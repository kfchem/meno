/**
 * Small reactions in 3D, every hydrogen an atom, for the atom-map tests:
 * hand-made here (bond lengths, angles and torsions placed one atom after
 * another), so that what each map should be is known by construction.
 */
import type { Molecule, ParsedAtom, ParsedBond } from "./molecule";

type V = [number, number, number];

const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const crossV = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: V): V => {
  const n = Math.hypot(a[0], a[1], a[2]);
  return [a[0] / n, a[1] / n, a[2] / n];
};

/** The point `r` from c, at `angle` b-c-d and torsion a-b-c-d, in degrees. */
export function place(a: V, b: V, c: V, r: number, angle: number, torsion: number): V {
  const th = (angle * Math.PI) / 180;
  const ph = (torsion * Math.PI) / 180;
  const bc = unit(sub(c, b));
  const n = unit(crossV(sub(b, a), bc));
  const m = crossV(n, bc);
  const d2: V = [-r * Math.cos(th), r * Math.sin(th) * Math.cos(ph), r * Math.sin(th) * Math.sin(ph)];
  return [
    c[0] + d2[0] * bc[0] + d2[1] * m[0] + d2[2] * n[0],
    c[1] + d2[0] * bc[1] + d2[1] * m[1] + d2[2] * n[1],
    c[2] + d2[0] * bc[2] + d2[1] * m[2] + d2[2] * n[2],
  ];
}

const round4 = (x: number) => Math.round(x * 1e4) / 1e4;

/**
 * A few thousandths of an ångström off, the same for an atom's name each
 * time: no two bonds exactly in line or exactly anti, as no real structure
 * has them (an exact 180-degree torsion reads as not a number in ACCeL's
 * arccos, and which atom wins there is down to rounding).
 */
function jitter(name: string): V {
  let h = 2166136261;
  for (const ch of name) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  const out: number[] = [];
  for (let i = 0; i < 3; i++) {
    h = Math.imul(h ^ (h >>> 13), 2246822507) >>> 0;
    out.push(((h % 2001) / 1000 - 1) * 0.004);
  }
  return out as V;
}

/** A molecule from named atoms and bonds between their names, its atoms in the order `order` gives (all of them); each a little off (`jitter`) unless asked not to be. */
export function molecule(
  atoms: Record<string, [string, V]>,
  bonds: [string, string, number][],
  order: string[] = Object.keys(atoms),
  options: { jitter?: boolean } = {},
): Molecule {
  const index = new Map(order.map((k, i) => [k, i]));
  const parsed: ParsedAtom[] = order.map((k) => {
    const [el, p] = atoms[k];
    const j: V = options.jitter === false ? [0, 0, 0] : jitter(k);
    return { el, x: round4(p[0] + j[0]), y: round4(p[1] + j[1]), z: round4(p[2] + j[2]) };
  });
  const parsedBonds: ParsedBond[] = bonds.map(([p, q, o]) => ({ a1: index.get(p)!, a2: index.get(q)!, order: o }));
  return { atoms: parsed, bonds: parsedBonds };
}

/** Ethane, staggered. */
export function ethaneAtoms(): Record<string, [string, V]> {
  const c1: V = [0, 0, 0];
  const c2: V = [1.53, 0, 0];
  const up: V = [1.53, 1, 0];
  const down: V = [0, 1, 0];
  const out: Record<string, [string, V]> = { C1: ["C", c1], C2: ["C", c2] };
  [60, 180, 300].forEach((t, i) => (out[`H1${i}`] = ["H", place(up, c2, c1, 1.09, 110.9, t)]));
  [0, 120, 240].forEach((t, i) => (out[`H2${i}`] = ["H", place(down, c1, c2, 1.09, 110.9, t)]));
  return out;
}

