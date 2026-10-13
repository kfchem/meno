/**
 * What a molecule in 3D's file leaves out (docs/WORKSPACE.md, *Hydrogens and
 * bond orders*): a file of coordinates - XYZ, PDB, a calculation's output -
 * gives no bond orders, and an X-ray entry no hydrogens. A picture drawn as
 * if they were known misleads as one with its hydrogens hidden does, so a
 * molecule says what is missing, and what can be found is found by the
 * RDKit plugin (its worker: bond orders from where the atoms stand, from a
 * SMILES, hydrogens where the atoms' geometry puts them). Pure: over the
 * molecule, and the MOL blocks the worker answers with.
 */
import { implicitHydrogens } from "../../../../lib/chem/molecule";
import { writeMolfile3d } from "../../../../lib/chem/molWriter";
import { readMolfile } from "../../../../lib/chem/ctfile";
import { chainRuns, isWater } from "../../../../lib/chem/biopolymer";
import type { Component } from "../../../../lib/chem/ccd";
import type { Molecule3D } from "../store/types";

/** What a molecule says of what its file leaves out, on the canvas and in a picture of it. */
export const NO_H_MARK = "No H in file";
export const ORDERS_MARK = "Bond orders unknown";

/** The most atoms a molecule's bond orders are sought for from its shape, at once: more, and they are left unknown. */
export const MOST_PERCEIVED = 400;

/**
 * A PDB entry's ligands: each group of bonded atoms bound to its chains -
 * residues in no run (`chainRuns`), water left out - by atom index; two
 * atoms at least (a lone ion has no bonds to order). For a molecule that
 * is no biopolymer, none.
 */
export function ligandGroups(m: Pick<Molecule3D, "atoms" | "bonds" | "biopolymer">): number[][] {
  const bp = m.biopolymer;
  if (!bp) return [];
  const inRun = new Uint8Array(bp.residues.length);
  for (const run of chainRuns(bp, m.atoms)) for (const r of run.residues) inRun[r] = 1;
  const bound = (i: number) => !inRun[bp.residueOf[i]] && !isWater(bp.residues[bp.residueOf[i]]);
  const near: number[][] = m.atoms.map(() => []);
  for (const b of m.bonds) {
    if (bound(b.a1) && bound(b.a2)) {
      near[b.a1].push(b.a2);
      near[b.a2].push(b.a1);
    }
  }
  const seen = new Uint8Array(m.atoms.length);
  const groups: number[][] = [];
  m.atoms.forEach((_, i) => {
    if (seen[i] || !bound(i) || !near[i].length) return;
    const group: number[] = [];
    const edge = [i];
    seen[i] = 1;
    while (edge.length) {
      const a = edge.pop()!;
      group.push(a);
      for (const b of near[a]) {
        if (seen[b]) continue;
        seen[b] = 1;
        edge.push(b);
      }
    }
    groups.push(group.sort((p, q) => p - q));
  });
  return groups;
}

/**
 * What an action on a molecule acts on (its bond orders found or given,
 * its hydrogens added): the ligand `atom` is part of, for a PDB entry -
 * its chains' own are not Meno's to complete (protonating a protein is not
 * done) - or else, the molecule's every atom. Null where `atom` is in a
 * chain.
 */
export function partOf(m: Pick<Molecule3D, "atoms" | "bonds" | "biopolymer">, atom: number | null): number[] | null {
  if (!m.biopolymer) return m.atoms.map((_, i) => i);
  const groups = ligandGroups(m);
  if (atom != null) return groups.find((g) => g.includes(atom)) ?? null;
  return groups.length === 1 ? groups[0] : null;
}

type Known = Pick<Molecule3D, "atoms" | "bonds" | "biopolymer" | "bondOrders" | "unknownOrders" | "chainOrders">;

