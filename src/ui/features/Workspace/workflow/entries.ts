/**
 * What a set holds (docs/WORKFLOWS.md, *An input: a set from the selection*): what
 * lies inside its frame - each structure drawn, each molecule in 3D and each
 * picture, whose middle is inside it - in the order they lie; what kind of
 * set that is; and its entries, each a structure with what has been found of
 * it.
 */
import { FAILURE_WORDS, type Failure } from "./failures";
import { convergedOf, type Converged } from "./converged";
import { COORDINATION_BOND, type ParsedAtom, type ParsedBond } from "../../../../lib/chem/molecule";
import type { CalcInfo } from "../../../../lib/calc/output";
import { FREQUENCY, geometryKey, propertyIn, type At, type By, type Entry, type EntryAtom, type EntryStatus, type EntryStereo, type Property } from "../../../../lib/entry";
import { leftOut, readEach } from "../utils/readNotes";
import { signatureOf } from "../utils/drawnLink";
import { identityOfDrawn, labelsDrawnOut } from "../chem/identityOf";
import { partOf } from "../chem/cleanUp";
import { stereoKnown } from "./configurations";
import { speciesOf } from "../../../../lib/io/writers";
import { isSkeleton } from "../utils/completeness";
import { groupLetter } from "../../../../lib/nodes/base";
import { aboveText, numberText } from "../../../../lib/calc/results";
import type { DrawnRecord, Member, Model, Molecule3D, PictureItem, WorkflowSet } from "../store/types";
import { kindInfo, type SetHolds, type StepKind } from "./kinds";
import { skeletonWhy } from "../../../../lib/chem/skeleton";
import { PATH_FRAME, REFINED_SAID, STARTED_SAID } from "../../../../lib/calc/paths";

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

/**
 * What a set holds: the structures drawn (each its atoms' ids), the
 * molecules in 3D and the pictures (by id) - its members, in their order,
 * where it has them; else what lies inside its frame (`lyingIn`). A member
 * gone from the page is left out; a structure member is the structures
 * drawn now that hold any of its atoms, each with the member's record
 * (`records`, beside the structures: none where it has none).
 */
export function setMembers(
  page: Page,
  set: Frame & { members?: readonly Member[] },
): { structures: number[][]; records: (DrawnRecord | undefined)[]; molecules: number[]; pictures: number[] } {
  if (!set.members) {
    const lying = lyingIn(page, set);
    return { ...lying, records: lying.structures.map(() => undefined) };
  }
  const drawn = drawnIn(page.model);
  const byAtom = componentsByAtom(page.model);
  const molecules = new Set((page.molecules3d ?? []).map((m) => m.id));
  const pictures = new Set((page.pictures ?? []).map((p) => p.id));
  const out = { structures: [] as number[][], records: [] as (DrawnRecord | undefined)[], molecules: [] as number[], pictures: [] as number[] };
  // (each structure taken, by its place among them)
  const taken = new Map<number, number>();
  for (const m of set.members) {
    if ("structure" in m) {
      const mine = new Set<number>();
      for (const id of m.structure) {
        const k = byAtom.get(id);
        if (k == null || mine.has(k)) continue;
        mine.add(k);
        const i = taken.get(k);
        if (i != null) {
          // (two members joined into one structure: what each came from kept, the properties of neither)
          if (m.record) out.records[i] = joined(out.records[i], m.record);
          continue;
        }
        taken.set(k, out.structures.length);
        out.structures.push(drawn[k].ids);
        out.records.push(m.record);
      }
    } else if ("molecule" in m) {
      if (molecules.has(m.molecule) && !out.molecules.includes(m.molecule)) out.molecules.push(m.molecule);
    } else if (pictures.has(m.picture) && !out.pictures.includes(m.picture)) out.pictures.push(m.picture);
  }
  // (each record as its structure stands now: edited since it was given, its properties are of the one before)
  out.records = out.records.map((r, i) => recordNow(r, page.model, out.structures[i]));
  return out;
}

/**
 * Where each structure a step numbered lies on the page, with what the step
 * said of it (Enumerate's: its record, `numberedRecord`): the middle of its atoms across, and
 * its lowest atom - where its number is shown under it - for each structure
 * member of the page's sets that has one.
 */
export function numberedOn(page: Page, sets: readonly WorkflowSet[]): { key: string; x: number; y: number; record: DrawnRecord }[] {
  const at = new Map(page.model.atoms.map((a) => [a.id, a]));
  return sets.flatMap((set) =>
    (set.members ?? []).flatMap((m) => {
      if (!("structure" in m) || recordNumber(m.record) == null) return [];
      const atoms = m.structure.flatMap((id) => (at.has(id) ? [at.get(id)!] : []));
      if (!atoms.length) return [];
      const xs = atoms.map((a) => a.x);
      return [{ key: `${set.id}:${m.structure[0]}`, x: (Math.min(...xs) + Math.max(...xs)) / 2, y: Math.min(...atoms.map((a) => a.y)), record: m.record! }];
    }),
  );
}

/** What `setMembers` found, as members: in its order, structures first - each with its record, where it has one - then molecules, then pictures. */
export function membersOf(found: {
  structures: readonly (readonly number[])[];
  records?: readonly (DrawnRecord | undefined)[];
  molecules: readonly number[];
  pictures: readonly number[];
}): Member[] {
  return [
    ...found.structures.map((ids, i) => structureMember(ids, found.records?.[i])),
    ...found.molecules.map((molecule) => ({ molecule })),
    ...found.pictures.map((picture) => ({ picture })),
  ];
}

/**
 * What a record is of: the structure it was given for, as a short key - so
 * that, edited since, it is known to be another. Its identity (chem
 * `identityOfDrawn`), each label that stands for atoms drawn out
 * (`labelsDrawnOut`): its atoms' elements, charges, masses and unpaired
 * electrons, its bonds, and each configuration as the drawing shows it -
 * not how: not where it lies, which wedges say it, whether an H is drawn,
 * nor whether a group is written by its label. So Clean-up, which draws
 * the same structure afresh, keeps a record's properties; a changed atom,
 * charge, bond, or configuration - its mirror image - does not. Where its
 * wedges cannot be read, or its identity not worked out in full, the
 * drawing itself is in the key too: any change to it is taken for one.
 */
export function drawnHash(model: Model, ids: readonly number[]): string {
  // (worked out once for each structure as drawn: an edit elsewhere on the page leaves its drawing's key, and so this, as it was)
  const labels = model.atoms.filter((a) => a.abbrev && ids.includes(a.id)).map((a) => `${a.id}:${JSON.stringify(a.abbrev)}`);
  const drawn = `${drawnKey(model, ids)}|${labels.join(";")}`;
  let key = identities.get(drawn);
  if (key == null) {
    // (wedges identity cannot read - crossed, or at a three-bonded N, B, Se, Te or Sb - or a search it could not finish: its configuration
    // not in the identity, so the drawing itself is, and any change to it - Clean-up's too - is taken for a change of structure)
    const { text, complete, unread } = identityOfDrawn(labelsDrawnOut(partOf(model, new Set(ids))));
    key = hash(complete && !unread.length ? text : `${text}|as drawn|${drawn}`).toString(36);
    if (identities.size >= IDENTITIES_KEPT) identities.clear();
    identities.set(drawn, key);
  }
  return key;
}
const identities = new Map<string, string>();
const IDENTITIES_KEPT = 4096;

/** What a record says once the structure it was given for has been edited: its properties and status taken away. */
export const BEFORE_THE_EDIT = "its properties were for the structure before the edit";
/** What a stale record says once a step has worked new values out of the structure as it is: those it had before the edit are gone still. */
export const TAKEN_AT_THE_EDIT = "the properties it had before the edit were taken away; those it has are of it as it is";

/** A record put on a structure as it is drawn now: of that structure (`of`). */
export const recordOn = (record: DrawnRecord, model: Model, ids: readonly number[]): DrawnRecord => ({ ...record, of: drawnHash(model, ids) });

