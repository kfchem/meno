/**
 * What a set holds (docs/WORKFLOWS.md, *An input: a set from the selection*): what
 * lies inside its frame - each structure drawn, each molecule in 3D and each
 * picture, whose middle is inside it - in the order they lie; what kind of
 * set that is; and its entries, each a structure with what has been found of
 * it.
 */
import type { ParsedAtom, ParsedBond } from "../../../../lib/chem/molecule";
import { geometryKey, type Entry, type EntryAtom, type Property } from "../../../../lib/entry";
import { speciesOf } from "../../../../lib/io/writers";
import type { Member, Model, Molecule3D, PictureItem, WorkflowSet } from "../store/types";
import type { SetHolds } from "./kinds";

type Pt = { x: number; y: number };
export type Frame = Pick<WorkflowSet, "x0" | "y0" | "x1" | "y1">;
export type Page = { model: Model; molecules3d?: readonly Molecule3D[]; pictures?: readonly Pick<PictureItem, "id" | "x" | "y">[] };

/** Whether `p` is inside a frame. */
export const inside = (b: Frame, p: Pt) => p.x >= b.x0 && p.x <= b.x1 && p.y >= b.y0 && p.y <= b.y1;

/** The structures drawn on the page, each its atoms' ids, as their bonds join them. */
export function structuresOf(model: Model): number[][] {
  const around = new Map<number, number[]>();
  const join = (p: number, q: number) => {
    around.set(p, [...(around.get(p) ?? []), q]);
    around.set(q, [...(around.get(q) ?? []), p]);
  };
  for (const b of model.bonds) {
    join(b.a, b.b);
    // (a haptic bond's ring with its metal and star, as fragmentOf has them:
    // walked by its bonds alone, the metal and the star were a structure
    // without the ring)
    for (const e of b.endpoints ?? []) join(b.a, e);
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

/** The structures drawn, by the id of each atom: its structure's place in `drawnIn`'s list. */
const componentAt = new WeakMap<Model, Map<number, number>>();
function componentsByAtom(model: Model): Map<number, number> {
  let found = componentAt.get(model);
  if (!found) {
    found = new Map();
    drawnIn(model).forEach((s, k) => s.ids.forEach((id) => found!.set(id, k)));
    componentAt.set(model, found);
  }
  return found;
}

/** What a set holds: the structures drawn (each its atoms' ids), the molecules in 3D and the pictures (by id) - its members, in their order, where it has them; else what lies inside its frame (`lyingIn`). A member gone from the page is left out; a structure member is the structures drawn now that hold any of its atoms. */
export function setMembers(page: Page, set: Frame & { members?: readonly Member[] }): { structures: number[][]; molecules: number[]; pictures: number[] } {
  if (!set.members) return lyingIn(page, set);
  const drawn = drawnIn(page.model);
  const byAtom = componentsByAtom(page.model);
  const molecules = new Set((page.molecules3d ?? []).map((m) => m.id));
  const pictures = new Set((page.pictures ?? []).map((p) => p.id));
  const out = { structures: [] as number[][], molecules: [] as number[], pictures: [] as number[] };
  const taken = new Set<number>();
  for (const m of set.members) {
    if ("structure" in m) {
      for (const id of m.structure) {
        const k = byAtom.get(id);
        if (k == null || taken.has(k)) continue;
        taken.add(k);
        out.structures.push(drawn[k].ids);
      }
    } else if ("molecule" in m) {
      if (molecules.has(m.molecule) && !out.molecules.includes(m.molecule)) out.molecules.push(m.molecule);
    } else if (pictures.has(m.picture) && !out.pictures.includes(m.picture)) out.pictures.push(m.picture);
  }
  return out;
}

/** What `setMembers` found, as members: in its order, structures first, then molecules, then pictures. */
export function membersOf(found: { structures: readonly (readonly number[])[]; molecules: readonly number[]; pictures: readonly number[] }): Member[] {
  return [...found.structures.map((ids) => ({ structure: [...ids] })), ...found.molecules.map((molecule) => ({ molecule })), ...found.pictures.map((picture) => ({ picture }))];
}

/** Where each of a page's structures, molecules and pictures is: what a set's gestures read (workflow/model `membersSettled`). */
export function placesOf(page: Page): { structures: { ids: number[]; at: Pt }[]; molecules: Map<number, Pt>; pictures: Map<number, Pt> } {
  return {
    structures: drawnIn(page.model),
    molecules: new Map((page.molecules3d ?? []).map((m) => [m.id, m.at])),
    pictures: new Map((page.pictures ?? []).map((p) => [p.id, { x: p.x, y: p.y }])),
  };
}

export { before as readingOrder };

/** What lies inside a frame: the structures drawn (each its atoms' ids), the molecules in 3D and the pictures (by id) whose middles are inside it, each in the order they lie. */
export function lyingIn(page: Page, set: Frame): { structures: number[][]; molecules: number[]; pictures: number[] } {
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
  // (a step's exit not run yet holds nothing yet: what it will give is flow's `givesOf`)
  if (set.made?.holds) return set.made.holds;
  const { structures } = setMembers(page, set);
  if (structures.length) return "structures";
  return setMolecules(page, set).some(conformersOfOne) ? "conformers" : "molecules";
}

/** How many entries a set holds, of what kind of set: a structure each, a frame each of a molecule in 3D - one for a path to its last - or a picture each. */
export function countOf(page: Page, set: WorkflowSet): { holds: SetHolds; entries: number; compounds: number } {
  const holds = holdsOf(page, set);
  const { structures, pictures } = setMembers(page, set);
  if (holds === "pictures") return { holds, entries: pictures.length, compounds: pictures.length };
  const molecules = setMolecules(page, set);
  const frames = molecules.reduce((n, m) => n + entriesIn(m), 0);
  const entries = structures.length + frames;
  return { holds, entries, compounds: holds === "conformers" ? molecules.length : entries };
}

/** How many frames a molecule in 3D has: its own geometry, and the rest. */
export const framesOf = (m: Pick<Molecule3D, "frames">) => 1 + (m.frames?.length ?? 0);

/** How many entries a molecule in 3D is: a frame each - but one, its last, where its frames are a path to it. */
export const entriesIn = (m: Pick<Molecule3D, "frames" | "path">) => (m.path ? 1 : framesOf(m));

/**
 * The most entries a result set lays out on the page (docs/WORKFLOWS-FOUNDATION.md,
 * *What a set shows*: up to 50, on the page): one with more holds them
 * itself (`WorkflowSet.collection`), summed up in its frame.
 */
export const LARGE_SET = 50;

/** A collection's molecules as steps take them, each given an id of its own within the set - not one of the page's, which they are not on - kept while the collection is the same. */
const asMolecules = new WeakMap<readonly Omit<Molecule3D, "id" | "at">[], Molecule3D[]>();

/** The molecules in 3D a set holds, in order: its collection's, where it holds one (each its id from -1 down, within the set), else those of the page among its members. */
export function setMolecules(page: Page, set: Frame & Pick<WorkflowSet, "members" | "collection">): Molecule3D[] {
  if (set.collection) {
    let ms = asMolecules.get(set.collection);
    if (!ms) {
      ms = set.collection.map((m, k) => ({ ...m, id: -(k + 1), at: { x: 0, y: 0 } }));
      asMolecules.set(set.collection, ms);
    }
    return ms;
  }
  const byId = new Map((page.molecules3d ?? []).map((m) => [m.id, m]));
  return setMembers(page, set).molecules.map((id) => byId.get(id)!);
}

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
  /**
   * Its charge and spin multiplicity, where the calculation it was read
   * from said them: the state it was in, which a step given it keeps -
   * an output's atoms carry no charges of their own.
   */
  charge?: number;
  multiplicity?: number;
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
    // (the state its calculation was in, where one said it)
    const state = {
      ...(Number.isInteger(m.calc?.charge) ? { charge: m.calc!.charge! } : {}),
      ...(Number.isInteger(m.calc?.multiplicity) && m.calc!.multiplicity! > 0 ? { multiplicity: m.calc!.multiplicity! } : {}),
    };
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
        ...state,
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

/**
 * A step's entry read as Meno's entry record (lib/entry, PR 1 of
 * docs/WORKFLOWS-FOUNDATION.md), by `id`: its structure in its numbering,
 * its geometry, its species by Meno's one rule, and what has been found of
 * it as properties - its energy (in hartrees, at its geometry), its
 * degeneracy, its compound as its group, its number, its name - and the
 * molecule it was a frame of as its lineage.
 */
export function entryOfSet(e: SetEntry, id: string): Entry {
  const atoms: EntryAtom[] = e.atoms.map((a) => ({
    el: a.el,
    ...(a.isotope ? { isotope: a.isotope } : {}),
    ...(a.charge ? { charge: a.charge } : {}),
    ...(a.radical ? { radical: a.radical } : {}),
  }));
  const at = { geometry: geometryKey(e.xyz) };
  const properties: Record<string, Property> = {
    group: { value: compoundLetter(e.compound), unit: "none", status: "computed" },
    number: { value: e.number, unit: "none", status: "computed" },
    ...(e.energy != null ? { energy: { value: e.energy, unit: "Eh" as const, at, status: "computed" as const } } : {}),
    ...(e.degeneracy != null ? { degeneracy: { value: e.degeneracy, unit: "none" as const, status: "computed" as const } } : {}),
    ...(e.name ? { name: { value: e.name, unit: "none" as const, status: "computed" as const } } : {}),
  };
  const written = { atoms: atoms.map((a, i) => ({ ...a, x: e.xyz[3 * i], y: e.xyz[3 * i + 1], z: e.xyz[3 * i + 2] })), bonds: [] };
  return {
    id,
    from: e.from != null ? [`molecule:${e.from}${e.frame != null ? `#${e.frame}` : ""}`] : [],
    structure: { atoms, bonds: e.bonds.map((b) => ({ a1: b.a1, a2: b.a2, order: b.order as 1 | 2 | 3 })) },
    geometry: { kind: "3d", xyz: [...e.xyz] },
    species: speciesOf(written, e),
    properties,
    status: "done",
  };
}

/**
 * A set's collection's hash (docs/WORKFLOWS-FOUNDATION.md, *Sets and
 * collections*): of its members, in order - each structure's atoms and
 * bonds, each molecule's atoms and every frame's places (lib/entry
 * `geometryKey`), each picture's image - so that what a set holds is told
 * apart by it, and the same again by the same. FNV-1a, twice over, 64 bits
 * as hex.
 */
export function collectionHash(page: Page & { pictures?: readonly Pick<PictureItem, "id" | "x" | "y" | "sha256">[] }, set: Frame & Pick<WorkflowSet, "members" | "collection">): string {
  const { structures, pictures } = setMembers(page, set);
  const atoms = new Map(page.model.atoms.map((a) => [a.id, a]));
  const shown = new Map((page.pictures ?? []).map((p) => [p.id, p as Partial<Pick<PictureItem, "sha256">>]));
  const parts: string[] = [];
  for (const ids of structures) {
    const inIt = new Set(ids);
    const els = ids.map((id) => `${atoms.get(id)!.el}${atoms.get(id)!.charge ?? ""}`).join(",");
    const bonds = page.model.bonds.filter((b) => inIt.has(b.a) && inIt.has(b.b)).map((b) => `${ids.indexOf(b.a)}-${ids.indexOf(b.b)}:${b.order}`).join(",");
    parts.push(`s|${els}|${bonds}`);
  }
  for (const m of setMolecules(page, set)) {
    const frames = Array.from({ length: framesOf(m) }, (_, f) => geometryKey(frameXyz(m, f))).join(",");
    parts.push(`m|${m.atoms.map((a) => a.el).join(",")}|${frames}`);
  }
  for (const id of pictures) parts.push(`p|${shown.get(id)?.sha256 ?? id}`);
  const text = parts.join("\n");
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x5bd1e995) >>> 0;
  }
  return a.toString(16).padStart(8, "0") + b.toString(16).padStart(8, "0");
}
