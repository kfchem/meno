/**
 * A stack of molecules in 3D: the molecules one file brought - an SD file's
 * records, a PDB entry's models of different atoms - standing in one place,
 * one shown at a time, with a slider through them as a molecule's frames
 * have (docs/WORKSPACE.md, *Stacks*). Laid out as a grid (`spread`), each
 * stands where the grid put it, all of them shown, and can be stacked again.
 * Which one a stack shows is the view's (`stacksShown`); that its molecules
 * are a stack, and whether it is laid out, the document's.
 */
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import type { AtomStack, Molecule3D } from "../store/types";
import { middleOfPoints } from "../../../../lib/extremes";

type Stacked = Pick<Molecule3D, "id" | "stack">;

/** How long a stack takes to go over from one of its molecules to the next, in milliseconds (components/Molecule3DView). */
export const STACK_SWAP_MS = 420;

/** The molecules of stack `stack`, in the order its file gave them. */
export function stackMembers<T extends Stacked>(molecules: readonly T[], stack: number): T[] {
  return molecules.filter((m) => m.stack?.id === stack);
}

/** The molecule stack `stack` shows: the one `shown` names, while it is one of the stack's; else its first. */
export function shownOf(molecules: readonly Stacked[], stack: number, shown: Readonly<Record<number, number>>): number | null {
  const members = stackMembers(molecules, stack);
  if (!members.length) return null;
  const said = shown[stack];
  return members.some((m) => m.id === said) ? said : members[0].id;
}

/**
 * The molecules out of sight in their stacks: those of a stack not laid out
 * as a grid, but the one it shows. Not drawn, not under the pointer, not
 * taken by a box or by Select all.
 */
export function hiddenInStacks(molecules: readonly Stacked[], shown: Readonly<Record<number, number>>): Set<number> {
  const hidden = new Set<number>();
  const showing = new Map<number, number>();
  for (const m of molecules) {
    const s = m.stack;
    if (!s || s.spread) continue;
    if (!showing.has(s.id)) showing.set(s.id, shownOf(molecules, s.id, shown) ?? m.id);
    if (showing.get(s.id) !== m.id) hidden.add(m.id);
  }
  return hidden;
}

/** A molecule's place in its stack, how many the stack holds and which they are - a molecule stacked, not laid out as a grid; else null. */
export function placeInStack(molecules: readonly Stacked[], m: Stacked): { index: number; count: number; members: number[] } | null {
  const s = m.stack;
  if (!s || s.spread) return null;
  const members = stackMembers(molecules, s.id).map((x) => x.id);
  return members.length > 1 ? { index: members.indexOf(m.id), count: members.length, members } : null;
}

/** An id for a new stack: one more than any of the molecules' stacks has. */
export function freshStackId(molecules: readonly Stacked[]): number {
  return molecules.reduce((most, m) => Math.max(most, m.stack?.id ?? 0), 0) + 1;
}

/**
 * Where a stack's molecules stand laid out as a grid about `at`, in their
 * order: in rows as long as there are rows, left to right and downwards,
 * each cell as wide and as tall as the widest molecule's reach and a
 * bond's room between.
 */
export function gridPlaces(at: { x: number; y: number }, reaches: readonly number[]): { x: number; y: number }[] {
  const n = reaches.length;
  if (!n) return [];
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  const cell = 2 * Math.max(...reaches) + NOMINAL_BOND_LENGTH;
  const x0 = at.x - ((cols - 1) * cell) / 2;
  const y0 = at.y + ((rows - 1) * cell) / 2;
  return reaches.map((_, k) => ({ x: x0 + (k % cols) * cell, y: y0 - Math.floor(k / cols) * cell }));
}

/**
 * The middle of the box round the places given: where a grid's molecules
 * stack again - where the stack stood as it was laid out, its last row
 * short or not.
 */
export function middleOf(places: readonly { x: number; y: number }[]): { x: number; y: number } {
  return middleOfPoints(places) ?? { x: 0, y: 0 };
}

/**
 * Molecules carried as a picture shows them: of each stack, the one it
 * shows (carried as `shown` - its first, where none says so) - not every
 * one, drawn over each other - and the rest as they are.
 */
export function seenOnly<T extends { stack?: Molecule3D["stack"]; shown?: true }>(carried: readonly T[]): T[] {
  const pick = new Map<number, T>();
  for (const m of carried) {
    const s = m.stack;
    if (!s || s.spread) continue;
    if (!pick.has(s.id) || m.shown) pick.set(s.id, m);
  }
  return carried.filter((m) => !m.stack || m.stack.spread || pick.get(m.stack.id) === m);
}

