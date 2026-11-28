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
 * the window, put on before any other listener there: by the module
 * main.tsx imports first (touchesFirst.ts), which imports only this one,
 * and this one imports nothing - so, as modules are run in the order they
 * are imported, no other module's code has run when it is put on. A finger
 * of a touch not the page's that comes down on the page is kept from every
 * listener after it - its down, its moves and its lift or cancel alike - so
 * nothing on the page hears its down, moves or lift without the others,
 * and nothing the page does can be begun by it and left undone.
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
/** What tells when the window is hidden: the document. */
type Shown = Pick<Document, "addEventListener" | "removeEventListener" | "visibilityState">;

/** A finger down: whether its touch is the page's, and whether it is kept from all after. */
type Finger = { pages: boolean; kept: boolean };
/**
 * The touch under way: whether it is the page's, and its fingers down; the
 * fingers let go of as the window lost them, each held to what it was till
 * its own lift; the finger last lifted, while its lift is heard; and the
 * down that began the touch.
 */
type Owner = { pages: boolean; down: Map<number, Finger>; left: Map<number, Finger>; lifted: ({ id: number } & Finger) | null; begunWith: Event | null };
let owner: Owner | null = null;

const keep = (e: Event) => {
  e.stopImmediatePropagation();
  e.preventDefault();
};

/**
 * Whose each touch is, decided on `win` as its first finger comes down;
 * what to call to stop. Put on before any other listener (touchesFirst.ts),
 * so that a finger of a touch not the page's that comes down on the page is
 * heard by none. A mouse and a pen are none of this.
 */
export function ownTouches(win: Heard, shown?: Shown, onPage: (target: EventTarget | null) => boolean = beganOnPage): () => void {
  const o: Owner = { pages: false, down: new Map(), left: new Map(), lifted: null, begunWith: null };
  owner = o;
  const of = (id: number) => o.down.get(id) ?? o.left.get(id);
  const onDown = (e: PointerEvent) => {
    if (e.pointerType !== "touch") return;
    o.lifted = null;
    o.left.delete(e.pointerId);
    // (a first finger - none other on the screen, or none the window still holds - begins a new touch, its owner where it came down)
    if (o.down.size === 0 || e.isPrimary) {
      o.down.clear();
      o.pages = onPage(e.target);
      o.begunWith = e;
    }
    const kept = !o.pages && onPage(e.target);
    o.down.set(e.pointerId, { pages: o.pages, kept });
    if (kept) keep(e);
  };
  const onMove = (e: PointerEvent) => {
    if (e.pointerType === "touch" && of(e.pointerId)?.kept) keep(e);
  };
  const onUp = (e: PointerEvent) => {
    if (e.pointerType !== "touch") return;
    const f = of(e.pointerId);
    o.down.delete(e.pointerId);
    o.left.delete(e.pointerId);
    o.lifted = f ? { id: e.pointerId, ...f } : null;
    if (f?.kept) keep(e);
  };
  // The window lost - another window in front, or this one hidden: any lift
  // may go unheard, and a finger whose lift never came would hold the touch
  // as under way, every next finger taken as one of it. So every finger is
  // let go of as one of a touch under way, and the next finger down begins
  // a new one, whatever it is said to be. Each finger let go of keeps what
  // it was till its own lift, if that comes: kept from the page still, or
  // the page's still - its moves and lift go where its down went, never a
  // part of a finger's events without the rest; and one whose lift never
  // comes holds nothing, as it is no part of a touch under way.
  const letGo = () => {
    for (const [id, f] of o.down) o.left.set(id, f);
    o.down.clear();
  };
  const onHidden = () => {
    if (shown?.visibilityState === "hidden") letGo();
  };
  win.addEventListener("pointerdown", onDown, true);
  win.addEventListener("pointermove", onMove, true);
  win.addEventListener("pointerup", onUp, true);
  win.addEventListener("pointercancel", onUp, true);
  win.addEventListener("blur", letGo);
  shown?.addEventListener("visibilitychange", onHidden);
  return () => {
    if (owner === o) owner = null;
    win.removeEventListener("pointerdown", onDown, true);
    win.removeEventListener("pointermove", onMove, true);
    win.removeEventListener("pointerup", onUp, true);
    win.removeEventListener("pointercancel", onUp, true);
    win.removeEventListener("blur", letGo);
    shown?.removeEventListener("visibilitychange", onHidden);
  };
}

/** Whether a touch pointer's event is of a touch that is the page's, heard after `ownTouches` has heard it (any, while nothing decides, or of a finger down before it began to). */
export function touchIsPages(e: PointerEvent): boolean {
  if (!owner || e.pointerType !== "touch") return true;
  const f = owner.down.get(e.pointerId) ?? owner.left.get(e.pointerId);
  if (f) return f.pages;
  if (owner.lifted?.id === e.pointerId) return owner.lifted.pages;
  return true;
}

/** Whether a touch pointer's down begins a new touch, its first finger (the system's primary pointer, while nothing decides). */
export function touchBegins(e: PointerEvent): boolean {
  return owner ? owner.begunWith === e : e.isPrimary;
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
