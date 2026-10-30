import type { PolicyKind } from "../src/shared/types";
import { SummaryCard, type CloseReason } from "../src/content/overlay";

export interface SampleSpec {
  /** Matches the `data-slot` element the card renders into. */
  slot: string;
  /** Short name used in the log and in the "dismissed" note, e.g. "Green". */
  label: string;
  kind: PolicyKind;
  show: (card: SummaryCard) => void;
}

export interface GalleryOptions {
  log: (message: string) => void;
  /** What "Show the real terms" does in the samples (the demo jumps to an in-page box). */
  onShowRealTerms: () => void;
}

/**
 * The sample-card gallery on the demo page. Dismissing a card (×, Escape,
 * "Looks okay", or Close after "Be careful") removes it and leaves a short
 * note in its place; reset() brings every card back.
 */
export class SampleGallery {
  constructor(
    private readonly doc: Document,
    private readonly specs: readonly SampleSpec[],
    private readonly options: GalleryOptions,
  ) {
    for (const spec of specs) this.render(spec);
  }

  reset(): void {
    for (const spec of this.specs) this.render(spec);
    this.options.log("Sample cards reset.");
  }

  private render(spec: SampleSpec): void {
    const slot = this.slot(spec);
    if (!slot) return;
    // Dropping a still-open card here is fine: it has no listeners outside its own subtree.
    slot.replaceChildren();
    const card = new SummaryCard({
      kind: spec.kind,
      realTermsUrl: null,
      onShowRealTerms: this.options.onShowRealTerms,
      onClose: (reason) => this.dismissed(spec, slot, reason),
      container: slot,
    });
    card.mount();
    spec.show(card);
  }

  private dismissed(spec: SampleSpec, slot: HTMLElement, reason: CloseReason): void {
    this.options.log(`${spec.label} sample card dismissed (${reason}).`);
    const note = this.doc.createElement("p");
    note.className = "dismissed";
    note.tabIndex = -1;
    note.textContent = `${spec.label} sample card dismissed. Use “Reset sample cards” to bring it back.`;
    slot.replaceChildren(note);
    // Keep keyboard users where they were instead of dropping focus to the top of the page.
    note.focus({ preventScroll: true });
  }

  private slot(spec: SampleSpec): HTMLElement | null {
    return this.doc.querySelector<HTMLElement>(`[data-slot="${spec.slot}"]`);
  }
}
