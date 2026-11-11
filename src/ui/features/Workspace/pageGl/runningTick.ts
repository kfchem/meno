/**
 * How often the marks of a running step - its icon turning, the dashes of
 * its wire moving - ask for a frame: about thirty a second, not one at
 * every display frame. The canvas draws on demand, and every frame redraws
 * the whole page, so what a page costs a frame it costs as often as the
 * marks ask; the marks go by the clock, not by the frames, and move as fast
 * at thirty as at sixty.
 */
export const RUNNING_FRAME_MS = 33;

/** A running mark's frame-asker: `ask` one frame, after RUNNING_FRAME_MS, where none is asked for yet; `stop` before it is let go. */
export type RunningTick = { ask: (invalidate: () => void) => void; stop: () => void };

export function runningTick(): RunningTick {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return {
    ask(invalidate) {
      if (timer != null) return;
      timer = setTimeout(() => {
        timer = null;
        invalidate();
      }, RUNNING_FRAME_MS);
    },
    stop() {
      if (timer != null) clearTimeout(timer);
      timer = null;
    },
  };
}

/**
 * Where a wire's dashes stand after `dt` seconds more (at most a tenth of
 * a second at once, a stalled page not leaping): `offset` further along at
 * `speed` px a second, on a page `zoom` px to a unit, round the length of a
 * dash and a gap, `dashPx` and `gapPx`.
 */
export function dashAdvance(offset: number, dt: number, speed: number, zoom: number, dashPx: number, gapPx: number): number {
  return (offset + (Math.min(dt, 0.1) * speed) / zoom) % ((dashPx + gapPx) / zoom);
}