/**
 * The record of a structure edited since it was given, or of two joined
 * into one, where `a` is the other's: what each came from kept, and the
 * properties and status of neither - said so (`stale`). None where nothing
 * is left.
 */
function joined(a: DrawnRecord | undefined, b: DrawnRecord): DrawnRecord | undefined {
  const from = [...new Set([...(a?.from ?? []), ...(b.from ?? [])])];
  const stale = a?.properties || a?.status || b.properties || b.status ? BEFORE_THE_EDIT : (a?.stale ?? b.stale);
  const out: DrawnRecord = { ...(from.length ? { from } : {}), ...(stale ? { stale } : {}) };
  return Object.keys(out).length ? out : undefined;
}

/** A record as its structure stands now: as it is, where that is the structure it was given for (or it does not say); else its properties and status taken away (`joined`). */
export function recordNow(record: DrawnRecord | undefined, model: Model, ids: readonly number[]): DrawnRecord | undefined {
  if (!record?.of || record.of === drawnHash(model, ids)) return record;
  return joined(undefined, record);
}

/** What a record adds to a step's key (flow `inputKey`): all it says, but not what it is of - the structure's own key says that. */
export const recordKey = ({ of: _of, ...r }: DrawnRecord): string => stableJson(r);

/** A structure as a set's member: its atoms' ids, and its record where it has one. */
export function structureMember(ids: readonly number[], record?: DrawnRecord): Member {
  return { structure: [...ids], ...(record ? { record } : {}) };
}

/**
 * Enumerate's record of a structure it made (docs/WORKFLOWS-FOUNDATION.md,
 * *R groups*): its number - its combination's place in the step's order,
 * from 1, kept whether it was made or set aside - and how it was made, in
 * words ("R1 = Me, R2 = OMe"), as its properties; and, where it was set
 * aside, why ("Same as 2"), as its status.
 */
export function numberedRecord(number: number, how: string, why?: string): DrawnRecord {
  return {
    properties: { number: { value: number, unit: "none", status: "computed" }, "made.how": { value: how, unit: "none", status: "computed" } },
    status: why ? { aside: why } : "done",
  };
}

/** A record's number (`numberedRecord`), where it has one. */
export function recordNumber(r: DrawnRecord | undefined): number | undefined {
  const v = r?.properties?.number?.value;
  return typeof v === "number" ? v : undefined;
}

/** How a record says its structure was made (`numberedRecord`), where it says. */
export function recordHow(r: DrawnRecord | undefined): string | undefined {
  const v = r?.properties?.["made.how"]?.value;
  return typeof v === "string" ? v : undefined;
}

/** Why a record's structure was set aside, where it was. */
export function recordWhy(r: DrawnRecord | undefined): string | undefined {
  const s = r?.status;
  return s && typeof s === "object" && "aside" in s ? s.aside : undefined;
}

