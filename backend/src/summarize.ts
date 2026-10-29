import Anthropic from "@anthropic-ai/sdk";
import { isRiskLevel, type PolicyKind, type Summary } from "../../shared/types";
import { OUTPUT_SCHEMA, SYSTEM_PROMPT, buildUserMessage } from "./prompt";

export const DEFAULT_MODEL = "claude-opus-5-5";

/** Thrown when the model's answer can't be turned into a card. */
export class SummaryError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "SummaryError";
  }
}

export async function summarizeWithClaude(
  client: Anthropic,
  model: string,
  text: string,
  kind: PolicyKind,
  truncated: boolean,
): Promise<Summary> {
  // Sampling parameters (temperature etc.) are not accepted on current models.
  // Consistency comes from the strict schema, explicit risk rules, low effort,
  // and the content-hash cache in front of this call.
  const response = await client.beta.messages.create({
    model,
    max_tokens: 8000,
    betas: ["server-side-fallback-2026-07-01"],
    // On a policy decline, retry server-side on Anthropic's recommended fallback model.
    fallbacks: "default",
    output_config: {
      effort: "low",
      format: { type: "json_schema", schema: OUTPUT_SCHEMA },
    },
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildUserMessage(text, kind, truncated) }],
  });

  if (response.stop_reason === "refusal") {
    throw new SummaryError(
      `Model declined to summarize (${response.stop_details?.category ?? "no category"})`,
      false,
    );
  }
  if (response.stop_reason === "max_tokens") {
    throw new SummaryError("Model ran out of output tokens", true);
  }

  const textBlock = response.content.find(
    (block): block is Anthropic.Beta.BetaTextBlock => block.type === "text",
  );
  if (!textBlock) {
    throw new SummaryError("Model returned no text", true);
  }
  return parseSummary(textBlock.text);
}

const MAX_POINTS = 3;
const MAX_POINT_CHARS = 220;
const MAX_REASON_CHARS = 160;

/** Validate and tidy the model's JSON into the card shape. */
export function parseSummary(raw: string): Summary {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new SummaryError("Model output was not valid JSON", true);
  }
  if (typeof data !== "object" || data === null) {
    throw new SummaryError("Model output was not an object", true);
  }
  const { points, risk, risk_reason } = data as Record<string, unknown>;

  if (!Array.isArray(points)) {
    throw new SummaryError("Model output had no points", true);
  }
  const cleanPoints = points
    .filter((p): p is string => typeof p === "string")
    .map((p) => clip(p.replace(/\s+/g, " ").trim(), MAX_POINT_CHARS))
    .filter((p) => p.length > 0)
    .slice(0, MAX_POINTS);
  if (cleanPoints.length === 0) {
    throw new SummaryError("Model output had no usable points", true);
  }
  if (!isRiskLevel(risk)) {
    throw new SummaryError("Model output had an invalid risk level", true);
  }
  const reason = typeof risk_reason === "string" ? clip(risk_reason.replace(/\s+/g, " ").trim(), MAX_REASON_CHARS) : "";

  return { points: cleanPoints, risk, riskReason: reason };
}

function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max / 2 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}
