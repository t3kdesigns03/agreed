// Popup -> content script. There is no background script: Agreed has no
// server to talk to, and everything else happens in the content script.

export interface ManualCheckMessage {
  type: "manual-check";
}

export type ManualCheckReply = { found: boolean };