/** FNV-1a over a string: a short key - for what came into a step, and for the structure a record is of. */
export function hash(text: string, h = 0x811c9dc5): number {
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/**
 * What a drawn structure adds to a step's key, as text: what it is - its
 * atoms' elements, charges, masses and radicals, its bonds' orders, wedges
 * and dative bonds (`signatureOf`) - and what its drawing says by where
 * things lie: on which side of each double bond each neighbour is, the
 * other end's taken together (cis or trans), and the order the neighbours
 * go round each atom a wedge starts from. Not where it is drawn: moved
 * whole, turned, or an atom nudged without crossing a line that matters, it
 * is the same; mirrored, its wedged centres are not.
 */
const drawnKeyed = new WeakMap<Model, Map<string, string>>();
export function drawnKey(model: Model, ids: readonly number[]): string {
  const known = drawnKeyed.get(model) ?? new Map<string, string>();
  drawnKeyed.set(model, known);
  const name = ids.join(",");
  const had = known.get(name);
  if (had != null) return had;
  const of = new Set(ids);
  const at = new Map(model.atoms.filter((a) => of.has(a.id)).map((a) => [a.id, a]));
  const near = new Map<number, number[]>();
  const bonds = model.bonds.filter((b) => at.has(b.a) && at.has(b.b));
  for (const b of bonds) {
    near.set(b.a, [...(near.get(b.a) ?? []), b.b]);
    near.set(b.b, [...(near.get(b.b) ?? []), b.a]);
  }
  const said: string[] = [];
  for (const a of at.values()) if (a.radical) said.push(`r${a.id}:${a.radical}`);
  for (const b of bonds) {
    if (b.dative) said.push(`d${b.a}-${b.b}`);
    if (b.order === 2) {
      // (each neighbour's side of the line through the bond, measured the same way at both ends)
      const p = at.get(b.a)!;
      const q = at.get(b.b)!;
      const side = (id: number) => {
        const n = at.get(id)!;
        return Math.sign((q.x - p.x) * (n.y - p.y) - (q.y - p.y) * (n.x - p.x));
      };
      for (const n of near.get(b.a) ?? []) if (n !== b.b) for (const m of near.get(b.b) ?? []) if (m !== b.a) said.push(`${n}~${m}:${side(n) * side(m)}`);
    }
    if (b.stereo && b.stereo !== "none") {
      // (round the atom it starts from, anticlockwise, from its lowest-numbered neighbour)
      const c = at.get(b.a)!;
      const round = (near.get(b.a) ?? [])
        .map((id) => ({ id, angle: Math.atan2(at.get(id)!.y - c.y, at.get(id)!.x - c.x) }))
        .sort((u, v) => u.angle - v.angle)
        .map((u) => u.id);
      const first = round.indexOf(Math.min(...round));
      said.push(`w${b.a}:${[...round.slice(first), ...round.slice(0, first)].join(">")}`);
    }
  }
  const key = `${signatureOf(model, ids)}|${said.sort().join(",")}`;
  known.set(name, key);
  return key;
}

const isText = (v: unknown): v is string => typeof v === "string";

/** An entry's status as a file keeps it (lib/entry `EntryStatus`), or none where it is not one. */
function statusIn(v: unknown): EntryStatus | undefined {
  if (v === "done") return v;
  const o = v as { failed?: unknown; aside?: unknown } | null;
  if (isText(o?.failed)) return { failed: o.failed };
  if (isText(o?.aside)) return { aside: o.aside };
  return undefined;
}

/**
 * A structure drawn's record as a file keeps it (`DrawnRecord`), each part
 * read as data: the entries it came from, by id, each that is no text left
 * out; its properties, each as lib/entry reads one (`propertyIn`), each
 * that does not read left out - all counted (utils/readNotes); its status;
 * what it is of, and why its properties were taken away. None where
 * nothing of it reads.
 */
export function readDrawnRecord(v: unknown): DrawnRecord | undefined {
  const r = v as { from?: unknown; properties?: unknown; status?: unknown; of?: unknown; stale?: unknown } | null;
  if (!r || typeof r !== "object") return undefined;
  const from = readEach(r.from, (id) => (isText(id) ? id : null), "madeFrom");
  const properties: Record<string, Property> = {};
  if (r.properties && typeof r.properties === "object" && !Array.isArray(r.properties)) {
    for (const [name, p] of Object.entries(r.properties as Record<string, unknown>)) {
      const read = name ? propertyIn(p) : undefined;
      if (read) properties[name] = read;
      else leftOut("property");
    }
  }
  const status = statusIn(r.status);
  const record: DrawnRecord = {
    ...(from.length ? { from } : {}),
    ...(Object.keys(properties).length ? { properties } : {}),
    ...(status ? { status } : {}),
    ...(isText(r.of) ? { of: r.of } : {}),
    ...(isText(r.stale) ? { stale: r.stale } : {}),
  };
  return Object.keys(record).length ? record : undefined;
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
 * workflow's - which say so (`conformerSet`) (the maintainer, 2026-10-08):
 * one conformer found included, a set in which one happened to be found,
 * not another kind of thing (the maintainer, 2026-10-21). A file's many
 * geometries are not.
 */
export const conformersOfOne = (m: Pick<Molecule3D, "conformerSet">) => m.conformerSet === true;

/**
 * What a set holds: what made it says - a Render step's, pictures; made by
 * the chemist, structures, where any is drawn - else a conformer set, where
 * every molecule in it is a conformer search's (`conformersOfOne`): each
 * molecule in it a compound, its frames its conformers - else molecules in
 * 3D. A set mixing the two is molecules in 3D, and no step takes it
 * (`plainAmong`).
 */
/** Whether a set can be read as a table in the column: molecules in 3D it holds off the page, or structures drawn (structuresTable). */
export function readAsTable(page: Page, set: WorkflowSet): boolean {
  return !!set.collection || holdsOf(page, set) === "structures";
}

export function holdsOf(page: Page, set: WorkflowSet): SetHolds {
  // (a step's exit not run yet holds nothing yet: what it will give is flow's `givesOf`)
  if (set.made?.holds) return set.made.holds;
  // (a table or a number it holds: that, whatever lies in its frame)
  if (set.table) return "table";
  if (set.number) return "number";
  if (set.chart) return "chart";
  const { structures } = setMembers(page, set);
  if (structures.length) return "structures";
  const molecules = setMolecules(page, set);
  return molecules.length && molecules.every(conformersOfOne) ? "conformers" : "molecules";
}

/**
 * Why a step takes no set of `molecules` mixing conformer sets with other
 * molecules in 3D - neither the others' frames are conformers, nor a
 * conformer set's conformers compounds of their own - naming the others,
 * by their titles or names, else their places; none where it does not mix
 * them.
 */
export function plainAmong(molecules: readonly Pick<Molecule3D, "conformerSet" | "title" | "name">[]): string | null {
  const plain = molecules.flatMap((m, i) => (conformersOfOne(m) ? [] : [m.title || m.name || `molecule ${i + 1}`]));
  if (!plain.length || plain.length === molecules.length) return null;
  const named = plain.length > 3 ? `${plain.slice(0, 3).join(", ")} and ${plain.length - 3} more` : plain.join(", ");
  return `It mixes conformer sets with other molecules in 3D: ${named} ${plain.length === 1 ? "is no conformer set" : "are no conformer sets"}`;
}

/** How many entries a set holds, of what kind of set: a structure each, a frame each of a molecule in 3D - one for a path to its last - or a picture each. */
export function countOf(page: Page, set: WorkflowSet): { holds: SetHolds; entries: number; compounds: number } {
  const holds = holdsOf(page, set);
  const { structures, pictures } = setMembers(page, set);
  if (holds === "pictures") return { holds, entries: pictures.length, compounds: pictures.length };
  // (a table's rows; a number, one; a chart's points, or a diagram's levels)
  if (holds === "table") return { holds, entries: set.table?.rows.length ?? 0, compounds: set.table?.rows.length ?? 0 };
  if (holds === "number") return { holds, entries: set.number ? 1 : 0, compounds: set.number ? 1 : 0 };
  if (holds === "chart") {
    const n = !set.chart ? 0 : set.chart.kind === "diagram" ? set.chart.levels.length : set.chart.points.length;
    return { holds, entries: n, compounds: n };
  }
  const molecules = setMolecules(page, set);
  const frames = molecules.reduce((n, m) => n + entriesIn(m), 0);
  // (a large result set's structures drawn, held off the page, as many as it holds)
  const entries = structures.length + (set.drawnCollection?.length ?? 0) + frames;
  return { holds, entries, compounds: holds === "conformers" ? molecules.length : entries };
}

/** A number as Meno writes one: an energy in kcal/mol as the chips write it ("1.89 kcal/mol"), else with all its digits and its unit. */
export function numberShown(n: { value: number; unit: string }): string {
  if (n.unit === "kcal/mol") return aboveText(n.value);
  return `${numberText(n.value)}${n.unit !== "none" ? ` ${n.unit}` : ""}`;
}

/** A set's count line, as its frame says it: how many of what it holds - and, of structures drawn more than the page shows (look `DRAWN_ON_PAGE`), how many it shows of how many - or that it is empty, not run yet, or not kept. */
export function countSaid(b: Pick<WorkflowSet, "notKept" | "made" | "number" | "chart" | "drawnCollection">, count: ReturnType<typeof countOf>): string {
  // (a result set the file did not keep: how many it held; one kept out of the file from now on, said so;
  // a step's exit not run yet, so - not empty, which would say it ran and gave nothing)
  return b.notKept && !count.entries
    ? `Not kept · ${b.notKept.count}`
    : b.made && !b.made.holds
    ? "Not run yet"
    : !count.entries
    ? "Empty"
    : count.holds === "table"
      ? plural(count.entries, "row")
    : count.holds === "number" && b.number
      ? numberShown(b.number)
    : count.holds === "chart"
      ? plural(count.entries, b.chart?.kind === "diagram" ? "level" : "point")
    : count.holds === "pictures"
      ? plural(count.entries, "picture")
      : count.holds === "structures"
        ? // (more than the page shows - look DRAWN_ON_PAGE - how many it shows of how many it holds)
          b.drawnCollection?.length && count.entries > b.drawnCollection.length
          ? `${(count.entries - b.drawnCollection.length).toLocaleString("en-US")} of ${plural(count.entries, "structure")} shown`
          : plural(count.entries, "structure")
        : count.holds === "molecules"
          ? plural(count.compounds, "compound")
          : `${plural(count.compounds, "compound")} · ${count.entries}`;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** How many frames a molecule in 3D has: its own geometry, and the rest. */
export const framesOf = (m: Pick<Molecule3D, "frames">) => 1 + (m.frames?.length ?? 0);

/** How many entries a molecule in 3D is: a frame each - but one, its last, where its frames are a path to it; and those it converged on, of an opened optimisation or scan. */
export const entriesIn = (m: Pick<Molecule3D, "frames" | "path" | "entryFrames">) => (m.path ? 1 : (m.entryFrames?.length ?? framesOf(m)));

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

/**
 * One entry of a set of structures drawn, as Meno's own steps take it and
 * give it (docs/WORKFLOWS-FOUNDATION.md, *Enumerate*): its place among the
 * set's, from 0, and the structure as it is drawn - its atoms and bonds,
 * where they lie on the page, its wedges, labels and all - in 2D - and
 * its record, where it has one (`DrawnRecord`: what a step gave it). Never
 * made 3D here: a step after it does that, as everywhere else.
 */
export type DrawnEntry = { place: number; drawn: Model; record?: DrawnRecord };

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
  /** How many forms of it a conformer search found alike - its rotamers - where it said: its Boltzmann weight counts each. */
  degeneracy?: number;
  /**
   * Where its mirror image was counted in (Duplicates, its degeneracy
   * counting both): the atoms the mirror image swaps - its atom i plays the
   * part of atom `mirror[i]` in its mirror image. An average by atom over its
   * conformers takes the mirror image's values so; one that cannot refuses.
   */
  mirror?: number[];
  /** Which stereoisomer it is, from its own geometry, where that has been asked (workflow/configurations). */
  stereo?: EntryStereo;
  /** Why a program step could not do it, where one could not (workflow/failures): an entry of a step's Failed exit. */
  failed?: Failure;
  /** That a run ended converged at its geometry, and how (workflow/converged): of that geometry alone - a record of another counts for none (`convergedOf`). */
  converged?: Converged;
  /** The imaginary frequencies its calculation judged it has, in cm-1 (lib/calc/output `CalcInfo.imaginary`): a mark that it is no minimum. */
  imaginary?: number[];
  /** Its molecule's marks of which frames failed, or are no minimum, did not read (`Molecule3D.marksUnread`): whether it is a minimum is not known. */
  marksUnread?: true;
  name?: string;
  /** Its properties by name, as its molecule's frame has them (`Molecule3D.properties`) - a model's, a descriptor's - each with its unit and what worked it out. */
  properties?: Record<string, Property>;
  /** Its hydrogens not there, and not said to be whole without any (lib/chem/skeleton): given no charge or spin, and no calculation run on it. */
  skeleton?: true;
  /** Its bonds' orders, where its molecule's file gave none (Molecule3D `bondOrders`); and whether the chemist said it is whole without hydrogens: kept by what a step gives back. */
  bondOrders?: Molecule3D["bondOrders"];
  wholeWithoutH?: true;
  /** It is one of only a part of its compound's conformers that came from a search (`Molecule3D.partOf`): what a step makes of it is a part too. */
  partOf?: true;
  /**
   * What the calculation it was read from says - the program, the method
   * its energy is of - and what its molecule keeps besides (`keptOf`): the
   * drawing it was made from, its stereo labels, how it was made and what
   * its energies are from. A step that works on entries alone, changing
   * none of them, gives them back with these as they were; a program that
   * works them out anew gives its own.
   */
  calc?: CalcInfo;
  keep?: Kept;
  /** The end it is paired with, where it is the start of a pair a step of two inputs works out (workflow/pairs: Path search's). */
  end?: SetEntry;
  /** Its sides, where it is a guess an *Optimise to a saddle point* step pairs with a reactant side and a product side (workflow/pairs `sideUnlike`). */
  sides?: { reactant: SetEntry; product: SetEntry };
  /** How it was paired with its end, in words (workflow/pairs): "in order, by place: start a #2 with end b #2", "each with each", "matched on pc". */
  paired?: string;
  /** The molecule in 3D it is a frame of, by id; which frame, and whether it is that molecule's last. */
  from?: number;
  frame?: number;
  last?: boolean;
};

/**
 * The entries a step that needs whole molecules refuses, by their places:
 * the skeletons among them, each to its Failed exit, kind "refused", with
 * why - the rest run (lib/chem/skeleton `skeletonWhy`).
 */
export function skeletonEntries(kind: StepKind, entries: readonly SetEntry[]): number[] {
  return kindInfo(kind).whole ? entries.flatMap((e, i) => (e.skeleton ? [i] : [])) : [];
}

/**
 * Why a step of `kind` is not run on `entries`, where its plugin needs whole
 * molecules (KindInfo `whole`) and some came in as skeletons - their
 * hydrogens not there (lib/chem/skeleton): counted by molecule, and said
 * before anything is sent. None, where it may run.
 */
export function skeletonsRefused(kind: StepKind, entries: readonly SetEntry[]): string | null {
  if (!kindInfo(kind).whole) return null;
  const skeletons = new Set(entries.flatMap((e, i) => (e.skeleton ? [e.from ?? `#${i}`] : [])));
  return skeletons.size ? skeletonWhy(skeletons.size) : null;
}

/** What an entry's molecule knew of its bonds' orders and its hydrogens, as a molecule a step gives back keeps it: "Bond orders unknown" stays said over it. */
export function keptKnown(e: Pick<SetEntry, "bondOrders" | "wholeWithoutH">): Pick<Molecule3D, "bondOrders" | "wholeWithoutH"> {
  return { ...(e.bondOrders ? { bondOrders: e.bondOrders } : {}), ...(e.wholeWithoutH ? { wholeWithoutH: true as const } : {}) };
}

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
/** What a molecule in 3D keeps besides its atoms, bonds and places that an entry of it carries (`SetEntry.keep`). */
export type Kept = Pick<Molecule3D, "drawnFrom" | "drawnAs" | "stereo" | "made" | "centres">;

/**
 * What a molecule keeps besides its atoms, bonds and places: the drawing it
 * was made from, its stereo labels, how it was made, and its bonds to ring
 * centres (eta) - its atoms in the same order, as its entries keep them.
 */
export function keptOf(m: Kept): Kept {
  return {
    drawnFrom: m.drawnFrom,
    drawnAs: m.drawnAs,
    ...(m.stereo ? { stereo: m.stereo } : {}),
    ...(m.made ? { made: m.made } : {}),
    ...(m.centres?.length ? { centres: m.centres } : {}),
  };
}

/** `v` as JSON with every object's keys in order: two values equal as data give the one text. */
function stableJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableJson).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableJson(o[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v) ?? "null";
}

/** What a calculation was, without what is each entry's own: its results, its output, its job among several, its wavefunction, the readers that could not read it. */
function calcLevel(c: CalcInfo | undefined): string {
  if (!c) return "";
  const { results: _results, source: _source, job: _job, wavefunction: _wavefunction, unread: _unread, ...level } = c;
  return stableJson(level);
}

/** A calculation, or a way of making, in a few words: its program, method and basis, or what its energies are from. */
function madeWords(e: SetEntry): string {
  const c = e.calc;
  return c ? [c.program, c.method, c.basis].filter(Boolean).join(" ") || "a calculation" : e.keep?.made?.energies ?? "no calculation";
}

/** An entry's stereo labels, centre by centre and bond by bond - not which are shown - or "" where it has none. */
function labelsOf(e: SetEntry): string {
  const st = e.keep?.stereo;
  if (!st || (!Object.keys(st.atoms ?? {}).length && !Object.keys(st.bonds ?? {}).length)) return "";
  return stableJson({ atoms: st.atoms, bonds: st.bonds });
}

/**
 * Why entries cannot stand as conformers of one compound, or null where they
 * can: they must come from the one calculation - its program, version,
 * method, basis, charge and multiplicity, read by the same readers - with
 * their energies from the one source, for those to stand in one list and
 * what made them to be said once; and be of the one configuration as their
 * stereo labels give it, a compound being one stereoisomer.
 */
export function unlikeMade(g: readonly SetEntry[]): string | null {
  const one = (f: (e: SetEntry) => string) => new Set(g.map(f)).size <= 1;
  if (!one((e) => calcLevel(e.calc))) return `its entries come from different calculations (${[...new Set(g.map(madeWords))].join("; ")})`;
  if (!one((e) => e.keep?.made?.energies ?? "")) return `its entries' energies come from different sources (${[...new Set(g.map(madeWords))].join("; ")})`;
  if (!one(labelsOf)) return "its entries' stereo labels differ: they may be different stereoisomers";
  return null;
}

/** What entries all keep alike (`SetEntry.keep`), part by part: a part one of them keeps otherwise - the drawing it was made from, how it was made - is kept by none. */
export function keptAlike(g: readonly SetEntry[]): Kept {
  const out: Record<string, unknown> = {};
  for (const k of ["drawnFrom", "drawnAs", "stereo", "made", "centres"] as const) {
    const first = g[0]?.keep?.[k];
    if (first !== undefined && g.every((e) => stableJson(e.keep?.[k]) === stableJson(first))) out[k] = first;
  }
  return out as Kept;
}

/** One frame's marks: why it failed, the imaginary frequencies it was judged to have, and whether its marks did not read - as an entry, or a molecule's frame, has them. */
export type FrameMarks = { failed?: Failure | null; imaginary?: number[] | null; marksUnread?: true };

/**
 * The marks of a molecule made of these frames, in order (one each): why
 * each failed and its imaginary frequencies, a list each where any frame
 * has one; and that its marks did not read, where any frame's did. What
 * every place that makes a molecule of some frames or entries - a step's
 * results, rows of a set's table - gives it, so that no frame that is no
 * minimum, or not known to be one, comes out looking like one.
 */
export function marksOf(frames: readonly FrameMarks[]): Pick<Molecule3D, "failed" | "imaginary" | "marksUnread"> {
  return {
    ...(frames.some((f) => f.failed) ? { failed: frames.map((f) => f.failed ?? null) } : {}),
    // (each frame's as its calculation judged it - none, [], as well as some - null where none judged it)
    ...(frames.some((f) => Array.isArray(f.imaginary)) ? { imaginary: frames.map((f) => (Array.isArray(f.imaginary) ? f.imaginary : null)) } : {}),
    ...(frames.some((f) => f.marksUnread) ? { marksUnread: true as const } : {}),
  };
}

/** A molecule's own marks of frame `f` of `n` (`FrameMarks`). */
export const frameMarks = (m: Pick<Molecule3D, "failed" | "imaginary" | "marksUnread">, f: number, n: number): FrameMarks => ({
  ...(m.failed?.length === n && m.failed[f] ? { failed: m.failed[f] } : {}),
  ...(m.imaginary?.length === n && Array.isArray(m.imaginary[f]) ? { imaginary: m.imaginary[f]! } : {}),
  ...(m.marksUnread ? { marksUnread: true as const } : {}),
});

/** What is said of an entry whose file's marks of failed frames did not read (`SetEntry.marksUnread`). */
export const MARKS_UNREAD = "its frames' marks could not be read, so whether it is a minimum is not known";

export { PATH_FRAME, REFINED_SAID, STARTED_SAID };

/** The one frame of a molecule its frames say is `what`; none where none is, or more than one. */
function frameSaid(m: Pick<Molecule3D, "calc">, what: string): number | null {
  const said = m.calc?.results?.find((r) => r.id === PATH_FRAME && r.on === "frames");
  if (!said || said.on !== "frames") return null;
  const k = said.values.indexOf(what);
  return k >= 0 && said.values.lastIndexOf(what) === k ? k : null;
}

/** Of a path search's molecule, the frame that is the point it refined, as its frames say; none for any other molecule. */
export const refinedFrame = (m: Pick<Molecule3D, "calc">): number | null => frameSaid(m, REFINED_SAID);

/** Of a reaction path's molecule, the frame it started from, as its frames say; none for any other molecule. */
export const startedFrame = (m: Pick<Molecule3D, "calc">): number | null => frameSaid(m, STARTED_SAID);

/** The frame of `n` a molecule's calculation is of: its last - or, a path search's, the point it refined, a reaction path's, the point it started from, its path going on past it. */
export const calcFrame = (m: Molecule3D, n: number): number => refinedFrame(m) ?? startedFrame(m) ?? n - 1;

/**
 * A molecule's calculation as frame `f` of its `n` carries it alone, where
 * it is the frame the calculation is of: whole, but what it says of each
 * frame (a path search's `PATH_FRAME`) that frame's alone - so that a
 * molecule of that one frame holds it as one of one frame, read back as
 * such, and its frames still say which it is.
 */
const calcOfFrame = (calc: CalcInfo, f: number, n: number): CalcInfo =>
  n > 1 && calc.results?.some((r) => r.on === "frames") ? { ...calc, results: calc.results.map((r) => (r.on === "frames" ? { ...r, values: [r.values[f] ?? null] } : r)) } : calc;

/** The imaginary frequencies frame `f` of `n` was judged to have: a conformer's own, else - the frame its calculation is of - its calculation's. */
const imaginaryAt = (m: Molecule3D, f: number, n: number): number[] | undefined =>
  (m.imaginary?.length === n ? m.imaginary[f] : f === calcFrame(m, n) ? m.calc?.imaginary : undefined) ?? undefined;

export function setEntries(molecules: readonly Molecule3D[], holds: "molecules" | "conformers", frames?: (m: Molecule3D) => readonly number[]): SetEntry[] {
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
    const properties = m.properties?.length === n ? m.properties : undefined;
    // (a skeleton, its hydrogens not there: each frame of it one; and what it knows of its orders, kept with it)
    const whole = {
      ...(isSkeleton(m) ? { skeleton: true as const } : {}),
      ...(m.bondOrders ? { bondOrders: m.bondOrders } : {}),
      ...(m.wholeWithoutH ? { wholeWithoutH: true as const } : {}),
    };
    const keep = keptOf(m);
    // (what its calculation read is of one geometry - its last: an earlier frame carries the calculation without it)
    const calcBefore = m.calc ? (({ results: _r, imaginary: _i, ...rest }) => rest)(m.calc) : undefined;
    // (those asked for - Take frames' - else a path's last frame alone; an opened optimisation or scan, the frames it converged on)
    const taken = frames ? frames(m) : m.path ? [n - 1] : (m.entryFrames ?? Array.from({ length: n }, (_, k) => k));
    for (const f of taken) {
      const xyz = frameXyz(m, f);
      const stereo = stereoKnown({ atoms: m.atoms, bonds: m.bonds, xyz });
      out.push({
        compound: holds === "conformers" ? i : out.length,
        number: holds === "conformers" ? (m.numbers?.[f] ?? f + 1) : 1,
        atoms: m.atoms,
        bonds: m.bonds,
        xyz,
        ...(stereo ? { stereo } : {}),
        // (an energy that is no number - NaN, or infinite - is none)
        ...(energies && Number.isFinite(energies[f]) ? { energy: energies[f] } : {}),
        ...state,
        ...(degeneracies ? { degeneracy: degeneracies[f] } : {}),
        ...whole,
        ...(m.mirrors?.length === n && m.mirrors[f] ? { mirror: m.mirrors[f]! } : {}),
        ...(m.name ? { name: m.name } : {}),
        ...(properties && Object.keys(properties[f]).length ? { properties: properties[f] } : {}),
        ...(m.partOf ? { partOf: true as const } : {}),
        ...(m.calc ? { calc: f === calcFrame(m, n) ? calcOfFrame(m.calc, f, n) : calcBefore } : {}),
        ...(m.failed?.[f] ? { failed: m.failed[f]! } : {}),
        ...(m.converged?.length === n && m.converged[f] ? { converged: m.converged[f]! } : {}),
        // (a conformer's own, frame by frame; a single geometry's, its calculation's - of its last geometry)
        ...(imaginaryAt(m, f, n) ? { imaginary: imaginaryAt(m, f, n) } : {}),
        ...(m.marksUnread ? { marksUnread: true as const } : {}),
        keep,
        from: m.id,
        frame: f,
        last: f === n - 1,
      });
    }
  });
  return out;
}

