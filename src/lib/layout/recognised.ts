/**
 * A drawing's rings in perspective that it gives no depth to, their depth worked out (lib/chem/perception/projection/recognise) so that
 * `readStereo` reads them as it reads a drawing with depth. A ring system of six-rings drawn as chairs - one ring, or chairs fused on bonds -
 * or a ring of five or six drawn as a Haworth ring; no atom of it with a depth already, no wedge at any of its atoms (a wedge reads as it
 * always did); anything else is as drawn. The drawing is not changed: its atoms come back with a depth, and as stereocentres, for the reading.
 */
import { recogniseChairs, recogniseHaworth, type Recognised } from "../chem/perception/projection/recognise";
import { key, perceive } from "./perceive";
import type { DrawnAtom, DrawnBond } from "./drawn";

export function withRecognisedDepth(atoms: readonly DrawnAtom[], bonds: readonly DrawnBond[]): readonly DrawnAtom[] {
  if (atoms.length < 5 || !bonds.length) return atoms;
  const mol = perceive({ atoms: atoms.map((a) => ({ el: a.el ?? "C", hs: a.hs })), bonds: bonds.map(({ a, b, order }) => ({ a, b, order })) });
  let out: DrawnAtom[] | null = null;
  const bondOf = new Map(bonds.map((b) => [key(b.a, b.b), b]));
  for (const sys of mol.systems) {
    if (sys.atoms.some((i) => atoms[i].z != null)) continue;
    // (a wedge at any atom of it: read as it always was)
    if (sys.atoms.some((i) => mol.neighbours[i].some((n) => bondOf.get(key(i, n))?.wedge))) continue;
    // (each ring's atoms in order round it, as places in the system)
    const local = new Map(sys.atoms.map((i, k) => [i, k]));
    const rings: number[][] = [];
    for (const r of sys.rings) {
      const ring = mol.rings[r];
      const order = [ring[0]];
      while (order.length < ring.length) {
        const next = mol.neighbours[order[order.length - 1]].find((v) => ring.includes(v) && !order.includes(v));
        if (next == null) break;
        order.push(next);
      }
      if (order.length === ring.length) rings.push(order);
    }
    if (rings.length !== sys.rings.length) continue;
    const places = sys.atoms.map((i) => ({ x: atoms[i].x, y: atoms[i].y }));
    const bold = sys.atoms.flatMap((i) =>
      mol.neighbours[i].filter((n) => n > i && local.has(n) && bondOf.get(key(i, n))?.bold).map((n): [number, number] => [local.get(i)!, local.get(n)!]),
    );
    // (chairs first - one, or fused; then a lone ring of five or six as a Haworth ring, with the page directions of the groups out of it)
    let got: Recognised = rings.every((r) => r.length === 6) ? recogniseChairs(places, rings.map((r) => r.map((i) => local.get(i)!)), bold) : { kind: "flat" };
    if (got.kind === "flat" && rings.length === 1) {
      const order = rings[0];
      const n = order.length;
      const edges = order.flatMap((_, k) => (bondOf.get(key(order[k], order[(k + 1) % n]))?.bold ? [k] : []));
      const groups = order.flatMap((i) => mol.neighbours[i].filter((v) => !order.includes(v)).map((v) => ({ x: atoms[v].x - atoms[i].x, y: atoms[v].y - atoms[i].y })));
      const haworth = recogniseHaworth(order.map((i) => places[local.get(i)!]), groups, edges);
      if (haworth.kind === "depth") got = { ...haworth, z: sys.atoms.map((i) => haworth.z[order.indexOf(i)]) };
      else got = haworth;
    }
    if (got.kind !== "depth") continue;
    const z = got.z;
    out ??= atoms.map((a) => a);
    sys.atoms.forEach((i, k) => (out![i] = { ...atoms[i], z: z[k], centre: true }));
  }
  return out ?? atoms;
}
