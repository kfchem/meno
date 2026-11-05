/**
 * A step's result set held off the page (docs/WORKFLOWS.md, *Held
 * results*): where its exit is wired on to another step and the chemist
 * has not opened it, what it holds is kept in the set itself - its
 * molecules in 3D in its collection, its structures drawn in its drawn
 * collection, as a large set keeps them - and its frame is drawn nowhere:
 * it lies nowhere on the page. The steps after it take what it holds from
 * there, as from a large set. Its wire is no longer wired on, or the
 * chemist opens it: it is laid out again, as its step's run lays out what
 * it gives (run `laidOutAgain`).
 *
 * One rule, kept after every edit (`heldSettled`, the workspace's
 * document's settle): an edit that wires an exit on holds its set in the
 * same step of the history, and one that takes its last wire away lays it
 * out in that step too.
 */
import { removeMolecules3d, withoutAtoms, type WorkspaceDocument } from "../document";
import type { DrawnModel, Molecule3D, Wire, WorkflowSet, WorkflowStep } from "../store/types";
import { setMembers, setMolecules, entriesIn, LARGE_SET, type Frame } from "./entries";
import { exitPlace } from "./kinds";
import { setGives, stepGives } from "./look";
import { drawnEntries, laidOutAgain, type RunWith } from "./run";

type Pt = { x: number; y: number };

/** The held sets of a page, by the page's sets and wires: worked out again only as either changes. */
const heldBy = new WeakMap<readonly WorkflowSet[], { wires: readonly Wire[] | undefined; held: ReadonlySet<number> }>();

/** The ids of a page's held sets: each a step's result set (`made`), a wire out of it, and not opened. */
export function heldSets(doc: Pick<WorkspaceDocument, "sets" | "wires">): ReadonlySet<number> {
  const sets = doc.sets ?? [];
  const was = heldBy.get(sets);
  if (was && was.wires === doc.wires) return was.held;
  const wired = new Set((doc.wires ?? []).map((w) => w.from.set));
  const held = new Set(sets.filter((b) => b.made && !b.opened && wired.has(b.id)).map((b) => b.id));
  heldBy.set(sets, { wires: doc.wires, held });
  return held;
}

/** Whether a set is held off the page (`heldSets`). */
export const isHeld = (doc: Pick<WorkspaceDocument, "sets" | "wires">, set: Pick<WorkflowSet, "id">): boolean => heldSets(doc).has(set.id);

/** A page's sets that lie on it: all but those held (`heldSets`). */
export function setsOnPage<T extends Pick<WorkflowSet, "id">>(doc: Pick<WorkspaceDocument, "sets" | "wires">, sets: readonly T[]): T[] {
  const held = heldSets(doc);
  return held.size ? sets.filter((b) => !held.has(b.id)) : [...sets];
}

/**
 * Where a wire out of a set starts: a step's result set's at its exit's
 * port on the step's card (look `stepGives`), held or not - its frame,
 * where it has one on the page, gives from no port of its own; a set the
 * chemist made, at its frame's right side.
 */
export function wireStart(steps: readonly Pick<WorkflowStep, "id" | "x" | "y" | "kind">[] | ReadonlyMap<number, Pick<WorkflowStep, "id" | "x" | "y" | "kind">>, set: Frame & Pick<WorkflowSet, "made">): Pt {
  const s = set.made ? ("get" in steps ? steps.get(set.made.step) : steps.find((x) => x.id === set.made!.step)) : undefined;
  return s && set.made ? stepGives(s, exitPlace(s.kind, set.made.exit)) : setGives(set);
}

/**
 * `doc` with set `id` held off the page: what it holds on the page - its
 * molecules in 3D, its structures drawn with their records - in the set
 * itself, in its order (before those it held off the page already, past
 * what a set lays out), each as it was: a molecule as it is, but for its
 * id and place, which it keeps by (`heldIds`), a structure on its atoms'
 * own ids, so that what a step after it worked out from it is the same
 * (flow `inputKey`). Each leaves the page - but one another set holds
 * too, which stays its. Its frame stays as it was, for where it is laid
 * out again; and the atoms its step put are its no longer, being gone.
 */
