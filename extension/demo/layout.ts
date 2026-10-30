/**
 * Keeps page content clear of a fixed bottom banner: writes the banner's
 * current height to `--banner-space` on `root`, which the page uses as bottom
 * padding and scroll padding. Updates whenever the banner resizes, wraps
 * differently, or is hidden. Returns a function that stops watching.
 */
export function reserveSpaceForBanner(
  banner: HTMLElement,
  root: HTMLElement = banner.ownerDocument.documentElement,
): () => void {
  const update = () => {
    const height = banner.hidden ? 0 : Math.ceil(banner.getBoundingClientRect().height);
    root.style.setProperty("--banner-space", `${height}px`);
  };
  update();

  const view = banner.ownerDocument.defaultView;
  if (view && typeof view.ResizeObserver === "function") {
    // Also fires when the banner is hidden (its size drops to 0) or shown again.
    const observer = new view.ResizeObserver(update);
    observer.observe(banner);
    return () => observer.disconnect();
  }
  view?.addEventListener("resize", update);
  return () => view?.removeEventListener("resize", update);
}
