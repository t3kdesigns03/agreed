import type { PolicyKind } from "./types";

// Content script -> background

export interface FetchPolicyMessage {
  type: "fetch-policy";
  url: string;
}

/** Record which policy a site showed, on this device only, for future "terms changed" alerts. */
export interface PolicySeenMessage {
  type: "policy-seen";
  origin: string;
  kind: PolicyKind;
  text: string;
}

export type BackgroundMessage = FetchPolicyMessage | PolicySeenMessage;

export type FetchPolicyReply = { ok: true; html: string; finalUrl: string } | { ok: false };

// Popup -> content script

export interface ManualCheckMessage {
  type: "manual-check";
}

export type ManualCheckReply = { found: boolean };
