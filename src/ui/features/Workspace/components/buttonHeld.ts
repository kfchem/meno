/**
 * Whether a pointer button is held down anywhere in the window: what moves
 * then is being dragged, and is followed at once rather than gone over to.
 */
let held = 0;
if (typeof window !== "undefined") {
  window.addEventListener("pointerdown", () => (held += 1), true);
  const up = () => (held = Math.max(0, held - 1));
  window.addEventListener("pointerup", up, true);
  window.addEventListener("pointercancel", up, true);
  window.addEventListener("blur", () => (held = 0));
}
export const buttonHeld = () => held > 0;
