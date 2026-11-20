/**
 * The atom stereo parity a CTfile carries in its atom block (V2000's `sss`, V3000's `CFG`; BIOVIA, "CTfile Formats", the atom block's
 * table, and Appendix A, *Stereo Notes*): written so that a reader that takes the parity finds the configuration the bond markings state.
 * The text has readers ignore it ("Ignored when read"), so Meno writes it and reads none: what a file states is read from its wedges and
 * its coordinates, as before.
 *
 * As Appendix A defines it: the atoms round a stereocentre numbered 1 to 4 in increasing atom number (their place in the atom block), a
 * hydrogen the highest numbered; the centre seen with the bond to atom 4 behind the plane of 1, 2 and 3; 1, 2, 3 clockwise is 1 (odd),
 * counterclockwise 2 (even); a centre with an either bond 3.
 */
import { implicitHydrogens } from "./perception/hydrogens";
import { readStereo, type DrawnAtom, type DrawnBond } from "./perception/stereo/from2d";
import { ELEMENTS } from "./elements";
import type { WriterModel } from "./molWriter";

const SYMBOLS = new Set(ELEMENTS.map((e) => e.symbol));

/** Each atom's parity, by id: 1 or 2 for a centre the bond markings state, 3 for one at a wavy bond; none for any other atom (0). */
export function atomParities(model: WriterModel): Map<number, 1 | 2 | 3> {
  const out = new Map<number, 1 | 2 | 3>();
  if (!model.bonds.some((b) => b.stereo === "up" || b.stereo === "down" || b.stereo === "wavy")) return out;
  const index = new Map(model.atoms.map((a, i) => [a.id, i]));
  const degree = new Map<number, number>();
  const orders = new Map<number, number>();
  for (const b of model.bonds) {
    for (const id of [b.a, b.b]) {
      degree.set(id, (degree.get(id) ?? 0) + 1);
      orders.set(id, (orders.get(id) ?? 0) + (b.dative ? 0 : b.order));
    }
  }
  // (the end a wedge is narrow at, as the writer writes it: the one said, else the end with more bonds)
  const narrowOf = (b: WriterModel["bonds"][number]) =>
    b.narrow === b.a || b.narrow === b.b ? b.narrow : (degree.get(b.a) ?? 0) >= (degree.get(b.b) ?? 0) ? b.a : b.b;
  const atoms: DrawnAtom[] = model.atoms.map((a) => {
    const element = SYMBOLS.has(a.el);
    const sum = orders.get(a.id) ?? 0;
    const hs = !element ? 0 : a.valence != null ? Math.max(0, a.valence - sum) : implicitHydrogens(a.el, sum, a.charge ?? 0, a.radical);
    return { x: a.x, y: a.y, el: a.el, hs, ...(a.charge ? { charge: a.charge } : {}), ...(a.isotope ? { isotope: a.isotope } : {}), ...(a.radical ? { radical: a.radical } : {}) };
  });
  const bonds: DrawnBond[] = model.bonds.flatMap((b) => {
    const [p, q] = [index.get(b.a), index.get(b.b)];
    if (p == null || q == null) return [];
    const wedge = b.stereo === "up" || b.stereo === "down" ? { narrow: index.get(narrowOf(b))!, stereo: b.stereo } : undefined;
    return [{ a: p, b: q, order: b.order, ...(wedge ? { wedge } : {}), ...(b.stereo === "wavy" ? { either: true } : {}) }];
  });
  const isH = (n: number) => n === -1 || atoms[n].el === "H";
  for (const [c, t] of readStereo(atoms, bonds).tetra) {
    // (four groups, a hydrogen among them counted: a centre by its lone pair has no parity in the text)
    if (t.neighbours.length !== 4 || !SYMBOLS.has(atoms[c].el ?? "C")) continue;
    // (in increasing atom number, a hydrogen the highest: the permutation's sign carries the volume over)
    const rank = (n: number) => (isH(n) ? Number.MAX_SAFE_INTEGER : n);
    const sorted = [...t.neighbours].sort((m, n) => rank(m) - rank(n));
    const from = t.neighbours.map((n) => sorted.indexOf(n));
    let swaps = 0;
    for (let i = 0; i < from.length; i++) for (let j = i + 1; j < from.length; j++) if (from[i] > from[j]) swaps++;
    const volume = swaps % 2 === 0 ? t.volume : -t.volume;
    // (the first three's volume, seen from the centre, positive where 1, 2, 3 turn counterclockwise with 4 behind them)
    out.set(model.atoms[c].id, volume > 0 ? 2 : 1);
  }
  // (a centre at a wavy bond: either)
  for (const b of model.bonds) {
    if (b.stereo !== "wavy") continue;
    const c = narrowOf(b);
    const i = index.get(c);
    if (i == null || out.has(c) || !SYMBOLS.has(atoms[i].el ?? "C")) continue;
    if ((degree.get(c) ?? 0) + atoms[i].hs === 4 && atoms[i].hs <= 1) out.set(c, 3);
  }
  return out;
}
