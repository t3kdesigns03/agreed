import type { PolicyKind } from "../shared/types";
import {
  AGREEMENT_PHRASE_PATTERNS,
  CLICKABLE_SELECTOR,
  CONSENT_ATTRIBUTE_PATTERN,
  CONSENT_ATTRIBUTE_SELECTOR,
  COOKIE_PHRASE_PATTERNS,
  KNOWN_CONSENT_SELECTORS,
  LIMITS,
  PHRASE_ELEMENT_SELECTOR,
  POLICY_LINK_PATTERNS,
  SCORE_THRESHOLD,
  STRONG_ACCEPT_PATTERNS,
  WEAK_ACCEPT_PATTERNS,
  WEIGHTS,
} from "./patterns";

export interface Detection {
  /** The banner, modal or sentence that asks for consent. */
  root: Element;
  score: number;
  kind: PolicyKind;
  /** Label of the site's own accept button, if one clearly exists. Used for scoring only; Agreed never presses it. */
  acceptLabel: string | null;
  /** Absolute http(s) URL of the full policy, if the consent UI links to one. */
  policyUrl: string | null;
  /** Visible text of `root`, whitespace-normalized. */
  text: string;
}

export interface DetectOptions {
  threshold?: number;
  /** Override for tests (jsdom has no layout). */
  isVisible?: (el: Element) => boolean;
  /** Elements to ignore, such as Agreed's own card host. */
  ignore?: (el: Element) => boolean;
}

/** Find the most likely consent UI on the page, or null if nothing scores high enough. */
export function detectConsent(doc: Document, options: DetectOptions = {}): Detection | null {
  const threshold = options.threshold ?? SCORE_THRESHOLD;
  const isVisible = options.isVisible ?? isRendered;
  const ignore = options.ignore ?? (() => false);

  const known = new Set<Element>();
  const candidates = new Set<Element>();
  collectCandidates(doc, candidates, known, 0);

  let best: Detection | null = null;
  for (const el of candidates) {
    if (ignore(el) || !isVisible(el)) continue;
    const detection = score(el, known.has(el), isVisible);
    if (!detection || detection.score < threshold) continue;
    if (
      !best ||
      detection.score > best.score ||
      (detection.score === best.score && detection.text.length < best.text.length)
    ) {
      best = detection;
    }
  }
  return best;
}

function collectCandidates(root: Document | ShadowRoot, out: Set<Element>, known: Set<Element>, depth: number): void {
  for (const selector of KNOWN_CONSENT_SELECTORS) {
    for (const el of safeQueryAll(root, selector)) {
      out.add(el);
      known.add(el);
    }
  }

  const attributeMatches = safeQueryAll(root, CONSENT_ATTRIBUTE_SELECTOR).slice(0, 400);
  for (const el of attributeMatches) out.add(el);

  for (const el of safeQueryAll(root, CLICKABLE_SELECTOR)) {
    if (acceptStrength(el) === "strong") out.add(findContainer(el));
  }

  let inspected = 0;
  for (const el of safeQueryAll(root, PHRASE_ELEMENT_SELECTOR)) {
    if (inspected++ >= LIMITS.phraseElements) break;
    const text = el.textContent ?? "";
    if (text.length > LIMITS.phraseElementMaxChars || text.length < LIMITS.candidateMinChars) continue;
    if (AGREEMENT_PHRASE_PATTERNS.some((p) => p.test(text))) {
      out.add(el);
    } else if (COOKIE_PHRASE_PATTERNS.some((p) => p.test(text))) {
      // "This site uses cookies." is usually a paragraph inside the banner; score the banner too.
      out.add(el);
      out.add(findContainer(el));
    }
  }

  // Some consent managers render inside an open shadow root.
  if (depth < 2) {
    for (const el of [...known, ...attributeMatches]) {
      if (el.shadowRoot) collectCandidates(el.shadowRoot, out, known, depth + 1);
    }
  }
}

function score(el: Element, isKnown: boolean, isVisible: (el: Element) => boolean): Detection | null {
  const text = visibleText(el);
  if (text.length < LIMITS.candidateMinChars || text.length > LIMITS.candidateMaxChars) return null;

  let total = 0;
  if (isKnown) total += WEIGHTS.knownConsentManager;
  const attrText = attributeText(el);
  if (CONSENT_ATTRIBUTE_PATTERN.test(attrText)) total += WEIGHTS.consentAttribute;
  if (isOverlayLike(el)) total += WEIGHTS.overlayLike;

  let acceptButton: HTMLElement | null = null;
  let hasWeakAccept = false;
  for (const clickable of safeQueryAll(el, CLICKABLE_SELECTOR)) {
    if (!isVisible(clickable)) continue;
    const strength = acceptStrength(clickable);
    if (strength === "strong") {
      acceptButton = clickable as HTMLElement;
      break;
    }
    if (strength === "weak") hasWeakAccept = true;
  }
  // An accept button that is itself the candidate (rare, but possible for tiny banners).
  if (!acceptButton && acceptStrength(el) === "strong") acceptButton = el as HTMLElement;
  if (acceptButton) total += WEIGHTS.strongAcceptButton;
  else if (hasWeakAccept) total += WEIGHTS.weakAcceptButton;

  const hasAgreementPhrase = AGREEMENT_PHRASE_PATTERNS.some((p) => p.test(text));
  const hasCookiePhrase = COOKIE_PHRASE_PATTERNS.some((p) => p.test(text));
  if (hasAgreementPhrase) total += WEIGHTS.agreementPhrase;
  if (hasCookiePhrase) total += WEIGHTS.cookiePhrase;

  const links = policyLinks(el);
  if (links.terms || links.privacy || links.cookies) total += WEIGHTS.policyLink;

  const kind = classify(text, attrText, links, hasCookiePhrase);
  const policyUrl =
    kind === "cookies"
      ? (links.cookies ?? links.privacy ?? links.terms)
      : kind === "privacy"
        ? (links.privacy ?? links.terms)
        : (links.terms ?? links.privacy ?? links.cookies);

  return {
    root: el,
    score: total,
    kind,
    acceptLabel: acceptButton ? labelOf(acceptButton) : null,
    policyUrl: policyUrl ?? null,
    text,
  };
}

