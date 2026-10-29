import type { PolicyKind } from "../../../shared/types";
import { ext, sendToBackground } from "../shared/browser";
import type { FetchPolicyReply, ManualCheckReply, SummarizeReply } from "../shared/messages";
import { detectConsent, isRendered, type Detection } from "./detect";
import { extractPolicyFromHtml, prepareForSummary } from "./extract";
import { SummaryCard } from "./overlay";
import { MANUAL_SCORE_THRESHOLD, POLICY_PAGE_PATTERN } from "./patterns";

/** After a card is closed, don't show one for the same site and kind for this long. */
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Consent banners usually appear within seconds; stop watching the page after this. */
const WATCH_WINDOW_MS = 30_000;
const FIRST_SCAN_DELAY_MS = 800;
const SCAN_DEBOUNCE_MS = 700;
/** A fetched policy page with less text than this probably needs JavaScript to render. */
const MIN_FETCHED_POLICY_CHARS = 400;
/** Show the fallback card if no answer arrives within this time. */
const SUMMARY_TIMEOUT_MS = 45_000;
const CARD_TAG = "PLAINAGREE-CARD";

declare global {
  interface Window {
    __plainAgreeLoaded?: boolean;
  }
}

let card: SummaryCard | null = null;
/** One automatic card per page load. */
let handled = false;
let observer: MutationObserver | null = null;
let scanTimer: number | undefined;
let consentWatch: number | undefined;

if (!window.__plainAgreeLoaded && document.documentElement instanceof HTMLHtmlElement) {
  window.__plainAgreeLoaded = true;
  start();
}

function start(): void {
  ext.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    if ((message as { type?: string } | null)?.type !== "manual-check") return false;
    manualCheck().then(
      (found) => sendResponse({ found } satisfies ManualCheckReply),
      () => sendResponse({ found: false } satisfies ManualCheckReply),
    );
    return true;
  });

  window.setTimeout(() => void autoScan(), FIRST_SCAN_DELAY_MS);
  observer = new MutationObserver(scheduleScan);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "style", "hidden", "open", "aria-hidden"],
  });
  window.setTimeout(stopWatching, WATCH_WINDOW_MS);
}

function scheduleScan(): void {
  if (handled) return;
  window.clearTimeout(scanTimer);
  scanTimer = window.setTimeout(() => void autoScan(), SCAN_DEBOUNCE_MS);
}

function stopWatching(): void {
  observer?.disconnect();
  observer = null;
  window.clearTimeout(scanTimer);
}

const ignoreOwnCard = (el: Element) => el.tagName === CARD_TAG;

async function autoScan(): Promise<void> {
  if (handled || card) return;
  const detection = detectConsent(document, { ignore: ignoreOwnCard });
  if (!detection) return;
  handled = true;
  stopWatching();
  if (await wasDismissed(detection.kind)) return;
  await showCard(detection, true);
}

/** "Check this page now" from the toolbar popup. Ignores earlier dismissals. */
async function manualCheck(): Promise<boolean> {
  if (card?.isOpen) {
    card.focus();
    return true;
  }
  const detection = detectConsent(document, { threshold: MANUAL_SCORE_THRESHOLD, ignore: ignoreOwnCard });
  if (detection) {
    handled = true;
    stopWatching();
    void showCard(detection, true);
    return true;
  }
  if (POLICY_PAGE_PATTERN.test(`${location.pathname} ${document.title}`)) {
    handled = true;
    stopWatching();
    void showCard(policyPageDetection(), false);
    return true;
  }
  return false;
}

/** Treat the current page as the policy itself (e.g. the user is on /privacy). */
function policyPageDetection(): Detection {
  const root = document.querySelector("main, [role='main'], article") ?? document.body;
  const where = `${location.pathname} ${document.title}`.toLowerCase();
  const kind: PolicyKind = where.includes("cookie") ? "cookies" : where.includes("privacy") ? "privacy" : "terms";
  return {
    root,
    score: 0,
    kind,
    acceptButton: null,
    acceptLabel: null,
    policyUrl: null,
    text: extractPolicyFromHtml(document.documentElement.outerHTML),
  };
}

