/**
 * A molecule in 3D's occlusion (./occlusion3d) for a frame in a look:
 * asked of a worker (./occlusionWorker) for the canvas, worked out at once
 * for a picture, and kept by what it was worked out from - the frame's
 * atoms, their radii in the look and its bond lines - so that the molecule
 * drawn again, or a picture made of it, takes it as it is.
 */
import { LINE_TERMS, OCCLUSION_REACH_ANGSTROM, occlusionOf, type Occlusion } from "./occlusion3d";
import { WORLD_PER_ANGSTROM, type BondLine } from "./molecule3d";

/** The reach, in the page's units. */
const REACH = OCCLUSION_REACH_ANGSTROM * WORLD_PER_ANGSTROM;

/** Bond lines as the worker takes them: seven numbers a line. */
export function packLines(lines: readonly BondLine[]): Float32Array {
  const out = new Float32Array(LINE_TERMS * lines.length);
  lines.forEach((l, k) => {
    out.set([l.a.x, l.a.y, l.a.z, l.b.x, l.b.y, l.b.z, l.r], LINE_TERMS * k);
  });
  return out;
}

/** The lines told apart by what they hold (two sets of lines are rarely alike but for being the same). */
function linesKey(lines: Float32Array): string {
  let h = 0;
  for (let i = 0; i < lines.length; i++) h = (h * 31 + Math.round(lines[i] * 1000)) | 0;
  return `${lines.length}:${h}`;
}

type Entry = Occlusion | Promise<Occlusion>;
const kept = new WeakMap<Float32Array, WeakMap<Float32Array, Map<string, Entry>>>();
function entries(places: Float32Array, radii: Float32Array): Map<string, Entry> {
  let byRadii = kept.get(places);
  if (!byRadii) kept.set(places, (byRadii = new WeakMap()));
  let byLines = byRadii.get(radii);
  if (!byLines) byRadii.set(radii, (byLines = new Map()));
  return byLines;
}

/** Its occlusion if it has been worked out already. */
export function occlusionKnown(places: Float32Array, radii: Float32Array, lines: Float32Array): Occlusion | undefined {
  const e = entries(places, radii).get(linesKey(lines));
  return e && !(e instanceof Promise) ? e : undefined;
}

/** Its occlusion now - worked out here, if it has not been: for a picture, which is made at once. */
export function occlusionNow(places: Float32Array, radii: Float32Array, lines: Float32Array): Occlusion {
  const known = occlusionKnown(places, radii, lines);
  if (known) return known;
  const o = occlusionOf(places, radii, lines, REACH);
  entries(places, radii).set(linesKey(lines), o);
  return o;
}

let worker: Worker | null = null;
let next = 1;
const pending = new Map<number, (o: Occlusion) => void>();

/** Its occlusion, asked of the worker - once, however often it is asked for. */
export function askOcclusion(places: Float32Array, radii: Float32Array, lines: Float32Array): Promise<Occlusion> {
  const byLines = entries(places, radii);
  const key = linesKey(lines);
  const e = byLines.get(key);
  if (e) return Promise.resolve(e);
  if (!worker) {
    worker = new Worker(new URL("./occlusionWorker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (m: MessageEvent<{ id: number } & Occlusion>) => {
      const done = pending.get(m.data.id);
      pending.delete(m.data.id);
      done?.({ atoms: m.data.atoms, bonds: m.data.bonds });
    };
  }
  const id = next++;
  const asked = new Promise<Occlusion>((resolve) => pending.set(id, resolve)).then((o) => {
    byLines.set(key, o);
    return o;
  });
  byLines.set(key, asked);
  worker.postMessage({ id, places, radii, lines, reach: REACH });
  return asked;
}
