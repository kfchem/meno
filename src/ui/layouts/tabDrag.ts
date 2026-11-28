/**
 * How far a tab laid at `left`, `width` wide (on the screen, in pixels) may
 * be dragged, as far as it is asked to (`x`): no further than the room's
 * ends either way.
 */
export function dragWithin(x: number, left: number, width: number, room: { left: number; right: number }): number {
  return Math.min(Math.max(x, room.left - left), room.right - (left + width));
}

/**
 * Where a strip scrolled sideways to `scrollLeft`, `width` across, is to be
 * scrolled to show a tab at `left` (from the strip's start), `tab` wide, and
 * `margin` either side of it (the chosen tab's corners): as little as shows
 * it whole - its start, where it is cut off on the left, else its end - or
 * nowhere (null), shown already. Never before the strip's start.
 */
export function scrollToShow(left: number, tab: number, scrollLeft: number, width: number, margin = 0): number | null {
  const from = left - margin;
  const to = left + tab + margin;
  if (from < scrollLeft) return Math.max(0, from);
  if (to > scrollLeft + width) return Math.max(0, Math.min(from, to - width));
  return null;
}

/** The drag of a tab under way: the pointer that holds it, or null where none is. */
export type DragMark = { current: number | null };

/** A drag of a tab over - every way one ends comes here, and only here. */
export function endDrag(mark: DragMark): void {
  mark.current = null;
}

/**
 * Every way a drag of a tab ends, besides its own end: its pointer let go or
 * cancelled anywhere on the window, the window left, Escape. Watched for as
 * long as the strip is there; what stops watching.
 */
export function watchDragEnds(mark: DragMark, on: Pick<Window, "addEventListener" | "removeEventListener">): () => void {
  const pointer = (e: Event) => {
    if (mark.current != null && (e as PointerEvent).pointerId === mark.current) endDrag(mark);
  };
  const left = () => endDrag(mark);
  const key = (e: Event) => {
    if ((e as KeyboardEvent).key === "Escape") endDrag(mark);
  };
  on.addEventListener("pointerup", pointer, true);
  on.addEventListener("pointercancel", pointer, true);
  on.addEventListener("blur", left);
  on.addEventListener("keydown", key, true);
  return () => {
    on.removeEventListener("pointerup", pointer, true);
    on.removeEventListener("pointercancel", pointer, true);
    on.removeEventListener("blur", left);
    on.removeEventListener("keydown", key, true);
  };
}

/**
 * What a tab does as it is pressed and dragged, as the strip gives it (ui/layouts/Tabs): a drag begun marks it under
 * way, held by its pointer; its end ends it (`endDrag`); a press chooses (`pressTab`).
 */
export function tabGestures(mark: DragMark, choose: () => void): {
  onDragStart: (e: { pointerId?: number }) => void;
  onDragEnd: () => void;
  onPointerDown: (e: { pointerId: number }) => void;
} {
  return {
    onDragStart: (e) => void (mark.current = e.pointerId ?? 1),
    onDragEnd: () => endDrag(mark),
    onPointerDown: (e) => pressTab(mark, e.pointerId, choose),
  };
}

/**
 * A tab pressed: chosen - by the pointer of no drag under way. A press by
 * the pointer a drag was marked by - one whose end never came to the strip,
 * the button let go outside the window, over another program - finds that
 * drag over: once left marked as under way, it had every tab pressed after
 * it refused, with nothing said. A second pointer pressing while a drag is
 * in hand chooses nothing, and leaves that drag as it is - its tab still
 * kept within the strip.
 */
export function pressTab(mark: DragMark, pointerId: number, choose: () => void): void {
  if (mark.current != null && mark.current !== pointerId) return;
  endDrag(mark);
  choose();
}
