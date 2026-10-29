import { MAX_POLICY_CHARS, normalizePolicyText } from "../../../shared/types";

/** Elements that never hold policy text. */
const NOISE_SELECTOR = [
  "script",
  "style",
  "noscript",
  "template",
  "svg",
  "iframe",
  "nav",
  "header",
  "footer",
  "aside",
  "form",
  "button",
  "[hidden]",
  "[aria-hidden='true']",
  "[role='navigation']",
  "[role='banner']",
  "[role='contentinfo']",
].join(",");

const MAIN_SELECTORS = ["main", "[role='main']", "article", "#content", "#main", ".content", ".main"];

/** Below this, a "main" region is probably a stub and the whole body is used instead. */
const MIN_MAIN_CHARS = 500;

/**
 * Pull the readable policy text out of a fetched HTML page. The HTML is parsed
 * into an inert document: no scripts run and no resources load.
 */
export function extractPolicyFromHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  for (const el of Array.from(doc.querySelectorAll(NOISE_SELECTOR))) el.remove();

  const body = doc.body;
  if (!body) return "";
  for (const selector of MAIN_SELECTORS) {
    const main = doc.querySelector(selector);
    if (main) {
      const text = textOf(main);
      if (text.length >= MIN_MAIN_CHARS) return text;
    }
  }
  return textOf(body);
}

/** Join text nodes with spaces so adjacent block elements don't run together. */
function textOf(root: Element): string {
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const parts: string[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const value = node.nodeValue;
    if (value && value.trim()) parts.push(value);
  }
  return normalizePolicyText(parts.join(" "));
}

/** Fit policy text into what the backend accepts, saying so when it was cut. */
export function prepareForSummary(text: string): { text: string; truncated: boolean } {
  const normalized = normalizePolicyText(text);
  if (normalized.length <= MAX_POLICY_CHARS) return { text: normalized, truncated: false };
  const cut = normalized.slice(0, MAX_POLICY_CHARS);
  const lastSentence = cut.lastIndexOf(". ");
  return {
    text: lastSentence > MAX_POLICY_CHARS * 0.9 ? cut.slice(0, lastSentence + 1) : cut,
    truncated: true,
  };
}