/** The atoms whose bond orders are unknown: a PDB entry's ligands' that are - all its ligands', before any were sought - or else, unknown, all of it. */
export function stillUnknown(m: Known): number[] {
  if (m.bondOrders !== "unknown") return [];
  if (!m.biopolymer) return m.atoms.map((_, i) => i);
  return m.unknownOrders ?? ligandGroups(m).flat();
}

/** Whether a molecule's bond orders are unknown as a look draws it: its file gave none and none were found or given - for a PDB entry, a ligand's - or its chains are drawn as atoms, whose own were not given from the dictionary. */
export function ordersUnknown(m: Known, chainsAsAtoms: boolean): boolean {
  return stillUnknown(m).length > 0 || (!!m.biopolymer && chainsAsAtoms && m.chainOrders !== "dictionary");
}

/**
 * Whether a molecule's file leaves out its hydrogens, as a look draws it:
 * some of it has none - all of it; for a PDB entry, its chains, where they
 * are drawn as atoms, or a ligand - and either its bond orders are unknown
 * and it has a carbon whose neighbours leave room for some
 * (`wantsHydrogens`), or, its orders known, an atom of it takes hydrogens
 * its valence leaves room for.
 */
export function noHydrogensInFile(m: Known, chainsAsAtoms = true): boolean {
  const bp = m.biopolymer;
  if (!bp) return lacksHydrogens(m, m.atoms.map((_, i) => i), m.bondOrders === "unknown");
  const open = new Set(stillUnknown(m));
  const chains = m.atoms.flatMap((_, i) => (bp.residues[bp.residueOf[i]]?.standard ? [i] : []));
  if (chainsAsAtoms && chains.length && lacksHydrogens(m, chains, true)) return true;
  return ligandGroups(m).some((g) => lacksHydrogens(m, g, open.has(g[0])));
}

/** Whether some atoms of a molecule have no hydrogens among them and would: a carbon among them that would (`wantsHydrogens`), their orders unknown (`unknown`); else an atom with room for some. */
function lacksHydrogens(m: Pick<Molecule3D, "atoms" | "bonds">, atoms: readonly number[], unknown: boolean): boolean {
  if (atoms.some((i) => m.atoms[i].el === "H")) return false;
  if (unknown) {
    const near: number[][] = m.atoms.map(() => []);
    for (const b of m.bonds) {
      near[b.a1]?.push(b.a2);
      near[b.a2]?.push(b.a1);
    }
    return atoms.some((i) => m.atoms[i].el === "C" && wantsHydrogens(m.atoms, i, near[i]));
  }
  const sum = new Float64Array(m.atoms.length);
  for (const b of m.bonds) {
    const order = b.order === 4 ? 1.5 : b.order >= 1 && b.order <= 3 ? b.order : 0;
    sum[b.a1] += order;
    sum[b.a2] += order;
  }
  return atoms.some((i) => implicitHydrogens(m.atoms[i].el, Math.round(sum[i]), m.atoms[i].charge ?? 0, m.atoms[i].radical) > 0);
}

/** Two of a carbon's neighbours further round it than this, in degrees, stand in a line with it. */
const IN_A_LINE = 165;
/** Three of its neighbours whose angles at it come to this, in degrees, or more stand in a plane with it (360 flat; 328.4 a tetrahedron's corner). */
const IN_A_PLANE = 350;
/** The end of a triple bond from a carbon to oxygen or nitrogen, in ångströms, at most: carbon monoxide's 1.13, an isocyanide's 1.17 (a C=O or C=N is 1.2 or more). */
const TRIPLE_END = 1.18;

/**
 * Whether a carbon, its bond orders unknown, would carry hydrogens, by
 * where its neighbours stand (`near`): with none, or one - but for the end
 * of a C≡O or C≡N, carbon monoxide's or an isocyanide's; two, not in a
 * line; three, not in a plane. With four, two in a line (carbon dioxide, a
 * nitrile, a metal's carbonyl, an alkyne's middle) or three in a plane
 * (C60, a ring carbon with no hydrogen of its own) it has room for none.
 */
