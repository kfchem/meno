/** Occlusion worked out off the main thread (./occlusion3d): a molecule's atoms and bond lines in, their terms out. */
import { occlusionOf } from "./occlusion3d";

type Question = { id: number; places: Float32Array; radii: Float32Array; lines: Float32Array; reach: number };

self.onmessage = (e: MessageEvent<Question>) => {
  const q = e.data;
  const o = occlusionOf(q.places, q.radii, q.lines, q.reach);
  (self as unknown as Worker).postMessage({ id: q.id, ...o }, [o.atoms.buffer, o.bonds.buffer] as Transferable[]);
};