async function showCard(detection: Detection, followPolicyLink: boolean): Promise<void> {
  const current = new SummaryCard({
    kind: detection.kind,
    realTermsUrl: detection.policyUrl,
    onShowRealTerms: () => reveal(detection.root),
    acceptLabel: detection.acceptButton ? detection.acceptLabel : null,
    onAccept: () => pressAccept(detection.acceptButton),
    onClose: () => {
      if (card === current) card = null;
      window.clearInterval(consentWatch);
      void rememberDismissed(detection.kind);
    },
  });
  card = current;
  current.mount();
  current.showLoading();
  watchConsentUi(current, detection.root);

  let reply: SummarizeReply;
  try {
    const text = followPolicyLink ? await gatherPolicyText(detection) : detection.text;
    const prepared = prepareForSummary(text);
    reply = await withTimeout(
      sendToBackground<SummarizeReply>({
        type: "summarize",
        text: prepared.text,
        truncated: prepared.truncated,
        kind: detection.kind,
        origin: location.origin,
      }),
      SUMMARY_TIMEOUT_MS,
    );
  } catch {
    reply = { ok: false, reason: "unavailable" };
  }

  if (!current.isOpen) return;
  if (reply?.ok) current.showSummary(reply.summary);
  else current.showError();
}

/**
 * The banner text plus, when it links to one, the full policy. The banner
 * explains what "Accept" does; the policy has the details.
 */
async function gatherPolicyText(detection: Detection): Promise<string> {
  if (!detection.policyUrl) return detection.text;
  let policy = "";
  try {
    const reply = await sendToBackground<FetchPolicyReply>({ type: "fetch-policy", url: detection.policyUrl });
    if (reply?.ok) policy = extractPolicyFromHtml(reply.html);
  } catch {
    // Fall back to the banner text alone.
  }
  if (policy.length < MIN_FETCHED_POLICY_CHARS) return detection.text;
  return `Notice shown on the page: ${detection.text}\n\nLinked policy: ${policy}`;
}

/** Close the card if the user accepts or rejects on the site itself and the banner goes away. */
function watchConsentUi(current: SummaryCard, root: Element): void {
  let missedChecks = 0;
  window.clearInterval(consentWatch);
  consentWatch = window.setInterval(() => {
    if (!current.isOpen) {
      window.clearInterval(consentWatch);
      return;
    }
    missedChecks = root.isConnected && isRendered(root) ? 0 : missedChecks + 1;
    if (missedChecks >= 2) current.close("consent-gone");
  }, 1000);
}

function pressAccept(button: HTMLElement | null): boolean {
  if (!button || !button.isConnected || !isRendered(button)) return false;
  button.click();
  return true;
}

/** "Show the real terms" when there is no link: scroll to the banner and outline it briefly. */
function reveal(root: Element): void {
  if (!(root instanceof HTMLElement)) return;
  root.scrollIntoView({ behavior: "smooth", block: "center" });
  const { outline, outlineOffset } = root.style;
  root.style.outline = "4px solid #1d3b9e";
  root.style.outlineOffset = "4px";
  window.setTimeout(() => {
    root.style.outline = outline;
    root.style.outlineOffset = outlineOffset;
  }, 3000);
}

function dismissKey(kind: PolicyKind): string {
  return `dismissed:${location.origin}:${kind}`;
}

async function wasDismissed(kind: PolicyKind): Promise<boolean> {
  try {
    const key = dismissKey(kind);
    const stored = await ext.storage.local.get(key);
    const at = stored[key];
    return typeof at === "number" && Date.now() - at < DISMISS_TTL_MS;
  } catch {
    return false;
  }
}

async function rememberDismissed(kind: PolicyKind): Promise<void> {
  try {
    await ext.storage.local.set({ [dismissKey(kind)]: Date.now() });
  } catch {
    // Storage is a convenience; failing to save only means the card may show again.
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        window.clearTimeout(timer);
        reject(err);
      },
    );
  });
}