// --- stacks of drawings ---------------------------------------------------
//
// A file's several records drawn flat - an SD file's - stand in one place
// as a stack of drawings, one record shown at a time, as a stack of
// molecules in 3D does: each of its atoms says its stack, its record and
// the record's title (`Atom.stack`); which record a stack shows is the
// view's (`recordsShown`). The canvas draws and works on what is shown - the
// store's `model` is the drawing as shown (`shownModel`), the document's
// whole drawing beside it (`fullModel`) - and what keeps the document, Save
// and Export, carries the whole, the record each stack shows marked
// (`carriedDrawing`), as a stack of molecules is carried.

type StackedAtom = { id: number; x: number; y: number; stack?: AtomStack };
type DrawnBond = { id: number; a: number; b: number };
type Drawing<A extends StackedAtom = StackedAtom> = { atoms: A[]; bonds: DrawnBond[] };
type Record_ = { record: number; atoms: number[]; title?: string };

/** The records of stack `stack` in a drawing, in order: each one's atoms, by id, and its title. */
export function recordsOf(model: Pick<Drawing, "atoms">, stack: number): Record_[] {
  const by = new Map<number, Record_>();
  for (const a of model.atoms) {
    const s = a.stack;
    if (s?.id !== stack) continue;
    let r = by.get(s.record);
    if (!r) by.set(s.record, (r = { record: s.record, atoms: [], ...(s.title ? { title: s.title } : {}) }));
    r.atoms.push(a.id);
  }
  return [...by.values()].sort((p, q) => p.record - q.record);
}

/** The record stack `stack` shows: the one `shown` names, while the stack has it; else its first. */
export function shownRecord(model: Pick<Drawing, "atoms">, stack: number, shown: Readonly<Record<number, number>>): number | null {
  const records = recordsOf(model, stack);
  if (!records.length) return null;
  const said = shown[stack];
  return records.some((r) => r.record === said) ? said : records[0].record;
}

/** Of each stack of drawings not laid out as a grid, the record it shows, by the stack's id. */
function showing(atoms: readonly StackedAtom[], shown: (stack: number) => number | undefined): Map<number, number> {
  const records = new Map<number, Set<number>>();
  for (const a of atoms) {
    const s = a.stack;
    if (!s || s.spread) continue;
    let r = records.get(s.id);
    if (!r) records.set(s.id, (r = new Set()));
    r.add(s.record);
  }
  const out = new Map<number, number>();
  for (const [stack, r] of records) {
    const said = shown(stack);
    out.set(stack, said != null && r.has(said) ? said : Math.min(...r));
  }
  return out;
}

/** A drawing with the atoms `hidden` left out, and the bonds to them - itself, where there are none. */
function without<M extends Drawing<any>>(model: M, hidden: ReadonlySet<number>): M {
  if (!hidden.size) return model;
  return { ...model, atoms: model.atoms.filter((a: StackedAtom) => !hidden.has(a.id)), bonds: model.bonds.filter((b) => !hidden.has(b.a) && !hidden.has(b.b)) };
}

const lastShown = new WeakMap<object, { shown: Readonly<Record<number, number>>; model: Drawing<any> }>();

/**
 * The drawing as it is shown: of each stack of drawings not laid out as a
 * grid, the record it shows, and the rest as it is - the very drawing given
 * where nothing is out of sight; asked again with the same, the same.
 */
export function shownModel<M extends Drawing<any>>(model: M, shown: Readonly<Record<number, number>>): M {
  const was = lastShown.get(model);
  if (was && was.shown === shown) return was.model as M;
  const atoms = model.atoms as StackedAtom[];
  let out = model;
  if (atoms.some((a) => a.stack && !a.stack.spread)) {
    const show = showing(atoms, (stack) => shown[stack]);
    out = without(model, new Set(atoms.filter((a) => a.stack && !a.stack.spread && show.get(a.stack.id) !== a.stack.record).map((a) => a.id)));
  }
  lastShown.set(model, { shown, model: out });
  return out;
}

/**
 * The whole drawing as a copy or a file carries it: of each stack, the
 * record it shows marked (`shown`) - the drawing given, where it has no
 * stack.
 */
export function carriedDrawing<M extends Drawing<any>>(model: M, shown: Readonly<Record<number, number>>): M {
  const atoms = model.atoms as StackedAtom[];
  if (!atoms.some((a) => a.stack && !a.stack.spread)) return model;
  const show = showing(atoms, (stack) => shown[stack]);
  return {
    ...model,
    atoms: atoms.map((a) => (a.stack && !a.stack.spread && show.get(a.stack.id) === a.stack.record ? { ...a, stack: { ...a.stack, shown: true } } : a)),
  };
}