export const ETHANE_BONDS: [string, string, number][] = [
  ["C1", "C2", 1],
  ["C1", "H10", 1],
  ["C1", "H11", 1],
  ["C1", "H12", 1],
  ["C2", "H20", 1],
  ["C2", "H21", 1],
  ["C2", "H22", 1],
];

/** Rotated by `deg` about z, then moved by `t`. */
export function moved(atoms: Record<string, [string, V]>, deg: number, t: V): Record<string, [string, V]> {
  const c = Math.cos((deg * Math.PI) / 180);
  const s = Math.sin((deg * Math.PI) / 180);
  const out: Record<string, [string, V]> = {};
  for (const [k, [el, p]] of Object.entries(atoms)) out[k] = [el, [c * p[0] - s * p[1] + t[0], s * p[0] + c * p[1] + t[1], p[2] + t[2]]];
  return out;
}

/** Cl- + CH3Br -> ClCH3 + Br-, each side one structure: the methyl's hydrogens fold over, as in a backside attack. */
export function sn2(): { reactant: Molecule; product: Molecule; productOrder: string[] } {
  const c: V = [0, 0, 0];
  const br: V = [1.95, 0, 0];
  const cl: V = [-1.79, 0, 0];
  const ref: V = [1.95, 1, 0];
  const refCl: V = [-1.79, 1, 0];
  const r: Record<string, [string, V]> = { C: ["C", c], Br: ["Br", br], Cl: ["Cl", [-3.3, 0, 0]] };
  const p: Record<string, [string, V]> = { C: ["C", c], Br: ["Br", [3.4, 0, 0]], Cl: ["Cl", cl] };
  // azimuths a little uneven, so that one assignment of the hydrogens fits best
  [5, 128, 241].forEach((t, i) => {
    r[`H${i}`] = ["H", place(ref, br, c, 1.09, 107.5, t)];
    p[`H${i}`] = ["H", place(refCl, cl, c, 1.09, 108.5, -t)];
  });
  const reactant = molecule(r, [
    ["C", "Br", 1],
    ["C", "H0", 1],
    ["C", "H1", 1],
    ["C", "H2", 1],
  ]);
  const productOrder = ["Br", "H2", "C", "H0", "Cl", "H1"];
  const product = molecule(
    p,
    [
      ["C", "Cl", 1],
      ["C", "H0", 1],
      ["C", "H1", 1],
      ["C", "H2", 1],
    ],
    productOrder,
  );
  return { reactant, product, productOrder };
}

/** Acetaldehyde -> its enol: a methyl hydrogen moves to the oxygen. */
export function enol(): { reactant: Molecule; product: Molecule; productOrder: string[] } {
  const c1: V = [0, 0, 0];
  const c2: V = [1.5, 0, 0];
  const d: V = [0, 1, 0];
  const o = place(d, c1, c2, 1.21, 124, 0);
  const r: Record<string, [string, V]> = {
    C1: ["C", c1],
    C2: ["C", c2],
    O: ["O", o],
    Ha: ["H", place(d, c1, c2, 1.1, 115, 180)],
  };
  [0, 120, 240].forEach((t, i) => (r[`Hm${i}`] = ["H", place(o, c2, c1, 1.09, 110, t)]));
  const reactant = molecule(r, [
    ["C1", "C2", 1],
    ["C2", "O", 2],
    ["C2", "Ha", 1],
    ["C1", "Hm0", 1],
    ["C1", "Hm1", 1],
    ["C1", "Hm2", 1],
  ]);
  const c2p: V = [1.34, 0, 0];
  const op = place(d, c1, c2p, 1.36, 123, 0);
  const p: Record<string, [string, V]> = {
    C1: ["C", c1],
    C2: ["C", c2p],
    O: ["O", op],
    Ha: ["H", place(d, c1, c2p, 1.08, 121, 180)],
    // the hydrogen that moved: on the oxygen, syn to the double bond
    Hm0: ["H", place(c1, c2p, op, 0.97, 109, 0)],
    Hm1: ["H", place(op, c2p, c1, 1.08, 121, 0)],
    Hm2: ["H", place(op, c2p, c1, 1.08, 121, 180)],
  };
  const productOrder = ["Hm1", "O", "C2", "Hm0", "C1", "Ha", "Hm2"];
  const product = molecule(
    p,
    [
      ["C1", "C2", 2],
      ["C2", "O", 1],
      ["C2", "Ha", 1],
      ["O", "Hm0", 1],
      ["C1", "Hm1", 1],
      ["C1", "Hm2", 1],
    ],
    productOrder,
  );
  return { reactant, product, productOrder };
}

