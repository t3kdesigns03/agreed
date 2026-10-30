// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { SummaryCard, type CardOptions, type CloseReason } from "../src/content/overlay";
import type { Summary } from "../src/shared/types";

// The card uses a closed shadow root. Capture it so tests can look inside.
const roots = new WeakMap<Element, ShadowRoot>();
const originalAttach = Element.prototype.attachShadow;
Element.prototype.attachShadow = function (init: ShadowRootInit) {
  const root = originalAttach.call(this, init);
  roots.set(this, root);
  return root;
};

const SUMMARY: Summary = {
  points: ["They share your visits with advertisers.", "You can say no to ad cookies."],
  risk: "yellow",
  riskReason: "Your visits are shared for ads.",
};

function mount(overrides: Partial<CardOptions> = {}) {
  const onClose = vi.fn<(reason: CloseReason) => void>();
  const card = new SummaryCard({
    kind: "cookies",
    realTermsUrl: "https://example.com/cookies",
    onClose,
    ...overrides,
  });
  card.mount();
  const host = document.querySelector("agreed-card")!;
  const root = roots.get(host)!;
  return { card, root, onClose };
}

function buttonByText(root: ShadowRoot, text: string): HTMLButtonElement {
  const button = Array.from(root.querySelectorAll("button")).find((b) => b.textContent === text);
  if (!button) throw new Error(`No button "${text}"`);
  return button;
}

afterEach(() => {
  document.querySelectorAll("agreed-card").forEach((el) => el.remove());
});

describe("SummaryCard", () => {
  it("renders the title, risk, points and real-terms link", () => {
    const { card, root } = mount();
    card.showSummary(SUMMARY);
    expect(root.querySelector("h2")?.textContent).toBe("What you're agreeing to");
    expect(root.querySelector(".risk-yellow .risk-label")?.textContent).toBe("Read with care");
    expect(Array.from(root.querySelectorAll(".points li"), (li) => li.textContent)).toEqual(SUMMARY.points);
    const link = root.querySelector<HTMLAnchorElement>("a.real-terms")!;
    expect(link.href).toBe("https://example.com/cookies");
    expect(link.rel).toContain("noopener");
    expect(root.querySelector("[role='dialog']")?.getAttribute("aria-labelledby")).toBe("pa-title");
  });

  it("treats summary text as text, never HTML", () => {
    const { card, root } = mount();
    card.showSummary({ ...SUMMARY, points: ['<img src=x onerror="alert(1)">'] });
    expect(root.querySelector("img")).toBeNull();
    expect(root.querySelector(".points li")?.textContent).toBe('<img src=x onerror="alert(1)">');
  });

  it("closes on Escape", () => {
    const { root, onClose } = mount();
    root.querySelector(".card")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(onClose).toHaveBeenCalledWith("dismissed");
    expect(document.querySelector("agreed-card")).toBeNull();
  });

  it("closes on 'Looks okay' and never offers to press anything on the page", () => {
    const { card, root, onClose } = mount();
    card.showSummary(SUMMARY);
    expect(root.textContent).not.toMatch(/press it for me|for you\?/i);
    buttonByText(root, "Looks okay").click();
    expect(onClose).toHaveBeenCalledWith("looks-okay");
  });

  it("shows the not-legal-advice line with every summary, before any button", () => {
    const { card, root } = mount();
    card.showSummary(SUMMARY);
    const disclaimer = root.querySelector(".disclaimer");
    expect(disclaimer?.textContent).toBe("Automatic summary of the text on this page. Not legal advice.");
    const firstButton = root.querySelector(".actions button")!;
    expect(disclaimer!.compareDocumentPosition(firstButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("never calls a green card safe", () => {
    const { card, root } = mount();
    card.showSummary({ ...SUMMARY, risk: "green" });
    expect(root.querySelector(".risk-label")?.textContent).toBe("No red flags found");
  });

  it("'Be careful' confirms nothing was accepted", () => {
    const { card, root, onClose } = mount();
    card.showSummary(SUMMARY);
    buttonByText(root, "Be careful").click();
    expect(root.textContent).toContain("Nothing has been accepted");
    buttonByText(root, "Close").click();
    expect(onClose).toHaveBeenCalledWith("be-careful");
  });

  it("shows a fallback with the real terms and a way out when summarizing fails", () => {
    const { card, root, onClose } = mount();
    card.showError();
    expect(root.textContent).toContain("couldn't read these terms");
    expect(root.querySelector("a.real-terms")).not.toBeNull();
    buttonByText(root, "Close").click();
    expect(onClose).toHaveBeenCalledWith("dismissed");
  });

  it("uses a button for 'Show the real terms' when there is no link", () => {
    const onShowRealTerms = vi.fn();
    const { root } = mount({ realTermsUrl: null, onShowRealTerms });
    buttonByText(root, "Show the real terms").click();
    expect(onShowRealTerms).toHaveBeenCalledOnce();
  });
});