/** A compound's letter, by its place among a set's: a to z, then aa, ab... (lib/nodes `groupLetter`, one rule for both). */
export const compoundLetter = groupLetter;

/**
 * The thermochemistry an entry's calculation read, that become its
 * properties (docs/WORKFLOWS-FOUNDATION.md, *The entry*): the total free
 * energy, the total enthalpy, the zero-point energy alone (not E + ZPE), and
 * the correction to the free energy (G - E) - each in hartrees, by the
 * reading's id, the one name every plugin that reads them gives them
 * (agreed with Populations, which reads `thermo.free-energy`).
 */
export const THERMO_PROPERTIES = ["thermo.free-energy", "thermo.enthalpy", "thermo.zpve", "thermo.g-correction"] as const;

/**
 * What an entry's calculation was, for its properties (lib/entry `By`): the
 * plugin that read it, the program, method and basis - and, for a thermal
 * quantity, the treatment of its vibrations and the symmetry it took (its
 * point group, its rotational symmetry number), as the program said them.
 */
function byOf(calc: SetEntry["calc"], thermal?: Pick<By, "treatment" | "pointGroup" | "symmetryNumber">): By | undefined {
  if (!calc) return undefined;
  const plugin = calc.readers[0]?.split(" ")[0];
  const by: By = {
    ...(plugin ? { plugin } : {}),
    ...(calc.program ? { program: calc.program } : {}),
    ...(calc.method ? { method: calc.method } : {}),
    ...(calc.basis ? { basis: calc.basis } : {}),
    ...(thermal?.treatment ? { treatment: thermal.treatment } : {}),
    ...(thermal?.pointGroup ? { pointGroup: thermal.pointGroup } : {}),
    ...(thermal?.symmetryNumber != null ? { symmetryNumber: thermal.symmetryNumber } : {}),
  };
  return Object.keys(by).length ? by : undefined;
}

