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

/**
 * The drag of a tab: the pointer that holds it while it is under way, and the kind of pointer it is (`current`,
 * `kind`); and the pointer of one ended before that pointer was let go - by Escape, by the window left - still down
 * (`over`), whose drag goes no further: the tab back in its place, and no other order of the tabs taken from it.
 */
export type DragMark = { current: number | null; kind?: string; over?: number | null };

/** A drag of a tab over - every way one ends comes here, and only here: `held`, its pointer still down. */
export function endDrag(mark: DragMark, held = false): void {
  mark.over = held && mark.current != null ? mark.current : null;
  mark.current = null;
}

/** Whether the tabs may be put in another order by a drag: only by one under way. */
export function reorders(mark: DragMark): boolean {
  return mark.current != null;
}

/** Where a dragged tab is to be at `x`, its drag kept within the strip by `within`: at its place, a drag ended with its pointer still down. */
export function dragTo(mark: DragMark, x: number, within: (x: number) => number): number {
  if (mark.over != null) return 0;
  return mark.current != null ? within(x) : x;
}

/**
 * Every way a drag of a tab ends, besides its own end: its pointer let go or
 * cancelled anywhere on the window, the window left, Escape. Watched for as
 * long as the strip is there; what stops watching.
 */
export function watchDragEnds(mark: DragMark, on: Pick<Window, "addEventListener" | "removeEventListener">): () => void {
  const pointer = (e: Event) => {
    const id = (e as PointerEvent).pointerId;
    if (mark.current != null && id === mark.current) endDrag(mark);
    if (mark.over != null && id === mark.over) mark.over = null;
  };
  const left = () => endDrag(mark, true);
  const key = (e: Event) => {
    if ((e as KeyboardEvent).key === "Escape") endDrag(mark, true);
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

/** A pointer pressed, as a tab hears it. */
export type Press = { pointerId: number; isPrimary?: boolean; pointerType?: string };

/**
 * What a tab does as it is pressed and dragged, as the strip gives it (ui/layouts/Tabs): a drag begun marks it under
 * way, held by its pointer; its end ends it (`endDrag`); a press chooses (`pressTab`).
 */
export function tabGestures(mark: DragMark, choose: () => void): {
  onDragStart: (e: object) => void;
  onDragEnd: () => void;
  onPointerDown: (e: Press) => void;
} {
  return {
    onDragStart: (e) => {
      // (a drag by touch with no pointer of its own to be told by: the first)
      const p = e as Partial<Press>;
      mark.current = typeof p.pointerId === "number" ? p.pointerId : 1;
      mark.kind = p.pointerType ?? "mouse";
      mark.over = null;
    },
    onDragEnd: () => endDrag(mark),
    onPointerDown: (e) => pressTab(mark, e, choose),
  };
}

/**
 * A tab pressed: chosen - by the pointer of no drag under way. A press by
 * the pointer a drag was marked by - one whose end never came to the strip,
 * the button let go outside the window, over another program - finds that
 * drag over: once left marked as under way, it had every tab pressed after
 * it refused, with nothing said. So does a primary pointer of the drag's
 * kind going down: a touch is primary only with no other touch on the
 * screen (Pointer Events), so the touch that held the drag is gone. Any
 * other pointer pressing while a drag is in hand - a second finger -
 * chooses nothing, and leaves that drag as it is, its tab still kept
 * within the strip.
 */
export function pressTab(mark: DragMark, press: Press, choose: () => void): void {
  const gone = press.isPrimary === true && press.pointerType != null && press.pointerType === mark.kind;
  if (mark.current != null && mark.current !== press.pointerId && !gone) return;
  endDrag(mark);
  choose();
}