/** A drawing carried as a picture shows it: of each stack, the record marked shown - its first, where none is - not every one, drawn over each other. */
export function seenDrawing<M extends Drawing<any>>(drawn: M): M {
  const atoms = drawn.atoms as StackedAtom[];
  if (!atoms.some((a) => a.stack && !a.stack.spread)) return drawn;
  const marked = recordsShownOf(atoms);
  const show = showing(atoms, (stack) => marked[stack]);
  return without(drawn, new Set(atoms.filter((a) => a.stack && !a.stack.spread && show.get(a.stack.id) !== a.stack.record).map((a) => a.id)));
}

/**
 * A drawing carried, apart: its atoms of no stack of drawings, and each
 * record of each stack - its stacks in order, their records in theirs -
 * each with the bonds among its atoms, and its title.
 */
export function recordDrawings<M extends Drawing<any>>(drawn: M): { loose: M; stacked: { model: M; title?: string }[] } {
  const atoms = drawn.atoms as StackedAtom[];
  if (!atoms.some((a) => a.stack)) return { loose: drawn, stacked: [] };
  const only = (ids: ReadonlySet<number>) =>
    ({ ...drawn, atoms: atoms.filter((a) => ids.has(a.id)), bonds: drawn.bonds.filter((b) => ids.has(b.a) && ids.has(b.b)) }) as M;
  const stacks = [...new Set(atoms.flatMap((a) => (a.stack ? [a.stack.id] : [])))].sort((p, q) => p - q);
  return {
    loose: only(new Set(atoms.filter((a) => !a.stack).map((a) => a.id))),
    stacked: stacks.flatMap((stack) => recordsOf(drawn, stack).map((r) => ({ model: only(new Set(r.atoms)), ...(r.title ? { title: r.title } : {}) }))),
  };
}

/** Which record each stack carried shows, as its atoms are marked: by the stack's id. */
export function recordsShownOf(atoms: readonly StackedAtom[]): Record<number, number> {
  const out: Record<number, number> = {};
  for (const a of atoms) if (a.stack?.shown && !a.stack.spread) out[a.stack.id] = a.stack.record;
  return out;
}

/**
 * Which record each stack of drawings carried in and added shows - the one
 * its atoms marked (`carried`), else its first - by the stack's id as it is
 * numbered once added: the added atoms found in `model` by the ids they
 * were given (`idOf`).
 */
export function recordsShownAdded(carried: readonly StackedAtom[], model: Pick<Drawing, "atoms">, idOf: (id: number) => number | undefined): Record<number, number> {
  if (!carried.some((a) => a.stack)) return {};
  const at = new Map(model.atoms.map((a) => [a.id, a]));
  const out: Record<number, number> = {};
  const marked = new Set<number>();
  for (const a of carried) {
    const id = idOf(a.id);
    const s = id != null ? at.get(id)?.stack : undefined;
    if (!s || s.spread || marked.has(s.id)) continue;
    if (a.stack?.shown) marked.add(s.id);
    if (a.stack?.shown || out[s.id] == null || s.record < out[s.id]) out[s.id] = s.record;
  }
  return out;
}

/** A record's place in its stack, how many records the stack has and which - an atom's of a stack not laid out as a grid; else null. */
export function placeOfRecord(model: Pick<Drawing, "atoms">, atom: StackedAtom): { index: number; count: number; records: number[]; title?: string } | null {
  const s = atom.stack;
  if (!s || s.spread) return null;
  const records = recordsOf(model, s.id);
  if (records.length < 2) return null;
  const index = records.findIndex((r) => r.record === s.record);
  return { index, count: records.length, records: records.map((r) => r.record), ...(records[index]?.title ? { title: records[index].title } : {}) };
}

/** The first id a stack of drawings added to these atoms can go by. */
export function freshRecordsId(atoms: readonly StackedAtom[]): number {
  let most = 0;
  for (const a of atoms) if (a.stack && a.stack.id > most) most = a.stack.id;
  return most + 1;
}

/**
 * A file's records drawn flat (`records`, each one's atoms by id), as a
 * stack `stack`: each record's atoms told their stack, record and title, and
 * each record moved to stand where the whole drawing stood - its middle on
 * the drawing's.
 */
