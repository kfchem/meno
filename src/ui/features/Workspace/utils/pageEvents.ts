import { events as pointerEvents } from "@react-three/fiber";

/** A box on the screen, in CSS pixels, as getBoundingClientRect gives one. */
type Box = { left: number; top: number; width: number; height: number };

/**
 * Where a pointer is over the canvas, as the camera takes it (-1 to 1 each
 * way, up positive): from where it is on the screen and where the canvas is
 * - never from the event's offset within its target. A move Meno makes of
 * no distance, to find again what is under a pointer the view moved under
 * (lib/input/stillPointer), is no event the system made, and Chromium gives
 * such an event's offset divided by the screen's device pixel ratio: at
 * 150 % it found what lay two thirds of the way from the canvas's corner to
 * the pointer, and lit another bond after a wheel's zoom. Where the canvas
 * has no size, the middle.
 */
export function pointerOver(clientX: number, clientY: number, canvas: Box): [x: number, y: number] {
  if (!(canvas.width > 0) || !(canvas.height > 0)) return [0, 0];
  return [((clientX - canvas.left) / canvas.width) * 2 - 1, -((clientY - canvas.top) / canvas.height) * 2 + 1];
}

/**
 * The page canvas's pointer events: React Three Fiber's own, but where the
 * pointer is worked out from the screen (`pointerOver`), the same for an
 * event the system made and one Meno did, and whatever element it came to.
 */
export const pageEvents: typeof pointerEvents = (store) => {
  const own = pointerEvents(store);
  return {
    ...own,
    compute(event, state) {
      const [x, y] = pointerOver(event.clientX, event.clientY, state.gl.domElement.getBoundingClientRect());
      state.pointer.set(x, y);
      state.raycaster.setFromCamera(state.pointer, state.camera);
    },
  };
};
