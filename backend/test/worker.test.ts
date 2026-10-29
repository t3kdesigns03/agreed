import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Summary } from "../../shared/types";

const summarizeWithClaude = vi.fn<(...args: unknown[]) => Promise<Summary>>();

vi.mock("../src/summarize", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/summarize")>();
  return { ...actual, summarizeWithClaude: (...args: unknown[]) => summarizeWithClaude(...args) };
});

const { default: worker } = await import("../src/index");
const { parseSummary, SummaryError } = await import("../src/summarize");

const POLICY = "We collect your email address and the pages you visit. We share this with advertising partners. ".repeat(3);
const SAMPLE: Summary = {
  points: ["They save your email and the pages you visit.", "They share it with advertisers."],
  risk: "yellow",
  riskReason: "Your data is shared for ads.",
};

function makeEnv() {
  const store = new Map<string, string>();
  const kv = {
    get: vi.fn(async (key: string, type?: string) => {
      const value = store.get(key);
      if (value === undefined) return null;
      return type === "json" ? JSON.parse(value) : value;
    }),
    put: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
  };
  return {
    env: { ANTHROPIC_API_KEY: "test-key", SUMMARY_CACHE: kv as unknown as KVNamespace },
    kv,
  };
}

function makeCtx() {
  const waits: Promise<unknown>[] = [];
  const ctx = { waitUntil: (p: Promise<unknown>) => waits.push(p), passThroughOnException() {} };
  return { ctx: ctx as unknown as ExecutionContext, settle: () => Promise.all(waits) };
}

function post(body: unknown): Request {
  return new Request("https://api.example/v1/summarize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("worker", () => {
  beforeEach(() => {
    summarizeWithClaude.mockReset();
  });

  it("summarizes, then serves the same policy from cache", async () => {
    summarizeWithClaude.mockResolvedValue(SAMPLE);
    const { env, kv } = makeEnv();

    const first = makeCtx();
    const res1 = await worker.fetch(post({ text: POLICY, kind: "privacy", truncated: false }), env, first.ctx);
    await first.settle();
    expect(res1.status).toBe(200);
    const body1 = (await res1.json()) as { cached: boolean; summary: Summary; hash: string };
    expect(body1.cached).toBe(false);
    expect(body1.summary).toEqual(SAMPLE);
    expect(kv.put).toHaveBeenCalledOnce();

    // Different whitespace, same policy: must hit the cache.
    const second = makeCtx();
    const res2 = await worker.fetch(
      post({ text: `  ${POLICY.replace(/ /g, "\n  ")}`, kind: "privacy", truncated: false }),
      env,
      second.ctx,
    );
    const body2 = (await res2.json()) as { cached: boolean; hash: string };
    expect(body2.cached).toBe(true);
    expect(body2.hash).toBe(body1.hash);
    expect(summarizeWithClaude).toHaveBeenCalledOnce();
  });

  it("rejects text that is too short", async () => {
    const { env } = makeEnv();
    const res = await worker.fetch(post({ text: "Accept", kind: "cookies" }), env, makeCtx().ctx);
    expect(res.status).toBe(400);
  });

  it("rejects malformed JSON", async () => {
    const { env } = makeEnv();
    const res = await worker.fetch(post("{not json"), env, makeCtx().ctx);
    expect(res.status).toBe(400);
  });

  it("returns 422 when the model declines", async () => {
    summarizeWithClaude.mockRejectedValue(new SummaryError("declined", false));
    const { env, kv } = makeEnv();
    const res = await worker.fetch(post({ text: POLICY, kind: "terms" }), env, makeCtx().ctx);
    expect(res.status).toBe(422);
    expect(kv.put).not.toHaveBeenCalled();
  });

  it("answers CORS preflight and health", async () => {
    const { env } = makeEnv();
    const pre = await worker.fetch(
      new Request("https://api.example/v1/summarize", { method: "OPTIONS" }),
      env,
      makeCtx().ctx,
    );
    expect(pre.status).toBe(204);
    expect(pre.headers.get("Access-Control-Allow-Origin")).toBe("*");
    const health = await worker.fetch(new Request("https://api.example/health"), env, makeCtx().ctx);
    expect(health.status).toBe(200);
  });
});

describe("parseSummary", () => {
  it("accepts valid output and trims to three points", () => {
    const summary = parseSummary(
      JSON.stringify({ points: ["One.", "Two.", "Three.", "Four."], risk: "red", risk_reason: "They sell data." }),
    );
    expect(summary.points).toEqual(["One.", "Two.", "Three."]);
    expect(summary.risk).toBe("red");
    expect(summary.riskReason).toBe("They sell data.");
  });

  it("rejects an invalid risk level", () => {
    expect(() => parseSummary(JSON.stringify({ points: ["One."], risk: "blue", risk_reason: "" }))).toThrow(
      SummaryError,
    );
  });

  it("rejects non-JSON output", () => {
    expect(() => parseSummary("Sure! Here is a summary")).toThrow(SummaryError);
  });

  it("clips very long points at a word boundary", () => {
    const long = "word ".repeat(100).trim();
    const summary = parseSummary(JSON.stringify({ points: [long], risk: "green", risk_reason: "Fine." }));
    expect(summary.points[0]!.length).toBeLessThanOrEqual(220);
    expect(summary.points[0]!.endsWith("…")).toBe(true);
  });
});