function wantsHydrogens(atoms: Molecule3D["atoms"], i: number, near: readonly number[]): boolean {
  const c = atoms[i];
  const way = (j: number) => [atoms[j].x - c.x, atoms[j].y - c.y, atoms[j].z - c.z];
  const angle = (j: number, k: number) => {
    const [u, v] = [way(j), way(k)];
    const dot = u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
    return (Math.acos(Math.max(-1, Math.min(1, dot / (Math.hypot(...u) * Math.hypot(...v))))) * 180) / Math.PI;
  };
  if (near.length === 0) return true;
  if (near.length === 1) {
    const o = atoms[near[0]];
    return !((o.el === "O" || o.el === "N") && Math.hypot(...way(near[0])) <= TRIPLE_END);
  }
  if (near.length === 2) return angle(near[0], near[1]) < IN_A_LINE;
  if (near.length === 3) return angle(near[0], near[1]) + angle(near[0], near[2]) + angle(near[1], near[2]) < IN_A_PLANE;
  return false;
}

/** Whether some of the molecule, or of `atoms`, has hydrogens: bond orders are sought from its shape only then. */
export function hasHydrogens(m: Pick<Molecule3D, "atoms">, atoms?: readonly number[]): boolean {
  return (atoms ?? m.atoms.map((_, i) => i)).some((i) => m.atoms[i]?.el === "H");
}

/**
 * Some of a molecule's atoms - all of them, unset - as a MOL block in 3D for
 * the worker, as its first frame has them, with the bonds among them; and
 * which of the molecule's atoms each of the block's is.
 */
export function blockOf(m: Pick<Molecule3D, "atoms" | "bonds">, atoms?: readonly number[]): { molblock: string; atoms: number[] } {
  const which = atoms ? [...atoms] : m.atoms.map((_, i) => i);
  const at = new Map(which.map((a, k) => [a, k]));
  const bonds = m.bonds.flatMap((b) => {
    const a1 = at.get(b.a1);
    const a2 = at.get(b.a2);
    return a1 != null && a2 != null ? [{ a1, a2, order: b.order >= 1 && b.order <= 3 ? b.order : 1 }] : [];
  });
  const block = writeMolfile3d(
    which.map((i) => ({ el: m.atoms[i].el, x: m.atoms[i].x, y: m.atoms[i].y, z: m.atoms[i].z, ...(m.atoms[i].charge ? { charge: m.atoms[i].charge } : {}) })),
    bonds,
  );
  return { molblock: block, atoms: which };
}

/**
 * A molecule given the bond orders, and the charges, the worker found or
 * was given for some of its atoms (`atoms`, the block's in their order;
 * hydrogens it left out come after the heavy ones, as `drawing_of` gives
 * them back, or not at all): each bond between two of them the block's,
 * the rest as they were.
 */
export function withOrders(m: Molecule3D, atoms: readonly number[], molblock: string, heavyOnly = false): Molecule3D | null {
  const ct = readMolfile(molblock);
  if (!ct) return null;
  // (the block's atoms in their order - or its heavy ones, where it left the hydrogens out)
  const which = heavyOnly ? atoms.filter((i) => m.atoms[i].el !== "H") : [...atoms];
  if (ct.atoms.length !== which.length) return null;
  const order = new Map<string, number>();
  for (const b of ct.bonds) {
    const p = which[b.a1];
    const q = which[b.a2];
    if (p == null || q == null) continue;
    order.set(p < q ? `${p} ${q}` : `${q} ${p}`, b.type >= 1 && b.type <= 3 ? b.type : 1);
  }
  const bonds = m.bonds.map((b) => {
    const o = order.get(b.a1 < b.a2 ? `${b.a1} ${b.a2}` : `${b.a2} ${b.a1}`);
    return o != null && o !== b.order ? { ...b, order: o } : b;
  });
  const charged = new Map(which.map((i, k) => [i, ct.atoms[k].charge ?? 0]));
  const atomsNow = m.atoms.map((a, i) => {
    const c = charged.get(i);
    if (c == null || c === (a.charge ?? 0)) return a;
    const { charge: _was, ...rest } = a;
    return c ? { ...rest, charge: c } : rest;
  });
  return { ...m, atoms: atomsNow, bonds };
}

