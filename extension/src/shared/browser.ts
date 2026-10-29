// Chrome, Edge and Firefox expose `chrome.*`; Safari and Firefox also expose
// `browser.*`. Prefer `browser` where it exists so Safari gets its native
// promise-based API, and fall back to `chrome` everywhere else.
declare const browser: typeof chrome | undefined;

export const ext: typeof chrome = typeof browser !== "undefined" && browser?.runtime ? browser : chrome;

/**
 * Send a message to the background script and wait for its reply. Uses the
 * callback form, which every browser supports.
 */
export function sendToBackground<TResponse>(message: unknown): Promise<TResponse> {
  return new Promise((resolve, reject) => {
    try {
      ext.runtime.sendMessage(message, (response: TResponse) => {
        const lastError = ext.runtime.lastError;
        if (lastError) reject(new Error(lastError.message));
        else resolve(response);
      });
    } catch (err) {
      // Thrown when the extension was reloaded and this content script is orphaned.
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}