export function stackedRecords<A extends StackedAtom, M extends { atoms: A[] }>(model: M, records: readonly { atoms: number[]; title?: string }[], stack = 1): M {
  if (records.length < 2) return model;
  const of = new Map<number, number>();
  records.forEach((r, k) => r.atoms.forEach((id) => of.set(id, k)));
  const at = new Map(model.atoms.map((a) => [a.id, a]));
  const middles = records.map((r) => boxMiddle(boxOf(r.atoms.flatMap((id) => (at.has(id) ? [at.get(id)!] : [])))));
  const all = boxMiddle(boxOf(model.atoms));
  return {
    ...model,
    atoms: model.atoms.map((a) => {
      const k = of.get(a.id);
      if (k == null) return a;
      const title = records[k].title;
      return { ...a, x: a.x - middles[k].x + all.x, y: a.y - middles[k].y + all.y, stack: { id: stack, record: k, ...(title ? { title } : {}) } };
    }),
  };
}

/**
 * Atoms brought into a drawing - a paste, a file added - their stacks
 * numbered after the drawing's own (from `first`), and none of them marked
 * shown: a stack of one record - one copied out of its stack - is that
 * record alone.
 */
export function addedStacks<A extends StackedAtom>(atoms: readonly A[], first: number): A[] {
  const records = new Map<number, Set<number>>();
  for (const a of atoms) if (a.stack) (records.get(a.stack.id) ?? records.set(a.stack.id, new Set()).get(a.stack.id)!).add(a.stack.record);
  if (!records.size) return atoms as A[];
  const ids = new Map<number, number>();
  let next = first;
  for (const [id, r] of records) if (r.size > 1) ids.set(id, next++);
  return atoms.map((a) => {
    if (!a.stack) return a;
    const id = ids.get(a.stack.id);
    const { stack: _stack, ...rest } = a;
    if (id == null) return rest as A;
    const { shown: _shown, ...stack } = a.stack;
    return { ...a, stack: { ...stack, id } };
  });
}

/** Atoms as the document keeps them: none marked shown - which a stack shows is the view's. */
export function unmarked<A extends StackedAtom>(atoms: readonly A[]): A[] {
  if (!atoms.some((a) => a.stack?.shown)) return atoms as A[];
  return atoms.map((a) => {
    if (!a.stack?.shown) return a;
    const { shown: _shown, ...stack } = a.stack;
    return { ...a, stack };
  });
}

/** Close enough to where it was to be still. */
const STILL = 1e-9;

/**
 * The drawing as an edit leaves it (`before` it, as it was), its stacks
 * kept whole: an atom drawn onto a record's - bonded to it, however far
 * along - of that record, and records bonded together one record (the
 * first); a stack left with one record that record alone; and a record
 * moved whole, every atom alike, while the stack's others stayed, taking
 * them with it - the record shown carried, its stack goes with it. The
 * drawing itself where none of that is so.
 */
export function settledRecords<M extends Drawing<any>>(model: M, before?: Drawing<any>): M {
  const atoms = model.atoms as StackedAtom[];
  if (!atoms.some((a) => a.stack)) return model;
  // the parts the bonds make, each of the record of its first stacked atom
  const index = new Map(atoms.map((a, i) => [a.id, i]));
  const root = atoms.map((_, i) => i);
  const find = (i: number): number => {
    while (root[i] !== i) i = root[i] = root[root[i]];
    return i;
  };
  for (const b of model.bonds) {
    const i = index.get(b.a);
    const j = index.get(b.b);
    if (i == null || j == null) continue;
    const [p, q] = [find(i), find(j)];
    if (p !== q) root[Math.max(p, q)] = Math.min(p, q);
  }
  const partOf = new Map<number, AtomStack>();
  for (let i = 0; i < atoms.length; i++) {
    const s = atoms[i].stack;
    if (!s) continue;
    const r = find(i);
    const has = partOf.get(r);
    if (!has || s.id < has.id || (s.id === has.id && s.record < has.record)) partOf.set(r, s);
  }
  let changed = false;
  let next = atoms.map((a, i) => {
    const s = partOf.get(find(i));
    if (!s || (a.stack && a.stack.id === s.id && a.stack.record === s.record && !a.stack.shown)) return a;
    changed = true;
    const { shown: _shown, ...kept } = s;
    return { ...a, stack: kept };
  });
  // a stack of one record: that record alone
  const records = new Map<number, Set<number>>();
  for (const a of next) if (a.stack) (records.get(a.stack.id) ?? records.set(a.stack.id, new Set()).get(a.stack.id)!).add(a.stack.record);
  if ([...records.values()].some((r) => r.size < 2)) {
    changed = true;
    next = next.map((a) => {
      if (!a.stack || records.get(a.stack.id)!.size > 1) return a;
      const { stack: _stack, ...rest } = a;
      return rest as StackedAtom;
    });
  }
  // a record moved whole, the rest of its stack where it was: they go with it
  if (before) {
    const was = new Map((before.atoms as StackedAtom[]).map((a) => [a.id, a]));
    const moves = new Map<number, Map<number, { dx: number; dy: number } | null | "still">>();
    for (const a of next) {
      const s = a.stack;
      if (!s || s.spread) continue;
      const w = was.get(a.id);
      const byRecord = moves.get(s.id) ?? moves.set(s.id, new Map()).get(s.id)!;
      const m = byRecord.get(s.record);
      if (m === null) continue;
      if (!w) {
        byRecord.set(s.record, null);
        continue;
      }
      const dx = a.x - w.x;
      const dy = a.y - w.y;
      const still = Math.abs(dx) <= STILL && Math.abs(dy) <= STILL;
      if (m === undefined) byRecord.set(s.record, still ? "still" : { dx, dy });
      else if (m === "still" ? !still : Math.abs(m.dx - dx) > STILL || Math.abs(m.dy - dy) > STILL) byRecord.set(s.record, null);
    }
    const carry = new Map<number, { dx: number; dy: number; record: number }>();
    for (const [stack, byRecord] of moves) {
      const moved = [...byRecord].filter(([, m]) => m !== "still");
      if (moved.length !== 1 || byRecord.size < 2) continue;
      const [record, m] = moved[0];
      if (m && m !== "still") carry.set(stack, { ...m, record });
    }
    if (carry.size) {
      changed = true;
      next = next.map((a) => {
        const c = a.stack && !a.stack.spread ? carry.get(a.stack.id) : undefined;
        return c && a.stack!.record !== c.record ? { ...a, x: a.x + c.dx, y: a.y + c.dy } : a;
      });
    }
  }
  return changed ? ({ ...model, atoms: next } as M) : model;
}

