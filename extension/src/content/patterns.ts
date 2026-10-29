// Tunable detection patterns for consent UIs.
//
// detect.ts scores each candidate element with the weights below and only
// shows a card when the best candidate reaches SCORE_THRESHOLD. To make
// detection stricter, raise the threshold or lower a weight; to catch a new
// consent manager, add its selector to KNOWN_CONSENT_SELECTORS.

/** Minimum score for a candidate to count as a consent UI. */
export const SCORE_THRESHOLD = 5;

/** Lower threshold used when the user explicitly asks "check this page". */
export const MANUAL_SCORE_THRESHOLD = 3;

export const WEIGHTS = {
  /** Element matches a known consent-manager selector. */
  knownConsentManager: 5,
  /** id / class / aria-label mentions cookies, consent, GDPR... */
  consentAttribute: 2,
  /** role="dialog", <dialog open>, or fixed/sticky positioning. */
  overlayLike: 1,
  /** Contains a button whose whole label is an accept/agree phrase. */
  strongAcceptButton: 3,
  /** Contains a button like "OK" or "Got it" (only meaningful with other signals). */
  weakAcceptButton: 1,
  /** "By continuing you agree to...", "I agree to the Terms". */
  agreementPhrase: 3,
  /** "We use cookies", "This site uses cookies". */
  cookiePhrase: 2,
  /** Links to a terms / privacy / cookie policy. */
  policyLink: 2,
} as const;

/**
 * Selectors for widely used consent-management platforms (CMPs).
 * Matching one of these is strong evidence on its own.
 */
export const KNOWN_CONSENT_SELECTORS: readonly string[] = [
  "#onetrust-banner-sdk",
  "#onetrust-consent-sdk",
  "#CybotCookiebotDialog",
  "#didomi-notice",
  "#didomi-popup",
  ".qc-cmp2-container",
  "#qc-cmp2-ui",
  "#truste-consent-track",
  ".truste_box_overlay",
  ".osano-cm-dialog",
  "#termly-code-snippet-support",
  ".cc-window",
  ".cc-banner",
  "#cookie-law-info-bar",
  ".cky-consent-container",
  "#cmplz-cookiebanner-container",
  "#iubenda-cs-banner",
  ".klaro .cookie-notice",
  "#tarteaucitronAlertBig",
  "#cookiescript_injected",
  ".fc-consent-root",
  "#sp_message_container",
  "#gdpr-consent-tool-wrapper",
  "#moove_gdpr_cookie_info_bar",
  ".cookie-notice-container",
  "#cookie-notice",
];

/** CSS selector for elements whose attributes suggest a consent UI. */
export const CONSENT_ATTRIBUTE_SELECTOR = [
  "[id*='cookie' i]",
  "[class*='cookie' i]",
  "[id*='consent' i]",
  "[class*='consent' i]",
  "[id*='gdpr' i]",
  "[class*='gdpr' i]",
  "[aria-label*='cookie' i]",
  "[aria-label*='consent' i]",
  "[aria-label*='privacy' i]",
  "[role='dialog']",
  "[role='alertdialog']",
  "dialog[open]",
  // Generic pop-up containers. Too common to mean anything alone, but the
  // scoring still needs consent wording or an accept button inside them.
  "[class*='banner' i]",
  "[class*='modal' i]",
  "[class*='popup' i]",
].join(",");

/** Attribute text (id, class, aria-label) that indicates a consent UI. */
export const CONSENT_ATTRIBUTE_PATTERN = /cookie|consent|gdpr|ccpa|(^|[-_\s])cmp([-_\s]|$)|privacy[-_]?(banner|notice|popup)/i;

/** Clickable elements whose full label means "accept". Matched against lowercase, punctuation-stripped text. */
export const STRONG_ACCEPT_PATTERNS: readonly RegExp[] = [
  /^(yes,? )?(i )?(agree|accept|consent)$/,
  /^(i )?(agree|accept|consent)( to)?( all| all cookies| cookies| the terms| terms| terms and conditions)$/,
  /^(i )?(agree|accept)( all)?( cookies)? (and|&) (continue|close|proceed)$/,
  /^(allow|enable)( all)? cookies$/,
  /^allow all$/,
  /^accept( all)? and close$/,
  /^(ok|okay),? i (agree|accept|understand)$/,
  /^i understand and (agree|accept)$/,
  /^agree and (continue|proceed)$/,
  /^accept recommended( settings)?$/,
];

/** Short generic acknowledgements. Only count together with other consent signals. */
export const WEAK_ACCEPT_PATTERNS: readonly RegExp[] = [/^(ok|okay|got it|continue|i understand|close|dismiss)$/];

/** Phrases that say using the site or a button means you agree to something. */
export const AGREEMENT_PHRASE_PATTERNS: readonly RegExp[] = [
  /\bby (continuing|clicking|tapping|signing (up|in)|logging in|creating an account|registering|proceeding|using (this|our) (site|website|app|service|services))\b[^.]{0,120}\b(agree|accept|consent|acknowledge)/i,
  /\bi (have read and )?(agree|accept|consent) (to )?(the |all |these )?(terms|privacy|conditions|eula|user agreement|data policy|cookie)/i,
  /\byou (agree|consent) to (our|the) (terms|privacy|use of cookies|cookie)/i,
];

export const COOKIE_PHRASE_PATTERNS: readonly RegExp[] = [
  // The headline of many consent-manager banners.
  /\bwe (value|respect|care about) your privacy\b/i,
  /\b(we|this (site|website)|our (site|website|partners)) uses? cookies\b/i,
  /\buse of cookies\b/i,
  /\bcookie (settings|preferences|policy|notice)\b/i,
  /\bwe (and our partners )?(store and\/or access|process) (information|personal data)\b/i,
];

/** Link text or URL patterns for each policy type, used to find the full policy. */
export const POLICY_LINK_PATTERNS = {
  terms: /\b(terms( of (service|use))?|conditions|user agreement|eula|tos)\b/i,
  privacy: /\b(privacy|data (policy|protection))\b/i,
  cookies: /\bcookies?\b/i,
} as const;

/** Clickable elements inspected for accept buttons. */
export const CLICKABLE_SELECTOR =
  "button, [role='button'], input[type='submit'], input[type='button'], a[href], a[role='button']";

/** Small text elements checked for agreement phrases ("By signing up you agree..."). */
export const PHRASE_ELEMENT_SELECTOR = "p, small, label, span, div";

/** Upper bounds that keep a scan cheap on very large pages. */
export const LIMITS = {
  /** Max elements inspected when looking for agreement phrases. */
  phraseElements: 2000,
  /** Phrase elements longer than this are paragraphs of content, not consent notes. */
  phraseElementMaxChars: 600,
  /** A candidate with more text than this is probably the whole page. */
  candidateMaxChars: 20000,
  /** A candidate with less text than this has nothing worth summarizing. */
  candidateMinChars: 20,
  /** How far up from an accept button to look for its banner/modal. */
  containerSearchDepth: 8,
  /** Stop climbing towards the banner once an ancestor holds more text than this. */
  containerMaxChars: 1500,
} as const;

/** Page URL or title patterns that mean the page itself is a policy (used by "check this page"). */
export const POLICY_PAGE_PATTERN = /\b(terms|privacy|cookie|legal|tos|eula|user[- ]agreement|conditions)\b/i;
