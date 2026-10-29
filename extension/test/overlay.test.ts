// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { SummaryCard, userGesture, type CardOptions, type CloseReason } from "../src/content/overlay";
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
    acceptLabel: null,
    onClose,
    ...overrides,
  });
  card.mount();
  const host = document.querySelector("plainagree-card")!;
  const root = roots.get(host)!;
  return { card, root, onClose };
}

function buttonByText(root: ShadowRoot, text: string): HTMLButtonElement {
  const button = Array.from(root.querySelectorAll("button")).find((b) => b.textContent === text);
  if (!button) throw new Error(`No button "${text}"`);
  return button;
}

/** jsdom can't create trusted events; simulate a real tap for one click. */
function trustedClick(el: HTMLElement): void {
  const spy = vi.spyOn(userGesture, "isReal").mockReturnValue(true);
  el.click();
  spy.mockRestore();
}

afterEach(() => {
  document.querySelectorAll("plainagree-card").forEach((el) => el.remove());
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
    expect(document.querySelector("plainagree-card")).toBeNull();
  });

  it("offers to press the accept button only after 'Looks okay', and only on a real tap", () => {
    const onAccept = vi.fn(() => true);
    const { card, root, onClose } = mount({ acceptLabel: "Accept all", onAccept });
    card.showSummary(SUMMARY);
    expect(onAccept).not.toHaveBeenCalled();

    buttonByText(root, "Looks okay").click();
    expect(root.textContent).toContain("press “Accept all” for you?");

    // A synthetic click (e.g. from a page script) must not press anything.
    buttonByText(root, "Yes, press it for me").click();
    expect(onAccept).not.toHaveBeenCalled();

    trustedClick(buttonByText(root, "Yes, press it for me"));
    expect(onAccept).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledWith("accepted");
  });

  it("closes on 'Looks okay' when there is no button to press", () => {
    const { card, root, onClose } = mount();
    card.showSummary(SUMMARY);
    buttonByText(root, "Looks okay").click();
    expect(onClose).toHaveBeenCalledWith("looks-okay");
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
