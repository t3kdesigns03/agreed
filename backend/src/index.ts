import Anthropic from "@anthropic-ai/sdk";
import {
  MAX_POLICY_CHARS,
  MIN_POLICY_CHARS,
  isPolicyKind,
  normalizePolicyText,
  sha256Hex,
  type ErrorResponse,
  type PolicyKind,
  type Summary,
  type SummarizeResponse,
} from "../../shared/types";
import { PROMPT_VERSION } from "./prompt";
import { DEFAULT_MODEL, SummaryError, summarizeWithClaude } from "./summarize";

export interface Env {
  /** Secret: `wrangler secret put ANTHROPIC_API_KEY` */
  ANTHROPIC_API_KEY: string;
  /** KV namespace that caches summaries by content hash. */
  SUMMARY_CACHE: KVNamespace;
  /** Optional model override (defaults to DEFAULT_MODEL). */
  MODEL?: string;
}

const CACHE_TTL_SECONDS = 60 * 60 * 24 * 30;
// JSON escaping can roughly double the size of the text; leave headroom.
const MAX_BODY_BYTES = MAX_POLICY_CHARS * 4;

const CORS_HEADERS: Record<string, string> = {
  // The API is public and takes no cookies or credentials.
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

// Requests for the same policy that arrive at the same isolate while a summary
// is being generated share one model call.
const inFlight = new Map<string, Promise<Summary>>();

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (url.pathname === "/health" && request.method === "GET") {
      return json({ ok: true, promptVersion: PROMPT_VERSION }, 200);
    }
    if (url.pathname !== "/v1/summarize") {
      return error("Not found", 404);
    }
    if (request.method !== "POST") {
      return error("Use POST", 405);
    }
    return handleSummarize(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;

async function handleSummarize(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const declaredLength = Number(request.headers.get("Content-Length") ?? "0");
  if (declaredLength > MAX_BODY_BYTES) {
    return error("Policy text is too long", 413);
  }

  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return error("Policy text is too long", 413);
    body = JSON.parse(raw);
  } catch {
    return error("Body must be JSON", 400);
  }
  if (typeof body !== "object" || body === null) {
    return error("Body must be a JSON object", 400);
  }

  const { text, kind, truncated } = body as Record<string, unknown>;
  if (typeof text !== "string") {
    return error("`text` must be a string", 400);
  }
  const normalized = normalizePolicyText(text);
  if (normalized.length < MIN_POLICY_CHARS) {
    return error("Policy text is too short", 400);
  }
  if (normalized.length > MAX_POLICY_CHARS) {
    return error("Policy text is too long", 413);
  }
  const policyKind: PolicyKind = isPolicyKind(kind) ? kind : "unknown";
  const wasTruncated = truncated === true;

  // The hash never trusts the client: it is computed here from the text itself.
  const hash = await sha256Hex(`${PROMPT_VERSION}\n${policyKind}\n${wasTruncated}\n${normalized}`);

  const cached = await env.SUMMARY_CACHE.get<Summary>(hash, "json");
  if (cached) {
    return json(response(cached, hash, true), 200);
  }

  let pending = inFlight.get(hash);
  if (!pending) {
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 2, timeout: 60_000 });
    pending = summarizeWithClaude(client, env.MODEL || DEFAULT_MODEL, normalized, policyKind, wasTruncated);
    inFlight.set(hash, pending);
    pending.then(
      () => inFlight.delete(hash),
      () => inFlight.delete(hash),
    );
  }

  try {
    const summary = await pending;
    ctx.waitUntil(env.SUMMARY_CACHE.put(hash, JSON.stringify(summary), { expirationTtl: CACHE_TTL_SECONDS }));
    return json(response(summary, hash, false), 200);
  } catch (err) {
    return upstreamError(err);
  }
}

function upstreamError(err: unknown): Response {
  if (err instanceof SummaryError) {
    console.warn("summary error:", err.message);
    return error("Could not summarize this policy", err.retryable ? 502 : 422);
  }
  if (err instanceof Anthropic.RateLimitError) {
    console.warn("rate limited by Anthropic API");
    return error("Busy, try again shortly", 503);
  }
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    console.error("Anthropic API key rejected:", err.status);
    return error("Summarizer is misconfigured", 500);
  }
  if (err instanceof Anthropic.BadRequestError) {
    console.error("bad request to Anthropic API:", err.message);
    return error("Could not summarize this policy", 422);
  }
  if (err instanceof Anthropic.APIError) {
    console.error("Anthropic API error:", err.status, err.message);
    return error("Summarizer is unavailable", 502);
  }
  console.error("unexpected error:", err);
  return error("Summarizer is unavailable", 500);
}

function response(summary: Summary, hash: string, cached: boolean): SummarizeResponse {
  return { summary, hash, cached, promptVersion: PROMPT_VERSION };
}

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...CORS_HEADERS },
  });
}

function error(message: string, status: number): Response {
  const body: ErrorResponse = { error: message };
  return json(body, status);
}
