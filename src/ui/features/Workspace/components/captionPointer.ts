/**
 * The pointer over a caption (Captions2D): its edge's, Meno's own for
 * dragging sideways, wherever the edge is under the pointer - over its words
 * too, whichever the pointer came to last or left first; else over its words,
 * the system's text pointer; else none. Asked for (`asked`, `setCursor`) and
 * written on the canvas itself (`own`), never both at once: the one written
 * on the canvas wins over the one asked for, and the text pointer stood over
 * the edge until it was pressed (seen on Windows, 2026-10-19).
 */
export function captionPointer(over: { words: boolean; edge: boolean }): { asked: "sideways" | null; own: "text" | "" } {
  if (over.edge) return { asked: "sideways", own: "" };
  return { asked: null, own: over.words ? "text" : "" };
}