/** A reading of the molecule's as its calculation gave it: its value, where it is a number or a text. */
function readingOf(calc: SetEntry["calc"], id: string): number | string | undefined {
  const r = calc?.results?.find((x) => x.on === "molecule" && x.id === id);
  return r && r.on === "molecule" && (typeof r.value === "number" || typeof r.value === "string") ? r.value : undefined;
}

/**
 * Its calculation's thermochemistry as properties (THERMO_PROPERTIES), each
 * worked out where the program said: the geometry, the temperature and
 * pressure it said it used, never a step's asking, and the solvation as
 * it said it ("none", the gas phase stated; unsaid, not stated). Only an
 * energy in hartrees is taken.
 */
function thermoOf(e: SetEntry, geometry: string): Partial<Record<(typeof THERMO_PROPERTIES)[number], Property>> {
  const calc = e.calc;
  if (!calc?.results?.length) return {};
  const kelvin = readingOf(calc, "thermo.temperature");
  const atm = readingOf(calc, "thermo.pressure");
  const treatment = readingOf(calc, "thermo.treatment");
  const pointGroup = readingOf(calc, "thermo.point-group");
  const sigma = readingOf(calc, "thermo.symmetry-number");
  const at: At = {
    geometry,
    ...(typeof kelvin === "number" ? { kelvin } : {}),
    ...(typeof atm === "number" ? { atm } : {}),
    ...(calc.solvation ? { solvent: calc.solvation } : {}),
  };
  // (each carries the symmetry it was worked out with, as the program printed it: a G with its own sigma, wherever it goes)
  const by = byOf(calc, {
    ...(typeof treatment === "string" ? { treatment } : {}),
    ...(typeof pointGroup === "string" ? { pointGroup } : {}),
    ...(typeof sigma === "number" && Number.isInteger(sigma) && sigma >= 1 ? { symmetryNumber: sigma } : {}),
  });
  const out: Partial<Record<(typeof THERMO_PROPERTIES)[number], Property>> = {};
  for (const id of THERMO_PROPERTIES) {
    const r = calc.results.find((x) => x.on === "molecule" && x.id === id);
    if (!r || r.on !== "molecule" || typeof r.value !== "number" || !Number.isFinite(r.value) || r.quantity !== "energy") continue;
    out[id] = { value: r.value, unit: "Eh", at, ...(by ? { by } : {}), status: "computed" };
  }
  return out;
}

