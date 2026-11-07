/**
 * The hierarchical digraph of a stereogenic unit (Prelog and Helmchen 1982
 * §3.2, pp. 572-573; Hanson et al. 2018 p. 1757): a tree grown out from its
 * root - the centre, or both atoms of the double bond - sphere by sphere,
 * built only as far as a comparison asks (Hanson p. 1757, "on a
 * need-to-know basis").
 *
 * - Each atom met again on the path from the root is a ring-closure
 *   duplicate (1982 p. 573): it ends its branch.
 * - Each node is made up to its ligancy (lib/chem/cip/prepare): its
 *   multiple bonds' duplicates, its hydrogens, and phantoms of atomic number
 *   0 for the rest. A duplicate's own ligands are three phantoms (1966 p.
 *   392), so it has none of its own here: what it is compared with is padded
 *   with phantoms as far as needed.
 * - Each node has its root distance for rule 1b, as Hanson et al. 2018
 *   propose (p. 1758): a ring-closure duplicate's is the sphere of the atom it
 *   duplicates; a multiple-bond duplicate's, the sphere of the atom it hangs
 *   from; any other node's, its own sphere.
 *
 * A digraph can be rooted at any atom: an auxiliary centre's ligand back
 * toward the root is ranked on a digraph rooted at that centre (Hanson p.
 * 1757; lib/chem/cip/rank).
 */
import { standardWeight } from "../isotopes";
import type { Prepared } from "./prepare";

/** What the node stands for besides an atom: an implicit hydrogen, or a phantom. */
export const HYDROGEN = -2;
export const PHANTOM = -1;

export type CipNode = {
  /** The atom it is, or duplicates; `HYDROGEN` or `PHANTOM`. */
  atom: number;
  /** Its atomic number, a duplicate's that of the atom it duplicates (or a blend's mean); NaN where it has none. */
  z: number;
  /** Its mass for rule 2: a duplicate's and a phantom's 0. */
  mass: number;
  dup: boolean;
  sphere: number;
  /** Its root distance, for rule 1b. */
  distance: number;
  parent: CipNode | null;
  /** The digraph it is part of. */
  graph: Digraph;
  /** Its ligands but the one toward the root, once asked for. */
  kids?: CipNode[];
};

/** Thrown where a unit's digraph grows past what is worked out (`NODE_BUDGET`). */
export class TooLarge extends Error {}

/** The most nodes one unit's digraphs are grown to: past it, the unit gets no label rather than freezing. */
export const NODE_BUDGET = 200_000;

/** A count of nodes made, shared by the digraphs of one unit. */
export type Budget = { left: number };

export class Digraph {
  readonly p: Prepared;
  readonly roots: CipNode[];
  private readonly budget: Budget;
  private readonly hMass: number;

  constructor(p: Prepared, root: readonly number[], budget: Budget) {
    this.p = p;
    this.budget = budget;
    this.hMass = standardWeight("H") ?? 1;
    this.roots = root.map((a) => this.node(a, 0, 0, false, null, p.z[a], p.mass[a]));
  }

  private node(atom: number, sphere: number, distance: number, dup: boolean, parent: CipNode | null, z: number, mass: number): CipNode {
    if (--this.budget.left < 0) throw new TooLarge();
    return { atom, z, mass, dup, sphere, distance, parent, graph: this };
  }

  /** The sphere of the node standing for `atom` on the path from the root to `from`, its root's atoms 0; -1 where it is not on it. */
  private onPath(from: CipNode, atom: number): number {
    for (let n: CipNode | null = from; n; n = n.parent) if (!n.dup && n.atom === atom) return n.sphere;
    for (const r of this.roots) if (r.atom === atom) return 0;
    return -1;
  }

  /** A real atom's node one sphere out from `from`, or its ring-closure duplicate where the path has it already. */
  private toward(from: CipNode, atom: number): CipNode {
    const met = this.onPath(from, atom);
    const s = from.sphere + 1;
    if (met >= 0) return this.node(atom, s, met, true, from, this.p.z[atom], 0);
    return this.node(atom, s, s, false, from, this.p.z[atom], this.p.mass[atom]);
  }

  private hydrogen(from: CipNode): CipNode {
    return this.node(HYDROGEN, from.sphere + 1, from.sphere + 1, false, from, 1, this.hMass);
  }

  private phantom(from: CipNode): CipNode {
    return this.node(PHANTOM, from.sphere + 1, from.sphere + 1, false, from, 0, 0);
  }

  /** How many ligands an atom has, complemented: four, or more where it has more neighbours and duplicates (an SF5's S). */
  ligancy(atom: number): number {
    const p = this.p;
    return Math.max(4, p.around[atom].length + p.hs[atom] + p.dups[atom].length);
  }

  /**
   * A root atom's substituents, in sphere 1: its neighbours but `except` (a
   * double bond's other atom), its hydrogens, and phantoms for the rest of
   * its ligancy - a lone pair's. Its duplicates are not among them: a
   * centre has none (lib/chem/cip/index refuses one that has), and a double
   * bond's end has its other atom's.
   */
  substituentsOf(root: CipNode, except: number | null): CipNode[] {
    const p = this.p;
    const a = root.atom;
    const out: CipNode[] = [];
    for (const b of p.around[a]) if (b !== except) out.push(this.toward(root, b));
    for (let k = 0; k < p.hs[a]; k++) out.push(this.hydrogen(root));
    const filled = p.around[a].length + p.hs[a] + p.dups[a].length;
    for (let k = filled; k < this.ligancy(a); k++) out.push(this.phantom(root));
    return out;
  }

  /** A root atom's ligand toward its neighbour `atom`: the branch an auxiliary centre's root-ward ligand is ranked by. */
  branchToward(root: CipNode, atom: number): CipNode {
    return this.toward(root, atom);
  }

  /** A node's ligands but the one toward the root: none for a duplicate, a hydrogen or a phantom. */
  children(n: CipNode): CipNode[] {
    if (n.kids) return n.kids;
    const kids: CipNode[] = [];
    if (!n.dup && n.atom >= 0 && n.parent) {
      const p = this.p;
      const a = n.atom;
      const from = n.parent.atom;
      for (const b of p.around[a]) if (b !== from) kids.push(this.toward(n, b));
      for (let k = 0; k < p.hs[a]; k++) kids.push(this.hydrogen(n));
      for (const d of p.dups[a]) kids.push(this.node(d.of, n.sphere + 1, n.sphere, true, n, d.z, 0));
      for (let k = kids.length + 1; k < this.ligancy(a); k++) kids.push(this.phantom(n));
    }
    n.kids = kids;
    return kids;
  }
}