/** Butadiene (s-cis) and ethylene stacked above it -> cyclohexene, the ethylene drawn down to bond. */
export function dielsAlder(): { reactants: Molecule[]; product: Molecule; productOrder: string[] } {
  const diene: Record<string, [string, V]> = {
    C1: ["C", [-1.4, -0.56, 0]],
    C2: ["C", [-0.73, 0.6, 0]],
    C3: ["C", [0.73, 0.6, 0]],
    C4: ["C", [1.4, -0.56, 0]],
    H2: ["H", [-1.28, 1.54, 0]],
    H3: ["H", [1.28, 1.54, 0]],
    H1a: ["H", [-2.49, -0.56, 0.05]],
    H1b: ["H", [-0.9, -1.52, -0.08]],
    H4a: ["H", [2.49, -0.56, 0.04]],
    H4b: ["H", [0.9, -1.52, -0.06]],
  };
  const ene = (z: number, pinch: number): Record<string, [string, V]> => ({
    C5: ["C", [-0.67 - pinch, -1.0, z]],
    C6: ["C", [0.67 + pinch, -1.0, z]],
    H5a: ["H", [-1.24 - pinch, -0.08, z + 0.1]],
    H5b: ["H", [-1.24 - pinch, -1.92, z + 0.12]],
    H6a: ["H", [1.24 + pinch, -0.08, z + 0.09]],
    H6b: ["H", [1.24 + pinch, -1.92, z + 0.11]],
  });
  const dieneBonds: [string, string, number][] = [
    ["C1", "C2", 2],
    ["C2", "C3", 1],
    ["C3", "C4", 2],
    ["C2", "H2", 1],
    ["C3", "H3", 1],
    ["C1", "H1a", 1],
    ["C1", "H1b", 1],
    ["C4", "H4a", 1],
    ["C4", "H4b", 1],
  ];
  const eneBonds = (o: number): [string, string, number][] => [
    ["C5", "C6", o],
    ["C5", "H5a", 1],
    ["C5", "H5b", 1],
    ["C6", "H6a", 1],
    ["C6", "H6b", 1],
  ];
  // one structure holding both, so that they stay where they are
  const reactant = molecule({ ...diene, ...ene(2.6, 0) }, [...dieneBonds, ...eneBonds(2)]);
  const productAtoms = { ...diene, ...ene(1.45, 0.08) };
  const productOrder = ["H6b", "C3", "C5", "H1a", "C1", "H4b", "C6", "H2", "C4", "H5a", "H3", "H1b", "C2", "H6a", "H4a", "H5b"];
  const product = molecule(
    productAtoms,
    [
      ["C1", "C2", 1],
      ["C2", "C3", 2],
      ["C3", "C4", 1],
      ["C4", "C6", 1],
      ["C5", "C6", 1],
      ["C1", "C5", 1],
      ...dieneBonds.slice(3),
      ...eneBonds(1).slice(1),
    ],
    productOrder,
  );
  return { reactants: [reactant], product, productOrder };
}

/** For each product atom, the reactant atom it is by construction (from 0): product atoms named `productOrder`, the reactant's in its own order. */
export function trueMap(reactantNames: string[], productOrder: string[]): number[] {
  return productOrder.map((k) => reactantNames.indexOf(k));
}
