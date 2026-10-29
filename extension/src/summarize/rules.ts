// Tunable rules for the on-device summarizer.
//
// Each rule looks for one kind of clause in the policy text. When a sentence
// matches one of a rule's `patterns` and none of its `unless` patterns, the
// rule's plain-English `point` can appear on the card. Rules are applied in
// priority order (lower number = more important) and the card shows at most
// three points.
//
// To change what the card says, edit `point` / `reason`. To catch more
// wording, add a pattern, and add a test case in test/summarize.test.ts.
import type { PolicyKind } from "../shared/types";

/**
 * red: a reason to be careful. yellow: worth knowing. good: a reassuring fact
 * (only rates a card green when nothing red or yellow was found).
 */
export type RuleLevel = "red" | "yellow" | "good";

export interface Rule {
  id: string;
  level: RuleLevel;
  /** Lower comes first on the card. */
  priority: number;
  /** Restrict a rule to some kinds of policy. Omit to apply to all. */
  kinds?: readonly PolicyKind[];
  /** Any one matching (in one sentence) triggers the rule. */
  patterns: readonly RegExp[];
  /** If one of these matches the same sentence, the rule does not trigger there. */
  unless?: readonly RegExp[];
  /** The sentence shown on the card. At most 20 words, 6th-grade wording. */
  point: string;
  /** Short reason shown next to the risk colour, for red and yellow rules. */
  reason?: string;
  /** Ids of rules this one makes redundant; they are dropped when this one matches. */
  hides?: readonly string[];
}

/**
 * "not / never / n't" shortly before one of the verbs: "we do not sell",
 * "we will never knowingly collect", "we don't share". A "not" elsewhere in the
 * sentence ("we sell your data and you cannot opt out") does not count.
 */
function negated(verbs: string): RegExp {
  return new RegExp(`(?:\\bnot|\\bnever|n't|\\bno longer)\\s+(?:to\\s+)?(?:\\w+\\s+){0,3}?(?:${verbs})`, "i");
}

