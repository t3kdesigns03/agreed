// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SampleGallery, type SampleSpec } from "../demo/gallery";
import { reserveSpaceForBanner } from "../demo/layout";
import type { Summary } from "../src/shared/types";
import demoHtml from "../demo/index.html?raw";
import privacyHtml from "../static/privacy.html?raw";

// The card uses a closed shadow root. Capture it so tests can look inside.
const roots = new WeakMap<Element, ShadowRoot>();
const originalAttach = Element.prototype.attachShadow;
Element.prototype.attachShadow = function (init: ShadowRootInit) {
  const root = originalAttach.call(this, init);
  roots.set(this, root);
  return root;
};

const SUMMARY: Summary = { points: ["One.", "Two."], risk: "yellow", riskReason: "Because." };

const SPECS: SampleSpec[] = [
  { slot: "green", label: "Green", kind: "cookies", show: (c) => c.showSummary({ ...SUMMARY, risk: "green" }) },
  { slot: "yellow", label: "Yellow", kind: "cookies", show: (c) => c.showSummary(SUMMARY) },
  { slot: "loading", label: "Loading", kind: "cookies", show: (c) => c.showLoading() },
];

function cardIn(slot: string): ShadowRoot | null {
  const host = document.querySelector(`[data-slot="${slot}"] agreed-card`);
  return host ? roots.get(host)! : null;
}

function press(root: ShadowRoot, text: string): void {
  const button = Array.from(root.querySelectorAll("button")).find((b) => b.textContent === text);
  if (!button) throw new Error(`No button "${text}"`);
  button.click();
}

function escape(root: ShadowRoot): void {
  root.querySelector("button")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
}

describe("demo sample gallery", () => {
  let log: string[];
  let gallery: SampleGallery;
  const onShowRealTerms = vi.fn();

  beforeEach(() => {
    document.body.innerHTML = SPECS.map((s) => `<div data-slot="${s.slot}"></div>`).join("");
    log = [];
    gallery = new SampleGallery(document, SPECS, { log: (m) => log.push(m), onShowRealTerms });
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("renders every sample card", () => {
    for (const spec of SPECS) expect(cardIn(spec.slot)).not.toBeNull();
  });

  it("removes a dismissed card and keeps it removed", async () => {
    press(cardIn("green")!, "Looks okay");
    expect(cardIn("green")).toBeNull();
    expect(document.querySelector('[data-slot="green"] .dismissed')?.textContent).toContain("Reset sample cards");
    expect(log).toEqual(["Green sample card dismissed (looks-okay)."]);
    // The old version re-rendered dismissed cards after a delay. Make sure nothing comes back.
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(cardIn("green")).toBeNull();
  });

  it("dismisses on ×, on Close after 'Be careful', and on Escape, with a log entry each time", () => {
    press(cardIn("green")!, "");
    const yellow = cardIn("yellow")!;
    press(yellow, "Be careful");
    press(yellow, "Close");
    escape(cardIn("loading")!);
    for (const spec of SPECS) expect(cardIn(spec.slot)).toBeNull();
    expect(log).toEqual([
      "Green sample card dismissed (dismissed).",
      "Yellow sample card dismissed (be-careful).",
      "Loading sample card dismissed (dismissed).",
    ]);
  });

  it("moves focus to the note left in place of the card", () => {
    escape(cardIn("yellow")!);
    expect(document.activeElement).toBe(document.querySelector('[data-slot="yellow"] .dismissed'));
  });

  it("brings every card back on reset, and Escape works the same every time", () => {
    for (let round = 0; round < 3; round++) {
      escape(cardIn("green")!);
      expect(cardIn("green")).toBeNull();
      gallery.reset();
      for (const spec of SPECS) expect(cardIn(spec.slot)).not.toBeNull();
      expect(document.querySelectorAll(".dismissed")).toHaveLength(0);
    }
    expect(log.filter((m) => m === "Green sample card dismissed (dismissed).")).toHaveLength(3);
    expect(log.filter((m) => m === "Sample cards reset.")).toHaveLength(3);
  });

  it("resets without duplicating cards that were never dismissed", () => {
    gallery.reset();
    for (const spec of SPECS) {
      expect(document.querySelectorAll(`[data-slot="${spec.slot}"] agreed-card`)).toHaveLength(1);
    }
  });

  it("uses the in-page sample policy for 'Show the real terms'", () => {
    const root = cardIn("yellow")!;
    expect(root.querySelector("a.real-terms")).toBeNull();
    press(root, "Show the real terms");
    expect(onShowRealTerms).toHaveBeenCalledOnce();
  });
});

describe("demo banner spacing", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.documentElement.style.removeProperty("--banner-space");
  });

  function fakeBanner(height: number): HTMLElement {
    const banner = document.createElement("div");
    banner.getBoundingClientRect = () => ({ height }) as DOMRect;
    document.body.append(banner);
    return banner;
  }

  it("reserves the banner's measured height and follows it as it changes", () => {
    let notify = () => {};
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: () => void) {
          notify = callback;
        }
        observe() {}
        disconnect() {}
      },
    );
    const banner = fakeBanner(137.4);
    reserveSpaceForBanner(banner);
    const space = () => document.documentElement.style.getPropertyValue("--banner-space");
    expect(space()).toBe("138px");

    banner.getBoundingClientRect = () => ({ height: 290 }) as DOMRect; // wrapped onto more lines on a phone
    notify();
    expect(space()).toBe("290px");

    banner.hidden = true; // after "Accept all" or "Reject"
    notify();
    expect(space()).toBe("0px");
  });

  it("pads the page by that height so nothing ends up behind the banner", () => {
    expect(demoHtml).toMatch(/main\s*{[^}]*padding:[^;]*var\(--banner-space\)/);
    expect(demoHtml).toMatch(/scroll-padding-bottom:[^;]*var\(--banner-space\)/);
  });
});

describe("demo and privacy page wording", () => {
  const read = (html: string) => {
    const doc = document.implementation.createHTMLDocument();
    doc.documentElement.innerHTML = html;
    return doc.body.textContent!.replace(/\s+/g, " ");
  };
  const demo = read(demoHtml);
  const privacy = read(privacyHtml);

  it("makes no absolute 'nothing goes over the network' claim", () => {
    expect(demo).not.toMatch(/nothing (here )?goes over the network/i);
    expect(demo).not.toMatch(/never makes any (network )?request/i);
  });

  it("describes the same single network request on both pages", () => {
    for (const text of [demo, privacy]) {
      expect(text).toMatch(/same website/i);
      expect(text).toMatch(/downloads that page/i);
      expect(text).toMatch(/without your cookies|cookies are not sent/i);
    }
    expect(demo).toMatch(/once loaded, this demo page makes no network requests/i);
    expect(privacy).toMatch(/once it has loaded it makes no network requests/i);
  });

  it("labels the static loading card and the demo-only real-terms link", () => {
    expect(demo).toMatch(/Loading \(static example\)/);
    expect(demo).toMatch(/Demo only: in these sample cards, “Show the real terms” jumps to the Sample policy box/);
  });
});
