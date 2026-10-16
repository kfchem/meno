/**
 * A ring or chain bound to a metal through all its atoms (eta), as the
 * plugin that makes a structure in 3D is asked about it: by the CTfile's own
 * multi-centre bond - a bond from the metal to a star atom at the system's
 * centre, its ENDPTS the system's atoms, ATTACH=ALL ("CTfile Formats", the
 * V3000 bond block) - however the drawing says it:
 * - a haptic bond as drawn or read from a file, already one;
 * - a label that names a ligand bound so in a complex (Cp, allyl), bonded to
 *   a metal: written out as that ligand, not as the group the label names
 *   elsewhere (Cp as a group is cyclopentadienyl bound by one carbon) - as
 *   is any label that names a ligand only in a complex (CO, NH3, =CHPh),
 *   which is otherwise written as no element;
 * - a ring drawn with a bond from the metal to each of its atoms (ferrocene
 *   by hand): those bonds become one such bond, so that the ring's atoms are
 *   not taken for carbons with a bond too many.
 *
 * The drawing's own atoms keep their places in the block, the stars made
 * for it come after them, so that the 3D structure's atoms stay tied to the
 * drawing's by their place (make3d `moleculeOf`).
 */
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { placedStructure } from "../../../../lib/chem/abbreviationPlace";
import { ligandStructure, namedLigand } from "../../../../lib/chem/ligands";
import { isMetal, ringsBondedAtomByAtom, type LayoutInput } from "../../../../lib/layout/perceive";
import type { Model } from "../store/types";

type Atom = Model["atoms"][number];
type Bond = Model["bonds"][number];

/**
 * A label bonded to one metal that names a ligand only in a complex (Cp,
 * allyl, CO, =CHPh): its structure as written out, laid off from the metal,
 * a neutral donor's bond to it a coordination bond (as chem/abbreviations
 * writes a ligand's). A ligand that binds as an anion (Cp, through its
 * ring) is written neutral, as a label on a metal is drawn: the plugin
 * counts the ring's charge.
 */
function boundLigand(a: Atom, metal: Atom): Atom["abbrev"] | null {
  const named = namedLigand(a.el.trim(), true);
  if (!named?.ligand.inComplex) return null;
  const { anionic, double, ...s } = ligandStructure(named.ligand, named.descriptor);
  const net = s.atoms.reduce((q, x) => q + (x.charge ?? 0), 0);
  const atoms = net ? s.atoms.map(({ charge: _charge, ...atom }) => atom) : s.atoms;
  const pi = new Set((s.haptic ?? []).map((h) => h.star));
  const lends = s.attach.map((at, k) => !anionic[k] && !double[k] && !pi.has(at));
  return placedStructure({ ...s, atoms, ...(lends.some(Boolean) ? { lends } : {}) }, { x: metal.x - a.x, y: metal.y - a.y }, NOMINAL_BOND_LENGTH);
}

/**
 * The structure as the plugin is asked about it, with every eta system as
 * one multi-centre bond (above); the same structure where it has none.
 */
export function etaBound(part: Model): Model {
  const byId = new Map(part.atoms.map((a) => [a.id, a]));
  const bondsOf = (id: number) => part.bonds.filter((b) => b.a === id || b.b === id);
  // (a donor's bond to its metal written from the donor, as a coordination bond is read: from the atom that lends its pair)
  const fromDonor = new Map<number, number>();
  let atoms = part.atoms.map((a) => {
    if (a.abbrev || isMetal(a.el)) return a;
    const touching = bondsOf(a.id);
    if (touching.length !== 1) return a;
    const other = byId.get(touching[0].a === a.id ? touching[0].b : touching[0].a);
    if (!other || !isMetal(other.el)) return a;
    const abbrev = boundLigand(a, other);
    if (abbrev?.lends?.[0]) fromDonor.set(touching[0].id, a.id);
    return abbrev ? { ...a, abbrev } : a;
  });
  const flipped = (b: Bond): Bond => (fromDonor.get(b.id) === b.b ? { ...b, a: b.b, b: b.a } : b);
  // (rings drawn bond by bond to a metal)
  const index = new Map(part.atoms.map((a, i) => [a.id, i]));
  const input: LayoutInput = {
    atoms: part.atoms.map((a) => ({ el: a.el })),
    bonds: part.bonds.map((b) => ({ a: index.get(b.a)!, b: index.get(b.b)!, order: b.order })),
  };
  const rings = ringsBondedAtomByAtom(input);
  if (!rings.length) return { ...part, atoms, bonds: part.bonds.map(flipped) };
  const gone = new Set(rings.flatMap((r) => r.bonds));
  const bonds: Bond[] = part.bonds.filter((_, i) => !gone.has(i)).map(flipped);
  let nextAtom = Math.max(...part.atoms.map((a) => a.id)) + 1;
  let nextBond = Math.max(0, ...part.bonds.map((b) => b.id)) + 1;
  const stars: Atom[] = [];
  for (const r of rings) {
    const ring = r.ring.map((i) => part.atoms[i]);
    const star = {
      id: nextAtom++,
      el: "*",
      x: ring.reduce((s, a) => s + a.x, 0) / ring.length,
      y: ring.reduce((s, a) => s + a.y, 0) / ring.length,
    } as Atom;
    stars.push(star);
    bonds.push({
      id: nextBond++,
      a: part.atoms[r.metal].id,
      b: star.id,
      order: 1,
      coordination: true,
      endpoints: ring.map((a) => a.id),
      attach: "all",
    } as Bond);
  }
  atoms = [...atoms, ...stars];
  return { ...part, atoms, bonds };
}