export const RULES: readonly Rule[] = [
  // ---- red ----
  {
    id: "sells-data",
    level: "red",
    priority: 10,
    patterns: [
      /\bsell(s|ing)?\b[^.]{0,80}\b(personal (information|data)|your (data|information)|user (data|information))\b/i,
      /\b(personal (information|data)|your (data|information))\b[^.]{0,80}\b(sold|sell)\b/i,
      /\bdata brokers?\b/i,
    ],
    unless: [negated("sell|sold")],
    point: "They may sell your personal information to other companies.",
    reason: "They may sell your personal information.",
    hides: ["does-not-sell", "shares-with-third-parties"],
  },
  {
    id: "automatic-charges",
    level: "red",
    priority: 11,
    patterns: [
      /\bauto(matically)?[- ]?renew/i,
      /\brecurring (billing|charges?|payments?|subscription)\b/i,
      /\b(charged|billed) automatically\b/i,
      /\bautomatically (charge|bill)\b/i,
      /\b(after|at the end of|when) (the|your) (free )?trial\b[^.]{0,100}\b(charge|charged|bill|billed|pay)\b/i,
    ],
    unless: [negated("charge|charged|bill|billed|renew")],
    point: "If you sign up, they will keep charging you until you cancel.",
    reason: "You could be charged automatically.",
  },
  {
    id: "sensitive-data",
    level: "red",
    priority: 12,
    patterns: [
      /\bprecise (geo)?location\b/i,
      /\b(gps|exact) location\b/i,
      /\bbiometric\b/i,
      /\b(face|voice) ?prints?\b/i,
      /\bfacial (recognition|geometry)\b/i,
      /\b(health|medical) (information|data|records)\b/i,
      /\b(your|phone|address book) contacts\b/i,
      /\bcontact list\b/i,
    ],
    unless: [negated("collect|use|process|store|access|gather|request|ask for|track")],
    point: "They collect very personal information, like your exact location, face, health or contacts.",
    reason: "They collect very personal information.",
  },
  {
    id: "content-license-strong",
    level: "red",
    priority: 13,
    kinds: ["terms", "unknown"],
    patterns: [
      /\b(perpetual|irrevocable)\b[^.]{0,120}\blicen[cs]e\b[^.]{0,160}\b(content|photos?|posts?|videos?|images?|voice|likeness|name)\b/i,
      /\blicen[cs]e\b[^.]{0,160}\b(content|photos?|posts?|videos?|images?)\b[^.]{0,160}\b(perpetual|irrevocable)\b/i,
    ],
    point: "They can keep using your photos and posts, even after you leave.",
    reason: "They can use what you post, forever.",
  },

  // ---- yellow ----
  {
    id: "partner-count",
    level: "yellow",
    priority: 20,
    patterns: [/\b\d{2,4}\s+(advertising |ad |third[- ]party )?(partners|vendors|third parties)\b/i],
    // The point is filled in by the summarizer with the actual number.
    point: "They share what you do here with {n} other companies.",
    reason: "What you do here is shared with many companies.",
    hides: ["shares-with-third-parties"],
  },
  {
    id: "ads",
    level: "yellow",
    priority: 21,
    patterns: [
      /\b(personali[sz]ed|targeted|interest[- ]based|tailored|relevant) (ads|advertising|advertisements|content and ads)\b/i,
      /\b(advertising|ad|marketing) (partners|purposes|cookies|networks?)\b/i,
      /\bshow (you )?(ads|advertising)\b/i,
      /\b(to|for) advertis(e|ing)\b/i,
    ],
    unless: [negated("use|show|serve|sell|share")],
    point: "They use what you do here to show you ads.",
    reason: "Your activity is used for ads.",
  },
  {
    id: "opt-out-sale-link",
    level: "yellow",
    priority: 22,
    patterns: [/\bdo not sell (or share )?my (personal )?(information|data|info)\b/i],
    point: "They share your information for ads, but you can tell them to stop.",
    reason: "Your information is shared for ads unless you say no.",
    hides: ["ads"],
  },
  {
    id: "shares-with-third-parties",
    level: "yellow",
    priority: 23,
    patterns: [
      /\bshare\b[^.]{0,80}\b(with|to)\b[^.]{0,40}\b(third[- ]part(y|ies)|partners|affiliates|other companies|service providers)\b/i,
      /\b(disclose|provide|transfer)\b[^.]{0,60}\b(personal (information|data)|your (data|information))\b[^.]{0,60}\b(third[- ]part(y|ies)|partners|affiliates)\b/i,
    ],
    unless: [negated("share|disclose|provide|transfer|rent|sell")],
    point: "They share your information with other companies.",
    reason: "Your information is shared with other companies.",
  },
  {
    id: "arbitration",
    level: "yellow",
    // Ahead of the ad rules: giving up the right to go to court matters more.
    priority: 19,
    kinds: ["terms", "unknown"],
    patterns: [/\barbitration\b/i, /\bclass[- ]action\b[^.]{0,60}\bwaive/i, /\bwaive\b[^.]{0,60}\b(jury|class[- ]action)\b/i],
    point: "If something goes wrong, you can't take them to court. A private judge decides.",
    reason: "You give up the right to take them to court.",
  },
  {
    id: "can-close-account",
    level: "yellow",
    priority: 25,
    kinds: ["terms", "unknown"],
    patterns: [
      /\b(terminate|suspend|disable|close)\b[^.]{0,60}\b(account|access)\b[^.]{0,80}\b(any time|any reason|without (prior )?notice|sole discretion)\b/i,
      /\b(at any time|for any reason|without notice)\b[^.]{0,60}\b(terminate|suspend)\b[^.]{0,40}\b(account|access)\b/i,
    ],
    point: "They can close your account at any time, without warning.",
    reason: "They can close your account without warning.",
  },
  {
    id: "can-change-terms",
    level: "yellow",
    priority: 26,
    kinds: ["terms", "privacy", "unknown"],
    patterns: [
      /\b(may|can|reserve the right to)\b[^.]{0,20}\b(change|modify|update|amend|revise)\b[^.]{0,60}\b(terms|agreement|polic(y|ies))\b[^.]{0,80}\b(any time|from time to time|without notice|sole discretion)\b/i,
    ],
    point: "They can change these rules later, and keeping on using the site means you agree.",
    reason: "They can change the rules at any time.",
  },
  {
    id: "keeps-data-long",
    level: "yellow",
    priority: 27,
    kinds: ["privacy", "terms", "unknown"],
    patterns: [
      /\b(retain|keep|store)\b[^.]{0,60}\b(indefinitely|as long as (necessary|needed|we (need|deem))|for as long as)\b/i,
    ],
    point: "They can keep your information for a long time.",
    reason: "They keep your information for a long time.",
  },
  {
    id: "analytics-cookies",
    level: "yellow",
    priority: 28,
    kinds: ["cookies"],
    patterns: [
      /\b(analytics|statistics|performance) cookies\b/i,
      /\bmeasure (traffic|audience|performance|how you use)\b/i,
      /\b(analy[sz]e|understand) (how you use|site usage|our traffic|traffic)\b/i,
    ],
    point: "They use cookies to count your visits and see what you click.",
    reason: "They track how you use the site.",
  },

  // ---- good ----
  {
    id: "does-not-sell",
    level: "good",
    priority: 40,
    patterns: [
      /\b(do|does|will) not sell\b[^.]{0,60}\b(personal|your) (information|data)\b/i,
      /\bnever sell\b/i,
      /\b(don't|doesn't) sell\b[^.]{0,60}\b(personal|your) (information|data)\b/i,
      /\b(have|has) not sold\b/i,
    ],
    unless: [/\bdo not sell (or share )?my\b/i],
    point: "They say they don't sell your personal information.",
  },
  {
    id: "essential-cookies-only",
    level: "good",
    priority: 41,
    kinds: ["cookies"],
    patterns: [
      /\b(only|solely) (use )?(strictly )?(necessary|essential) cookies\b/i,
      /\bonly (use )?cookies (that are )?(strictly )?(necessary|essential|needed)\b/i,
    ],
    point: "They say they only use cookies the website needs to work.",
  },
  {
    id: "can-refuse-cookies",
    level: "good",
    priority: 42,
    kinds: ["cookies"],
    patterns: [
      /\b(reject|decline|refuse|deny)\b[^.]{0,30}\b(all|optional|non-?essential|cookies)\b/i,
      /\b(change|manage|update) (your )?(cookie )?(settings|preferences|choices)\b/i,
      /\bwithdraw (your )?consent\b/i,
    ],
    point: "You can say no to the extra cookies and still use the site.",
  },
  {
    id: "can-delete-data",
    level: "good",
    priority: 43,
    kinds: ["privacy", "terms", "unknown"],
    patterns: [/\b(request|ask)\b[^.]{0,50}\b(delet|eras)(e|ion|ure)\b/i, /\bright to (erasure|deletion|be forgotten)\b/i],
    point: "You can ask them to delete your information.",
  },
];

/** Shown first when the policy says little that the rules recognize, so the card is never empty. */
export const CONTEXT_POINTS: Record<PolicyKind, string> = {
  cookies: "This website wants to save cookies on your device.",
  terms: "This website wants you to agree to its rules before you continue.",
  privacy: "This explains what the website does with your information.",
  unknown: "This website wants you to agree to something before you continue.",
};

export const REASONS = {
  /** No red or yellow rule matched, but a reassuring one did. */
  green: "We didn't find anything worrying.",
  /** Nothing recognizable at all. */
  unclear: "We couldn't find the key details. Take a quick look yourself.",
} as const;

/** Most points the card shows. */
export const MAX_POINTS = 3;
