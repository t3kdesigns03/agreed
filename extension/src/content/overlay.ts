import type { PolicyKind, RiskLevel, Summary } from "../../../shared/types";
import { CARD_CSS } from "./overlay-styles";

export type CloseReason = "dismissed" | "looks-okay" | "be-careful" | "accepted" | "consent-gone";

export interface CardOptions {
  kind: PolicyKind;
  /** Full policy URL. Without one, "Show the real terms" calls onShowRealTerms instead. */
  realTermsUrl: string | null;
  onShowRealTerms?: () => void;
  /** Label of the site's own accept button, when PlainAgree is able to press it. */
  acceptLabel: string | null;
  /** Press the site's accept button. Returns false if the button is gone. */
  onAccept?: () => boolean;
  onClose: (reason: CloseReason) => void;
  /** Render inside this element instead of floating over the page (demo page). */
  container?: HTMLElement;
}

const SUBTITLES: Record<PolicyKind, string> = {
  cookies: "About this website's cookies",
  terms: "About this website's terms",
  privacy: "About this website's privacy policy",
  unknown: "About this website's rules",
};

const RISK_LABELS: Record<RiskLevel, string> = {
  green: "Looks fine",
  yellow: "Read with care",
  red: "Watch out",
};

/**
 * Whether a click came from the user rather than a script. A separate object
 * only so tests can stand in for a real tap; jsdom can't create trusted events.
 */
export const userGesture = {
  isReal: (event: Event): boolean => event.isTrusted,
};

const SVG_NS = "http://www.w3.org/2000/svg";
const ICON_PATHS: Record<RiskLevel | "close", string> = {
  green: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm-1.2 14.2-4.3-4.3 1.6-1.6 2.7 2.7 5.6-5.6 1.6 1.6-7.2 7.2Z",
  yellow: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1.2 15h-2.4v-2.4h2.4V17Zm0-4.4h-2.4V7h2.4v5.6Z",
  red: "M12 2.5 1.5 21h21L12 2.5Zm1.2 15.3h-2.4v-2.4h2.4v2.4Zm0-4.2h-2.4V9h2.4v4.6Z",
  close: "M6.4 5 5 6.4l5.6 5.6L5 17.6 6.4 19l5.6-5.6 5.6 5.6 1.4-1.4-5.6-5.6L19 6.4 17.6 5 12 10.6 6.4 5Z",
};

/**
 * The PlainAgree summary card. Lives in a closed Shadow DOM so page styles
 * can't break it and page scripts can't read or click it.
 */
export class SummaryCard {
  private readonly host: HTMLElement;
  private readonly root: ShadowRoot;
  private readonly title: HTMLHeadingElement;
  private readonly body: HTMLDivElement;
  private readonly previousFocus: Element | null;
  private closed = false;

