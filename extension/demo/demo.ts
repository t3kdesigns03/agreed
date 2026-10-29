// Standalone demo: renders sample cards and runs the real detector on a fake
// cookie banner. Uses canned summaries, so it needs no extension or backend.
import type { PolicyKind, Summary } from "../../shared/types";
import { detectConsent } from "../src/content/detect";
import { SummaryCard } from "../src/content/overlay";

const SAMPLES: Record<"green" | "yellow" | "red", Summary> = {
  green: {
    points: [
      "They only use cookies that the website needs to work.",
      "They don't share what you do here with advertisers.",
    ],
    risk: "green",
    riskReason: "Nothing unusual. Your information is only used to run the site.",
  },
  yellow: {
    points: [
      "They use cookies to show you ads and count your visits.",
      "If you tap Accept all, they share this with 142 ad partners.",
      "You can say no to ad cookies and still use the site.",
    ],
    risk: "yellow",
    riskReason: "Your visits are shared with advertisers unless you say no.",
  },
  red: {
    points: [
      "After the 7-day free trial, they charge you $14.99 every month.",
      "They can sell your name, email and location to other companies.",
      "You can't take them to court. Problems go to a private judge.",
    ],
    risk: "red",
    riskReason: "Automatic charges and they can sell your personal information.",
  },
};

function renderStatic(slot: string, build: (card: SummaryCard) => void, kind: PolicyKind = "cookies"): void {
  const container = document.querySelector<HTMLElement>(`[data-slot="${slot}"]`);
  if (!container) return;
  const card = new SummaryCard({
    kind,
    realTermsUrl: "#sample-policy",
    acceptLabel: "Accept all",
    onAccept: () => true,
    onClose: (reason) => {
      log(`Sample "${slot}" card closed (${reason}).`);
      // Re-render so the gallery stays complete.
      window.setTimeout(() => renderStatic(slot, build, kind), 400);
    },
    container,
  });
  card.mount();
  build(card);
}

renderStatic("green", (c) => c.showSummary(SAMPLES.green));
renderStatic("yellow", (c) => c.showSummary(SAMPLES.yellow));
renderStatic("red", (c) => c.showSummary(SAMPLES.red), "terms");
renderStatic("loading", (c) => c.showLoading());
renderStatic("error", (c) => c.showError(), "terms");

// Live detection on the fake banner below.
const banner = document.getElementById("fake-banner") as HTMLElement;
const acceptButton = document.getElementById("fake-accept") as HTMLButtonElement;
const runButton = document.getElementById("run-detector") as HTMLButtonElement;
const resetButton = document.getElementById("reset-banner") as HTMLButtonElement;
let liveCard: SummaryCard | null = null;

acceptButton.addEventListener("click", () => {
  banner.hidden = true;
  log("The site's “Accept all” button was pressed.");
});
document.getElementById("fake-reject")?.addEventListener("click", () => {
  banner.hidden = true;
  log("The site's “Reject” button was pressed.");
});

resetButton.addEventListener("click", () => {
  banner.hidden = false;
  log("Banner shown again.");
});

runButton.addEventListener("click", () => {
  liveCard?.close("dismissed");
  const detection = detectConsent(document, {
    ignore: (el) => el.tagName === "PLAINAGREE-CARD" || el.closest(".gallery") !== null,
  });
  if (!detection) {
    log("No consent UI detected. (Is the banner hidden? Press “Show the banner again”.)");
    return;
  }
  log(
    `Detected a “${detection.kind}” consent UI (score ${detection.score}). Accept button: ${
      detection.acceptLabel ? `“${detection.acceptLabel}”` : "none"
    }. Policy link: ${detection.policyUrl ?? "none"}.`,
  );
  const card = new SummaryCard({
    kind: detection.kind,
    realTermsUrl: detection.policyUrl,
    onShowRealTerms: () => detection.root.scrollIntoView({ behavior: "smooth", block: "center" }),
    acceptLabel: detection.acceptButton ? detection.acceptLabel : null,
    onAccept: () => {
      if (!detection.acceptButton?.isConnected) return false;
      detection.acceptButton.click();
      return true;
    },
    onClose: (reason) => {
      log(`Live card closed (${reason}).`);
      if (liveCard === card) liveCard = null;
    },
  });
  liveCard = card;
  card.mount();
  card.showLoading();
  window.setTimeout(() => {
    if (card.isOpen) card.showSummary(SAMPLES.yellow);
  }, 1200);
});

function log(message: string): void {
  const list = document.getElementById("log");
  if (!list) return;
  const item = document.createElement("li");
  item.textContent = message;
  list.prepend(item);
}
