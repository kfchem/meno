/** Whether a pointer button is held anywhere in the window, for what moves the drawing as it is; and how many presses and keys the window has had. */
const held = { buttons: 0, acts: 0 };
/** A press, a let-go or a key, as the window hears it: the buttons held, and one more act for a press or a key. */
export const heard = (e: { type: string; buttons?: number }): void => {
  if (e.type === "pointerdown" || e.type === "keydown") held.acts += 1;
  if (e.type === "pointercancel") held.buttons = 0;
  else if (e.buttons != null) held.buttons = e.buttons;
};
if (typeof window !== "undefined") {
  // (a key, in a text or on the page, counted as a press is: the chemist doing something - workflow/runShown)
  for (const type of ["pointerdown", "pointerup", "pointercancel", "keydown"]) window.addEventListener(type, (e) => heard(e as PointerEvent), true);
}

/** Whether a pointer button is held now: the drawing, and the words that belong to its structures, follow at once rather than ease. */
export const pressHeld = (): boolean => held.buttons !== 0;

/** How many pointer presses and keys the window has had: compared before and after, whether the chemist did anything between. */
export const actsSoFar = (): number => held.acts;

/** Whether a text is being written: a field, a text box or editable words (`el`, the one with the keys) have the keys. */
export const typing = (el: Element | null = typeof document !== "undefined" ? document.activeElement : null): boolean => {
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || (el as HTMLElement).isContentEditable === true;
};
