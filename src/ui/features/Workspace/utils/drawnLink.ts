import { isElementSymbol } from "../../../../lib/roles/molblock";
import { readStereo } from "../../../../lib/layout/drawn";
import { drawingOf } from "../chem/drawing";
import type { Model, Molecule3D } from "../store/types";

type Atom = Model["atoms"][number];
type Bond = Model["bonds"][number];

/** A drawing's atoms by id, and each atom's bonds: made once for each drawing, so that a structure is read in the time its own atoms take, not the page's (`pageIndex`). */
export type PageIndex = { byId: ReadonlyMap<number, Atom>; bondsOf: ReadonlyMap<number, readonly Bond[]> };
const indexes = new WeakMap<Model, PageIndex>();

/** A drawing's index (`PageIndex`), made the first time it is asked for and kept while the drawing is. */
export function pageIndex(model: Model): PageIndex {
  const had = indexes.get(model);
  if (had) return had;
  const byId = new Map(model.atoms.map((a) => [a.id, a]));
  const bondsOf = new Map<number, Bond[]>();
  for (const b of model.bonds) for (const end of b.a === b.b ? [b.a] : [b.a, b.b]) bondsOf.set(end, [...(bondsOf.get(end) ?? []), b]);
  const index = { byId, bondsOf };
  indexes.set(model, index);
  return index;
}

/**
 * What a drawn structure is, as its molecules in 3D were made from it: its
 * atoms (by id: element, charge, mass), its bonds (order, and what a
 * haptic bond binds; a wedge only on one that leaves it), and each configuration
 * its drawing states as identity reads it (`configurationsOf`: R or S,
 * E or Z, an axis's sense, by its atoms' ids) - so that a configuration
 * changed by moving atoms, not wedges, is a change - and not otherwise
 * where anything is drawn, nor a hydrogen bond, which is no bond of a structure (one drawn
 * or taken away changes no molecule made from it). A molecule in 3D whose
 * drawing no longer says the same is its drawing's no longer. Read through
 * the drawing's index (`pageIndex`): the structure's own atoms and bonds
 * alone, however many others the page holds.
 */
export function signatureOf(model: Model, ids: Iterable<number>): string {
  const { byId, bondsOf } = pageIndex(model);
  const of = new Set(ids);
  // (a haptic bond's star with the metal it is bound to: no atom of a
  // molecule in 3D, so not among its drawing's atoms, but of the structure
  // as its bond is - else every complex so bound read as drawn otherwise)
  for (const id of [...of])
    for (const b of bondsOf.get(id) ?? []) {
      if (!b.endpoints?.length) continue;
      const star = b.a === id ? b.b : b.a;
      if (byId.get(star)?.el === "*") of.add(star);
    }
  // (and a label bonded to it - Cp, cod - written out for the plugin: where it is bound through a pi system, its place in
  // the structure asked about is that system's star, no atom of the molecule in 3D, so no atom the molecule is tied to;
  // of the structure all the same, as the bond to it is - else every complex so labelled read as drawn otherwise)
  const label = (a: Atom) => !!a.abbrev || (a.el !== "*" && !isElementSymbol(a.el));
  const reach = [...of];
  while (reach.length) {
    const x = reach.pop()!;
    for (const b of bondsOf.get(x) ?? []) {
      const y = b.a === x ? b.b : b.a;
      const other = byId.get(y);
      if (!of.has(y) && other && label(other)) {
        of.add(y);
        reach.push(y);
      }
    }
  }
  const atoms = [...of]
    .flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []))
    .map((a) => `${a.id}:${a.el}:${a.charge ?? 0}:${a.isotope ?? ""}`)
    .sort();
  const read = configurationsOf(model, of);
  const touching = new Set<Bond>();
  for (const id of of) for (const b of bondsOf.get(id) ?? []) if (!b.hydrogen) touching.add(b);
  const bonds = [...touching]
    .map((b) => {
      const ends = of.has(b.a) && of.has(b.b) ? `${b.a}-${b.b}` : of.has(b.a) ? `${b.a}-out` : `${b.b}-out`;
      // (and what a haptic bond binds)
      const binds = b.endpoints?.length ? `:${[...b.endpoints].sort((p, q) => p - q).join(" ")}` : "";
      // (a wedge whose configuration is read says nothing the configurations do not (`configurationsOf`): one moved to
      //  another bond that states the same, as Clean-up moves one, is no change; one not read - at no centre, or leaving
      //  the structure - is kept as drawn)
      const wedge = !b.stereo || b.stereo === "none" || read.wedges.has(b.id) ? "" : `:${b.stereo}`;
      return `${ends}:${b.order}${wedge}${binds}`;
    })
    .sort();
  return [...atoms, "|", ...bonds, ...(read.said.length ? ["|", ...read.said] : [])].join(",");
}

/**
 * Each configuration a structure's drawing states, as identity reads it (lib/layout/drawn `readStereo`): a centre's sense,
 * a double bond's or an odd cumulene's cis or trans, an axis's sense - each written against its atoms' lowest ids, so that
 * one configuration is one text however it is drawn (a wedge on another bond, the drawing turned) and another is another
 * ((Z)- and (E)-but-2-ene, a methyl moved; butan-2-ol's methyl and ethyl exchanged in place).
 */
