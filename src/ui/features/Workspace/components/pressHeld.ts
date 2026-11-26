/** Whether a pointer button is held anywhere in the window, for what moves the drawing as it is. */
const held = { buttons: 0 };
if (typeof window !== "undefined") {
  const note = (e: PointerEvent) => (held.buttons = e.buttons);
  window.addEventListener("pointerdown", note, true);
  window.addEventListener("pointerup", note, true);
  window.addEventListener("pointercancel", () => (held.buttons = 0), true);
}

/** Whether a pointer button is held now: the drawing, and the words that belong to its structures, follow at once rather than ease. */
export const pressHeld = (): boolean => held.buttons !== 0;