/** The box round some atoms. */
function boxOf(atoms: readonly { x: number; y: number }[]): { x0: number; x1: number; y0: number; y1: number } {
  let [x0, x1, y0, y1] = [Infinity, -Infinity, Infinity, -Infinity];
  for (const a of atoms) [x0, x1, y0, y1] = [Math.min(x0, a.x), Math.max(x1, a.x), Math.min(y0, a.y), Math.max(y1, a.y)];
  return { x0, x1, y0, y1 };
}
const boxMiddle = (b: ReturnType<typeof boxOf>) => ({ x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 });

/** Each record's box, of a stack's records. */
function recordBoxes(model: Pick<Drawing, "atoms">, records: readonly Record_[]) {
  const at = new Map(model.atoms.map((a) => [a.id, a]));
  return records.map((r) => boxOf(r.atoms.flatMap((id) => (at.has(id) ? [at.get(id)!] : []))));
}

/**
 * How far each record of a stack moves, by record, laid out as a grid where
 * it stands - round the middle of the records' middles: in rows about as many as its columns, left to right and
 * downwards, each cell as wide as the widest record and as tall as the
 * tallest, with two bonds' room between.
 */
export function recordsGrid(model: Pick<Drawing, "atoms">, stack: number): Map<number, { dx: number; dy: number }> {
  const records = recordsOf(model, stack);
  const moves = new Map<number, { dx: number; dy: number }>();
  if (!records.length) return moves;
  const boxes = recordBoxes(model, records);
  const n = records.length;
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  const w = Math.max(...boxes.map((b) => b.x1 - b.x0)) + 2 * NOMINAL_BOND_LENGTH;
  const h = Math.max(...boxes.map((b) => b.y1 - b.y0)) + 2 * NOMINAL_BOND_LENGTH;
  const mid = middleOf(boxes.map(boxMiddle));
  const x0 = mid.x - ((cols - 1) * w) / 2;
  const y0 = mid.y + ((rows - 1) * h) / 2;
  records.forEach((r, k) => {
    const c = boxMiddle(boxes[k]);
    moves.set(r.record, { dx: x0 + (k % cols) * w - c.x, dy: y0 - Math.floor(k / cols) * h - c.y });
  });
  return moves;
}

/** How far each record of a stack laid out as a grid moves, by record, stacked again where the grid stands: each one's middle on the middle of theirs - where it stood as it was laid out, its last row short or not. */
export function recordsGathered(model: Pick<Drawing, "atoms">, stack: number): Map<number, { dx: number; dy: number }> {
  const records = recordsOf(model, stack);
  const moves = new Map<number, { dx: number; dy: number }>();
  if (!records.length) return moves;
  const boxes = recordBoxes(model, records);
  const mid = middleOf(boxes.map(boxMiddle));
  records.forEach((r, k) => {
    const c = boxMiddle(boxes[k]);
    moves.set(r.record, { dx: mid.x - c.x, dy: mid.y - c.y });
  });
  return moves;
}
