/**
 * A molecule a file gives no coordinates - every atom at one point, as
 * some programs write a molfile, an SD record or a reaction's molecules,
 * every atom at 0, 0, 0 - laid out as it is read, by Meno's own layout
 * engine (lib/layout), flat. Read as written, it was a pile, each atom
 * over the next and only one label to be seen.
 */
import { layout2D } from "../layout/engine";
import type { LayoutInput } from "../layout/perceive";
import { ELEMENTS } from "../chem/elements";
import { kekuleOrders } from "../chem/kekulize";
import { implicitHydrogens, type Molecule } from "../chem/molecule";

const ELEMENT_SYMBOLS = new Set(ELEMENTS.map((e) => e.symbol));
/** The CTfile bond types that take no H from either end: a coordination bond, a hydrogen bond. */
const NO_VALENCE = new Set([9, 10]);

/** Whether a molecule's atoms - two or more - all stand at one point: a file written with no coordinates. */
export function unplaced(atoms: readonly { x: number; y: number; z?: number }[]): boolean {
  if (atoms.length < 2) return false;
  const [a] = atoms;
  const near = (p: number, q: number) => Math.abs(p - q) < 1e-6;
  return atoms.every((b) => near(b.x, a.x) && near(b.y, a.y) && near(b.z ?? 0, a.z ?? 0));
}

/**
 * Whether a molecule is whole enough to be laid out: every bond between two
 * of its own atoms, none from an atom to itself, and not cut short - a
 * record that ends before the atoms its counts line gives, whose missing
 * atoms the reader makes up at the origin (CtMolecule's `cut`, where the
 * reader marks it). Laid out, a damaged file's 999 made-up carbons took
 * seconds, and a bond to an atom it lacks threw.
 */
function whole(m: Molecule): boolean {
  if ((m.ct as { cut?: boolean } | undefined)?.cut) return false;
  const n = m.atoms.length;
  return m.bonds.every((b) => b.a1 >= 0 && b.a2 >= 0 && b.a1 < n && b.a2 < n && b.a1 !== b.a2);
}

/** Whether a molecule read is one Meno lays out as it reads it: whole, and given no coordinates. */
export function laidOutAsRead(m: Molecule): boolean {
  return unplaced(m.atoms) && whole(m);
}

/** The middle length of the molecules' bonds, as drawn - none, where they have none. */
function middleBond(mols: readonly Molecule[]): number | null {
  const lengths = mols
    .flatMap((m) =>
      m.bonds.flatMap((b) => {
        const [p, q] = [m.atoms[b.a1], m.atoms[b.a2]];
        // (a bond to an atom the molecule lacks says nothing of its length)
        return p && q ? [Math.hypot(p.x - q.x, p.y - q.y)] : [];
      }),
    )
    .filter((d) => d > 1e-6)
    .sort((p, q) => p - q);
  return lengths.length ? lengths[lengths.length >> 1] : null;
}

/**
 * A file's molecules - an SD file's records, a reaction's - each laid out,
 * flat, where its file gave it no coordinates, its fragments side by side as
 * the engine lays out a structure from a SMILES, and as it was where it did.
 * Those laid out take the bond length the others are drawn with, so that the
 * file keeps one scale. Their stereochemistry, which no file without
 * coordinates draws, is none.
 */
export function laidOutWhereUnplaced(mols: readonly Molecule[]): Molecule[] {
  const lay = mols.map(laidOutAsRead);
  // (a file whose records all have their places - nearly every one - costs
  // nothing more: a thousand records' bonds were measured for nothing)
  if (!lay.some(Boolean)) return [...mols];
  const length = middleBond(mols.filter((m, i) => !lay[i] && !unplaced(m.atoms)));
  return mols.map((m, i) => {
    if (!lay[i]) return m;
    // (a layout that fails leaves the record as it was read: reading never stops for it)
    try {
      return laidOut(m, length);
    } catch {
      return m;
    }
  });
}

function laidOut(m: Molecule, length: number | null): Molecule {
  const orders = kekuleOrders(m.atoms, m.bonds);
  const used = m.atoms.map(() => 0);
  m.bonds.forEach((b, i) => {
    if (NO_VALENCE.has(b.order)) return;
    used[b.a1] += orders[i];
    used[b.a2] += orders[i];
  });
  const input: LayoutInput = {
    atoms: m.atoms.map((a, i) => ({
      el: a.el,
      ...(a.charge ? { charge: a.charge } : {}),
      // (the H it carries: as the file says, or by its valence - none for a label)
      hs: !ELEMENT_SYMBOLS.has(a.el) ? 0 : a.hCount ?? implicitHydrogens(a.el, used[i], a.charge ?? 0, a.radical),
    })),
    bonds: m.bonds.map((b, i) => ({ a: b.a1, b: b.a2, order: orders[i] })),
  };
  const laid = layout2D(input);
  const placed = m.atoms.map((a, i) => ({ ...a, x: laid.x[i], y: laid.y[i], z: 0 }));
  // (at the others' bond length, where there are others)
  const own = middleBond([{ ...m, atoms: placed }]);
  const k = length && own ? length / own : 1;
  return { ...m, atoms: placed.map((a) => ({ ...a, x: a.x * k, y: a.y * k })) };
}
