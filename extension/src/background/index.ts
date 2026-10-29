import {
  MIN_POLICY_CHARS,
  isPolicyKind,
  isRiskLevel,
  normalizePolicyText,
  sha256Hex,
  type Summary,
  type SummarizeRequest,
} from "../../../shared/types";
import { ext } from "../shared/browser";
import type { FetchPolicyMessage, FetchPolicyReply, SummarizeMessage, SummarizeReply } from "../shared/messages";

// Injected at build time from PLAINAGREE_BACKEND_URL (see scripts/build.mjs).
declare const __BACKEND_URL__: string;
const BACKEND_URL = __BACKEND_URL__.replace(/\/+$/, "");
/** The build's default URL contains this marker until a real deployment URL is set. */
const PLACEHOLDER_MARKER = "YOUR-SUBDOMAIN";

const SUMMARY_TIMEOUT_MS = 35_000;
const POLICY_FETCH_TIMEOUT_MS = 10_000;
const MAX_POLICY_HTML_BYTES = 3_000_000;

const CACHE_PREFIX = "sum:";
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 300;
const DISMISS_PREFIX = "dismissed:";
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DRIFT_KEY = "drift";
const DRIFT_MAX_ENTRIES = 500;
const PRUNE_EVERY_N_WRITES = 20;

interface CacheEntry {
  summary: Summary;
  savedAt: number;
}

/** Last-seen policy hash per site and kind, kept on this device for future "terms changed" alerts. */
type DriftMap = Record<string, { hash: string; firstSeen: number; lastSeen: number; previousHash?: string }>;

const inFlight = new Map<string, Promise<SummarizeReply>>();
let writesSincePrune = 0;

ext.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  if (sender.id !== ext.runtime.id) return false;
  const type = (message as { type?: string } | null)?.type;
  if (type === "summarize") {
    handleSummarize(message as SummarizeMessage).then(sendResponse, () =>
      sendResponse({ ok: false, reason: "unavailable" } satisfies SummarizeReply),
    );
    return true;
  }
  if (type === "fetch-policy") {
    fetchPolicy(message as FetchPolicyMessage).then(sendResponse, () =>
      sendResponse({ ok: false } satisfies FetchPolicyReply),
    );
    return true;
  }
  return false;
});

ext.runtime.onInstalled.addListener(() => void prune());
ext.runtime.onStartup?.addListener(() => void prune());

async function handleSummarize(message: SummarizeMessage): Promise<SummarizeReply> {
  if (typeof message.text !== "string" || !isPolicyKind(message.kind)) {
    return { ok: false, reason: "rejected" };
  }
  const text = normalizePolicyText(message.text);
  if (text.length < MIN_POLICY_CHARS) return { ok: false, reason: "rejected" };

  const hash = await sha256Hex(`${message.kind}\n${message.truncated === true}\n${text}`);
  void recordDrift(message.origin, message.kind, hash);

  const cached = await readCache(hash);
  if (cached) return { ok: true, summary: cached, cached: true };

  let pending = inFlight.get(hash);
  if (!pending) {
    pending = requestSummary({ text, kind: message.kind, truncated: message.truncated === true }).then(
      async (reply) => {
        if (reply.ok) await writeCache(hash, reply.summary);
        return reply;
      },
    );
    inFlight.set(hash, pending);
    void pending.finally(() => inFlight.delete(hash));
  }
  return pending;
}

/** Only the policy text and its kind leave the device: no URL, no page, no user data. */
async function requestSummary(body: SummarizeRequest): Promise<SummarizeReply> {
  if (!BACKEND_URL || BACKEND_URL.includes(PLACEHOLDER_MARKER)) {
    console.warn("PlainAgree: no backend configured. Rebuild with PLAINAGREE_BACKEND_URL set.");
    return { ok: false, reason: "not-configured" };
  }

  let response: Response;
  try {
    response = await fetch(`${BACKEND_URL}/v1/summarize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      credentials: "omit",
      signal: AbortSignal.timeout(SUMMARY_TIMEOUT_MS),
    });
  } catch {
    return { ok: false, reason: "offline" };
  }

  if (response.status === 400 || response.status === 413 || response.status === 422) {
    return { ok: false, reason: "rejected" };
  }
  if (!response.ok) return { ok: false, reason: "unavailable" };

  try {
    const data = (await response.json()) as { summary?: unknown };
    const summary = toSummary(data.summary);
    return summary ? { ok: true, summary, cached: false } : { ok: false, reason: "unavailable" };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

function toSummary(value: unknown): Summary | null {
  if (typeof value !== "object" || value === null) return null;
  const { points, risk, riskReason } = value as Record<string, unknown>;
  if (!Array.isArray(points) || !isRiskLevel(risk)) return null;
  const cleanPoints = points.filter((p): p is string => typeof p === "string" && p.trim().length > 0).slice(0, 3);
  if (cleanPoints.length === 0) return null;
  return { points: cleanPoints, risk, riskReason: typeof riskReason === "string" ? riskReason : "" };
}

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

async function readCache(hash: string): Promise<Summary | null> {
  try {
    const key = CACHE_PREFIX + hash;
    const stored = await ext.storage.local.get(key);
    const entry = stored[key] as CacheEntry | undefined;
    if (!entry || Date.now() - entry.savedAt > CACHE_TTL_MS) return null;
    return toSummary(entry.summary);
  } catch {
    return null;
  }
}

async function writeCache(hash: string, summary: Summary): Promise<void> {
  try {
    const entry: CacheEntry = { summary, savedAt: Date.now() };
    await ext.storage.local.set({ [CACHE_PREFIX + hash]: entry });
    if (++writesSincePrune >= PRUNE_EVERY_N_WRITES) {
      writesSincePrune = 0;
      await prune();
    }
  } catch {
    // A full or unavailable cache only costs a network round trip next time.
  }
}

async function recordDrift(origin: string, kind: string, hash: string): Promise<void> {
  if (typeof origin !== "string" || !origin.startsWith("http")) return;
  try {
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

/** Drop expired summaries and dismissals, and cap the summary cache size. */
async function prune(): Promise<void> {
  try {
    const all = await ext.storage.local.get(null);
    const now = Date.now();
    const remove: string[] = [];
    const summaries: Array<[string, number]> = [];

    for (const [key, value] of Object.entries(all)) {
      if (key.startsWith(CACHE_PREFIX)) {
        const savedAt = (value as CacheEntry | undefined)?.savedAt ?? 0;
        if (now - savedAt > CACHE_TTL_MS) remove.push(key);
        else summaries.push([key, savedAt]);
      } else if (key.startsWith(DISMISS_PREFIX)) {
        if (typeof value !== "number" || now - value > DISMISS_TTL_MS) remove.push(key);
      }
    }
    if (summaries.length > CACHE_MAX_ENTRIES) {
      summaries.sort((a, b) => a[1] - b[1]);
      remove.push(...summaries.slice(0, summaries.length - CACHE_MAX_ENTRIES).map(([key]) => key));
    }
    if (remove.length) await ext.storage.local.remove(remove);
  } catch {
    // Pruning is housekeeping; ignore failures.
  }
}
