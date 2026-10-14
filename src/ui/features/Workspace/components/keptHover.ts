/**
 * What a press lands on is under the pointer, so it is hovered - whatever
 * the canvas's own record of what is hovered says.
 *
 * A handler that stops a press lets the canvas (R3F) take back the hover of
 * the object it is on, where the mesh pressed is not the mesh the object was
 * first hovered by: a PDF's page drawn finer since the pointer came to it is
 * another of its meshes. The object is told the pointer is out, and its
 * hover goes - a click on it then lets the selection go, as a click on
 * nothing does, and a double-click on it does nothing.
 *
 * Hovered again here, it stays so while the canvas hovers it again itself
 * at the pointer's next move (`over`); if it does not, the pointer is no
 * longer on it, and the hover goes then - or as the pointer leaves the
 * canvas.
 */
export type HoverKeeper<K> = {
  /** Pressed on `id`, the press stopped there: hovered, if it no longer is. */
  keep: (id: K) => void;
  /** The canvas hovers `id` itself. */
  over: (id: K) => void;
};

export function hoverKeeper<K>(hover: { get: () => K | null; set: (id: K | null) => void }, moves: EventTarget, leaves: EventTarget): HoverKeeper<K> {
  const kept = new Set<K>();
  return {
    keep: (id) => {
      if (hover.get() === id) return;
      hover.set(id);
      kept.add(id);
      // (after the canvas has taken the move: its own listener is nearer the pointer's target than `moves`)
      const done = () => {
        moves.removeEventListener("pointermove", done);
        leaves.removeEventListener("pointerleave", done);
        if (kept.delete(id) && hover.get() === id) hover.set(null);
      };
      moves.addEventListener("pointermove", done);
      leaves.addEventListener("pointerleave", done);
    },
    over: (id) => void kept.delete(id),
  };
}
