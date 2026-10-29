import { ext } from "../shared/browser";
import type { ManualCheckMessage, ManualCheckReply } from "../shared/messages";

const button = document.getElementById("check") as HTMLButtonElement;
const status = document.getElementById("status") as HTMLParagraphElement;

button.addEventListener("click", async () => {
  button.disabled = true;
  status.textContent = "Checking…";
  status.textContent = await checkActiveTab();
  button.disabled = false;
});

async function checkActiveTab(): Promise<string> {
  let tabId: number | undefined;
  try {
    const [tab] = await ext.tabs.query({ active: true, currentWindow: true });
    tabId = tab?.id;
  } catch {
    tabId = undefined;
  }
  if (tabId === undefined) return "PlainAgree can't check this page.";

  const reply = await new Promise<ManualCheckReply | null>((resolve) => {
    const message: ManualCheckMessage = { type: "manual-check" };
    ext.tabs.sendMessage(tabId, message, (response?: ManualCheckReply) => {
      // lastError means no content script here: a browser page, or opened before install.
      resolve(ext.runtime.lastError ? null : (response ?? null));
    });
  });

  if (!reply) return "PlainAgree can't check this page. If it was open before you installed PlainAgree, reload it and try again.";
  if (reply.found) {
    window.setTimeout(() => window.close(), 600);
    return "Done. Look for the PlainAgree card on the page.";
  }
  return "We didn't find any terms or cookie notice on this page.";
}