function configurationsOf(model: Model, of: ReadonlySet<number>): { said: string[]; wedges: Set<number> } {
  const atoms = model.atoms.filter((a) => of.has(a.id));
  const bonds = model.bonds.filter((b) => of.has(b.a) && of.has(b.b) && !b.hydrogen);
  // (nothing to state: no wedge, no double bond)
  if (!bonds.some((b) => b.order === 2 || (b.stereo && b.stereo !== "none"))) return { said: [], wedges: new Set() };
  const drawing = drawingOf({ atoms, bonds } as Model);
  const read = readStereo(drawing.atoms, drawing.bonds);
  const id = (i: number) => (i < 0 ? Infinity : atoms[i].id);
  const near: number[][] = atoms.map(() => []);
  for (const b of drawing.bonds) {
    near[b.a].push(b.b);
    near[b.b].push(b.a);
  }
  const order = new Map(drawing.bonds.map((b) => [b.a < b.b ? `${b.a},${b.b}` : `${b.b},${b.a}`, b.order]));
  // (a reference at an end turned to the end's lowest other neighbour: the sense turned with it where it moves)
  const turned = (end: number, ref: number, not: number) => {
    const others = near[end].filter((n) => n !== not).map(id);
    return id(ref) === Math.min(...others) ? 1 : -1;
  };
  // (the atom across an axis's or a run's end: its partner where bonded, else the one it is doubly bonded to)
  const across = (u: number, v: number) => (near[u].includes(v) ? v : (near[u].find((n) => order.get(n < u ? `${n},${u}` : `${u},${n}`) === 2) ?? -1));
  const out: string[] = [];
  for (const [c, t] of read.tetra) {
    const ns = t.neighbours.map(id);
    // (the sense against the neighbours in id order: turned once for each swap that sorts them)
    let sign: number = t.volume;
    const sorted = [...ns];
    for (let i = 0; i < sorted.length; i++)
      for (let j = 0; j < sorted.length - 1 - i; j++)
        if (sorted[j] > sorted[j + 1]) {
          [sorted[j], sorted[j + 1]] = [sorted[j + 1], sorted[j]];
          sign = -sign;
        }
    out.push(`c${id(c)}:${sign}`);
  }
  for (const [k, ct] of read.cisTrans) {
    const b = drawing.bonds[k];
    const sense = (ct.cis ? 1 : -1) * turned(b.a, ct.refs[0], b.b) * turned(b.b, ct.refs[1], b.a);
    out.push(`d${Math.min(id(b.a), id(b.b))}-${Math.max(id(b.a), id(b.b))}:${sense}`);
  }
  for (const x of [...read.axes.map((a) => ({ ...a, kind: "a", set: a.sense })), ...read.cumulated.map((a) => ({ ...a, kind: "u", set: a.cis ? 1 : -1 }))]) {
    const [u, v] = x.atoms;
    const sense = x.set * turned(u, x.refs[0], across(u, v)) * turned(v, x.refs[1], across(v, u));
    out.push(`${x.kind}${Math.min(id(u), id(v))}-${Math.max(id(u), id(v))}:${sense}`);
  }
  // (the wedges whose configuration was read: each at a centre read, narrow there)
  const wedges = new Set<number>();
  drawing.bonds.forEach((b, k) => {
    if (b.wedge && read.tetra.has(b.wedge.narrow)) wedges.add(bonds[k].id);
  });
  return { said: out.sort(), wedges };
}

/**
 * How a molecule in 3D stands to the drawing it was made from: the same
 * structure still ("live"), drawn otherwise since ("changed"), gone, or
 * made from none.
 */
export function linkOf(m: Pick<Molecule3D, "drawnFrom" | "drawnAs">, model: Model): "live" | "changed" | "gone" | null {
  if (!m.drawnFrom) return null;
  const ids = m.drawnFrom.filter((id): id is number => id != null);
  const present = new Set(model.atoms.map((a) => a.id));
  if (!ids.some((id) => present.has(id))) return "gone";
  return m.drawnAs != null && signatureOf(model, ids) !== m.drawnAs ? "changed" : "live";
}

/**
 * A molecule in 3D pasted with its drawing - all of it, or some - tied to
 * the pasted drawing's atoms, which `idOf` renames: still its drawing's if it
 * was in what was copied (`part`), or changed if only some of that came;
 * tied to nothing where none of its drawing came with it.
 */
export function relinked<M extends Pick<Molecule3D, "drawnFrom" | "drawnAs">>(
  m: M,
  part: Model,
  idOf: (id: number) => number | undefined,
): M {
  if (!m.drawnFrom) return m;
  const drawnFrom = m.drawnFrom.map((id) => (id == null ? null : (idOf(id) ?? null)));
  if (!drawnFrom.some((id) => id != null)) {
    const { drawnFrom: _from, drawnAs: _as, ...rest } = m;
    return rest as M;
  }
  if (linkOf(m, part) !== "live") return { ...m, drawnFrom };
  const renamed: Model = {
    atoms: part.atoms.map((a) => ({ ...a, id: idOf(a.id) ?? a.id })),
    bonds: part.bonds.map((b) => ({ ...b, a: idOf(b.a) ?? b.a, b: idOf(b.b) ?? b.b })),
  };
  return { ...m, drawnFrom, drawnAs: signatureOf(renamed, drawnFrom.filter((id): id is number => id != null)) };
}
