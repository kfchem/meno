/**
 * Whose a touch is. The page's pan and zoom hears every finger on the
 * window, before anything under it does (PanZoom2D), so that a second
 * finger makes a pinch of the page wherever it lands - on an atom, a bond,
 * a chip, even in the column beside it - and what the first began is taken
 * back. That is for fingers begun on the page. One begun anywhere else - in
 * the column, in Settings, a dialog, a menu, a text being typed - is not
 * the page's: no part of the page hears any finger of it, not even one
 * that comes down on the page, and the part it began in hears its own (a
 * PDF in the column is pinched there).
 *
 * Whose it is is decided once, as its first finger comes down, and holds
 * until the last is lifted or cancelled. It is decided by one listener on
 * the window, put on before any other (main.tsx: `ownTouches`): a finger of
 * a touch not the page's that comes down on the page is kept from every
 * listener after it - its down, its moves and its lift or cancel alike - so
 * nothing on the page ever hears half of a finger's life, and nothing the
 * page does can be begun by it and left undone.
 */

/** What marks the page, for a touch: the canvas's box and the layer the page's HTML is laid in (PanZoom2D puts it on them). */
export const PAGE_TOUCH = "data-page-touch";

/** What a touch can begin on: a node, its element, and what it is within. */
type Began = { nodeType: number; parentElement?: Element | null; closest?: (selector: string) => Element | null };

/** What is typed into: a finger there is the field's, even on the page. */
const TYPED = 'input, textarea, select, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]';

/** Whether a touch begun on `target` is the page's: within what is marked the page, and not in a field typed into. */
export function beganOnPage(target: EventTarget | null): boolean {
  const n = target as unknown as Began | null;
  if (!n || typeof n.nodeType !== "number") return false;
  const el = typeof n.closest === "function" ? n : n.parentElement;
  if (!el?.closest?.(`[${PAGE_TOUCH}]`)) return false;
  return !el.closest(TYPED);
}

/** What listeners are put on: the window. */
type Heard = Pick<Window, "addEventListener" | "removeEventListener">;

/** The touch under way: whether it is the page's; each finger down, with whether it is kept from all after; and the finger last lifted, while its lift is heard. */
type Owner = { pages: boolean; down: Map<number, boolean>; lifted: { id: number; pages: boolean } | null };
let owner: Owner | null = null;

const keep = (e: Event) => {
  e.stopImmediatePropagation();
  e.preventDefault();
};

/**
 * Whose each touch is, decided on `win` as its first finger comes down;
 * what to call to stop. Put on before any other listener, so that a finger
 * of a touch not the page's that comes down on the page is heard by none.
 * A mouse and a pen are none of this.
 */
export function ownTouches(win: Heard, onPage: (target: EventTarget | null) => boolean = beganOnPage): () => void {
  const o: Owner = { pages: false, down: new Map(), lifted: null };
  owner = o;
  const onDown = (e: PointerEvent) => {
    if (e.pointerType !== "touch") return;
    o.lifted = null;
    // (a first finger - none other on the screen, or one whose lift never came - begins a new touch, its owner where it came down)
    if (o.down.size === 0 || e.isPrimary) {
      o.down.clear();
      o.pages = onPage(e.target);
    }
    const kept = !o.pages && onPage(e.target);
    o.down.set(e.pointerId, kept);
    if (kept) keep(e);
  };
  const onMove = (e: PointerEvent) => {
    if (e.pointerType === "touch" && o.down.get(e.pointerId)) keep(e);
  };
  const onUp = (e: PointerEvent) => {
    if (e.pointerType !== "touch") return;
    const kept = o.down.get(e.pointerId);
    o.lifted = o.down.delete(e.pointerId) ? { id: e.pointerId, pages: o.pages } : null;
    if (kept) keep(e);
  };
  win.addEventListener("pointerdown", onDown, true);
  win.addEventListener("pointermove", onMove, true);
  win.addEventListener("pointerup", onUp, true);
  win.addEventListener("pointercancel", onUp, true);
  return () => {
    if (owner === o) owner = null;
    win.removeEventListener("pointerdown", onDown, true);
    win.removeEventListener("pointermove", onMove, true);
    win.removeEventListener("pointerup", onUp, true);
    win.removeEventListener("pointercancel", onUp, true);
  };
}

/** Whether a touch pointer's event is of a touch that is the page's, heard after `ownTouches` has heard it (any, while nothing decides, or of a finger down before it began to). */
export function touchIsPages(e: PointerEvent): boolean {
  if (!owner || e.pointerType !== "touch") return true;
  if (owner.down.has(e.pointerId)) return owner.pages;
  if (owner.lifted?.id === e.pointerId) return owner.lifted.pages;
  return true;
}

/** The page's own handling of touch pointers, heard on the window before anything under it. */
export type PageTouchHandlers = {
  down: (e: PointerEvent) => void;
  move: (e: PointerEvent) => void;
  up: (e: PointerEvent) => void;
};

/**
 * The page's touch handlers put on `win`, heard in the capture phase, and
 * only for touches that are the page's (`ownTouches`); what to call to take
 * them off. Other pointers (a mouse, a pen) go to the handlers as ever.
 */
export function pageTouches(win: Heard, page: PageTouchHandlers): () => void {
  const onDown = (e: PointerEvent) => void (touchIsPages(e) && page.down(e));
  const onMove = (e: PointerEvent) => void (touchIsPages(e) && page.move(e));
  const onUp = (e: PointerEvent) => void (touchIsPages(e) && page.up(e));
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
