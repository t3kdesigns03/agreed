import { normalizePolicyText, type PolicyKind, type Summary } from "../shared/types";
import { CONTEXT_POINTS, MAX_POINTS, REASONS, RULES, type Rule } from "./rules";

/** Shown with the "unclear" card so the user knows what to do next. */
const LOOK_YOURSELF_POINT = "Tap “Show the real terms” to read them yourself.";

interface Match {
  rule: Rule;
  point: string;
}

/**
 * Turn policy text into a card, entirely on this device. Deterministic: the
 * same text always gives the same card.
 */
export function summarizePolicy(text: string, kind: PolicyKind): Summary {
  const sentences = splitSentences(normalizePolicyText(text));
  const matches = findMatches(sentences, kind);

  const warnings = matches.filter((m) => m.rule.level !== "good");
  const good = matches.filter((m) => m.rule.level === "good");

  if (warnings.length === 0 && good.length === 0) {
    return { points: [CONTEXT_POINTS[kind], LOOK_YOURSELF_POINT], risk: "yellow", riskReason: REASONS.unclear };
  }

  // Leave room for one reassuring fact (like "you can say no") when there is one.
  const warningSlots = good.length > 0 ? MAX_POINTS - 1 : MAX_POINTS;
  const chosen = [...warnings.slice(0, warningSlots), ...good].slice(0, MAX_POINTS);
  const points = chosen.map((m) => m.point);
  if (points.length < 2) points.unshift(CONTEXT_POINTS[kind]);

  const firstWarning = warnings[0];
  if (!firstWarning) return { points, risk: "green", riskReason: REASONS.green };
  return {
    points,
    risk: warnings.some((m) => m.rule.level === "red") ? "red" : "yellow",
    riskReason: (warnings.find((m) => m.rule.level === "red") ?? firstWarning).rule.reason ?? "",
  };
}

function findMatches(sentences: string[], kind: PolicyKind): Match[] {
  const matches: Match[] = [];
  for (const rule of RULES) {
    if (rule.kinds && !rule.kinds.includes(kind)) continue;
    const point = matchRule(rule, sentences);
    if (point) matches.push({ rule, point });
  }

  const hidden = new Set(matches.flatMap((m) => m.rule.hides ?? []));
  return matches
    .filter((m) => !hidden.has(m.rule.id))
    .sort((a, b) => a.rule.priority - b.rule.priority);
}

/** The rule's point if any sentence triggers it, otherwise null. */
function matchRule(rule: Rule, sentences: string[]): string | null {
  let partnerCount = 0;
  let matched = false;
  for (const sentence of sentences) {
    // Questions are usually headings ("Do we sell your data?"), not statements.
    if (rule.level !== "good" && sentence.endsWith("?")) continue;
    if (!rule.patterns.some((p) => p.test(sentence))) continue;
    if (rule.unless?.some((p) => p.test(sentence))) continue;
    matched = true;
    if (!rule.point.includes("{n}")) break;
    partnerCount = Math.max(partnerCount, largestPartnerCount(sentence));
  }
  if (!matched) return null;
  return rule.point.includes("{n}") ? rule.point.replace("{n}", String(partnerCount)) : rule.point;
}

function largestPartnerCount(sentence: string): number {
  let largest = 0;
  for (const m of sentence.matchAll(/\b(\d{2,4})\s+(?:advertising |ad |third[- ]party )?(?:partners|vendors|third parties)\b/gi)) {
    largest = Math.max(largest, Number(m[1]));
  }
  return largest;
}

/** Split normalized text into sentences. Long un-punctuated runs are kept whole. */
export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?;])\s+(?=[^a-z])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
