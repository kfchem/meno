/** The view a camera gives: where it looks, and how near. */
export type View = { x: number; y: number; zoom: number };

/**
 * What to do after each frame is drawn, so that what is under a resting
 * pointer is found again when the view has moved under it: `again`, given
 * the canvas's own `raycast`, each time the view (`view`) is not as it was
 * the frame before - not at the first frame, and not while a button is
 * held (`held`), what is dragged following the pointer.
 */
export function hoverFollows(view: () => View, held: () => boolean, again: (raycast: () => void) => void, raycast: () => void): () => void {
  let was: View | null = null;
  return () => {
    const now = view();
    const moved = !!was && (was.x !== now.x || was.y !== now.y || was.zoom !== now.zoom);
    was = now;
    if (moved && !held()) again(raycast);
  };
}
