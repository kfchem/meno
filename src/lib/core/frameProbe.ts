/** TEMPORARY PROBE (not for merge; from agent/e1-frame-probe): which work runs in a frame that took long - a 3D structure arriving and growing. Sections are timed (`timed`); a frame gap over GAP_MS is logged with the sections inside it. */
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

export function startProbe(): void {
  if (started) return;
  started = true;
  let last = performance.now();
  const tick = (now: number) => {
    const gap = now - last;
    if (gap > GAP_MS) {
      const inside = ring.filter((e) => e.at + e.ms >= last - 2 && e.at <= now);
      const sum = inside.reduce((s, e) => s + e.ms, 0);
      const parts = inside.map((e) => `${e.label}=${e.ms.toFixed(1)}`).join(" | ");
      console.warn(`[probe] frame gap ${gap.toFixed(0)}ms, timed ${sum.toFixed(0)}ms: ${parts || "(nothing timed: React, other work or the browser's own)"}`);
    }
    last = now;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
