// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { detectConsent, normalizeLabel } from "../src/content/detect";
import { extractPolicyFromHtml, prepareForSummary } from "../src/content/extract";
import { MAX_POLICY_CHARS } from "../src/shared/types";

/** jsdom has no layout, so treat anything not hidden by attribute or inline style as visible. */
function visible(el: Element): boolean {
  for (let node: Element | null = el; node; node = node.parentElement) {
    if (node.hasAttribute("hidden")) return false;
    if ((node as HTMLElement).style?.display === "none") return false;
  }
  return true;
}

function page(html: string): Document {
  document.body.innerHTML = html;
  return document;
}

const detect = (doc: Document, threshold?: number) => detectConsent(doc, { isVisible: visible, threshold });

describe("detectConsent", () => {
  it("finds a typical cookie banner with an accept button and policy link", () => {
    const doc = page(`
      <main><h1>News</h1><p>${"Article text. ".repeat(50)}</p></main>
      <div class="cookie-banner" style="position: fixed; bottom: 0">
        <p>We use cookies to personalise ads and measure traffic.
           See our <a href="https://example.com/cookie-policy">cookie policy</a>.</p>
        <button>Reject</button>
        <button>Accept all cookies</button>
      </div>`);
    const result = detect(doc);
    expect(result).not.toBeNull();
    expect(result!.kind).toBe("cookies");
    expect(result!.acceptLabel).toBe("Accept all cookies");
    expect(result!.policyUrl).toBe("https://example.com/cookie-policy");
    expect(result!.root.className).toBe("cookie-banner");
  });

  it("recognises known consent managers by selector", () => {
    const doc = page(`
      <div id="onetrust-banner-sdk">
        <p>We and our partners process personal data such as IP address.</p>
        <button id="onetrust-accept-btn-handler">I Accept</button>
      </div>`);
    const result = detect(doc);
    expect(result?.root.id).toBe("onetrust-banner-sdk");
    expect(result?.acceptLabel).toBe("I Accept");
  });

  it("finds a 'We value your privacy' banner in a generic modal", () => {
    const doc = page(`
      <div class="site-modal">
        <h2>We value your privacy</h2>
        <p>Read our <a href="https://example.com/data-protection">data protection notice</a>.</p>
        <button>Agree and continue</button>
      </div>`);
    const result = detect(doc);
    expect(result?.root.className).toBe("site-modal");
    expect(result?.kind).toBe("cookies");
    expect(result?.policyUrl).toBe("https://example.com/data-protection");
  });

  it("finds 'By signing up you agree' text with links to the terms", () => {
    const doc = page(`
      <form>
        <input type="email" aria-label="Email">
        <button type="submit">Sign up</button>
        <p class="legal">By signing up, you agree to our
          <a href="https://example.com/terms">Terms of Service</a> and
          <a href="https://example.com/privacy">Privacy Policy</a>.</p>
      </form>`);
    const result = detect(doc);
    expect(result).not.toBeNull();
    expect(result!.kind).toBe("terms");
    expect(result!.policyUrl).toBe("https://example.com/terms");
    // Never offer to press "Sign up" for the user.
    expect(result!.acceptButton).toBeNull();
  });

  it("finds a Terms of Service modal", () => {
    const doc = page(`
      <div role="dialog" aria-label="Updated terms">
        <h2>We've updated our Terms</h2>
        <p>Please review the new <a href="https://example.com/legal/terms-of-service">Terms of Use</a>
           before continuing.</p>
        <button>I agree</button>
      </div>`);
    const result = detect(doc);
    expect(result?.kind).toBe("terms");
    expect(result?.acceptLabel).toBe("I agree");
  });

  it("ignores ordinary dialogs with an Accept button", () => {
    const doc = page(`
      <div role="dialog"><p>Sam invited you to the team workspace.</p><button>Accept</button><button>Decline</button></div>`);
    expect(detect(doc)).toBeNull();
  });

  it("ignores articles that merely mention cookies", () => {
    const doc = page(`
      <article><p>Many websites say "we use cookies" but few explain what that means for you as a reader.</p>
      <p><a href="https://example.com/privacy">Our privacy policy</a></p></article>`);
    expect(detect(doc)).toBeNull();
  });

  it("ignores hidden banners", () => {
    const doc = page(`
      <div class="cookie-banner" hidden>
        <p>We use cookies.</p><button>Accept all</button>
      </div>`);
    expect(detect(doc)).toBeNull();
  });

  it("does not follow links that point back to the same page", () => {
    const doc = page(`
      <div class="consent-popup" style="position: fixed">
        <p>We use cookies to improve the site. <a href="#">Cookie settings</a></p>
        <button>Accept</button>
      </div>`);
    const result = detect(doc);
    expect(result).not.toBeNull();
    expect(result!.policyUrl).toBeNull();
  });

  it("finds weaker signals only with the manual threshold", () => {
    const doc = page(`
      <div class="notice-bar"><p>This website uses cookies.</p><button>Got it</button></div>`);
    expect(detect(doc)).toBeNull();
    expect(detect(doc, 3)?.kind).toBe("cookies");
  });
});

describe("normalizeLabel", () => {
  it("lowercases and strips punctuation but keeps ampersands", () => {
    expect(normalizeLabel("  Accept & Continue! ")).toBe("accept & continue");
    expect(normalizeLabel("I’m OK")).toBe("i'm ok");
  });
});

describe("extractPolicyFromHtml", () => {
  it("prefers the main content and drops navigation and scripts", () => {
    const body = "We collect your email address to send you receipts. ".repeat(20);
    const html = `<html><body>
      <nav>Home About Shop</nav>
      <main><h1>Privacy Policy</h1><p>${body}</p><script>alert(1)</script></main>
      <footer>© Example</footer></body></html>`;
    const text = extractPolicyFromHtml(html);
    expect(text.startsWith("Privacy Policy We collect")).toBe(true);
    expect(text).not.toContain("Home About");
    expect(text).not.toContain("alert");
    expect(text).not.toContain("©");
  });

  it("keeps words in adjacent elements apart", () => {
    const text = extractPolicyFromHtml("<body><h2>Section 1</h2><p>Data we collect</p></body>");
    expect(text).toBe("Section 1 Data we collect");
  });
});

describe("prepareForSummary", () => {
  it("leaves normal policies alone", () => {
    expect(prepareForSummary("  Short   policy text. ")).toEqual({ text: "Short policy text.", truncated: false });
  });

  it("cuts very long policies and says so", () => {
    const result = prepareForSummary("This is one sentence. ".repeat(10_000));
    expect(result.truncated).toBe(true);
    expect(result.text.length).toBeLessThanOrEqual(MAX_POLICY_CHARS);
    expect(result.text.endsWith(".")).toBe(true);
  });
});