/**
 * Its calculation's vibrations as properties (lib/entry `FREQUENCY`): the
 * table `vibrations`, each row a vibration's frequency in cm-1 (an imaginary
 * one negative), read from the list whose column is a wavenumber - and the
 * property `modes`, in the same order, where every row gives its atoms'
 * displacements. What else the list has stays among its readings: the
 * entry's columns take only units Meno's table has.
 */
function vibrationsOf(e: SetEntry, at: At): { vibrations?: Property; modes?: Property } {
  const list = e.calc?.results?.find((x) => x.on === "list" && x.id === "vibrations");
  if (!list || list.on !== "list") return {};
  const k = list.columns.findIndex((c) => c.quantity === "wavenumber");
  if (k < 0) return {};
  const freqs = list.rows.map((r) => r.cells[k]);
  if (!freqs.length || !freqs.every((f): f is number => typeof f === "number" && Number.isFinite(f))) return {};
  const by = byOf(e.calc);
  const n = 3 * e.atoms.length;
  const moves = list.rows.map((r) => r.move);
  const modes = moves.every((m): m is number[] => Array.isArray(m) && m.length === n && m.every(Number.isFinite)) ? moves : undefined;
  return {
    vibrations: { value: { table: { columns: [FREQUENCY], rows: freqs.map((f) => [f]) } }, unit: "none", at, ...(by ? { by } : {}), status: "computed" },
    ...(modes ? { modes: { value: { modes }, unit: "none" as const, at, ...(by ? { by } : {}), status: "computed" as const } } : {}),
  };
}

/**
 * The names of what an entry's calculation read that it carries as its own
 * properties where its calculation's readings are not kept with it: a
 * conformer of a conformer set, whose molecule keeps one calculation, not
 * its frames' each (run `moleculesOf`, `calcProperties`).
 */
export const CALC_CARRIED: readonly string[] = [...THERMO_PROPERTIES, "vibrations"];

/**
 * What an entry's calculation read, as properties of its own: its
 * thermochemistry (`thermoOf`) and its vibrations' frequencies
 * (`vibrationsOf`, without the modes' displacements, which are large), at
 * its geometry - what a conformer carries, frame by frame, where its
 * molecule cannot keep each conformer's calculation (run `moleculesOf`).
 */
export function calcProperties(e: SetEntry): Record<string, Property> {
  const at: At = { geometry: geometryKey(e.xyz), ...(e.calc?.solvation ? { solvent: e.calc.solvation } : {}) };
  const { vibrations } = vibrationsOf(e, at);
  return { ...thermoOf(e, at.geometry), ...(vibrations ? { vibrations } : {}) };
}

/** An entry without what it carries of a calculation (`CALC_CARRIED`): of a geometry it is no longer at, or one a new calculation reads again. */
export function withoutCarried(e: SetEntry): SetEntry {
  if (!e.properties || !CALC_CARRIED.some((k) => k in e.properties!)) return e;
  const { properties, ...rest } = e;
  const left = Object.fromEntries(Object.entries(properties).filter(([k]) => !CALC_CARRIED.includes(k)));
  return Object.keys(left).length ? { ...rest, properties: left } : rest;
}

/**
 * An entry's free energy G: its calculation's (`thermoOf`), else one it
 * carries (`calcProperties`) - only one of its geometry, worked out, a
 * finite number in hartrees. None where it has none.
 */
export function freeEnergyOf(e: SetEntry): Property | undefined {
  const geometry = geometryKey(e.xyz);
  const p = thermoOf(e, geometry)["thermo.free-energy"] ?? e.properties?.["thermo.free-energy"];
  if (!p || p.status !== "computed" || p.unit !== "Eh" || typeof p.value !== "number" || !Number.isFinite(p.value)) return undefined;
  return p.at?.geometry == null || p.at.geometry === geometry ? p : undefined;
}

/**
 * An entry's imaginary frequencies (cm-1): as its calculation judged them,
 * where it judged some; else, where its vibrations were worked out - its
 * calculation's, or those it carries (`calcProperties`) - those the table
 * lists as negative, none where it lists none: a table with one never reads
 * as none; else none, where its calculation judged none with no table read
 * beside it; "not computed" where none was worked out or judged.
 */
export function imaginaryOf(e: Pick<SetEntry, "imaginary" | "calc" | "properties">): number[] | "not computed" {
  if (e.imaginary?.length) return [...e.imaginary];
  const list = e.calc?.results?.find((x) => x.on === "list" && x.id === "vibrations");
  if (list && list.on === "list") {
    const k = list.columns.findIndex((c) => c.quantity === "wavenumber");
    return k < 0 ? [] : list.rows.map((r) => r.cells[k]).filter((f): f is number => typeof f === "number" && f < 0);
  }
  const table = e.properties?.vibrations?.value;
  // (none read: its calculation's verdict of none, where it gave one)
  if (!e.properties?.vibrations) return Array.isArray(e.imaginary) ? [] : "not computed";
  const rows = typeof table === "object" && table && "table" in table ? table.table.rows : [];
  return rows.map((r) => r[0]).filter((f): f is number => typeof f === "number" && f < 0);
}

/** The names Meno gives what it has found of an entry (`menoProperties`), each a field of a step's entry - its compound, its energy, its vibrations, its state - never one of its own properties. */
const MENO_NAMES = ["group", "number", "energy", ...THERMO_PROPERTIES, "vibrations", "modes", "degeneracy", "mirror", "imaginary", "imaginary.first", "imaginary.second", "name", "state", "failure", "converged"] as const;
export const MENO_OWN: ReadonlySet<string> = new Set(MENO_NAMES);

