/**
 * A drawing's rings in perspective that it gives no depth to, their depth worked out (lib/chem/perception/projection/recognise) so that
 * `readStereo` reads them as it reads a drawing with depth. Only a six-ring on its own - no atom of it with a depth already, no wedge at any of
 * its atoms (a wedge reads as it always did) - that is drawn as a chair; anything else is as drawn. The drawing is not changed: its atoms come
 * back with a depth, and as stereocentres, for the reading.
 */
import { recogniseChair, recogniseHaworth } from "../chem/perception/projection/recognise";
import { key, perceive } from "./perceive";
import type { DrawnAtom, DrawnBond } from "./drawn";

export function withRecognisedDepth(atoms: readonly DrawnAtom[], bonds: readonly DrawnBond[]): readonly DrawnAtom[] {
  if (atoms.length < 6 || !bonds.length) return atoms;
  const mol = perceive({ atoms: atoms.map((a) => ({ el: a.el ?? "C", hs: a.hs })), bonds: bonds.map(({ a, b, order }) => ({ a, b, order })) });
  let out: DrawnAtom[] | null = null;
  const bondOf = new Map(bonds.map((b) => [key(b.a, b.b), b]));
  for (const sys of mol.systems) {
    if (sys.rings.length !== 1) continue;
    const ring = mol.rings[sys.rings[0]];
    if ((ring.length !== 6 && ring.length !== 5) || ring.some((i) => atoms[i].z != null)) continue;
    // (a wedge at any atom of it: read as it always was)
    if (ring.some((i) => mol.neighbours[i].some((n) => bondOf.get(key(i, n))?.wedge))) continue;
    // (the atoms in order round it)
    const order = [ring[0]];
    while (order.length < 6) {
      const next = mol.neighbours[order[order.length - 1]].find((v) => ring.includes(v) && !order.includes(v));
      if (next == null) break;
      order.push(next);
    }
    if (order.length !== ring.length) continue;
    const n = order.length;
    const bold = order.flatMap((_, k) => (bondOf.get(key(order[k], order[(k + 1) % n]))?.bold ? [k] : []));
    const places = order.map((i) => ({ x: atoms[i].x, y: atoms[i].y }));
    // (a six-ring as a chair first; then a ring of five or six as a Haworth ring, with the page directions of the groups out of it)
    let got = n === 6 ? recogniseChair(places, bold) : ({ kind: "flat" } as const);
    if (got.kind === "flat") {
      const groups = order.flatMap((i) => mol.neighbours[i].filter((v) => !ring.includes(v)).map((v) => ({ x: atoms[v].x - atoms[i].x, y: atoms[v].y - atoms[i].y })));
      got = recogniseHaworth(places, groups, bold);
    }
    if (got.kind !== "depth") continue;
    out ??= atoms.map((a) => a);
    order.forEach((i, k) => (out![i] = { ...atoms[i], z: got.z[k], centre: true }));
  }
  return out ?? atoms;
}
