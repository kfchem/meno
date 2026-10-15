import { useEffect, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { follow, TAU } from "../../../theme/motion";
import type { Frame } from "../workflow/entries";
import { buttonHeld } from "./buttonHeld";

const SIDES = ["x0", "x1", "y0", "y1"] as const;
/** Near enough to its place to be there, in world units. */
const THERE = 1e-4;

/**
 * Each set's frame as it is drawn (docs/WORKFLOWS.md, *How it looks*):
 * where the document has it - or, changed by anything but a drag (a run's
 * results, an undo, a 3D look its molecules are laid out again for), on
 * its way there, as a molecule goes to its place (`TAU.place`), so that a
 * set and what it holds move together. A set dragged or sized follows at
 * once; one just made is where it is.
 */
export function useShownFrames(sets: readonly (Frame & { id: number })[]): ReadonlyMap<number, Frame> {
  const shown = useRef(new Map<number, Frame>());
  const goals = useRef(sets);
  goals.current = sets;
  const [, redraw] = useState(0);
  const { invalidate } = useThree();
  const held = buttonHeld();
  const now = new Map<number, Frame>();
  for (const b of sets) {
    const was = shown.current.get(b.id);
    now.set(b.id, !was || held ? { x0: b.x0, x1: b.x1, y0: b.y0, y1: b.y1 } : was);
  }
  shown.current = now;
  const away = sets.some((b) => SIDES.some((k) => Math.abs(now.get(b.id)![k] - b[k]) > THERE));
  // (one set off its place: the frames drawn until it is there)
  useEffect(() => {
    if (away) invalidate();
  }, [away, sets, invalidate]);
  useFrame((_, dt) => {
    const step = Math.min(dt, 1 / 30);
    let moved = false;
    for (const b of goals.current) {
      const f = shown.current.get(b.id);
      if (!f || SIDES.every((k) => Math.abs(f[k] - b[k]) <= THERE)) continue;
      const next = buttonHeld() ? { x0: b.x0, x1: b.x1, y0: b.y0, y1: b.y1 } : { x0: follow(f.x0, b.x0, step, TAU.place), x1: follow(f.x1, b.x1, step, TAU.place), y0: follow(f.y0, b.y0, step, TAU.place), y1: follow(f.y1, b.y1, step, TAU.place) };
      // (there: exactly where the document has it)
      shown.current.set(b.id, SIDES.every((k) => Math.abs(next[k] - b[k]) <= THERE) ? { x0: b.x0, x1: b.x1, y0: b.y0, y1: b.y1 } : next);
      moved = true;
    }
    if (moved) {
      redraw((n) => n + 1);
      invalidate();
    }
  });
  return shown.current;
}
