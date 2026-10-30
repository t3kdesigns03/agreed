/** Give up on the linked policy page after this and summarize the banner alone. */
const POLICY_TIMEOUT_MS = 10_000;
const MAX_POLICY_HTML_BYTES = 3_000_000;

/**
 * Download a linked policy page, but only from the website the user is
 * already on. Cross-site policies are skipped (the banner text is used
 * instead), so Agreed needs no "access all websites" permission and never
 * contacts a server the user didn't visit. Cookies and the referrer are left
 * out, so the request carries nothing about the user.
 */
export async function fetchSameSitePolicy(url: string, pageUrl: string = location.href): Promise<string | null> {
  let target: URL;
  try {
    target = new URL(url, pageUrl);
  } catch {
    return null;
  }
  if (target.origin !== new URL(pageUrl).origin) return null;

  try {
    const response = await fetch(target.href, {
      credentials: "omit",
      referrerPolicy: "no-referrer",
      headers: { Accept: "text/html,application/xhtml+xml" },
      signal: AbortSignal.timeout(POLICY_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    if (!/text\/html|application\/xhtml\+xml/i.test(response.headers.get("Content-Type") ?? "")) return null;
    return await readCapped(response, MAX_POLICY_HTML_BYTES);
  } catch {
    return null;
  }
}

async function readCapped(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    text += decoder.decode(value, { stream: true });
    if (received >= maxBytes) {
      await reader.cancel();
      break;
    }
  }
  return text + decoder.decode();
}
