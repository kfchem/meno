/**
 * How a style card carried (StylePicker3D) ends other than by its let-go: the window left - its pointer's let-go then
 * lost - or Escape. Either puts it back where it came from (`putBack`). Escape is taken only while a card is pressed,
 * and then ends only the carry, not what the cards are on as well. Returns a stop.
 */
export function carryEnds(win: EventTarget, pressed: () => boolean, putBack: () => void): () => void {
  const key = (e: Event) => {
    if ((e as KeyboardEvent).key !== "Escape" || !pressed()) return;
    e.stopPropagation();
    e.preventDefault();
    putBack();
  };
  win.addEventListener("blur", putBack);
  win.addEventListener("keydown", key, { capture: true });
  return () => {
    win.removeEventListener("blur", putBack);
    win.removeEventListener("keydown", key, { capture: true });
  };
}
