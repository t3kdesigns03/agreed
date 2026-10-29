// Types shared by the extension and the summarization backend.
// Keep this file dependency-free: it is bundled into both.

/** What kind of consent the user is being asked for. */
export type PolicyKind = "terms" | "privacy" | "cookies" | "unknown";

/** Traffic-light risk rating shown on the card. */
export type RiskLevel = "green" | "yellow" | "red";

export interface Summary {
  /** 2–3 plain-English sentences, most important first. */
  points: string[];
  risk: RiskLevel;
  /** One short sentence explaining the risk colour. */
  riskReason: string;
}

/** POST /v1/summarize request body. Only public policy text is sent. */
export interface SummarizeRequest {
  text: string;
  kind: PolicyKind;
  /** True when the client had to cut a very long policy down to MAX_POLICY_CHARS. */
  truncated: boolean;
}

export interface SummarizeResponse {
  summary: Summary;
  /** SHA-256 of the normalized policy text (plus prompt version). */
  hash: string;
  cached: boolean;
  promptVersion: string;
}

export interface ErrorResponse {
  error: string;
}

/** Longest policy text the backend accepts, in characters (~40k tokens). */
export const MAX_POLICY_CHARS = 150_000;

/** Shortest text worth summarizing. Anything smaller is not a real policy or banner. */
export const MIN_POLICY_CHARS = 40;

/**
 * Collapse whitespace so the same policy hashes identically regardless of the
 * page's markup or indentation.
 */
export function normalizePolicyText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function isRiskLevel(value: unknown): value is RiskLevel {
  return value === "green" || value === "yellow" || value === "red";
}

export function isPolicyKind(value: unknown): value is PolicyKind {
  return value === "terms" || value === "privacy" || value === "cookies" || value === "unknown";
}