/** What Meno has found of an entry, as properties by its own names (`MENO_NAMES`, which its type holds it to): its compound as its group, its number, its energy (in hartrees, at its geometry - in the solvation its calculation said - by what worked it out), its calculation's thermochemistry and vibrations, its degeneracy, its mirror image's atoms where one was counted in, how many imaginary frequencies it has and the two largest, its name, its state, and why it failed, where it did. */
function menoProperties(e: SetEntry): Partial<Record<(typeof MENO_NAMES)[number], Property>> {
  const at: At = { geometry: geometryKey(e.xyz), ...(e.calc?.solvation ? { solvent: e.calc.solvation } : {}) };
  const by = byOf(e.calc);
  // (what its energy is, where no calculation says: what made it says - "E(MP2)" its notes named, a force field - so that energies
  //  from two sources, or one from a calculation and one not, are never one column, set against one another: a diagram's levels, a window)
  const energyBy = by ?? (e.keep?.made?.energies ? { method: e.keep.made.energies } : undefined);
  return {
    group: { value: compoundLetter(e.compound), unit: "none", status: "computed" },
    number: { value: e.number, unit: "none", status: "computed" },
    ...(e.energy != null ? { energy: { value: e.energy, unit: "Eh" as const, at, ...(energyBy ? { by: energyBy } : {}), status: "computed" as const } } : {}),
    ...thermoOf(e, at.geometry),
    ...vibrationsOf(e, at),
    ...(e.degeneracy != null ? { degeneracy: { value: e.degeneracy, unit: "none" as const, status: "computed" as const } } : {}),
    ...(e.mirror ? { mirror: { value: { list: [...e.mirror], per: "atom" as const }, unit: "none" as const, status: "computed" as const } } : {}),
    ...imaginaryProperties(e, at),
    ...(e.name ? { name: { value: e.name, unit: "none" as const, status: "computed" as const } } : {}),
    // (whether it is a result to stand on: finished - converged, not failed, its marks read - or why not, in a step's line's words)
    state: { value: entryState(e), unit: "none", status: "computed" },
    // (why it failed, where it did, in its program's own words: for a Filter to send each kind of failure its own way - Runs again)
    ...(e.failed ? { failure: { value: e.failed.why, unit: "none" as const, status: "computed" as const } } : {}),
    // (where a run ended converged at its geometry, how: "optimisation", "saddle point optimisation", "highest point refined" - none where none did)
    ...convergedProperty(e),
  };
}

/** That a run ended converged at an entry's geometry, as a property (workflow/converged): how, at that geometry; none where none did. */
function convergedProperty(e: SetEntry): Partial<Record<"converged", Property>> {
  const c = convergedOf(e);
  return c ? { converged: { value: c.how, unit: "none", at: { geometry: c.geometry }, status: "computed" } } : {};
}

/**
 * An entry's imaginary frequencies as properties, for a chemist to select on
 * with Filter ("imaginary = 1", "imaginary.second < 50 cm-1"): how many its
 * calculation judged it has - 0 where its vibrations were worked out and
 * none is, none at all where they were not (`imaginaryOf`) - and the largest
 * and the next, each as its size in cm-1 (120.5 for 120.5i), where it has
 * them. Meno judges nothing by them: whether one is a minimum, or a saddle
 * point, is the chemist's to say.
 */
function imaginaryProperties(e: SetEntry, at: At): Partial<Record<"imaginary" | "imaginary.first" | "imaginary.second", Property>> {
  const found = imaginaryOf(e);
  if (found === "not computed") return {};
  const sizes = found.map(Math.abs).sort((p, q) => q - p);
  const of = (value: number, unit: "none" | "cm-1"): Property => ({ value, unit, at, status: "computed" });
  return {
    imaginary: of(sizes.length, "none"),
    ...(sizes.length > 0 ? { "imaginary.first": of(sizes[0], "cm-1") } : {}),
    ...(sizes.length > 1 ? { "imaginary.second": of(sizes[1], "cm-1") } : {}),
  };
}

/** How a value of the structure one was made from is named on it (stepRuns `madeRecord`): `made_from.nll`, that one's NLL - never its own. */
export const MADE_FROM = "made_from.";

/**
 * The values of the structure one was made from, as that one's (`made_from.nll`): its own, and what it carried of
 * one it was made from in turn, as it is - one level, still of the structure it was made from, at a remove - its
 * own over them; never which of how many it was (`made`).
 */
export function madeFrom(record: DrawnRecord | undefined): [string, Property][] {
  const had = Object.entries(record?.properties ?? {});
  return [
    ...had.filter(([name]) => name.startsWith(MADE_FROM)),
    ...had.filter(([name]) => !name.startsWith(MADE_FROM) && name !== "made").map(([name, p]): [string, Property] => [`${MADE_FROM}${name}`, p]),
  ];
}

/**
 * A structure drawn as an entry record (lib/entry) reads it - by Filter,
 * and as a table of structures (flow `structuresAsTable`) - by `id`: its
 * record's properties, what it was made from and its status, its drawing
 * no part of it (no structure, no geometry); and Meno's `state` of it:
 * "failed: <why>" where its record says it failed, else finished (one an
 * earlier step set aside - the same as another - is no failure).
 */
export function drawnAsEntry(e: DrawnEntry, id: string): Entry {
  const status = e.record?.status;
  const state = typeof status === "object" && "failed" in status ? `failed: ${status.failed}` : FINISHED;
  return {
    id,
    from: e.record?.from ?? [],
    structure: { atoms: [], bonds: [] },
    geometry: { kind: "none" },
    species: null,
    properties: { ...e.record?.properties, state: { value: state, unit: "none", status: "computed" } },
    status: status ?? "done",
  };
}

/** What a step's entry is, as Filter's `state` reads it (docs/WORKFLOWS.md, *Filter*): "finished"; else why not - its failure in a step's line's words ("not converged", "refused"), or "marks not read". */
export const FINISHED = "finished";
/**
 * The condition that keeps only the entries that are results to stand on, as a Filter is given it (`entryState`):
 * here, beside `FINISHED`, so that it is made once that is - never, across an import cycle, before it ("state = undefined").
 */
export const STATE_FINISHED = `state = ${FINISHED}`;
export function entryState(e: Pick<SetEntry, "failed" | "marksUnread">): string {
  if (e.failed) return FAILURE_WORDS[e.failed.kind] ?? e.failed.kind;
  return e.marksUnread ? "marks not read" : FINISHED;
}

/** The properties an entry carries of its own under names Meno gives its own (`menoProperties`), which its entry record reads as Meno's: none, mostly. */
export function shadowedIn(e: SetEntry): string[] {
  if (!e.properties) return [];
  const own = menoProperties(e);
  return Object.keys(e.properties).filter((k) => k in own || ALWAYS_MENO.includes(k));
}

/** Meno's names an entry's own property never stands under, where Meno has none to give: that a run converged is a run's record alone (workflow/converged), never a value an entry carries. */
const ALWAYS_MENO: readonly string[] = ["converged"];

