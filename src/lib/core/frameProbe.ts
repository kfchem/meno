/** TEMPORARY PROBE (not for merge): which work runs in a frame that took long. Sections are timed (`timed`); a frame gap over GAP_MS is logged with the sections inside it. */
const GAP_MS = 28;
type Entry = { label: string; at: number; ms: number };
let ring: Entry[] = [];
let started = false;

export function timed<T>(label: string, f: () => T, min = 3): T {
  const at = performance.now();
  try {
    return f();
  } finally {
    const ms = performance.now() - at;
    if (ms >= min) ring.push({ label, at, ms });
    if (ring.length > 400) ring = ring.slice(-200);
  }
}

export function noteEntry(label: string, ms: number): void {
  ring.push({ label, at: performance.now() - ms, ms });
}

/** Every animation-frame callback, timer and message the page runs timed as one entry each: the JS of a frame, whoever's - so a gap with this little in it is not JS (paint, layout, raster, GC). */
function wrapAll(): void {
  const w = window as unknown as { requestAnimationFrame: (f: FrameRequestCallback) => number; setTimeout: (f: TimerHandler, ms?: number, ...a: unknown[]) => number };
  const raf = w.requestAnimationFrame.bind(window);
  w.requestAnimationFrame = (f) => raf((t) => timed("raf", () => f(t), 0));
  const st = w.setTimeout.bind(window);
  w.setTimeout = ((f: TimerHandler, ms?: number, ...a: unknown[]) => (typeof f === "function" ? st(() => timed("timeout", () => (f as (...x: unknown[]) => void)(...a), 0), ms) : st(f, ms))) as typeof w.setTimeout;
  const port = MessagePort.prototype as unknown as { onmessage: ((e: MessageEvent) => void) | null };
  const desc = Object.getOwnPropertyDescriptor(port, "onmessage");
  if (desc?.set && desc.get) {
    Object.defineProperty(port, "onmessage", {
      ...desc,
      set(fn: ((e: MessageEvent) => void) | null) {
        desc.set!.call(this, fn ? (e: MessageEvent) => timed("message", () => fn.call(this, e), 0) : fn);
      },
    });
  }
}

export function startProbe(): void {
  if (started) return;
  started = true;
  wrapAll();
  let last = performance.now();
  const tick = (now: number) => {
    const gap = now - last;
    if (gap > GAP_MS) {
      const inside = ring.filter((e) => e.at + e.ms >= last - 2 && e.at <= now);
      // (the labelled work, and what the page's own callbacks, timers and messages took altogether: the JS of the frame)
      const named = inside.filter((e) => !["raf", "timeout", "message"].includes(e.label));
      const sum = named.reduce((s, e) => s + e.ms, 0);
      const js = inside.filter((e) => ["raf", "timeout", "message"].includes(e.label)).reduce((s, e) => s + e.ms, 0);
      const parts = named.map((e) => `${e.label}=${e.ms.toFixed(1)}`).join(" | ");
      console.warn(`[probe] frame gap ${gap.toFixed(0)}ms, timed ${sum.toFixed(0)}ms, all callbacks ${js.toFixed(0)}ms: ${parts || "(nothing timed: React, other work or the browser's own)"}`);
    }
    last = now;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
