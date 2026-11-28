import { useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { runningTick, type RunningTick } from "./runningTick";

/**
 * A running mark's frame-asker (runningTick) on this canvas, while it moves
 * (`on`): told whether the page's tab is the one shown (its canvas then
 * draws on demand, never otherwise), and stopped as the mark stops moving
 * or goes. At each frame drawn the mark moves by `step(dt)` and asks again.
 */
export function useRunningMotion(on: boolean): RunningTick {
  const tick = useMemo(() => runningTick(), []);
  const shown = useThree((s) => s.frameloop !== "never");
  useEffect(() => tick.shown(shown), [tick, shown]);
  useEffect(() => {
    if (!on) tick.stop();
    return tick.stop;
  }, [tick, on]);
  return tick;
}
