/**
 * Whose a touch is. The page's pan and zoom hears every finger on the
 * window, before anything under it does (PanZoom2D), so that a second
 * finger makes a pinch of the page wherever it lands - on an atom, a bond,
 * a chip - and what the first began is taken back. That is for fingers
 * begun on the page. One begun anywhere else - in the column beside it, in
 * Settings, a dialog, a menu, a text being typed - is not the page's: the
 * page leaves that touch alone, every finger of it, to its end, and the
 * part it began in hears them all (a PDF in the column is pinched there).
 *
 * Whose it is is decided once, as its first finger comes down, and holds
 * until the last is lifted or cancelled.
 */

/** What a touch can begin on: a node, its element, and what it is within. */
type Began = { nodeType: number; parentElement?: Element | null; closest?: (selector: string) => Element | null };

/** What is typed into: a finger there is the field's, even on the page. */
const TYPED = 'input, textarea, select, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]';

/**
 * Whether a touch begun on `target` is the page's: within one of `parts`
 * (the canvas's box, the layer the page's HTML is laid in), and not in a
 * field typed into.
 */
export function beganOnPage(target: EventTarget | null, parts: readonly (Pick<Node, "contains"> | null | undefined)[]): boolean {
  const n = target as unknown as Began | null;
  if (!n || typeof n.nodeType !== "number") return false;
  if (!parts.some((p) => p?.contains(n as unknown as Node))) return false;
  const el = typeof n.closest === "function" ? n : n.parentElement;
  return !el?.closest?.(TYPED);
}

/** The page's own handling of touch pointers, heard on the window before anything under it. */
export type PageTouchHandlers = {
  down: (e: PointerEvent) => void;
  move: (e: PointerEvent) => void;
  up: (e: PointerEvent) => void;
};

/** What the page's touch handlers are put on: the window. */
type Heard = Pick<Window, "addEventListener" | "removeEventListener">;

/**
 * The page's touch handlers put on `win`, heard first (in the capture
 * phase), and only for touches whose first finger came down where
 * `onPage` says is the page; what to call to take them off. Other pointers
 * (a mouse, a pen) go to the handlers as ever.
 */
export function pageTouches(win: Heard, onPage: (target: EventTarget | null) => boolean, page: PageTouchHandlers): () => void {
  // (the fingers of this touch that are down, and whether it is the page's)
  const down = new Set<number>();
  let pages = false;
  const onDown = (e: PointerEvent) => {
    if (e.pointerType === "touch") {
      // (a first finger - none other on the screen, or one whose lift never came - begins a new touch, its owner where it came down)
      if (down.size === 0 || e.isPrimary) {
        down.clear();
        pages = onPage(e.target);
      }
      down.add(e.pointerId);
      if (!pages) return;
    }
    page.down(e);
  };
  const onMove = (e: PointerEvent) => {
    if (e.pointerType === "touch" && down.has(e.pointerId) && !pages) return;
    page.move(e);
  };
  const onUp = (e: PointerEvent) => {
    if (e.pointerType === "touch" && down.delete(e.pointerId) && !pages) return;
    page.up(e);
  };
  win.addEventListener("pointerdown", onDown, true);
  win.addEventListener("pointermove", onMove, true);
  win.addEventListener("pointerup", onUp, true);
  win.addEventListener("pointercancel", onUp, true);
  return () => {
    win.removeEventListener("pointerdown", onDown, true);
    win.removeEventListener("pointermove", onMove, true);
    win.removeEventListener("pointerup", onUp, true);
    win.removeEventListener("pointercancel", onUp, true);
  };
}