/**
 * A molecule given bond orders and formal charges for some of its atoms
 * (`atoms`), as an estimate made of them alone gives them: `orders`, each
 * bond's among them by its place in `bonds`, the molecule's bonds between
 * two of them in turn; `charges`, each atom's in turn. Its other bonds and
 * atoms as they were.
 */
export function withPartOrders(m: Molecule3D, atoms: readonly number[], orders: readonly number[], charges: readonly number[]): Molecule3D {
  const at = new Map(atoms.map((a, k) => [a, k]));
  let k = 0;
  const bonds = m.bonds.map((b) => {
    if (!at.has(b.a1) || !at.has(b.a2)) return b;
    const order = orders[k++];
    return order === b.order ? b : { ...b, order };
  });
  const atomsNow = m.atoms.map((a, i) => {
    const k = at.get(i);
    if (k == null || charges[k] === (a.charge ?? 0)) return a;
    const { charge: _was, ...rest } = a;
    return charges[k] ? { ...rest, charge: charges[k] } : rest;
  });
  return { ...m, atoms: atomsNow, bonds };
}

/** The bonds among some of a molecule's atoms (`atoms`), each by those atoms' places: as an estimate is asked of them, in the molecule's order. */
export function bondsAmong(m: Pick<Molecule3D, "bonds">, atoms: readonly number[]): { a1: number; a2: number }[] {
  const at = new Map(atoms.map((a, k) => [a, k]));
  return m.bonds.flatMap((b) => (at.has(b.a1) && at.has(b.a2) ? [{ a1: at.get(b.a1)!, a2: at.get(b.a2)! }] : []));
}

/**
 * A molecule given the hydrogens the worker added to some of its atoms
 * (`atoms`, the block's first ones in their order; its new hydrogens after
 * them): each put after the molecule's atoms, bonded to its atom - in the
 * same residue, for a biopolymer; tied to no atom of a drawing. Null where
 * the block is not those atoms and hydrogens, or the molecule has other
 * frames, which would have none.
 */
export function withHydrogens(m: Molecule3D, atoms: readonly number[], molblock: string): Molecule3D | null {
  const ct = readMolfile(molblock);
  if (!ct || m.frames?.length || ct.atoms.length < atoms.length) return null;
  const added = ct.atoms.slice(atoms.length);
  if (!added.every((a) => a.symbol === "H")) return null;
  const n = m.atoms.length;
  const indexOf = (k: number) => (k < atoms.length ? atoms[k] : n + (k - atoms.length));
  const newAtoms = added.map((a) => ({ el: "H", x: a.x, y: a.y, z: a.z }));
  const newBonds = ct.bonds.filter((b) => b.a1 >= atoms.length || b.a2 >= atoms.length).map((b) => ({ a1: indexOf(b.a1), a2: indexOf(b.a2), order: 1 }));
  const bp = m.biopolymer;
  const partner = (h: number) => newBonds.find((b) => b.a1 === h || b.a2 === h);
  return {
    ...m,
    atoms: [...m.atoms, ...newAtoms],
    bonds: [...m.bonds, ...newBonds],
    ...(m.drawnFrom ? { drawnFrom: [...m.drawnFrom, ...newAtoms.map(() => null)] } : {}),
    ...(bp
      ? {
          biopolymer: {
            ...bp,
            names: [...bp.names, ...newAtoms.map(() => "H")],
            residueOf: [
              ...bp.residueOf,
              ...newAtoms.map((_, k) => {
                const b = partner(n + k);
                const heavy = b ? (b.a1 === n + k ? b.a2 : b.a1) : atoms[0];
                return bp.residueOf[heavy] ?? bp.residueOf[atoms[0]];
              }),
            ],
          },
        }
      : {}),
  };
}

