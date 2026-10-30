// Chrome, Edge and Firefox expose `chrome.*`; Safari and Firefox also expose
// `browser.*`. Prefer `browser` where it exists so Safari gets its native
// promise-based API, and fall back to `chrome` everywhere else.
declare const browser: typeof chrome | undefined;

export const ext: typeof chrome = typeof browser !== "undefined" && browser?.runtime ? browser : chrome;