  constructor(private readonly options: CardOptions) {
    const doc = (options.container ?? document.documentElement).ownerDocument;
    this.previousFocus = doc.activeElement;

    this.host = doc.createElement("plainagree-card");
    this.root = this.host.attachShadow({ mode: "closed" });

    const style = doc.createElement("style");
    style.textContent = CARD_CSS;

    const wrap = doc.createElement("div");
    wrap.className = options.container ? "wrap inline" : "wrap";

    const card = doc.createElement("section");
    card.className = "card";
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-modal", "false");
    card.setAttribute("aria-labelledby", "pa-title");
    card.setAttribute("aria-describedby", "pa-body");
    card.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        event.preventDefault();
        this.close("dismissed");
      }
    });

    const top = el(doc, "div", "top");
    const brand = el(doc, "span", "brand", "PlainAgree");
    const closeButton = el(doc, "button", "close");
    closeButton.type = "button";
    closeButton.setAttribute("aria-label", "Close this summary");
    closeButton.append(icon(doc, "close"));
    closeButton.addEventListener("click", () => this.close("dismissed"));
    top.append(brand, closeButton);

    this.title = el(doc, "h2", "", "What you're agreeing to");
    this.title.id = "pa-title";
    this.title.tabIndex = -1;

    const subtitle = el(doc, "p", "subtitle", SUBTITLES[options.kind]);

    this.body = el(doc, "div", "body");
    this.body.id = "pa-body";
    this.body.setAttribute("aria-live", "polite");

    const footer = el(doc, "div", "footer");
    footer.append(this.realTermsControl(doc));

    card.append(top, this.title, subtitle, this.body, footer);
    wrap.append(card);
    this.root.append(style, wrap);
  }

  mount(): void {
    (this.options.container ?? document.documentElement).append(this.host);
    if (!this.options.container) this.title.focus({ preventScroll: true });
  }

  get isOpen(): boolean {
    return !this.closed;
  }

  /** Bring keyboard focus back to the card (used when the user re-checks the page). */
  focus(): void {
    this.title.focus({ preventScroll: true });
  }

  showLoading(): void {
    const doc = this.host.ownerDocument;
    const status = el(doc, "p", "status");
    const spinner = el(doc, "span", "spinner");
    spinner.setAttribute("aria-hidden", "true");
    status.append(spinner, doc.createTextNode("Reading the fine print for you…"));
    this.render(status);
  }

  showSummary(summary: Summary): void {
    const doc = this.host.ownerDocument;

    const risk = el(doc, "div", `risk risk-${summary.risk}`);
    const text = el(doc, "div");
    text.append(el(doc, "strong", "risk-label", RISK_LABELS[summary.risk]));
    if (summary.riskReason) text.append(el(doc, "span", "risk-reason", summary.riskReason));
    risk.append(icon(doc, summary.risk), text);

    const list = el(doc, "ul", "points");
    for (const point of summary.points) list.append(el(doc, "li", "", point));

    const actions = el(doc, "div", "actions");
    actions.append(
      button(doc, "primary", "Looks okay", () => this.afterLooksOkay()),
      button(doc, "secondary", "Be careful", () => this.afterBeCareful()),
    );

    this.render(risk, list, actions);
  }

  showError(): void {
    const doc = this.host.ownerDocument;
    const actions = el(doc, "div", "actions");
    actions.append(button(doc, "secondary", "Close", () => this.close("dismissed")));
    this.render(
      el(doc, "p", "", "We couldn't read these terms right now."),
      el(doc, "p", "", "Nothing has been accepted. You can open the real terms below and decide for yourself."),
      actions,
    );
  }

  close(reason: CloseReason): void {
    if (this.closed) return;
    this.closed = true;
    const hadFocus = this.root.activeElement !== null;
    this.host.remove();
    if (hadFocus && this.previousFocus instanceof HTMLElement && this.previousFocus.isConnected) {
      this.previousFocus.focus({ preventScroll: true });
    }
    this.options.onClose(reason);
  }

  private afterLooksOkay(): void {
    const { acceptLabel, onAccept } = this.options;
    if (!acceptLabel || !onAccept) {
      this.close("looks-okay");
      return;
    }
    const doc = this.host.ownerDocument;
    const actions = el(doc, "div", "actions");
    actions.append(
      button(doc, "primary", "Yes, press it for me", (event) => {
        // Only a real tap by the user may press the site's button.
        if (!userGesture.isReal(event)) return;
        if (onAccept()) this.close("accepted");
        else this.showAcceptFailed();
      }),
      button(doc, "secondary", "No, I'll do it", () => this.close("looks-okay")),
    );
    this.render(el(doc, "p", "", `Do you want PlainAgree to press “${acceptLabel}” for you?`), actions);
    this.focusFirstButton();
  }

  private afterBeCareful(): void {
    const doc = this.host.ownerDocument;
    const actions = el(doc, "div", "actions");
    actions.append(button(doc, "secondary", "Close", () => this.close("be-careful")));
    this.render(
      el(doc, "p", "", "Good idea. Nothing has been accepted."),
      el(doc, "p", "", "Take your time. You can say no, pick fewer options, or leave this website."),
      actions,
    );
    this.focusFirstButton();
  }

  private showAcceptFailed(): void {
    const doc = this.host.ownerDocument;
    const actions = el(doc, "div", "actions");
    actions.append(button(doc, "secondary", "Close", () => this.close("dismissed")));
    this.render(el(doc, "p", "", "We couldn't find that button any more. Please press it yourself on the page."), actions);
    this.focusFirstButton();
  }

  private realTermsControl(doc: Document): HTMLElement {
    const { realTermsUrl, onShowRealTerms } = this.options;
    if (realTermsUrl) {
      const link = el(doc, "a", "real-terms", "Show the real terms");
      link.href = realTermsUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      return link;
    }
    const control = button(doc, "real-terms", "Show the real terms", () => onShowRealTerms?.());
    return control;
  }

  private render(...nodes: Node[]): void {
    this.body.replaceChildren(...nodes);
  }

  private focusFirstButton(): void {
    this.body.querySelector("button")?.focus({ preventScroll: true });
  }
}

function el<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  className = "",
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  // textContent, never innerHTML: summaries come from the network.
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(
  doc: Document,
  className: string,
  label: string,
  onClick: (event: MouseEvent) => void,
): HTMLButtonElement {
  const b = el(doc, "button", className, label);
  b.type = "button";
  b.addEventListener("click", onClick);
  return b;
}

function icon(doc: Document, name: keyof typeof ICON_PATHS): SVGSVGElement {
  const svg = doc.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  const path = doc.createElementNS(SVG_NS, "path");
  path.setAttribute("d", ICON_PATHS[name]);
  path.setAttribute("fill", "currentColor");
  svg.append(path);
  return svg;
}
