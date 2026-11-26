/**
 * Where what a mark says goes (ChemMarks2D): under the mark, its middle
 * under the mark's - but moved along, or put over the mark, where it would
 * run out of what can be seen of the canvas.
 */

/** A box on the screen, in CSS pixels. */
export type ScreenBox = { left: number; top: number; right: number; bottom: number };

/** How far in from the edges of what can be seen the words keep, and how far under the mark - or over it - they lie, in CSS pixels. */
export const TIP_MARGIN_PX = 6;
export const TIP_GAP_PX = 6;

/** Where words `width` by `height` lie as first put: under `mark`, their middle under its middle. */
export function tipUnder(mark: ScreenBox, width: number, height: number): ScreenBox {
  const mid = (mark.left + mark.right) / 2;
  const top = mark.bottom + TIP_GAP_PX;
  return { left: mid - width / 2, top, right: mid + width / 2, bottom: top + height };
}

/**
 * How the words, `tip` where they lie as first put - under the mark, their
 * middle under its middle - move to lie within `room`, `margin` in from its
 * edges: along by `dx`, and over the mark (`above`) where there is no room
 * under it and there is over it. Wider than the room, they keep their start
 * in it. With `aboveFirst`, over the mark is where they go first, and under
 * it only where there is no room over it.
 */
export function tipPlace(tip: ScreenBox, mark: ScreenBox, room: ScreenBox, margin = TIP_MARGIN_PX, aboveFirst = false): { dx: number; above: boolean } {
  let dx = 0;
  if (tip.right > room.right - margin) dx = room.right - margin - tip.right;
  if (tip.left + dx < room.left + margin) dx = room.left + margin - tip.left;
  const height = tip.bottom - tip.top;
  const gap = tip.top - mark.bottom;
  const roomOver = mark.top - gap - height >= room.top + margin;
  const above = aboveFirst ? roomOver : tip.bottom > room.bottom - margin && roomOver;
  return { dx, above };
}

/** What the page's tip is about (PageTip): what it says, and the middle and size of what it is about, in the page's units; `key`, which thing that is. */
export type TipAt = { key: string; text: string; x: number; y: number; w: number; h: number };

/** What the tip shows: what it is about now, or - `leaving` - what it was last about, fading out where it stood. */
export type TipShown = { at: TipAt; leaving: boolean } | null;

/**
 * The page's tip going as it came, eased (PageTip; docs/LOOK.md, *Motion*):
 * nothing pointed at any more, it stays for `ms` with its last words at its
 * last place while CSS fades it, then is gone. Pointed at again before then,
 * it is whole again from where it had faded to; another thing pointed at
 * takes its place at once, so that two tips are never seen together. A
 * timer runs only while it fades.
 */
export class TipFade {
  private last: TipAt | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  /** `gone`: called when the fade is over and nothing is shown any more. */
  constructor(
    private readonly ms: number,
    private readonly gone: () => void,
  ) {}

  /** What is shown, `at` being what the tip is about now (null: nothing). Read as it is drawn; starts nothing. */
  shown(at: TipAt | null): TipShown {
    if (at) {
      this.last = at;
      return { at, leaving: false };
    }
    return this.last && { at: this.last, leaving: true };
  }

  /** The tip about something (`on`) or nothing: its fade started or called off - after it is drawn. */
  follow(on: boolean) {
    if (on) return this.stop();
    if (!this.last || this.timer !== null) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.last = null;
      this.gone();
    }, this.ms);
  }

  /** No fade left running (its owner gone). */
  stop() {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }
}