export function heldOff(doc: WorkspaceDocument, id: number): WorkspaceDocument {
  const set = doc.sets?.find((b) => b.id === id);
  // (none on the page: its members said, and none - held already, as after every edit but the one that wires it: no looking)
  if (!set || (set.members && !set.members.length)) return doc;
  const own = setMembers(doc, set);
  if (!own.molecules.length && !own.structures.length) return doc;
  // (what another set holds too stays on the page, its)
  const others = (doc.sets ?? []).filter((b) => b.id !== id).map((b) => setMembers(doc, b));
  const otherMolecules = new Set(others.flatMap((m) => m.molecules));
  const otherAtoms = new Set(others.flatMap((m) => m.structures.flat()));
  const molecules: Molecule3D[] = own.molecules.length && !set.collection ? setMolecules(doc, set) : [];
  const drawn: DrawnModel[] = drawnEntries(doc.model, own.structures, own.records).map((e) => ({ ...e.drawn, ...(e.record ? { record: e.record } : {}) }));
  let out = removeMolecules3d(doc, molecules.map((m) => m.id).filter((m) => !otherMolecules.has(m)));
  const atoms = own.structures.flat().filter((a) => !otherAtoms.has(a));
  if (atoms.length) out = withoutAtoms(out, atoms);
  const { put: _put, heldIds: _ids, ...rest } = set;
  const held: WorkflowSet = {
    ...rest,
    members: [],
    ...(molecules.length ? { collection: molecules.map(({ id: _i, at: _a, ...m }) => m), heldIds: molecules.map((m) => m.id) } : {}),
    ...(drawn.length ? { drawnCollection: [...drawn, ...(set.drawnCollection ?? [])] } : {}),
  };
  return { ...out, sets: (out.sets ?? []).map((b) => (b.id === id ? held : b)) };
}

/** What is on a page, by id: its atoms, molecules in 3D and pictures - worked out once for an edit, where it is asked. */
type OnPage = { atoms: ReadonlySet<number>; molecules: ReadonlySet<number>; pictures: ReadonlySet<number> };

/**
 * Whether any of a set's members is on the page still - an atom of one of
 * its structures, one of its molecules or pictures - or, its members not
 * known yet, anything lies in its frame (entries `setMembers`).
 */
function showsAny(doc: WorkspaceDocument, set: WorkflowSet, on: () => OnPage): boolean {
  if (!set.members) {
    const own = setMembers(doc, set);
    return own.structures.length + own.molecules.length + own.pictures.length > 0;
  }
  if (!set.members.length) return false;
  const page = on();
  return set.members.some((m) => ("structure" in m ? m.structure.some((a) => page.atoms.has(a)) : "molecule" in m ? page.molecules.has(m.molecule) : page.pictures.has(m.picture)));
}

/**
 * Whether a set not held holds off the page what a run would lay out on it
 * (run `filled`) - and nothing on the page (`showsAny`): molecules in 3D in
 * its collection, no more entries than a set lays out (`LARGE_SET`), or
 * structures drawn in its drawn collection. What holding it left - or what
 * is left of a large set once those it showed were deleted, the next laid
 * out in that edit's own step of the history; a set not held lays them
 * out, as a run does.
 */
function laysOut(doc: WorkspaceDocument, set: WorkflowSet, on: () => OnPage): boolean {
  if (set.table || set.number || set.chart || !(set.collection?.length || set.drawnCollection?.length)) return false;
  if (showsAny(doc, set, on)) return false;
  return set.collection?.length ? set.collection.reduce((n, m) => n + entriesIn(m), 0) <= LARGE_SET : true;
}

/**
 * `doc` after an edit (`before`, none as a file opens), each set held off
 * the page or laid out on it as it is wired now (`heldSets`): one the edit
 * wired on holds what it held on the page (`heldOff`); one no longer
 * wired on, or opened - or one that showed some and held the rest, those
 * it showed deleted by the edit - is laid out again (run `laidOutAgain`):
 * its molecules in 3D only where their room on the page can be worked out
 * (`extentOf`, the workspace's styles in 3D: none, they stay held, summed
 * up in its frame as a large set's are). Nothing to do where the edit
 * changed no set, step or wire, nor what is on the page.
 */
export function heldSettled(doc: WorkspaceDocument, before: WorkspaceDocument | undefined, extentOf?: RunWith["extentOf"]): WorkspaceDocument {
  if (!doc.sets?.length) return doc;
  const wiring = !before || doc.sets !== before.sets || doc.wires !== before.wires || doc.steps !== before.steps;
  const page = !before || doc.model !== before.model || doc.molecules3d !== before.molecules3d || doc.pictures !== before.pictures;
  if (!wiring && !page) return doc;
  const held = heldSets(doc);
  // (what is on the page, by id: worked out once, where a set asks)
  let seen: OnPage | undefined;
  const on = () =>
    (seen ??= {
      atoms: new Set(doc.model.atoms.map((a) => a.id)),
      molecules: new Set((doc.molecules3d ?? []).map((m) => m.id)),
      pictures: new Set((doc.pictures ?? []).map((p) => p.id)),
    });
  let out = doc;
  for (const set of doc.sets) {
    // (an edit of what is on the page alone: only a set showing some and holding the rest can have been emptied by it)
    if (!wiring && !(set.members?.length && (set.collection?.length || set.drawnCollection?.length))) continue;
    const now = out.sets === doc.sets ? set : out.sets?.find((b) => b.id === set.id);
    if (!now) continue;
    if (held.has(set.id)) out = heldOff(out, set.id);
    else if (laysOut(doc, now, on) && (!now.collection || extentOf)) out = laidOutAgain(out, set.id, extentOf);
  }
  return out;
}
