/**
 * The clock a style card's samples take their own turn by (Preview3D): one for every sample turning on its own, so each
 * steps in the same moment and all are drawn in one frame. It goes by the screen's frames and steps on whole ones -
 * every other frame at 60 Hz, every fourth at 120 - so its steps are evenly spaced; a timer's would fall on frames
 * unevenly, two in one and none in the next.
 */

/**
 * How often a sample's own turn is drawn, a second: at its speed under a pixel a frame either way, at half the cost of
 * every frame the screen has (a turn by hand, and its coast, drawn at every one).
 */
export const IDLE_FPS = 30;
/** How early a frame may come and still step: the screen's frames come a little uneven. */
const FRAME_SLACK_MS = 4;

const turning = new Set<(d: number) => void>();
let clock: number | null = null;

/** Steps `step` by the seconds gone, IDLE_FPS times a second, on the screen's frames; returns a stop. */
export function onIdleClock(step: (d: number) => void): () => void {
  turning.add(step);
  if (clock == null) {
    let was = performance.now();
    const tick = (now: number) => {
      clock = requestAnimationFrame(tick);
      if (now - was < 1000 / IDLE_FPS - FRAME_SLACK_MS) return;
      const d = Math.min((now - was) / 1000, 1 / 20);
      was = now;
      for (const f of turning) f(d);
    };
    clock = requestAnimationFrame(tick);
  }
  return () => {
    turning.delete(step);
    if (turning.size || clock == null) return;
    cancelAnimationFrame(clock);
    clock = null;
  };
}

/**
 * A sample on the clock only while it is seen - on the screen, in a window in front: `seen` puts it on and takes it off,
 * `stop` takes it off for good. With no sample seen, there is no clock at all.
 */
export function idleClockWhileSeen(step: (d: number) => void): { seen: (on: boolean) => void; stop: () => void } {
  let leave: (() => void) | null = null;
  const off = () => {
    leave?.();
    leave = null;
  };
  return {
    seen: (on) => {
      if (on && !leave) leave = onIdleClock(step);
      else if (!on) off();
    },
    stop: off,
  };
}
