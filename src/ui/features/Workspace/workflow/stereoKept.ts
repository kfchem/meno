/**
 * Configurations kept through Enumerate (docs/WORKFLOWS-FOUNDATION.md,
 * *Substituent swap*, *Configurations kept*): a product says every
 * configuration its template says - each stereocentre and each double
 * bond's side, mapped - and none the template does not, at the template's
 * atoms. Read back from the product's drawing as the canvas reads it
 * (lib/layout/drawn `readStereo`), so whatever the join did to the wedges
 * is checked, not assumed.
 */
import { readStereo } from "../../../../lib/layout/drawn";
import type { Bond, Model } from "../store/types";
import { degrees, drawingOf, narrowEnd, orientFor } from "../chem/drawing";

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
function parity<T>(from: readonly T[], to: readonly T[]): 1 | -1 | 0 {
  if (from.length !== to.length || from.some((x) => !to.includes(x))) return 0;
  const p = from.map((x) => to.indexOf(x));
  let sign: 1 | -1 = 1;
  const seen = new Array<boolean>(p.length).fill(false);
  for (let i = 0; i < p.length; i++) {
    if (seen[i]) continue;
    let len = 0;
    for (let j = i; !seen[j]; j = p[j]) {
      seen[j] = true;
      len++;
    }
    if (len % 2 === 0) sign = sign === 1 ? -1 : 1;
  }
  return sign;
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
    const sign = p ? parity(t.around.map((n) => at(c, n)), p.around) : 0;
    if (!p || !sign || t.volume * sign !== p.volume) changed.add(c);
  }
  // (a centre read now at a template atom that had none: one nobody chose)
  for (const c of now.centres.keys()) if (template.atoms.some((a) => a.id === c) && !was.centres.has(c)) changed.add(c);
  const ends = (bonds: readonly Bond[], id: number) => bonds.find((b) => b.id === id)!;
  for (const [b, s] of was.sides) {
    const p = now.sides.get(b);
    const bond = ends(template.bonds, b);
    if (!p) {
      changed.add(bond.a);
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
 * `product` with each of the template's wedges narrow at the end it was
 * narrow at in `template`: a bond added to an atom changes how the drawing
 * counts its bonds, and with them which end of a wedge it reads as narrow
 * (`narrowEnd`) - so a wedge would move to the other atom, losing one
 * configuration and making up another.
 */
export function wedgesHeld(template: Model, product: Model): Model {
  const was = degrees(template.bonds);
  const now = degrees(product.bonds);
  const narrow = new Map(template.bonds.filter((b) => b.stereo === "up" || b.stereo === "down").map((b) => [b.id, narrowEnd(b, was)]));
  if (!narrow.size) return product;
  return { ...product, bonds: product.bonds.map((b) => (narrow.has(b.id) && (b.stereo === "up" || b.stereo === "down") ? { ...b, stereoOrient: orientFor(b, narrow.get(b.id)!, now) } : b)) };
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
    const { stereo: _s, stereoOrient: _o, ...rest } = b;
    void _s;
    void _o;
    return rest as Bond;
  });
  for (const b of order) {
    const other = b.a === c ? b.b : b.a;
    // (not on a bond whose other end is a centre: the wedge would say something of it too)
    if (saidOf(template).centres.has(other)) continue;
    for (const stereo of ["up", "down"] as const) {
      const tried: Model = { ...product, bonds: plain.map((x) => (x.id === b.id ? { ...x, stereo, stereoOrient: orientFor(x, c, degree) } : x)) };
      if (!changedAt(template, tried, took).includes(c)) return tried;
    }
  }
  return null;
}
