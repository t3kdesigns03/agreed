import { MIN_POLICY_CHARS, isPolicyKind, normalizePolicyText, sha256Hex } from "../shared/types";
import { ext } from "../shared/browser";
import type { FetchPolicyMessage, FetchPolicyReply, PolicySeenMessage } from "../shared/messages";

// The background script never talks to any server of its own. It only reads
// public policy pages that a consent banner links to, and keeps a few local
// records in extension storage.

const POLICY_FETCH_TIMEOUT_MS = 10_000;
const MAX_POLICY_HTML_BYTES = 3_000_000;

const DISMISS_PREFIX = "dismissed:";
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DRIFT_KEY = "drift";
const DRIFT_MAX_ENTRIES = 500;

/** Last-seen policy hash per site and kind, kept on this device for future "terms changed" alerts. */
type DriftMap = Record<string, { hash: string; firstSeen: number; lastSeen: number; previousHash?: string }>;

ext.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  if (sender.id !== ext.runtime.id) return false;
  const type = (message as { type?: string } | null)?.type;
  if (type === "fetch-policy") {
    fetchPolicy(message as FetchPolicyMessage).then(sendResponse, () =>
      sendResponse({ ok: false } satisfies FetchPolicyReply),
    );
    return true;
  }
  if (type === "policy-seen") {
    void recordDrift(message as PolicySeenMessage);
    return false;
  }
  return false;
});

ext.runtime.onInstalled.addListener(() => void prune());
ext.runtime.onStartup?.addListener(() => void prune());

/**
 * Fetch a linked policy page. Runs here rather than in the content script so
 * cross-site pages can be read; cookies are never sent, so the request
 * carries nothing about the user.
 */
async function fetchPolicy(message: FetchPolicyMessage): Promise<FetchPolicyReply> {
  let url: URL;
  try {
    url = new URL(message.url);
  } catch {
    return { ok: false };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return { ok: false };

  try {
    const response = await fetch(url.href, {
      credentials: "omit",
      redirect: "follow",
      headers: { Accept: "text/html,application/xhtml+xml,text/plain;q=0.8" },
      signal: AbortSignal.timeout(POLICY_FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return { ok: false };
    const type = response.headers.get("Content-Type") ?? "";
    const isHtml = /text\/html|application\/xhtml\+xml/i.test(type);
    const isPlain = /text\/plain/i.test(type);
    if (!isHtml && !isPlain) return { ok: false };

    const body = await readCapped(response, MAX_POLICY_HTML_BYTES);
    const html = isHtml ? body : `<pre>${escapeHtml(body)}</pre>`;
    return { ok: true, html, finalUrl: response.url };
  } catch {
    return { ok: false };
  }
}

async function readCapped(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    text += decoder.decode(value, { stream: true });
    if (received >= maxBytes) {
      await reader.cancel();
      break;
    }
  }
  return text + decoder.decode();
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Hashing happens here because crypto.subtle is unavailable to content scripts on http pages. */
async function recordDrift(message: PolicySeenMessage): Promise<void> {
  const { origin, kind } = message;
  if (typeof origin !== "string" || !origin.startsWith("http") || !isPolicyKind(kind)) return;
  if (typeof message.text !== "string") return;
  const text = normalizePolicyText(message.text);
  if (text.length < MIN_POLICY_CHARS) return;

  try {
    const hash = await sha256Hex(text);
    const stored = await ext.storage.local.get(DRIFT_KEY);
    const drift: DriftMap = (stored[DRIFT_KEY] as DriftMap | undefined) ?? {};
    const key = `${origin}|${kind}`;
    const now = Date.now();
    const previous = drift[key];
    drift[key] =
      previous && previous.hash === hash
        ? { ...previous, lastSeen: now }
        : { hash, firstSeen: now, lastSeen: now, previousHash: previous?.hash };

    const keys = Object.keys(drift);
    if (keys.length > DRIFT_MAX_ENTRIES) {
      keys
        .sort((a, b) => drift[a]!.lastSeen - drift[b]!.lastSeen)
        .slice(0, keys.length - DRIFT_MAX_ENTRIES)
        .forEach((k) => delete drift[k]);
    }
    await ext.storage.local.set({ [DRIFT_KEY]: drift });
  } catch {
    // Drift tracking is best-effort.
  }
}

/** Drop expired dismissals. */
async function prune(): Promise<void> {
  try {
    const all = await ext.storage.local.get(null);
    const now = Date.now();
    const remove = Object.entries(all)
      .filter(([key, value]) => key.startsWith(DISMISS_PREFIX) && (typeof value !== "number" || now - value > DISMISS_TTL_MS))
      .map(([key]) => key);
    if (remove.length) await ext.storage.local.remove(remove);
  } catch {
    // Pruning is housekeeping; ignore failures.
  }
}
