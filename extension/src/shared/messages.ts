import type { PolicyKind, Summary } from "../../../shared/types";

// Content script -> background

export interface SummarizeMessage {
  type: "summarize";
  text: string;
  kind: PolicyKind;
  truncated: boolean;
  /** Page origin, kept on this device only for policy-drift tracking. Never sent to the backend. */
  origin: string;
}

export interface FetchPolicyMessage {
  type: "fetch-policy";
  url: string;
}

export type BackgroundMessage = SummarizeMessage | FetchPolicyMessage;

export type SummarizeReply =
  | { ok: true; summary: Summary; cached: boolean }
  | { ok: false; reason: "not-configured" | "offline" | "rejected" | "unavailable" };

export type FetchPolicyReply = { ok: true; html: string; finalUrl: string } | { ok: false };

// Popup -> content script

export interface ManualCheckMessage {
  type: "manual-check";
}

export type ManualCheckReply = { found: boolean };
