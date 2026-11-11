/**
 * A result set of more molecules in 3D than a page lays out (`LARGE_SET`)
 * holds them itself, and its frame shows one at a time - as a stack does,
 * with a stack chip to go through them (docs/WORKFLOWS.md, *A large result
 * set*). The one shown is a view: drawn from the set's collection, on no
 * page, so none of the page's molecules - not selected, moved or deleted -
 * and which one is the view's, not an undo step (`EditorState.heldShown`,
 * as `stacksShown` is).
 */
import type { Molecule3D, WorkflowSet } from "../store/types";
import type { WorkspaceDocument } from "../document";
import { compoundLetter, LARGE_SET, setMolecules, type Frame } from "./entries";
import { setsOnPage } from "./onPage";
import { CHIP, PX, SET_PAD, SET_TOP } from "./look";
import { hasChip } from "./selectionSet";

/** Views take the ids below `-HELD_VIEWS`, each set's own span of that many: a collection's molecules are numbered from -1 down within it (`setMolecules`), well short of it. */
export const HELD_VIEWS = 2 ** 24;

/** The id the view of molecule `index` of set `set` is drawn and turned by: one of its own for each, so that each keeps how it was turned as the stack goes over. */
export const heldViewId = (set: number, index: number): number => -(HELD_VIEWS * (set + 1) + index);

/** Whether `id` is a held view's (`heldViewId`), not a molecule of the page. */
export const isHeldView = (id: number): boolean => id <= -HELD_VIEWS;

/** Whether a set shows its molecules one at a time: it holds more than a page lays out. */
export const showsOneAtATime = (b: Pick<WorkflowSet, "collection">): boolean => (b.collection?.length ?? 0) > LARGE_SET;

/** Which of a set's molecules its view shows, by its place in its collection: kept within it. */
export function shownIn(b: Pick<WorkflowSet, "id" | "collection">, shown: Readonly<Record<number, number>>): number {
  const n = b.collection?.length ?? 0;
  const k = shown[b.id];
  return k != null && Number.isInteger(k) && k >= 0 && k < n ? k : 0;
}

/** The least a held set's frame is wide: its tab's name and count, and *Open as a table* beside them, in its first line. */
export const HELD_LEAST_W = 300 * PX;

/** The room left between the tab's line - its name, count and *Open as a table* - and the molecule below it: the top of the molecule is seen further than the atoms alone reach (page units). */
export const HELD_TOP_GAP = 16 * PX;

/** How far the frames chip hangs below the stack chip, where a view's molecule has one (page units): a chip's own height and the gap between. */
export const HELD_CHIP_ROW = 28 * PX;

/** How many chips hang under a set's molecule: its stack chip, and its frames chip where any of its molecules has one - worked out once for a collection. */
const rowsOf = new WeakMap<readonly unknown[], number>();
export function chipRows(collection: readonly Parameters<typeof hasChip>[0][]): number {
  let rows = rowsOf.get(collection);
  if (rows == null) {
    rows = collection.some((m) => hasChip(m)) ? 2 : 1;
    rowsOf.set(collection, rows);
  }
  return rows;
}

/** A held set's frame as wide and as tall as the largest molecule it holds and its chips need (`rooms`, each as the molecule is laid out on the page: about its place) - and at least `least` wide, so that its name and count read whole. */
export function heldFrame(rooms: readonly (Frame & { chip: number })[], rows: number, least: number): { width: number; height: number } {
  let half = 0;
  let reach = 0;
  for (const r of rooms) {
    half = Math.max(half, -r.x0, r.x1);
    reach = Math.max(reach, -r.y0, r.y1);
  }
  return { width: Math.max(least, 2 * half + 2 * SET_PAD), height: SET_TOP + HELD_TOP_GAP + 2 * reach + rows * CHIP + SET_PAD };
}

/** Where a view's molecule stands in its set's frame: across its middle, in the room between its name (and the gap under it) and its chips. */
export function heldViewAt(b: Frame, rows: number): { x: number; y: number } {
  const room = Math.abs(b.y1 - b.y0) - SET_TOP - HELD_TOP_GAP - rows * CHIP - SET_PAD;
  return { x: (b.x0 + b.x1) / 2, y: Math.max(b.y0, b.y1) - SET_TOP - HELD_TOP_GAP - room / 2 };
}

export type HeldView = {
  set: WorkflowSet;
  /** Its place in the set's collection. */
  index: number;
  count: number;
  /** The molecule, as the page would have it, on the id of its view and where its set's frame puts it. */
  molecule: Molecule3D;
};

/** The same view of a molecule at the same place is the same object: what draws it is not asked to draw it again. */
const viewed = new WeakMap<object, Map<string, Molecule3D>>();
function viewOf(m: Molecule3D, id: number, at: { x: number; y: number }): Molecule3D {
  let kept = viewed.get(m);
  if (!kept) viewed.set(m, (kept = new Map()));
  const key = `${id}:${at.x}:${at.y}`;
  let v = kept.get(key);
  if (!v) {
    if (kept.size > 8) kept.clear();
    kept.set(key, (v = { ...m, id, at: { ...at } }));
  }
  return v;
}

/** The views of the sets on a page that show their molecules one at a time, by what each shows (`EditorState.heldShown`): a set held off the page is drawn nowhere, and none is. */
export function heldViews(doc: Pick<WorkspaceDocument, "sets" | "wires" | "steps" | "molecules3d" | "model">, shown: Readonly<Record<number, number>>): HeldView[] {
  const sets = doc.sets ?? [];
  if (!sets.some(showsOneAtATime)) return [];
  return setsOnPage(doc, sets)
    .filter(showsOneAtATime)
    .map((set) => {
      const index = shownIn(set, shown);
      const of = setMolecules(doc, set)[index];
      return { set, index, count: set.collection!.length, molecule: viewOf(of, heldViewId(set.id, index), heldViewAt(set, chipRows(set.collection!))) };
    });
}

/**
 * The molecule a view's stack chip is told of: its own title, as the chip says it - or, a conformer set's, which compound
 * it is of the set's (its letter, as the set's table has it).
 */
export function viewShown(v: Pick<HeldView, "molecule" | "index">): Molecule3D {
  if (v.molecule.title || !v.molecule.conformerSet) return v.molecule;
  return { ...v.molecule, title: `compound ${compoundLetter(v.index)}` };
}
