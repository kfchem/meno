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

/** How many changes to the page's own DOM - nodes, attributes, text - were made since the frame before: layout and paint follow each. */
let mutations = 0;
let mutationTargets = new Map<string, number>();
function watchDom(): void {
  new MutationObserver((records) => {
    mutations += records.length;
    for (const r of records) {
      const el = r.target as Element;
      const name = `${r.type}:${(el.nodeName || "").toLowerCase()}${el.id ? "#" + el.id : ""}${typeof el.className === "string" && el.className ? "." + el.className.split(" ")[0] : ""}`;
      mutationTargets.set(name, (mutationTargets.get(name) ?? 0) + 1);
    }
  }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
}

export function startProbe(): void {
  if (started) return;
  started = true;
  wrapAll();
  watchDom();
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
      const top = [...mutationTargets].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k}x${v}`).join(",");
      console.warn(`[probe] DOM changes ${mutations}${top ? " (" + top + ")" : ""}; frame gap ${gap.toFixed(0)}ms, timed ${sum.toFixed(0)}ms, all callbacks ${js.toFixed(0)}ms: ${parts || "(nothing timed: React, other work or the browser's own)"}`);
    }
    mutations = 0;
    mutationTargets = new Map();
    last = now;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
