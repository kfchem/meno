/**
 * The reaction the templates carry, drawn by hand in Meno's own units: an intramolecular Diels-Alder of a nonatriene - one reactant, a chain
 * of nine carbons with a diene at one end and a double bond at the other - to the two ring-fused products, trans and cis, drawn with
 * their fusion hydrogens on a wedge and a hash. Made up here, atom by atom; nothing is read from any program's files.
 *
 * Chain atoms C1 to C9: C1=C2, C3=C4 (the diene) and C8=C9 (the dienophile), the chain C4-C5-C6-C7-C8 between them. The new bonds are C1-C9
 * and C4-C8; C2=C3 is the product's double bond.
 */
import { NOMINAL_BOND_LENGTH as L } from "../../src/lib/chem/acs";
import type { Arrow, Atom, Bond, Plus } from "../../src/ui/features/Workspace/store/types";
import type { Frame } from "../../src/ui/features/Workspace/workflow/entries";

type Drawing = { atoms: Atom[]; bonds: Bond[] };

const C30 = Math.cos(Math.PI / 6);

/** The reactant: the nine carbons in a zigzag from `at` (its left end), y up. */
function chain(id: number, at: { x: number; y: number }): Drawing {
  const atoms: Atom[] = Array.from({ length: 9 }, (_, i) => ({ id: id + i, el: "C", r: 0.9, x: at.x + i * L * C30, y: at.y + (i % 2 === 0 ? 0 : L / 2) }));
  const orders = [2, 1, 2, 1, 1, 1, 1, 2];
  const bonds: Bond[] = orders.map((order, i) => ({ id: id + 100 + i, a: id + i, b: id + i + 1, order: order as 1 | 2 }));
  return { atoms, bonds };
}

/** A product: a six-ring and a five-ring sharing the bond C4-C8, with the fusion hydrogens - on a wedge at C4 and, trans, a hash at C8, or, cis, a wedge. The shared bond stands upright at `at` (its lower end, C4). */
function fused(id: number, at: { x: number; y: number }, trans: boolean): Drawing {
  const [x, y] = [at.x, at.y];
  const pentagon = (dx: number, dy: number) => ({ x: x + dx * L, y: y + dy * L });
  const at4 = { x, y };
  const at8 = { x, y: y + L };
  // (the six-ring to the left: C9 and C1 above and to the left of C8, C2 and C3 below C1 and C9's lower neighbours; the five-ring to the right)
  const points: Record<string, { x: number; y: number }> = {
    C4: at4,
    C8: at8,
    C9: { x: x - L * C30, y: y + 1.5 * L },
    C1: { x: x - 2 * L * C30, y: y + L },
    C2: { x: x - 2 * L * C30, y },
    C3: { x: x - L * C30, y: y - 0.5 * L },
    C7: pentagon(0.951, 1.309),
    C6: pentagon(1.539, 0.5),
    C5: pentagon(0.951, -0.309),
    H4: { x: x + 0.45 * L, y: y - 0.45 * L },
    H8: { x: x + 0.45 * L, y: y + 1.45 * L },
  };
  const names = Object.keys(points);
  const ids = Object.fromEntries(names.map((n, i) => [n, id + i]));
  const atoms: Atom[] = names.map((n) => ({ id: ids[n], el: n.startsWith("H") ? "H" : "C", r: 0.9, ...points[n] }));
  const ring = [
    ["C1", "C2", 1],
    ["C2", "C3", 2],
    ["C3", "C4", 1],
    ["C4", "C8", 1],
    ["C8", "C9", 1],
    ["C9", "C1", 1],
    ["C4", "C5", 1],
    ["C5", "C6", 1],
    ["C6", "C7", 1],
    ["C7", "C8", 1],
  ] as const;
  const bonds: Bond[] = ring.map(([a, b, order], i) => ({ id: id + 100 + i, a: ids[a], b: ids[b], order }));
  bonds.push({ id: id + 120, a: ids.C4, b: ids.H4, order: 1, stereo: "up", narrow: ids.C4 });
  bonds.push({ id: id + 121, a: ids.C8, b: ids.H8, order: 1, stereo: trans ? "down" : "up", narrow: ids.C8 });
  return { atoms, bonds };
}

export type Example = { atoms: Atom[]; bonds: Bond[]; arrows: Arrow[]; pluses: Plus[]; frame: Frame; nextId: number };

/** The example reaction as the page holds it, and the frame to put a set round: the reactant, an arrow, the trans product, a plus and the cis product. */
export function exampleReaction(): Example {
  const reactant = chain(1, { x: -20 * L, y: 0 });
  const arrow: Arrow = { id: 1, x: -10 * L, y: 0.4 * L, angle: 0, length: 5 * L };
  const trans = fused(300, { x: -3 * L, y: -0.5 * L }, true);
  const plus: Plus = { id: 1, x: -0.1 * L, y: 0.4 * L };
  const cis = fused(600, { x: 3.2 * L, y: -0.5 * L }, false);
  const all = [reactant, trans, cis];
  return {
    atoms: all.flatMap((d) => d.atoms),
    bonds: all.flatMap((d) => d.bonds),
    arrows: [arrow],
    pluses: [plus],
    frame: { x0: -22 * L, y0: -4 * L, x1: 8 * L, y1: 4 * L },
    nextId: 1000,
  };
}
