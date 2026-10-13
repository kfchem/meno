/**
 * What a set holds (docs/WORKFLOWS.md, *An input: a set from the selection*): what
 * lies inside its frame - each structure drawn, each molecule in 3D and each
 * picture, whose middle is inside it - in the order they lie; what kind of
 * set that is; and its entries, each a structure with what has been found of
 * it.
 */
import type { ParsedAtom, ParsedBond } from "../../../../lib/chem/molecule";
import type { Model, Molecule3D, PictureItem, WorkflowSet } from "../store/types";
import type { SetHolds } from "./kinds";

type Pt = { x: number; y: number };
export type Frame = Pick<WorkflowSet, "x0" | "y0" | "x1" | "y1">;
export type Page = { model: Model; molecules3d?: readonly Molecule3D[]; pictures?: readonly Pick<PictureItem, "id" | "x" | "y">[] };

/** Whether `p` is inside a frame. */
export const inside = (b: Frame, p: Pt) => p.x >= b.x0 && p.x <= b.x1 && p.y >= b.y0 && p.y <= b.y1;

/** The structures drawn on the page, each its atoms' ids, as their bonds join them. */
export function structuresOf(model: Model): number[][] {
  const around = new Map<number, number[]>();
  for (const b of model.bonds) {
    around.set(b.a, [...(around.get(b.a) ?? []), b.b]);
    around.set(b.b, [...(around.get(b.b) ?? []), b.a]);
  }
  const seen = new Set<number>();
  const out: number[][] = [];
  for (const a of model.atoms) {
    if (seen.has(a.id)) continue;
    const part: number[] = [];
    const todo = [a.id];
    seen.add(a.id);
    while (todo.length) {
      const id = todo.pop()!;
      part.push(id);
      for (const n of around.get(id) ?? []) {
        if (!seen.has(n)) {
          seen.add(n);
          todo.push(n);
        }
      }
    }
    out.push(part);
  }
  return out;
}

/** The middle of a structure's atoms, found in `byId`: the page's atoms by their ids. */
export function middleOfAtoms(byId: ReadonlyMap<number, Pt>, ids: readonly number[]): Pt {
  let x = 0;
  let y = 0;
  for (const id of ids) {
    const a = byId.get(id)!;
    x += a.x;
    y += a.y;
  }
  return { x: x / ids.length, y: y / ids.length };
}

/**
 * The structures drawn, each with its middle: worked out once for each
 * drawing - a drawing changed is a new one - as every set asks on every
 * edit, of pages of thousands of atoms (the atoms by id made once, not for
 * each structure).
 */
const drawnAt = new WeakMap<Model, { ids: number[]; at: Pt }[]>();
function drawnIn(model: Model): { ids: number[]; at: Pt }[] {
  let found = drawnAt.get(model);
  if (!found) {
    const byId = new Map(model.atoms.map((a) => [a.id, a]));
    found = structuresOf(model).map((ids) => ({ ids, at: middleOfAtoms(byId, ids) }));
    drawnAt.set(model, found);
  }
  return found;
}

/** Whether `p` lies before `q`: higher on the page, or - about level, within half a bond's height - to its left. */
const before = (p: Pt, q: Pt) => (Math.abs(p.y - q.y) > 0.9 ? q.y - p.y : p.x - q.x);

/** What lies inside a frame: the structures drawn (each its atoms' ids), the molecules in 3D and the pictures (by id) whose middles are inside it, each in the order they lie. */
export function setMembers(page: Page, set: Frame): { structures: number[][]; molecules: number[]; pictures: number[] } {
  const structures = drawnIn(page.model)
    .filter((s) => inside(set, s.at))
    .sort((p, q) => before(p.at, q.at))
    .map((s) => s.ids);
  const molecules = (page.molecules3d ?? [])
    .filter((m) => inside(set, m.at))
    .sort((p, q) => before(p.at, q.at))
    .map((m) => m.id);
  const pictures = (page.pictures ?? [])
    .filter((p) => inside(set, p))
    .sort((p, q) => before(p, q))
    .map((p) => p.id);
  return { structures, molecules, pictures };
}

/**
 * Whether a molecule's frames are one compound's conformers wherever it
 * is: those a conformer search made - Meno's own (*3D structures*), or a
 * workflow's - which say so (`conformerSet`), where it has more than one
 * (the maintainer, 2026-10-08). A file's many geometries are not.
 */
export const conformersOfOne = (m: Pick<Molecule3D, "conformerSet" | "frames">) => m.conformerSet === true && framesOf(m) > 1;

