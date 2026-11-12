/**
 * Background work waits for the person's hands to rest. Drawing and input
 * come first, always (docs/PDF.md, *Never in the way of a frame*): reading
 * a PDF's figures, indexing it, anything the window does for itself, starts
 * only once nothing has been scrolled, zoomed, dragged or pressed for
 * `CALM_MS` - `whenCalm` - and is not started again while the hands are busy.
 * What is already under way runs in a worker (never on the thread the
 * drawing runs on), so a read begun a moment before a scroll goes on beside it.
 *
 * Where the input is heard (`watchInput`, once, from main.tsx): the wheel -
 * a touchpad's scroll and its pinch - a press, a pointer moved with a button
 * down (a drag, a pan), a touch moved.
 */

/** How long after the last input the window counts as calm, in ms. */
export const CALM_MS = 200;

type Clock = { now: () => number; later: (go: () => void, ms: number) => void };

/** A gate on a clock: told of input (`busy`), it lets work through (`whenCalm`) once `calmMs` have gone by without any. */
export function calmGate(clock: Clock, calmMs = CALM_MS) {
  let busyUntil = -Infinity;
  return {
    /** Input was heard now. */
    busy(): void {
      busyUntil = clock.now() + calmMs;
    },
    /** Whether the hands are at rest. */
    calm(): boolean {
      return clock.now() >= busyUntil;
    },
    /**
     * `work` once calm - after a moment of its own, never in the turn input was heard in - and asked
     * again for another wait if input came meanwhile. Returns a way to call it off.
     */
    whenCalm(work: () => void): () => void {
      let off = false;
      const check = () => {
        if (off) return;
        const wait = busyUntil - clock.now();
        if (wait > 0) clock.later(check, wait);
        else work();
      };
      clock.later(check, 0);
      return () => {
        off = true;
      };
    },
  };
}

const gate = calmGate({ now: () => performance.now(), later: (go, ms) => void setTimeout(go, ms) });

export const noteBusy = gate.busy;
export const isCalm = gate.calm;
export const whenCalm = gate.whenCalm;

let watching = false;

/** Listens, once, for the input that makes the window busy (`noteBusy`): in the capture phase, so that nothing stopping an event hides it. */
export function watchInput(target: Pick<Window, "addEventListener"> = window): void {
  if (watching) return;
  watching = true;
  const busy = () => noteBusy();
  const opts = { capture: true, passive: true } as const;
  target.addEventListener("wheel", busy, opts);
  target.addEventListener("pointerdown", busy, opts);
  target.addEventListener("touchmove", busy, opts);
  target.addEventListener("pointermove", (e) => (e as PointerEvent).buttons && noteBusy(), opts);
}
