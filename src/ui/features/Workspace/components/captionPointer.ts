/**
 * The pointer over a caption (Captions2D): its edge's, Meno's own for
 * dragging sideways, wherever the edge is under the pointer - over its words
 * too, whichever the pointer came to last or left first; else over its words,
 * the system's text pointer; else none. Asked for (`asked`, `data-cursor`)
 * and written on the canvas itself (`own`), never both at once: the one
 * written on the canvas wins over the one asked for, and the text pointer
 * stood over the edge until it was pressed (seen on Windows, 2026-10-19).
 *
 * The canvas is the page's, its pointer asked for and written by others too
 * - a shape's handles, a PDF's links, ink's crosshair: given what the canvas
 * has (`now`), what it is to have, a caption's own pointers put there or
 * taken away and any other left as it is.
 */
export function captionPointer(
  over: { words: boolean; edge: boolean },
  now: { asked: string | undefined; own: string },
): { asked: string | undefined; own: string } {
  return {
    asked: over.edge ? "sideways" : now.asked === "sideways" ? undefined : now.asked,
    own: over.words && !over.edge ? "text" : now.own === "text" ? "" : now.own,
  };
}
