/**
 * A render's frame carried by a drag (Renders2D): its middle goes as far as
 * the pointer does, in the page's units - `perPx` of them to a pixel, the
 * page up where the screen is down - each move given to `onMove`. The
 * closed hand while it is carried, the open one again once let go.
 */
export function carryFrame(
  el: HTMLElement,
  e: { pointerId: number; clientX: number; clientY: number },
  at: { x: number; y: number },
  perPx: number,
  onMove: (x: number, y: number) => void,
): void {
  el.setPointerCapture(e.pointerId);
  const from = { cx: e.clientX, cy: e.clientY, x: at.x, y: at.y };
  const move = (m: Event) => {
    const { clientX, clientY } = m as PointerEvent;
    onMove(from.x + (clientX - from.cx) * perPx, from.y - (clientY - from.cy) * perPx);
  };
  el.style.cursor = "grabbing";
  const end = () => {
    el.style.cursor = "grab";
    el.removeEventListener("pointermove", move);
    el.removeEventListener("pointerup", end);
    el.removeEventListener("pointercancel", end);
  };
  el.addEventListener("pointermove", move);
  el.addEventListener("pointerup", end);
  el.addEventListener("pointercancel", end);
}