const pairOf = (a: string, b: string) => (a < b ? `${a}\n${b}` : `${b}\n${a}`);

/**
 * A PDB entry given its residues' bond orders and formal charges as the
 * Chemical Component Dictionary defines each residue (`components`, by
 * residue name): a residue whose every atom the component names, with its
 * element, and whose every bond within it the component has - single,
 * double or triple - takes the component's; any other is left as it was.
 * Bonds between residues (a peptide's, a disulfide, a ligand's link) stay
 * as they are. Its ligands so given are known; its chains, where every
 * residue of them was given. Null where it is no PDB entry; `given`, the
 * residues given, by place.
 */
export function withComponents(m: Molecule3D, components: ReadonlyMap<string, Component>): { molecule: Molecule3D; given: number[] } | null {
  const bp = m.biopolymer;
  if (!bp) return null;
  const members: number[][] = bp.residues.map(() => []);
  m.atoms.forEach((_, i) => members[bp.residueOf[i]].push(i));
  const inside: number[][] = bp.residues.map(() => []);
  m.bonds.forEach((b, k) => {
    if (bp.residueOf[b.a1] === bp.residueOf[b.a2]) inside[bp.residueOf[b.a1]].push(k);
  });
  const orders = new Map<number, number>();
  const charges = new Map<number, number>();
  const given: number[] = [];
  bp.residues.forEach((residue, r) => {
    const c = components.get(residue.name);
    if (!c || isWater(residue) || !members[r].length) return;
    const atomOf = new Map(c.atoms.map((a) => [a.name, a]));
    const named = members[r].map((i) => atomOf.get(bp.names[i]));
    if (named.some((a, k) => !a || a.element.toUpperCase() !== m.atoms[members[r][k]].el.toUpperCase())) return;
    const orderOf = new Map(c.bonds.map((b) => [pairOf(b.a, b.b), b.order]));
    const found: [number, number][] = [];
    for (const k of inside[r]) {
      const order = orderOf.get(pairOf(bp.names[m.bonds[k].a1], bp.names[m.bonds[k].a2]));
      // (a bond the component has not, or not as single, double or triple: the residue is not the component's as drawn)
      if (order == null) return;
      found.push([k, order]);
    }
    for (const [k, order] of found) orders.set(k, order);
    members[r].forEach((i, k) => charges.set(i, named[k]!.charge));
    given.push(r);
  });
  const bonds = m.bonds.map((b, k) => {
    const order = orders.get(k);
    return order != null && order !== b.order ? { ...b, order } : b;
  });
  const atoms = m.atoms.map((a, i) => {
    const c = charges.get(i);
    if (c == null || c === (a.charge ?? 0)) return a;
    const { charge: _was, ...rest } = a;
    return c ? { ...rest, charge: c } : rest;
  });
  const done = new Set(given);
  const left = stillUnknown(m).filter((i) => !done.has(bp.residueOf[i]));
  const inRun = new Uint8Array(bp.residues.length);
  for (const run of chainRuns(bp, m.atoms)) for (const r of run.residues) inRun[r] = 1;
  const chains = bp.residues.flatMap((residue, r) => ((residue.standard || inRun[r]) && !isWater(residue) ? [r] : []));
  const { unknownOrders: _was, ...rest } = m;
  const molecule: Molecule3D = {
    ...rest,
    atoms,
    bonds,
    ...(m.bondOrders === "unknown" ? (left.length ? { bondOrders: "unknown" as const, unknownOrders: left } : { bondOrders: "dictionary" as const }) : {}),
    ...(chains.length && chains.every((r) => done.has(r)) ? { chainOrders: "dictionary" as const } : {}),
  };
  return { molecule, given };
}
