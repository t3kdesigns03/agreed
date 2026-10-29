import { describe, expect, it } from "vitest";
import { splitSentences, summarizePolicy } from "../src/summarize/summarize";
import { MAX_POINTS, RULES } from "../src/summarize/rules";

describe("summarizePolicy", () => {
  it("rates selling data and automatic charges red", () => {
    const summary = summarizePolicy(
      "Your subscription will automatically renew each month after the free trial. " +
        "We may sell your personal information to data brokers.",
      "terms",
    );
    expect(summary.risk).toBe("red");
    expect(summary.points).toContain("They may sell your personal information to other companies.");
    expect(summary.points).toContain("If you sign up, they will keep charging you until you cancel.");
    expect(summary.riskReason).toBe("They may sell your personal information.");
  });

  it("does not treat 'we do not sell' as selling, and says so", () => {
    const summary = summarizePolicy(
      "We do not sell your personal information. We only use strictly necessary cookies.",
      "cookies",
    );
    expect(summary.risk).toBe("green");
    expect(summary.points).toContain("They say they don't sell your personal information.");
    expect(summary.points.join(" ")).not.toContain("may sell");
  });

  it("still catches selling when 'not' appears elsewhere in the sentence", () => {
    const summary = summarizePolicy(
      "We sell your personal information to partners and you cannot opt out of this.",
      "privacy",
    );
    expect(summary.risk).toBe("red");
  });

  it("reads a 'Do Not Sell or Share My Personal Information' link as sharing for ads", () => {
    const summary = summarizePolicy(
      "We use cookies. Do Not Sell or Share My Personal Information. Accept all.",
      "cookies",
    );
    expect(summary.risk).toBe("yellow");
    expect(summary.points).toContain("They share your information for ads, but you can tell them to stop.");
    expect(summary.points.join(" ")).not.toContain("don't sell");
  });

  it("names the number of partners on a typical cookie banner", () => {
    const summary = summarizePolicy(
      "We and our 142 partners use cookies to show you personalised ads and measure traffic. " +
        "You can reject non-essential cookies at any time.",
      "cookies",
    );
    expect(summary.risk).toBe("yellow");
    expect(summary.points[0]).toBe("They share what you do here with 142 other companies.");
    expect(summary.points).toContain("You can say no to the extra cookies and still use the site.");
  });

  it("explains arbitration in plain words", () => {
    const summary = summarizePolicy(
      "Any dispute will be resolved by binding arbitration, and you waive any right to a jury trial.",
      "terms",
    );
    expect(summary.points).toContain("If something goes wrong, you can't take them to court. A private judge decides.");
  });

  it("ignores headings phrased as questions", () => {
    const summary = summarizePolicy(
      "Do we sell your personal information? No. We do not sell your personal information to anyone.",
      "privacy",
    );
    expect(summary.risk).toBe("green");
  });

  it("does not flag 'we do not knowingly collect health information'", () => {
    const summary = summarizePolicy("We do not knowingly collect health information or precise location.", "privacy");
    expect(summary.risk).not.toBe("red");
  });

  it("gives a yellow 'take a look' card when it recognizes nothing", () => {
    const summary = summarizePolicy("Welcome to our website. Please read the following carefully.", "terms");
    expect(summary.risk).toBe("yellow");
    expect(summary.points).toHaveLength(2);
    expect(summary.riskReason).toContain("couldn't find the key details");
  });

  it("never shows more than three points, and always at least two", () => {
    const everything =
      "We may sell your personal information. Your plan will auto-renew. We collect precise location. " +
      "We use targeted ads. Disputes go to arbitration. We may terminate your account at any time without notice.";
    const summary = summarizePolicy(everything, "terms");
    expect(summary.points.length).toBeLessThanOrEqual(MAX_POINTS);

    const thin = summarizePolicy("We use cookies to show you personalised ads.", "cookies");
    expect(thin.points.length).toBeGreaterThanOrEqual(2);
    expect(thin.points[0]).toBe("This website wants to save cookies on your device.");
  });

  it("is deterministic", () => {
    const text = "We and our 80 partners use cookies for advertising. You can change your cookie settings.";
    expect(summarizePolicy(text, "cookies")).toEqual(summarizePolicy(text, "cookies"));
  });
});

describe("rules", () => {
  it("keeps every point short enough for the card", () => {
    for (const rule of RULES) {
      const words = rule.point.split(/\s+/).length;
      expect(words, rule.id).toBeLessThanOrEqual(20);
    }
  });

  it("gives every warning a reason", () => {
    for (const rule of RULES.filter((r) => r.level !== "good")) {
      expect(rule.reason, rule.id).toBeTruthy();
    }
  });
});

describe("splitSentences", () => {
  it("splits on sentence ends, but not before a lowercase word (abbreviations, clauses)", () => {
    expect(splitSentences("We use cookies. You can say no; or not. See e.g. this. Then stop")).toEqual([
      "We use cookies.",
      "You can say no; or not.",
      "See e.g. this.",
      "Then stop",
    ]);
  });
});
