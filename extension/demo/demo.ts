// Standalone demo: runs the real on-device summarizer on sample policy text,
// renders the cards, and runs the real detector on a fake cookie banner.
import { detectConsent, visibleText } from "../src/content/detect";
import { SummaryCard } from "../src/content/overlay";
import { summarizePolicy } from "../src/summarize/summarize";
import { SampleGallery } from "./gallery";
import { reserveSpaceForBanner } from "./layout";

/** Sample policy text. The cards below are what the summarizer makes of it. */
const SAMPLE_TEXT = {
  green:
    "We only use strictly necessary cookies to keep you signed in and remember your cart. " +
    "We do not sell your personal information. You can change your cookie settings at any time.",
  yellow:
    "We and our 142 partners use cookies to show you personalised ads and measure traffic. " +
    "You can reject non-essential cookies or change your preferences at any time.",
  red:
    "Your subscription will automatically renew each month after the free trial and you will be charged until you cancel. " +
    "We may sell your personal information to data brokers and advertising partners. " +
    "Any dispute will be resolved by binding arbitration and you waive any right to a class action.",
};

const SAMPLES = {
  green: summarizePolicy(SAMPLE_TEXT.green, "cookies"),
  yellow: summarizePolicy(SAMPLE_TEXT.yellow, "cookies"),
  red: summarizePolicy(SAMPLE_TEXT.red, "terms"),
};

for (const [slot, text] of Object.entries(SAMPLE_TEXT)) {
  const source = document.querySelector(`[data-source="${slot}"]`);
  if (source) source.textContent = text;
}

// In the samples, "Show the real terms" jumps to the in-page sample policy box.
// On a real website the card links to that site's own policy instead.
function showSamplePolicy(): void {
  const policy = document.getElementById("sample-policy");
  if (!policy) return;
  policy.scrollIntoView({ block: "start" });
  policy.focus({ preventScroll: true });
}

const gallery = new SampleGallery(
  document,
  [
    { slot: "green", label: "Green", kind: "cookies", show: (c) => c.showSummary(SAMPLES.green) },
    { slot: "yellow", label: "Yellow", kind: "cookies", show: (c) => c.showSummary(SAMPLES.yellow) },
    { slot: "red", label: "Red", kind: "terms", show: (c) => c.showSummary(SAMPLES.red) },
    { slot: "loading", label: "Loading", kind: "cookies", show: (c) => c.showLoading() },
    { slot: "error", label: "Fallback", kind: "terms", show: (c) => c.showError() },
  ],
  { log, onShowRealTerms: showSamplePolicy },
);
document.getElementById("reset-samples")?.addEventListener("click", () => gallery.reset());

// Live detection on the fake banner below.
const banner = document.getElementById("fake-banner") as HTMLElement;
reserveSpaceForBanner(banner);
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
    ignore: (el) => el.tagName === "AGREED-CARD" || el.closest(".gallery") !== null,
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
    onClose: (reason) => {
      log(`Live card closed (${reason}).`);
      if (liveCard === card) liveCard = null;
    },
  });
  liveCard = card;
  card.mount();
  card.showLoading();
  // The demo can't fetch example.com's policy, so it summarizes the banner text itself.
  const summary = summarizePolicy(visibleText(detection.root), detection.kind);
  window.setTimeout(() => {
    if (card.isOpen) card.showSummary(summary);
  }, 600);
});

function log(message: string): void {
  const list = document.getElementById("log");
  if (!list) return;
  const item = document.createElement("li");
  item.textContent = message;
  list.prepend(item);
}
