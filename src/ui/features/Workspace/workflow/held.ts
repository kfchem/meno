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
import type { DrawnModel, Molecule3D, WorkflowSet } from "../store/types";
import { setMembers, setMolecules, LARGE_SET } from "./entries";
import { heldSets } from "./onPage";
import { drawnEntries, laidOutAgain, type RunWith } from "./run";

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

/**
 * Whether any of a set's members is on the page still - an atom of one of
 * its structures, one of its molecules or pictures - or, its members not
 * known yet, anything lies in its frame (entries `setMembers`). The page
 * looked through from its end, where what a step put is drawn: one found
 * there soon, as an edit that moves them leaves them all - only an edit
 * that took them all away is looked through whole.
 */
function showsAny(doc: WorkspaceDocument, set: WorkflowSet): boolean {
  if (!set.members) {
    const own = setMembers(doc, set);
    return own.structures.length + own.molecules.length + own.pictures.length > 0;
  }
  if (!set.members.length) return false;
  const atoms = new Set<number>();
  const molecules = new Set<number>();
  const pictures = new Set<number>();
  for (const m of set.members) {
    if ("structure" in m) for (const a of m.structure) atoms.add(a);
    else if ("molecule" in m) molecules.add(m.molecule);
    else pictures.add(m.picture);
  }
  const lastFound = <T extends { id: number }>(xs: readonly T[] | undefined, ids: ReadonlySet<number>) => {
    if (!xs || !ids.size) return false;
    for (let i = xs.length - 1; i >= 0; i--) if (ids.has(xs[i].id)) return true;
    return false;
  };
  return lastFound(doc.model.atoms, atoms) || lastFound(doc.molecules3d, molecules) || lastFound(doc.pictures, pictures);
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
function laysOut(doc: WorkspaceDocument, set: WorkflowSet): boolean {
  if (set.table || set.number || set.chart || !(set.collection?.length || set.drawnCollection?.length)) return false;
  if (showsAny(doc, set)) return false;
  return set.collection?.length ? set.collection.length <= LARGE_SET : true;
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
  let out = doc;
  for (const set of doc.sets) {
    // (an edit of what is on the page alone: only a set showing some and holding the rest can have been emptied by it)
    if (!wiring && !(set.members?.length && (set.collection?.length || set.drawnCollection?.length))) continue;
    const now = out.sets === doc.sets ? set : out.sets?.find((b) => b.id === set.id);
    if (!now) continue;
    if (held.has(set.id)) out = heldOff(out, set.id);
    else if (laysOut(doc, now) && (!now.collection || extentOf)) out = laidOutAgain(out, set.id, extentOf);
  }
  return out;
}
