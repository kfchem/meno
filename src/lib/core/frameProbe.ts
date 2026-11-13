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

/** TEMPORARY PROBE (not for merge): each WebGL program the renderer made, named once - where, and its cache key (what tells it from another). */
const probeSeen = new WeakSet<object>();
type ProbeObject = {
  type: string;
  name: string;
  renderOrder: number;
  visible: boolean;
  count?: number;
  parent: ProbeObject | null;
  material?: unknown;
  geometry?: { type: string; attributes?: Record<string, unknown> };
  traverse: (f: (o: ProbeObject) => void) => void;
};
export function probeNewPrograms(gl: { info: { programs: unknown[] | null }; properties?: { get: (o: object) => { currentProgram?: unknown } } }, where: string, scene?: ProbeObject): void {
  const made: { name?: string; cacheKey?: string; id?: number }[] = [];
  for (const p of (gl.info.programs ?? []) as { name?: string; cacheKey?: string; id?: number }[]) {
    if (probeSeen.has(p)) continue;
    probeSeen.add(p);
    made.push(p);
    console.warn(`[probe] program #${p.id} "${p.name}" made ${where} at ${performance.now().toFixed(0)}ms: key ${p.cacheKey}`);
  }
  // (what on the page each was made for: every object drawn with it - its kind, order, geometry, and where it hangs)
  if (!made.length || !scene || !gl.properties) return;
  const ids = new Map(made.map((p) => [p as unknown, p.id]));
  scene.traverse((o) => {
    for (const m of [o.material].flat()) {
      if (!m || typeof m !== "object") continue;
      const id = ids.get(gl.properties!.get(m).currentProgram);
      if (id == null) continue;
      const path: string[] = [];
      for (let q = o.parent; q && path.length < 5; q = q.parent) path.push(`${q.type}${q.name ? `:${q.name}` : ""}`);
      const mat = m as { type?: string; name?: string; transparent?: boolean; depthTest?: boolean };
      const attrs = Object.keys(o.geometry?.attributes ?? {}).join("+");
      console.warn(
        `[probe] program #${id} drawn for ${o.type}${o.name ? `:${o.name}` : ""} renderOrder ${o.renderOrder} visible ${o.visible}${o.count != null ? ` count ${o.count}` : ""} material ${mat.type}${mat.name ? `:${mat.name}` : ""} transparent ${mat.transparent} depthTest ${mat.depthTest} geometry ${o.geometry?.type}(${attrs}) under ${path.join(" < ")}`,
      );
    }
  });
}

