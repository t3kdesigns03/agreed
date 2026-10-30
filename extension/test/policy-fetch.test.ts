import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchSameSitePolicy } from "../src/content/policy-fetch";

const PAGE = "https://shop.example/checkout";

function htmlResponse(body: string, type = "text/html; charset=utf-8"): Response {
  return new Response(body, { status: 200, headers: { "Content-Type": type } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchSameSitePolicy", () => {
  it("downloads a same-site policy without cookies or a referrer", async () => {
    const fetchMock = vi.fn(async () => htmlResponse("<main>Policy</main>"));
    vi.stubGlobal("fetch", fetchMock);

    expect(await fetchSameSitePolicy("/privacy", PAGE)).toBe("<main>Policy</main>");
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://shop.example/privacy");
    expect(init.credentials).toBe("omit");
    expect(init.referrerPolicy).toBe("no-referrer");
  });

  it("never contacts another website", async () => {
    const fetchMock = vi.fn(async () => htmlResponse("<main>Policy</main>"));
    vi.stubGlobal("fetch", fetchMock);

    expect(await fetchSameSitePolicy("https://tracker.example/privacy", PAGE)).toBeNull();
    expect(await fetchSameSitePolicy("http://shop.example/privacy", PAGE)).toBeNull(); // different scheme = different origin
    expect(await fetchSameSitePolicy("javascript:alert(1)", PAGE)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("ignores responses that aren't web pages", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => htmlResponse("%PDF-1.7", "application/pdf")));
    expect(await fetchSameSitePolicy("/terms.pdf", PAGE)).toBeNull();
  });

  it("returns null instead of throwing when the network fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    expect(await fetchSameSitePolicy("/privacy", PAGE)).toBeNull();
  });
});
