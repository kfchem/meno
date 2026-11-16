/**
 * Configurations kept through Enumerate (docs/WORKFLOWS-FOUNDATION.md,
 * *Substituent swap*, *Configurations kept*): a product says every
 * configuration its template says - each stereocentre and each double
 * bond's side, mapped - and none the template does not, at the template's
 * atoms. Read back from the product's drawing as the canvas reads it
 * (lib/layout/drawn `readStereo`), so whatever the join did to the wedges
 * is checked, not assumed. A double bond the product has no cis or trans
 * at - its group on an end now alike with the end's other, F/C=C/C made
 * F/C=C(C)C - keeps nothing and loses nothing: it is no stereo unit there
 * (lib/chem/perception/symmetry `settingCisTrans`).
 */
import { readStereo } from "../../../../lib/layout/drawn";
import type { Bond, Model } from "../store/types";
import { degrees, drawingOf, narrowEnd } from "../chem/drawing";
import { parity } from "../../../../lib/chem/perception/stereo/geometry";
import { drawnGraph } from "../../../../lib/chem/perception/stereo/from2d";
import { settingCisTrans } from "../../../../lib/chem/perception/symmetry";

/** A centre's neighbours by atom id ("H" for its undrawn hydrogen), in the order read, and the sign of the volume they span. */
type Centre = { around: (number | "H")[]; volume: 1 | -1 };
/** What a drawing says of configurations: its centres by atom id, its double bonds' sides by bond id (an atom on each end, and whether they are on one side). */
export type Said = { centres: Map<number, Centre>; sides: Map<number, { refs: [number, number]; cis: boolean }> };

/** The configurations `model`'s drawing says. */
export function saidOf(model: Model): Said {
  const d = drawingOf(model);
  const read = readStereo(d.atoms, d.bonds);
  const id = (i: number) => model.atoms[i].id;
  const centres = new Map<number, Centre>();
  for (const [c, t] of read.tetra) centres.set(id(c), { around: t.neighbours.map((n) => (n === -1 ? "H" : id(n))), volume: t.volume });
  // (drawingOf keeps every bond of a whole model, in order)
  const sides = new Map<number, { refs: [number, number]; cis: boolean }>();
  for (const [b, s] of read.cisTrans) sides.set(model.bonds[b].id, { refs: [id(s.refs[0]), id(s.refs[1])], cis: s.cis });
  return { centres, sides };
}

/** The parity of the permutation taking `from` to `to` (the same items): +1 even, -1 odd; 0 where they are not the same items. */
function parityBetween<T>(from: readonly T[], to: readonly T[]): 1 | -1 | 0 {
  if (from.length !== to.length || from.some((x) => !to.includes(x))) return 0;
  // (the sign of the permutation of places taking one to the other: the one parity - perception/stereo/geometry - and the 0 above is this caller's own)
  return parity(from.map((x) => to.indexOf(x)));
}

/**
 * Where `product` says other than `template` of the template's atoms:
 * each atom (by id) whose configuration it changes, loses, or gains - a
 * centre, or a double bond's end. `took` maps each template atom whose
 * undrawn hydrogen a group took to that group's attach atom; every other
 * template atom keeps its id. Empty where every configuration is kept.
 */
export function changedAt(template: Model, product: Model, took: ReadonlyMap<number, number>): number[] {
  const was = saidOf(template);
  const now = saidOf(product);
  const changed = new Set<number>();
  const at = (c: number, n: number | "H") => (n === "H" && took.has(c) ? took.get(c)! : n);
  for (const [c, t] of was.centres) {
    const p = now.centres.get(c);
    const sign = p ? parityBetween(t.around.map((n) => at(c, n)), p.around) : 0;
    if (!p || !sign || t.volume * sign !== p.volume) changed.add(c);
  }
  // (a centre read now at a template atom that had none: one nobody chose)
  for (const c of now.centres.keys()) if (template.atoms.some((a) => a.id === c) && !was.centres.has(c)) changed.add(c);
  const ends = (bonds: readonly Bond[], id: number) => bonds.find((b) => b.id === id)!;
  for (const [b, s] of was.sides) {
    const p = now.sides.get(b);
    const bond = ends(template.bonds, b);
    if (!p) {
      if (!noneThere(product, b, s)) changed.add(bond.a);
      continue;
    }
    // (a ref on one end other than the template's is the other neighbour there - the group in its H's place among them: the side flips with each)
    const flips = [0, 1].filter((k) => p.refs[k] !== s.refs[k]).length;
    if ((s.cis !== p.cis) !== (flips % 2 === 1)) changed.add(bond.a);
  }
  for (const b of now.sides.keys()) {
    const bond = template.bonds.find((x) => x.id === b);
    if (bond && !was.sides.has(b)) changed.add(bond.a);
  }
  return [...changed].sort((p, q) => p - q);
}

/**
 * Whether the double bond `id` of `product`, given the side `side` (its refs by atom id), sets nothing there - the rest as its
 * drawing says it (perception/symmetry `settingCisTrans`): its cis or trans is no configuration, so none read is none lost.
 */
function noneThere(product: Model, id: number, side: { refs: [number, number]; cis: boolean }): boolean {
  const k = product.bonds.findIndex((x) => x.id === id);
  const index = new Map(product.atoms.map((a, i) => [a.id, i]));
  const refs = side.refs.map((r) => index.get(r));
  if (k < 0 || refs[0] == null || refs[1] == null) return false;
  const d = drawingOf(product);
  const read = readStereo(d.atoms, d.bonds);
  const { graph, bondAt } = drawnGraph(d.atoms, d.bonds, { ...read, cisTrans: new Map(read.cisTrans).set(k, { refs: [refs[0], refs[1]], cis: side.cis }) });
  const j = bondAt.indexOf(k);
  return j >= 0 && !settingCisTrans(graph).bonds[j].stereo;
}

/**
 * `product` with the centre `c` - a template centre whose undrawn hydrogen
 * a group took - wedged anew so that it says the configuration it had: its
 * own wedges taken off, and one put on a bond out of it, the group's first,
 * then the others in turn, up and then down, until the drawing reads back
 * as the template's (`changedAt` none at `c`). Null where none does.
 */
export function rewedged(template: Model, product: Model, c: number, took: ReadonlyMap<number, number>): Model | null {
  const bonds = product.bonds.filter((b) => b.a === c || b.b === c);
  const group = took.get(c);
  const order = [...bonds.filter((b) => b.a === group || b.b === group), ...bonds.filter((b) => b.a !== group && b.b !== group)];
  const degree = degrees(product.bonds);
  const plain = product.bonds.map((b) => {
    if (!(b.a === c || b.b === c) || (b.stereo !== "up" && b.stereo !== "down")) return b;
    // (a wedge narrow at the other end is that atom's: kept)
    if (narrowEnd(b, degree) !== c) return b;
    const { stereo: _s, narrow: _o, ...rest } = b;
    void _s;
    void _o;
    return rest as Bond;
  });
  for (const b of order) {
    const other = b.a === c ? b.b : b.a;
    // (not on a bond whose other end is a centre: the wedge would say something of it too)
    if (saidOf(template).centres.has(other)) continue;
    for (const stereo of ["up", "down"] as const) {
      const tried: Model = { ...product, bonds: plain.map((x) => (x.id === b.id ? { ...x, stereo, narrow: c } : x)) };
      if (!changedAt(template, tried, took).includes(c)) return tried;
    }
  }
  return null;
}
