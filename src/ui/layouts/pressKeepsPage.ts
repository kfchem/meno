/**
 * A press on what says it keeps the page (`data-keeps-page`: the title bar's
 * Undo and the history it holds) is no press on the page. What is under way
 * there - words being typed, Quick Add open, a chain being drawn - hears
 * nothing of it, as it hears nothing of the undo keys, and the focus stays
 * where it was: in the field, with its caret. The press is heard first of
 * all the window's (listened to as the app loads, before any view listens
 * for a press away from it) and given only to its own element's handler.
 */

/** The attribute that says so. */
export const KEEPS_PAGE = "data-keeps-page";

const handlers = new WeakMap<object, (e: PointerEvent) => void>();

type Pressed = { type: string; target: unknown; stopImmediatePropagation(): void; preventDefault(): void };

/** What a press on `target` is kept for: the nearest element that keeps the page, or none. */
export function keeperOf(target: unknown): Element | null {
  const el = target as { closest?: (selector: string) => Element | null } | null;
  return el?.closest?.(`[${KEEPS_PAGE}]`) ?? null;
}

/** `handle` given every press begun on `el` (its pointerdown), which no other listener hears. What it gives takes it away. */
export function onKeptPress(el: Element, handle: (e: PointerEvent) => void): () => void {
  handlers.set(el, handle);
  return () => {
    if (handlers.get(el) === handle) handlers.delete(el);
  };
}

/**
 * A pointerdown or mousedown heard by the window: on what keeps the page,
 * kept from every other listener - the pointerdown given to its element's
 * own handler, the mousedown's default (the focus moved) not done.
 * Whether it was so kept.
 */
export function keepPress(e: Pressed): boolean {
  const el = keeperOf(e.target);
  if (!el) return false;
  e.stopImmediatePropagation();
  if (e.type === "mousedown") e.preventDefault();
  else handlers.get(el)?.(e as unknown as PointerEvent);
  return true;
}

if (typeof window !== "undefined") {
  window.addEventListener("pointerdown", keepPress, true);
  window.addEventListener("mousedown", keepPress, true);
}
