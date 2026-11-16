/**
 * A drawing's rings in perspective that it gives no depth to, their depth worked out (lib/chem/perception/projection/recognise) so that
 * `readStereo` reads them as it reads a drawing with depth. A ring system of six-rings drawn as chairs - one ring, or chairs fused on bonds -
 * a ring of five or six drawn as a Haworth ring, or a bridged system or a cage drawn as a view of the engine's solid for it, a bold bond its
 * near edge; no atom of it with a depth already, no wedge at any of its atoms (a wedge reads as it
 * always did); anything else is as drawn. The drawing is not changed: its atoms come back with a depth, and as stereocentres, for the reading.
 */
import { READ_AS_HAWORTH, READ_IN_PERSPECTIVE, recogniseChairs, recogniseHaworth, recogniseByViews, type Recognised } from "../chem/perception/projection/recognise";
import { isCage, projectCage, tiedViews, type CageView } from "./cage";
import { key, perceive } from "./perceive";
import { ofTheStructure } from "../chem/perception/graph";
import type { DrawnAtom, DrawnBond } from "./drawn";

export function withRecognisedDepth(atoms: readonly DrawnAtom[], bonds: readonly DrawnBond[]): readonly DrawnAtom[] {
  return recognition(atoms, bonds).atoms;
}

/**
 * What the recognition says of each atom of a ring system it took for a projection, by its index: "read from the ring as drawn in
 * perspective", "read as a Haworth ring", or - unread - why, and what to draw (docs/EDITOR-2D.md, *Drawn in perspective*). Where a centre's
 * R or S is shown, its tip says it.
 */
export function recognisedSaid(atoms: readonly DrawnAtom[], bonds: readonly DrawnBond[]): ReadonlyMap<number, string> {
  return recognition(atoms, bonds).said;
}

type Recognition = { atoms: readonly DrawnAtom[]; said: Map<number, string> };
/** The last recognitions, by the drawing's atoms and bonds as given: one drawing is read for its identity, its R and S and its marks in turn. */
const kept = new WeakMap<readonly DrawnAtom[], { bonds: readonly DrawnBond[]; places: string; got: Recognition }>();

function recognition(atoms: readonly DrawnAtom[], bonds: readonly DrawnBond[]): Recognition {
  // (the places, depths and bonds as they are now: an array changed in place is read again)
  const places = atoms.map((a) => `${a.x} ${a.y} ${a.z ?? ""}`).join(";") + "|" + bonds.map((b) => `${b.a} ${b.b} ${b.order} ${b.bold ? 1 : 0} ${b.wedge ? 1 : 0}`).join(";");
  const before = kept.get(atoms);
  if (before && before.bonds === bonds && before.places === places) return before.got;
  const got = recognise(atoms, bonds);
  kept.set(atoms, { bonds, places, got });
  return got;
}

function recognise(atoms: readonly DrawnAtom[], drawn: readonly DrawnBond[]): Recognition {
  // (the structure's bonds alone: a hydrogen bond drawn closes no ring - between two groups of a chair it would make it a bridged system)
  const bonds = drawn.filter(ofTheStructure);
  const said = new Map<number, string>();
  if (atoms.length < 5 || !bonds.length) return { atoms, said };
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
    // (a bridged system or a cage: the ways Meno draws it in perspective, fitted - read by a mark only)
    const bridgedOrCage = isCage(mol, sys) || rings.some((r, i) => rings.some((q, j) => j > i && r.filter((a) => q.includes(a)).length >= 3));
    if (bridgedOrCage) {
      const got = recogniseByViews(places, viewsOf(mol, sys), bold);
      if (got.kind === "unread") for (const i of sys.atoms) said.set(i, got.why);
      if (got.kind !== "depth") continue;
      // (every atom of it a centre, as a tool's projection makes them: whether a centre's sense says anything - quinuclidine's N, whose two
      //  alike arms run between the same two atoms, says none - is identity's to tell, not the reader's)
      out ??= atoms.map((a) => a);
      sys.atoms.forEach((i, k) => {
        out![i] = { ...atoms[i], z: got.z[k], centre: true };
        said.set(i, READ_IN_PERSPECTIVE);
      });
      continue;
    }
    // (chairs first - one, or fused; then a lone ring of five or six as a Haworth ring, with the page directions of the groups out of it)
    let haworthRing = false;
    let got: Recognised = rings.every((r) => r.length === 6) ? recogniseChairs(places, rings.map((r) => r.map((i) => local.get(i)!)), bold) : { kind: "flat" };
    if (got.kind === "flat" && rings.length === 1) {
      const order = rings[0];
      const n = order.length;
      const edges = order.flatMap((_, k) => (bondOf.get(key(order[k], order[(k + 1) % n]))?.bold ? [k] : []));
      const groups = order.flatMap((i) => mol.neighbours[i].filter((v) => !order.includes(v)).map((v) => ({ x: atoms[v].x - atoms[i].x, y: atoms[v].y - atoms[i].y })));
      const haworth = recogniseHaworth(order.map((i) => places[local.get(i)!]), groups, edges);
      if (haworth.kind === "depth") got = { ...haworth, z: sys.atoms.map((i) => haworth.z[order.indexOf(i)]) };
      else got = haworth;
      haworthRing = haworth.kind === "depth";
    }
    if (got.kind === "unread") {
      for (const i of sys.atoms) said.set(i, got.why);
      continue;
    }
    if (got.kind !== "depth") continue;
    const z = got.z;
    const words = haworthRing ? READ_AS_HAWORTH : READ_IN_PERSPECTIVE;
    out ??= atoms.map((a) => a);
    sys.atoms.forEach((i, k) => {
      out![i] = { ...atoms[i], z: z[k], centre: true };
      said.set(i, words);
    });
  }
  return { atoms: out ?? atoms, said };
}

/** The ways Meno draws a bridged system or a cage in perspective (lib/layout/cage): its best view, the same from the other side, those tied with it, and the next few - each its atoms' places and depths in the system's order. */
function viewsOf(mol: Parameters<typeof projectCage>[0], sys: Parameters<typeof projectCage>[1]): { x: number; y: number; z: number }[][] {
  const views: Omit<CageView, "other">[] = [];
  const add = (v: CageView | null) => {
    if (!v) return;
    views.push(v);
    if (v.other) views.push(v.other);
  };
  for (let rank = 0; rank < 4; rank++) add(rank ? projectCage(mol, sys, rank) : projectCage(mol, sys));
  for (const v of tiedViews(mol, sys)) add(v);
  return views.filter((v) => sys.atoms.every((i) => v.pos.has(i) && v.depth.has(i))).map((v) => sys.atoms.map((i) => ({ ...v.pos.get(i)!, z: v.depth.get(i)! })));
}