/**
 * What a set holds: what made it says - a Render step's, pictures; made by
 * the chemist, structures, where any is drawn - else a conformer set, where
 * a molecule in it is a conformer search's (`conformersOfOne`): each
 * molecule in it a compound, its frames its conformers - else molecules in
 * 3D.
 */
export function holdsOf(page: Page, set: WorkflowSet): SetHolds {
  if (set.made) return set.made.holds;
  const { structures, molecules } = setMembers(page, set);
  if (structures.length) return "structures";
  const byId = new Map((page.molecules3d ?? []).map((m) => [m.id, m]));
  return molecules.some((id) => conformersOfOne(byId.get(id)!)) ? "conformers" : "molecules";
}

/** How many entries a set holds, of what kind of set: a structure each, a frame each of a molecule in 3D - one for a path to its last - or a picture each. */
export function countOf(page: Page, set: WorkflowSet): { holds: SetHolds; entries: number; compounds: number } {
  const holds = holdsOf(page, set);
  const { structures, molecules, pictures } = setMembers(page, set);
  if (holds === "pictures") return { holds, entries: pictures.length, compounds: pictures.length };
  const byId = new Map((page.molecules3d ?? []).map((m) => [m.id, m]));
  const frames = molecules.reduce((n, id) => n + entriesIn(byId.get(id)!), 0);
  const entries = structures.length + frames;
  return { holds, entries, compounds: holds === "conformers" ? molecules.length : entries };
}

/** How many frames a molecule in 3D has: its own geometry, and the rest. */
export const framesOf = (m: Pick<Molecule3D, "frames">) => 1 + (m.frames?.length ?? 0);

/** How many entries a molecule in 3D is: a frame each - but one, its last, where its frames are a path to it. */
const entriesIn = (m: Pick<Molecule3D, "frames" | "path">) => (m.path ? 1 : framesOf(m));

/** One entry of a set of molecules in 3D, as a step takes it: its compound by its place among the set's, its number among that compound's conformers, its atoms and bonds, its geometry, its energy. */
export type SetEntry = {
  compound: number;
  number: number;
  atoms: readonly ParsedAtom[];
  bonds: readonly ParsedBond[];
  /** Its atoms' x, y and z in turn, in ångströms. */
  xyz: readonly number[];
  /** In hartrees, where it has one. */
  energy?: number;
  /** How many forms of it a conformer search found alike - its rotamers - where it said (CREST's degeneracy): its Boltzmann weight counts each. */
  degeneracy?: number;
  name?: string;
  /** The molecule in 3D it is a frame of, by id; which frame, and whether it is that molecule's last. */
  from?: number;
  frame?: number;
  last?: boolean;
};

/** A molecule's frame `f`: its atoms' x, y and z in turn. */
export function frameXyz(m: Pick<Molecule3D, "atoms" | "frames">, f: number): number[] {
  return f === 0 ? m.atoms.flatMap((a) => [a.x, a.y, a.z]) : (m.frames?.[f - 1] ?? []);
}

/**
 * The entries of molecules in 3D, as a set of `set`. In a compound set
 * each frame of each molecule is a compound of its own - a file of many
 * geometries is many compounds, not conformers because they are many
 * (docs/WORKFLOWS.md, *Compound sets and conformer sets*); in a conformer
 * set each molecule is a compound, its frames its conformers.
 */
export function setEntries(molecules: readonly Molecule3D[], holds: "molecules" | "conformers"): SetEntry[] {
  const out: SetEntry[] = [];
  molecules.forEach((m, i) => {
    const n = framesOf(m);
    const energies = m.energies?.length === n ? m.energies : undefined;
    const degeneracies = m.degeneracies?.length === n ? m.degeneracies : undefined;
    // (a path: its last frame alone)
    for (let f = m.path ? n - 1 : 0; f < n; f++) {
      out.push({
        compound: holds === "conformers" ? i : out.length,
        number: holds === "conformers" ? (m.numbers?.[f] ?? f + 1) : 1,
        atoms: m.atoms,
        bonds: m.bonds,
        xyz: frameXyz(m, f),
        ...(energies ? { energy: energies[f] } : {}),
        ...(degeneracies ? { degeneracy: degeneracies[f] } : {}),
        ...(m.name ? { name: m.name } : {}),
        from: m.id,
        frame: f,
        last: f === n - 1,
      });
    }
  });
  return out;
}

/** A compound's letter, by its place among a set's: a to z, then aa, ab... */
export function compoundLetter(i: number): string {
  const a = "abcdefghijklmnopqrstuvwxyz";
  return i < 26 ? a[i] : compoundLetter(Math.floor(i / 26) - 1) + a[i % 26];
}