function classify(
  text: string,
  attrText: string,
  links: PolicyLinks,
  hasCookiePhrase: boolean,
): PolicyKind {
  if (hasCookiePhrase || /cookie/i.test(attrText)) return "cookies";
  const mentionsTerms = POLICY_LINK_PATTERNS.terms.test(text) || Boolean(links.terms);
  const mentionsPrivacy = POLICY_LINK_PATTERNS.privacy.test(text) || Boolean(links.privacy);
  if (mentionsTerms) return "terms";
  if (mentionsPrivacy) return "privacy";
  if (links.cookies || /cookie/i.test(text)) return "cookies";
  return "unknown";
}

interface PolicyLinks {
  terms?: string;
  privacy?: string;
  cookies?: string;
}

function policyLinks(el: Element): PolicyLinks {
  const found: PolicyLinks = {};
  const here = stripHash(el.ownerDocument?.location?.href ?? "");
  for (const a of safeQueryAll(el, "a[href]")) {
    const href = (a as HTMLAnchorElement).href;
    if (!/^https?:/i.test(href) || stripHash(href) === here) continue;
    const label = `${a.textContent ?? ""} ${a.getAttribute("aria-label") ?? ""}`;
    const path = safePath(href);
    for (const kind of ["terms", "privacy", "cookies"] as const) {
      if (found[kind]) continue;
      if (POLICY_LINK_PATTERNS[kind].test(label) || POLICY_LINK_PATTERNS[kind].test(path)) found[kind] = href;
    }
  }
  return found;
}

/** Walk up from an accept button (or cookie sentence) to the banner or modal that holds it. */
function findContainer(start: Element): Element {
  let best: Element = start.parentElement ?? start;
  let el: Element | null = start.parentElement;
  for (let depth = 0; el && depth < LIMITS.containerSearchDepth; depth++) {
    if (el === el.ownerDocument.body || el === el.ownerDocument.documentElement) break;
    if (isOverlayLike(el) || CONSENT_ATTRIBUTE_PATTERN.test(attributeText(el))) return el;
    if ((el.textContent ?? "").length > LIMITS.containerMaxChars) break;
    best = el;
    el = el.parentElement;
  }
  return best;
}

type AcceptStrength = "strong" | "weak" | null;

function acceptStrength(el: Element): AcceptStrength {
  const label = normalizeLabel(labelOf(el));
  if (!label || label.length > 60) return null;
  if (STRONG_ACCEPT_PATTERNS.some((p) => p.test(label))) return "strong";
  if (WEAK_ACCEPT_PATTERNS.some((p) => p.test(label))) return "weak";
  return null;
}

function labelOf(el: Element): string {
  if (el instanceof HTMLInputElement) return el.value.trim();
  const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
  return text || (el.getAttribute("aria-label") ?? "").trim();
}

export function normalizeLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[^\p{L}\p{N}&' ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function attributeText(el: Element): string {
  const cls = typeof el.className === "string" ? el.className : (el.getAttribute("class") ?? "");
  return `${el.id} ${cls} ${el.getAttribute("aria-label") ?? ""}`;
}

function isOverlayLike(el: Element): boolean {
  let node: Element | null = el;
  for (let i = 0; node && i < 4; i++) {
    const role = node.getAttribute("role");
    if (role === "dialog" || role === "alertdialog" || node.tagName === "DIALOG") return true;
    const view = node.ownerDocument.defaultView;
    const position = view ? view.getComputedStyle(node).position : "";
    if (position === "fixed" || position === "sticky") return true;
    node = node.parentElement;
  }
  return false;
}

/** Real visibility check using layout. Replaced in tests. */
export function isRendered(el: Element): boolean {
  const checker = (el as Element & { checkVisibility?: (opts: object) => boolean }).checkVisibility;
  if (checker && !checker.call(el, { opacityProperty: true, visibilityProperty: true })) return false;
  const rect = el.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return false;
  const style = el.ownerDocument.defaultView?.getComputedStyle(el);
  if (!style) return true;
  return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0.05;
}

export function visibleText(el: Element): string {
  const raw = (el as HTMLElement).innerText ?? el.textContent ?? "";
  return raw.replace(/\s+/g, " ").trim();
}

function safeQueryAll(root: ParentNode, selector: string): Element[] {
  try {
    return Array.from(root.querySelectorAll(selector));
  } catch {
    // An unsupported selector (e.g. the `i` flag on an old engine) must not break detection.
    return [];
  }
}

function stripHash(url: string): string {
  const i = url.indexOf("#");
  return i === -1 ? url : url.slice(0, i);
}

function safePath(href: string): string {
  try {
    const u = new URL(href);
    return decodeURIComponent(u.pathname).replace(/[-_/]+/g, " ");
  } catch {
    return "";
  }
}