/**
 * A step's entry read as Meno's entry record (lib/entry, PR 1 of
 * docs/WORKFLOWS-FOUNDATION.md), by `id`: its structure in its numbering,
 * its geometry, its species by Meno's one rule, and what has been found of
 * it as properties - its energy (in hartrees, at its geometry, by what
 * worked it out), its calculation's thermochemistry and vibrations, its
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
  // (its own properties - a model's, a descriptor's - as they came; Meno's names after them, its own: `shadowedIn` names those it gave under them)
  const properties: Record<string, Property> = { ...Object.fromEntries(Object.entries(e.properties ?? {}).filter(([k]) => !ALWAYS_MENO.includes(k))), ...menoProperties(e) };
  const written = { atoms: atoms.map((a, i) => ({ ...a, x: e.xyz[3 * i], y: e.xyz[3 * i + 1], z: e.xyz[3 * i + 2] })), bonds: [], ...(e.skeleton ? { skeleton: true } : {}) };
  return {
    id,
    from: e.from != null ? [`molecule:${e.from}${e.frame != null ? `#${e.frame}` : ""}`] : [],
    // (a coordination bond - the CTfile's type, as a molecule in 3D holds it - as the record marks one: single, so marked)
    structure: { atoms, bonds: e.bonds.map((b) => (b.order === COORDINATION_BOND ? { a1: b.a1, a2: b.a2, order: 1 as const, coordination: true as const } : { a1: b.a1, a2: b.a2, order: b.order as 1 | 2 | 3 })) },
    geometry: { kind: "3d", xyz: [...e.xyz] },
    species: speciesOf(written, e),
    properties,
    ...(e.stereo ? { stereo: e.stereo } : {}),
    // (its file's marks of which frames failed did not read: not done, as far as is known)
    status: e.failed ? { failed: e.failed.why } : e.marksUnread ? { failed: MARKS_UNREAD } : "done",
  };
}

/**
 * An entry record as a step's entry again (`entryOfSet`, the other way),
 * where a step of Meno's has made it: its structure, its places, its charge
 * and spin, and its own properties - each as the step left it (lib/steps
 * restructure: a value of a geometry naming it, a label, a value of a
 * structure marked where it is another's). Where it was made from a step's
 * entry (`was`) and is that entry still - the same atoms and bonds, places
 * and charge and spin, only its properties changed (a Tag's) - all that
 * entry held is kept. Where any of them changed, what was worked out at the
 * old ones goes - its calculation, its energy, its marks of failed or not
 * a minimum, its degeneracy, mirror image and stereo - never carried onto
 * another structure or geometry; the molecule it is a frame of (`from`,
 * `frame`) stays. None where it has no single 3D geometry: a step's entry
 * is one frame in 3D.
 */
export function setEntryOfEntry(e: Entry, place: { compound: number; number: number }, was?: SetEntry): SetEntry | null {
  if (e.geometry.kind !== "3d") return null;
  const xyz = e.geometry.xyz;
  if (xyz.length !== 3 * e.structure.atoms.length) return null;
  const atoms: ParsedAtom[] = e.structure.atoms.map((a, i) => ({
    el: a.el,
    ...(a.isotope ? { isotope: a.isotope } : {}),
    ...(a.charge ? { charge: a.charge } : {}),
    ...(a.radical ? { radical: a.radical } : {}),
    x: xyz[3 * i],
    y: xyz[3 * i + 1],
    z: xyz[3 * i + 2],
  }));
  const bonds: ParsedBond[] = e.structure.bonds.map((b) => ({ a1: b.a1, a2: b.a2, order: b.coordination ? COORDINATION_BOND : b.order }));
  const own = Object.fromEntries(Object.entries(e.properties).filter(([k]) => !MENO_OWN.has(k)));
  const name = e.properties.name?.value;
  const made: SetEntry = {
    compound: place.compound,
    number: place.number,
    atoms,
    bonds,
    xyz: [...xyz],
    // (its charge and spin where given - by a calculation, or a Species step - not where its atoms alone say them: a step's entry holds what was given, as one read from an output does)
    ...(e.species?.from.charge === "given" ? { charge: e.species.charge } : {}),
    ...(e.species?.from.multiplicity === "given" ? { multiplicity: e.species.multiplicity } : {}),
    ...(e.species ? {} : { skeleton: true as const }),
    ...(typeof name === "string" ? { name } : was?.name ? { name: was.name } : {}),
    ...(Object.keys(own).length ? { properties: own } : {}),
    ...(was?.from != null ? { from: was.from } : {}),
    ...(was?.frame != null ? { frame: was.frame } : {}),
    ...(was?.last != null ? { last: was.last } : {}),
  };
  if (!was || !sameAs(was, made)) return made;
  // (that entry still: all it held, its properties as the step left them - and its charge and spin given, where the step gave the ones it had)
  const { properties: _, ...held } = was;
  // (what it carries of its calculation - a conformer's free energy, its vibrations - of that geometry still: kept, as its calculation is)
  const carried = Object.fromEntries(CALC_CARRIED.flatMap((k) => (was.properties?.[k] ? [[k, was.properties[k]]] : [])));
  const properties = { ...own, ...carried };
  return {
    ...held,
    compound: place.compound,
    number: place.number,
    ...(made.charge != null ? { charge: made.charge } : {}),
    ...(made.multiplicity != null ? { multiplicity: made.multiplicity } : {}),
    ...(Object.keys(properties).length ? { properties } : {}),
    ...(made.name ? { name: made.name } : {}),
  };
}

/** A step's entry's charge and spin as in use - given, or as its atoms say them (`speciesOf`) - or none, a skeleton's. */
function speciesNow(e: SetEntry): string {
  const s = entryOfSet(e, "").species;
  return s ? `${s.charge}|${s.multiplicity}` : "none";
}

/** Whether two step's entries are one: the same atoms, in order, the same bonds, places, and charge and spin in use - one given that its atoms say already is the same. */
function sameAs(a: SetEntry, b: SetEntry): boolean {
  const atom = (x: ParsedAtom) => `${x.el}|${x.isotope ?? ""}|${x.charge ?? 0}|${x.radical ?? ""}`;
  const bond = (x: ParsedBond) => `${Math.min(x.a1, x.a2)}-${Math.max(x.a1, x.a2)}:${x.order}`;
  return (
    a.atoms.length === b.atoms.length &&
    a.atoms.every((x, i) => atom(x) === atom(b.atoms[i])) &&
    a.bonds.map(bond).sort().join() === b.bonds.map(bond).sort().join() &&
    geometryKey(a.xyz) === geometryKey(b.xyz) &&
    speciesNow(a) === speciesNow(b)
  );
}

/**
 * A set's collection's hash (docs/WORKFLOWS-FOUNDATION.md, *Sets and
 * collections*): of its members, in order - each structure's atoms and
 * bonds, each molecule's atoms and every frame's places (lib/entry
 * `geometryKey`), each picture's image - so that what a set holds is told
 * apart by it, and the same again by the same. FNV-1a, twice over, 64 bits
 * as hex.
 */
export function collectionHash(page: Page & { pictures?: readonly Pick<PictureItem, "id" | "x" | "y" | "sha256">[] }, set: Frame & Pick<WorkflowSet, "members" | "collection" | "drawnCollection">): string {
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
  // (a large result set's, held off the page: each by its own atoms' order, as those on it are by theirs)
  for (const m of set.drawnCollection ?? []) {
    const at = new Map(m.atoms.map((a, i) => [a.id, i]));
    parts.push(`s|${m.atoms.map((a) => `${a.el}${a.charge ?? ""}`).join(",")}|${m.bonds.map((b) => `${at.get(b.a)}-${at.get(b.b)}:${b.order}`).join(",")}`);
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

/** What a set holds itself, on no page (`collection`), said - "118 molecules", "400 conformers" - for what goes with it when it is deleted; none where it holds none. */
/** Whether a set holds what is on no page - a large set's molecules in 3D (`collection`), structures drawn it does not show (`drawnCollection`) - which go with it: deleting it asks first. */
export const holdsOwn = (set: Pick<WorkflowSet, "collection" | "drawnCollection"> | undefined): boolean => !!(set?.collection?.length || set?.drawnCollection?.length);

export function heldOwn(page: Page, set: WorkflowSet): string | undefined {
  // (structures drawn it holds off the page - those it does not show: they go with it; those it shows are the page's)
  if (set.drawnCollection?.length) return `${set.drawnCollection.length.toLocaleString("en-US")} ${set.drawnCollection.length === 1 ? "structure" : "structures"}`;
  if (!set.collection?.length) return undefined;
  const { holds, entries } = countOf(page, set);
  const noun = holds === "conformers" ? "conformer" : "molecule";
  return `${entries.toLocaleString("en-US")} ${entries === 1 ? noun : `${noun}s`}`;
}
