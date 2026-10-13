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

/** The middle length of the molecules' bonds, as drawn - none, where they have none. */
function middleBond(mols: readonly Molecule[]): number | null {
  const lengths = mols
    .flatMap((m) => m.bonds.map((b) => Math.hypot(m.atoms[b.a1].x - m.atoms[b.a2].x, m.atoms[b.a1].y - m.atoms[b.a2].y)))
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
  const length = middleBond(mols.filter((m) => !unplaced(m.atoms)));
  return mols.map((m) => (unplaced(m.atoms) ? laidOut(m, length) : m));
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
