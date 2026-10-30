/**
 * A workflow's parts as the document holds them (docs/WORKFLOWS.md): sets,
 * steps and wires, numbered from one counter - each change an edit to the
 * document, so that undo takes it back and Save keeps it.
 */
import type { ChartValue } from "../../../../lib/chart";
import type { DiagramValue } from "../../../../lib/energyDiagram";
import type { NumberValue, Table } from "../../../../lib/table";
import type { WorkspaceDocument } from "../document";
import type { DrawnModel, Member, StepRunKept, WireEnd, WorkflowSet, WorkflowStep } from "../store/types";
import type { OptionValues } from "../../../../lib/options";
import { inside, lyingIn, membersOf, placesOf, readingOrder, recordOn, setMembers, structureMember, structuresOf, type Frame } from "./entries";
import { drawnBox } from "../../../../utils/importers";
import { CHART_PX, NAME_DOWN, PX, SET_PAD, SET_TOP, TABLE_PX, tableBodyPx } from "./look";
import { canWire, resultOf, wireInto } from "./flow";
import { exitsOf, ONE_INPUT, type StepKind } from "./kinds";
import { byOf, inputsFor } from "./doers";
import { CARD_H, CARD_W, GAP, BETWEEN } from "./look";
import { placeBelow } from "./place";

const idOf = (doc: WorkspaceDocument) => doc.nextWorkflowId ?? 1;

/** A frame with its corners in order: x0 left of x1, y0 below y1. */
export const framed = (f: Frame): Frame => ({ x0: Math.min(f.x0, f.x1), y0: Math.min(f.y0, f.y1), x1: Math.max(f.x0, f.x1), y1: Math.max(f.y0, f.y1) });

/** `doc` with a set round `frame`, holding what lies inside it, in the order it lies; it is numbered `nextWorkflowId`. Made by a step, it says so; named, it has the name. */
export function addSet(doc: WorkspaceDocument, frame: Frame, made?: WorkflowSet["made"], name?: string): WorkspaceDocument {
  const id = idOf(doc);
  const f = framed(frame);
  const set: WorkflowSet = { id, ...f, ...(made ? { made } : {}), ...(name ? { name } : {}), members: membersOf(lyingIn(doc, f)) };
  return { ...doc, nextWorkflowId: id + 1, sets: [...(doc.sets ?? []), set] };
}

/**
 * `doc` with a set holding `table` - read from a file, a text on the page -
 * put down with its middle at `at`, as large as its first rows take, named
 * `name`: a chemist's set, holding nothing else.
 */
/** How large a set holding a table is put down, on the page, at the most: its first rows, and what it is. */
export const TABLE_SET = { w: TABLE_PX.w * PX + 2 * SET_PAD, h: SET_TOP + TABLE_PX.h * PX + SET_PAD };

/** How large a set holding `table` is made: as wide as a table's set, and as tall as its body draws (look `tableBodyPx`) under its name - no taller, nothing under its last line. */
export function tableSetSize(table: Pick<Table, "rows">): { w: number; h: number } {
  return { w: TABLE_SET.w, h: 2 * NAME_DOWN + tableBodyPx(table.rows.length) * PX + SET_PAD };
}

export function addTableSet(doc: WorkspaceDocument, at: { x: number; y: number }, table: Table, name?: string): WorkspaceDocument {
  const { w, h } = tableSetSize(table);
  const id = idOf(doc);
  const set: WorkflowSet = { id, x0: at.x - w / 2, x1: at.x + w / 2, y0: at.y - h / 2, y1: at.y + h / 2, ...(name ? { name } : {}), members: [], table };
  return { ...doc, nextWorkflowId: id + 1, sets: [...(doc.sets ?? []), set] };
}

/** A set's members, as given: a step's result set holding what the step made, in its order - on the page, so no collection of its own; and how many of them did not read, where some did not (`WorkflowSet.unread`). */
export function holdMembers(doc: WorkspaceDocument, id: number, members: Member[], unread?: number): WorkspaceDocument {
  return withSet(doc, id, ({ collection: _c, drawnCollection: _d, unread: _u, ...b }) => ({ ...b, members, ...(unread ? { unread } : {}) }));
}

/**
 * `doc` with set `id` holding, besides the structures drawn on the page
 * among its members, `rest` - those after them in the step's order that it
 * does not show (look `DRAWN_ON_PAGE`) - off the page, in the set itself
 * (`WorkflowSet.drawnCollection`).
 */
export function holdRest(doc: WorkspaceDocument, id: number, rest: readonly DrawnModel[]): WorkspaceDocument {
  return rest.length ? withSet(doc, id, (b) => ({ ...b, drawnCollection: [...rest] })) : doc;
}

/**
 * A step's result set holding what the step made itself, in its order - its
 * molecules in 3D (`WorkflowSet.collection`) or its structures drawn
 * (`WorkflowSet.drawnCollection`): none of the page's among its members.
 */
export function holdCollection(
  doc: WorkspaceDocument,
  id: number,
  held: { collection: NonNullable<WorkflowSet["collection"]> } | { drawnCollection: NonNullable<WorkflowSet["drawnCollection"]> },
  unread?: number,
): WorkspaceDocument {
  return withSet(doc, id, ({ unread: _u, collection: _c, drawnCollection: _d, ...b }) => ({ ...b, members: [], ...held, ...(unread ? { unread } : {}) }));
}

/** How large a set holding a chart is made, on the page: its axes, labels and points. */
export const CHART_SET = { w: CHART_PX.w * PX + 2 * SET_PAD, h: SET_TOP + CHART_PX.h * PX + SET_PAD };

/** How large a set holding a number is made, on the page: its title and its value, on one line, as an empty set's is. */
export const NUMBER_SET = { w: 220 * PX + 2 * SET_PAD, h: SET_TOP };

/** A step's result set holding a number it gave (`WorkflowSet.number`): nothing on the page among its members. */
export function holdNumber(doc: WorkspaceDocument, id: number, number: NumberValue): WorkspaceDocument {
  return withSet(doc, id, ({ collection: _c, unread: _u, chart: _h, table: _t, ...b }) => ({ ...b, members: [], number }));
}

/** A step's result set holding nothing: no members, and no chart, table, number or molecules held in it - as a step that had nothing to work on leaves it (run `ranEmpty`). */
export function holdNothing(doc: WorkspaceDocument, id: number): WorkspaceDocument {
  return withSet(doc, id, ({ collection: _c, drawnCollection: _d, unread: _u, chart: _h, table: _t, number: _n, ...b }) => ({ ...b, members: [] }));
}

/** A step's result set holding a chart it made (`WorkflowSet.chart`): nothing on the page among its members, and no molecules of its own. */
export function holdChart(doc: WorkspaceDocument, id: number, chart: ChartValue | DiagramValue): WorkspaceDocument {
  return withSet(doc, id, ({ collection: _c, unread: _u, ...b }) => ({ ...b, members: [], chart }));
}

/** A step's result set holding a table it made (`WorkflowSet.table`; a Reaction's bond changes): nothing on the page among its members, and no molecules of its own. */
export function holdTable(doc: WorkspaceDocument, id: number, table: Table): WorkspaceDocument {
  return withSet(doc, id, ({ collection: _c, unread: _u, ...b }) => ({ ...b, members: [], table }));
}

/** A result set of structures drawn with the atoms its step put on the page (`WorkflowSet.put`) - none, where it put none. */
export function heldPut(doc: WorkspaceDocument, id: number, atoms: readonly number[]): WorkspaceDocument {
  return withSet(doc, id, ({ put: _was, ...b }) => (atoms.length ? { ...b, put: [...atoms] } : b));
}

/** A step's result set kept in the workspace's file, or not (*Don't keep in the file*): a chemist's set is always kept. */
/** A step's jobs' raw outputs kept in the workspace's file, or not (*Don't keep raw outputs*, workflow/keptJobs). */
export function keepRawOutputs(doc: WorkspaceDocument, id: number, keep: boolean): WorkspaceDocument {
  return {
    ...doc,
    steps: (doc.steps ?? []).map((s) => {
      if (s.id !== id) return s;
      const { keepRaw: _, ...rest } = s;
      return keep ? rest : { ...rest, keepRaw: false as const };
    }),
  };
}

export function keepSet(doc: WorkspaceDocument, id: number, keep: boolean): WorkspaceDocument {
  const set = doc.sets?.find((b) => b.id === id);
  if (!set?.made || (set.keep !== false) === keep) return doc;
  const { keep: _was, ...rest } = set;
  return { ...doc, sets: (doc.sets ?? []).map((b) => (b.id === id ? (keep ? rest : { ...rest, keep: false as const }) : b)) };
}

/** A chemist's set named anew - a step's set is named for what made it - its name taken away where the new one is empty. */
export function renameSet(doc: WorkspaceDocument, id: number, name: string): WorkspaceDocument {
  const set = doc.sets?.find((b) => b.id === id);
  if (!set || set.made || (set.name ?? "") === name.trim()) return doc;
  const { name: _was, ...rest } = set;
  const next = name.trim() ? { ...rest, name: name.trim() } : rest;
  return { ...doc, sets: (doc.sets ?? []).map((b) => (b.id === id ? next : b)) };
}

function withSet(doc: WorkspaceDocument, id: number, change: (b: WorkflowSet) => WorkflowSet): WorkspaceDocument {
  const sets = doc.sets ?? [];
  const i = sets.findIndex((b) => b.id === id);
  if (i < 0) return doc;
  const next = change(sets[i]);
  return next === sets[i] ? doc : { ...doc, sets: sets.map((b, k) => (k === i ? next : b)) };
}

/** A set's frame, sized anew. */
export function resizeSet(doc: WorkspaceDocument, id: number, frame: Frame): WorkspaceDocument {
  const f = framed(frame);
  return withSet(doc, id, (b) => (b.x0 === f.x0 && b.y0 === f.y0 && b.x1 === f.x1 && b.y1 === f.y1 ? b : { ...b, ...f }));
}

/** A set moved by (dx, dy), with all it holds: the structures drawn, the molecules in 3D and the pictures inside it. */
export function moveSet(doc: WorkspaceDocument, id: number, dx: number, dy: number): WorkspaceDocument {
  const set = doc.sets?.find((b) => b.id === id);
  if (!set || (dx === 0 && dy === 0)) return doc;
  const { structures, molecules, pictures } = setMembers(doc, set);
  const atoms = new Set(structures.flat());
  const moved = new Set(molecules);
  const shown = new Set(pictures);
  return {
    ...withSet(doc, id, (b) => ({ ...b, x0: b.x0 + dx, x1: b.x1 + dx, y0: b.y0 + dy, y1: b.y1 + dy })),
    model: atoms.size ? { ...doc.model, atoms: doc.model.atoms.map((a) => (atoms.has(a.id) ? { ...a, x: a.x + dx, y: a.y + dy } : a)) } : doc.model,
    molecules3d: moved.size ? (doc.molecules3d ?? []).map((m) => (moved.has(m.id) ? { ...m, at: { ...m.at, x: m.at.x + dx, y: m.at.y + dy } } : m)) : doc.molecules3d,
    pictures: shown.size ? (doc.pictures ?? []).map((p) => (shown.has(p.id) ? { ...p, x: p.x + dx, y: p.y + dy } : p)) : doc.pictures,
  };
}

/** `doc` without a set - and the wires from it: what it held stays where it is. */
export function removeSet(doc: WorkspaceDocument, id: number): WorkspaceDocument {
  const sets = (doc.sets ?? []).filter((b) => b.id !== id);
  if (sets.length === (doc.sets ?? []).length) return doc;
  return { ...doc, sets, wires: (doc.wires ?? []).filter((w) => !("set" in w.from && w.from.set === id)) };
}

/** `doc` with a step of `kind`, done by `by` - Meno, or a plugin - whose card's top left is at (x, y); it is numbered `nextWorkflowId`. */
export function addStep(doc: WorkspaceDocument, kind: StepKind, x: number, y: number, options?: OptionValues, by?: string): WorkspaceDocument {
  const id = idOf(doc);
  const step: WorkflowStep = { id, kind, x, y, ...(by ? { by } : {}), ...(options && Object.keys(options).length ? { options } : {}) };
  return withExits({ ...doc, nextWorkflowId: id + 1, steps: [...(doc.steps ?? []), step] }, id);
}

/**
 * `doc` with a set for each of a step's exits it has none for: every exit is
 * a result set of its own, made with the step and empty until it runs, so
 * that what a step will give can be wired on before it has run
 * (docs/WORKFLOWS-FOUNDATION.md, *Steps, ports and exits*). Each stands to
 * the right of the card, the first level with its top and a second under
 * it, half as high - or lower, where something is there already: clear of
 * the page's sets, cards, structures, molecules and wires (place
 * `placeBelow`).
 */
export function withExits(doc: WorkspaceDocument, stepId: number): WorkspaceDocument {
  const step = doc.steps?.find((s) => s.id === stepId);
  if (!step) return doc;
  let next = doc;
  let top = step.y;
  for (const exit of exitsOf(step.kind)) {
    const high = exit.of ? CARD_H / 2 : CARD_H;
    const was = resultOf(next, step.id, exit.id);
    // (holding nothing yet: what lies under a new frame is not what its step made)
    if (!was) {
      const setId = next.nextWorkflowId ?? 1;
      const frame = placeBelow(next, step.x + CARD_W + GAP, top, CARD_W, high, { step: step.id });
      next = holdMembers(addSet(next, frame, { step: step.id, exit: exit.id }), setId, []);
      top = frame.y0 - BETWEEN;
    } else top = was.y0 - BETWEEN;
  }
  return next;
}

function withStep(doc: WorkspaceDocument, id: number, change: (s: WorkflowStep) => WorkflowStep): WorkspaceDocument {
  const steps = doc.steps ?? [];
  const i = steps.findIndex((s) => s.id === id);
  if (i < 0) return doc;
  const next = change(steps[i]);
  return next === steps[i] ? doc : { ...doc, steps: steps.map((s, k) => (k === i ? next : s)) };
}

export function moveStep(doc: WorkspaceDocument, id: number, x: number, y: number): WorkspaceDocument {
  return withStep(doc, id, (s) => (s.x === x && s.y === y ? s : { ...s, x, y }));
}

/** A step's options changed - or its kind, to another who does it fills, with the options it takes for that one. */
export function updateStep(doc: WorkspaceDocument, id: number, patch: { options?: OptionValues; kind?: StepKind }): WorkspaceDocument {
  return withStep(doc, id, (s) => {
    const next: WorkflowStep = { ...s, ...(patch.kind ? { kind: patch.kind } : {}), ...(patch.options ? { options: patch.options } : {}) };
    return JSON.stringify(next) === JSON.stringify(s) ? s : next;
  });
}

/** What a step did when it ran, kept with it. */
export function setRan(doc: WorkspaceDocument, id: number, ran: NonNullable<WorkflowStep["ran"]>): WorkspaceDocument {
  return withStep(doc, id, (s) => ({ ...s, ran }));
}

/** A step's earlier runs, newest first - none, where it keeps none. */
export function withStepRuns(doc: WorkspaceDocument, id: number, runs: StepRunKept[]): WorkspaceDocument {
  return withStep(doc, id, (s) => {
    if (runs.length) return { ...s, runs };
    if (!s.runs) return s;
    const { runs: _r, ...rest } = s;
    return rest;
  });
}

/** A step's run while its jobs wait or run - or, ended, none: the step as it was otherwise. */
export function setRunning(doc: WorkspaceDocument, id: number, running: WorkflowStep["running"]): WorkspaceDocument {
  return withStep(doc, id, (s) => {
    if (running) return { ...s, running };
    if (!s.running) return s;
    const { running: _r, ...rest } = s;
    return rest;
  });
}

/** The steps running in `now` that `then` - what an undo or a redo would come to - has not: an undo that takes them away asks first, as deleting them does. */
export function runningGone(now: WorkspaceDocument, then: WorkspaceDocument | undefined): WorkflowStep[] {
  if (!then) return [];
  return (now.steps ?? []).filter((s) => s.running && !(then.steps ?? []).some((x) => x.id === s.id));
}

/**
 * `doc` without a step and the wires into it. A set its exits made that
 * holds something - molecules on the page, or a large set's own
 * (`collection`) - stays, with what it holds: a set like any the chemist
 * drew (of conformers, where its molecules' frames are a conformer search's:
 * entries `holdsOf`), and the wires out of it with it; one that holds
 * nothing - its step never ran, or gave nothing there - goes with the step,
 * and the wires out of it: an empty frame the chemist never drew is not
 * left behind. A set that stays and was kept out of the workspace's file
 * (*Don't keep in the file*) is kept in it in full from then on: the step
 * that could make its molecules again is gone, and a chemist's set is
 * always kept.
 */
export function removeStep(doc: WorkspaceDocument, id: number): WorkspaceDocument {
  const steps = (doc.steps ?? []).filter((s) => s.id !== id);
  if (steps.length === (doc.steps ?? []).length) return doc;
  const empty = new Set((doc.sets ?? []).filter((b) => b.made?.step === id && !b.members?.length && !b.collection?.length && !b.drawnCollection?.length && !b.unread).map((b) => b.id));
  return {
    ...doc,
    steps,
    wires: (doc.wires ?? []).filter((w) => w.to.step !== id && !empty.has(w.from.set)),
    // (a set it made, kept, a chemist's - and kept in the file in full, its *Don't keep in the file* gone with the step that could make it again, and the atoms it put on the page the chemist's, no run to take them away)
    sets: (doc.sets ?? []).filter((b) => !empty.has(b.id)).map((b) => (b.made?.step === id ? (({ made: _m, keep: _k, put: _p, ...rest }) => rest)(b) : b)),
  };
}

/** `doc` with a wire from `from` into the step `to` - in place of one it had - where it may go there (flow `canWire`). */
export function connect(doc: WorkspaceDocument, from: WireEnd, to: number, into?: string): WorkspaceDocument {
  // (no input named: the first of the step's that takes what comes)
  const step = doc.steps?.find((s) => s.id === to);
  const inputs = step ? inputsFor(step.kind, byOf(step)) : undefined;
  if (inputs && !inputs.length) return doc;
  const port = into ?? (inputs ? (inputs.find((p) => canWire(doc, from, to, p.id))?.id ?? inputs[0].id) : ONE_INPUT);
  if (!canWire(doc, from, to, port)) return doc;
  const was = wireInto(doc, to, port);
  if (was && JSON.stringify(was.from) === JSON.stringify(from)) return doc;
  const id = idOf(doc);
  // (one wire to an input: a new one takes the place of what was there)
  return { ...doc, nextWorkflowId: id + 1, wires: [...(doc.wires ?? []).filter((w) => !(w.to.step === to && w.to.port === port)), { id, from, to: { step: to, port } }] };
}

export function removeWire(doc: WorkspaceDocument, id: number): WorkspaceDocument {
  const wires = (doc.wires ?? []).filter((w) => w.id !== id);
  return wires.length === (doc.wires ?? []).length ? doc : { ...doc, wires };
}

/**
 * `doc` after an edit, each set's members as the edit leaves them
 * (docs/WORKFLOWS-FOUNDATION.md, *Members are explicit*): the frame's
 * gesture is the edit.
 * - A member gone from the page is gone from the set; a structure member
 *   follows its atoms - drawn on, split, joined to another.
 * - What the edit took out of a frame - its middle inside the frame before
 *   and outside it now, moved or the frame resized - leaves the set.
 * - What the edit brought into a chemist's set - outside before (or not
 *   there at all) and inside now - joins it, at its place in reading order
 *   among the members. A step's result set takes in nothing: what it holds
 *   is its step's.
 * - What stays inside or outside keeps its place, or its absence: moved
 *   within the frame, a member keeps its place in the order.
 * A set with no members yet (one read from a file saved before sets kept
 * them) holds what lies inside its frame, once.
 */
export function membersSettled(doc: WorkspaceDocument, before: WorkspaceDocument): WorkspaceDocument {
  if (!doc.sets?.length) return doc;
  const samePage = doc.model === before.model && doc.molecules3d === before.molecules3d && doc.pictures === before.pictures;
  if (samePage && doc.sets === before.sets) return doc;
  const now = placesOf(doc);
  const wasAtom = new Map(before.model.atoms.map((a) => [a.id, a]));
  const wasMiddle = (ids: readonly number[]) => {
    const at = ids.flatMap((id) => (wasAtom.has(id) ? [wasAtom.get(id)!] : []));
    return at.length ? { x: at.reduce((s, a) => s + a.x, 0) / at.length, y: at.reduce((s, a) => s + a.y, 0) / at.length } : null;
  };
  const was = placesOf(before);
  let changed = false;
  const sets = doc.sets.map((set) => {
    if (!set.members) {
      changed = true;
      return membersLying(doc, set);
    }
    const prior = before.sets?.find((b) => b.id === set.id);
    if (samePage && prior && prior.x0 === set.x0 && prior.x1 === set.x1 && prior.y0 === set.y0 && prior.y1 === set.y1 && prior.members === set.members) return set;
    // (each member as the page has it now: a structure as the structures that hold its atoms, in its place)
    const held = setMembers(doc, set);
    type Placed = { member: Member; at: { x: number; y: number }; wasIn: boolean };
    const nowAt = new Map(now.structures.map((s) => [s.ids[0], s]));
    const list: Placed[] = [
      ...held.structures.map((ids, i) => {
        const at = nowAt.get(ids[0])!.at;
        const w = wasMiddle(ids);
        // (with its record: a step's, which a structure keeps however it moves)
        return { member: structureMember(ids, held.records[i]), at, wasIn: !!(prior && w && inside(prior, w)) };
      }),
      ...held.molecules.map((id) => {
        const w = was.molecules.get(id);
        return { member: { molecule: id } as Member, at: now.molecules.get(id)!, wasIn: !!(prior && w && inside(prior, w)) };
      }),
      ...held.pictures.map((id) => {
        const w = was.pictures.get(id);
        return { member: { picture: id } as Member, at: now.pictures.get(id)!, wasIn: !!(prior && w && inside(prior, w)) };
      }),
    ];
    // (members in the order the set had them: structures, molecules and pictures interleaved as listed)
    const rank = new Map<string, number>();
    set.members.forEach((m, k) => {
      if ("structure" in m) m.structure.forEach((id) => rank.set(`s${id}`, rank.get(`s${id}`) ?? k));
      else rank.set("molecule" in m ? `m${m.molecule}` : `p${m.picture}`, k);
    });
    const keyOf = (m: Member) => ("structure" in m ? Math.min(...m.structure.map((id) => rank.get(`s${id}`) ?? Infinity)) : (rank.get("molecule" in m ? `m${m.molecule}` : `p${m.picture}`) ?? Infinity));
    list.sort((p, q) => keyOf(p.member) - keyOf(q.member));
    // what the edit took out
    let kept = prior ? list.filter((p) => !(p.wasIn && !inside(set, p.at))) : list;
    // what the edit brought into a chemist's set, each at its place in reading order - but one that holds its molecules itself (a large set its step left), or a table or a number, which takes in nothing: what it holds is its own
    if (!set.made && !set.collection && !set.table && !set.number && prior) {
      const isMember = new Set(kept.map((p) => ("structure" in p.member ? `s${p.member.structure[0]}` : "molecule" in p.member ? `m${p.member.molecule}` : `p${p.member.picture}`)));
      const heldAtoms = new Set(held.structures.flat());
      const add = (member: Member, at: { x: number; y: number }, w: { x: number; y: number } | null | undefined) => {
        if (!inside(set, at) || (w && inside(prior, w))) return;
        const k = kept.findIndex((p) => readingOrder(at, p.at) < 0);
        const entry = { member, at, wasIn: false };
        kept = k < 0 ? [...kept, entry] : [...kept.slice(0, k), entry, ...kept.slice(k)];
      };
      for (const s of now.structures) if (!s.ids.some((id) => heldAtoms.has(id))) add({ structure: s.ids }, s.at, wasMiddle(s.ids));
      for (const [id, at] of now.molecules) if (!isMember.has(`m${id}`)) add({ molecule: id }, at, was.molecules.get(id));
      for (const [id, at] of now.pictures) if (!isMember.has(`p${id}`)) add({ picture: id }, at, was.pictures.get(id));
    }
    const members = kept.map((p) => p.member);
    if (sameMembers(members, set.members)) return set;
    changed = true;
    return { ...set, members };
  });
  return changed ? { ...doc, sets } : doc;
}

/** `doc` with each set that has no members yet - one read from a file saved before sets kept them - holding what lies inside its frame: read once, as the workspace opens. */
export function membersFound(doc: WorkspaceDocument): WorkspaceDocument {
  if (!doc.sets?.some((b) => !b.members)) return doc;
  return { ...doc, sets: doc.sets.map((b) => (b.members ? b : membersLying(doc, b))) };
}

/**
 * A set holding what lies inside its frame: each structure a copy carried a
 * record for (`WorkflowSet.carried`) - the same atoms - with that record,
 * of the structure as it is drawn now.
 */
function membersLying(doc: WorkspaceDocument, { carried, ...set }: WorkflowSet): WorkflowSet {
  const found = lyingIn(doc, set);
  const records = found.structures.map((ids) => {
    const of = new Set(ids);
    const c = carried?.find((x) => x.structure.length === ids.length && x.structure.every((id) => of.has(id)));
    return c && (c.record.of ? recordOn(c.record, doc.model, ids) : c.record);
  });
  return { ...set, members: membersOf({ ...found, records }) };
}

/** Whether two lists of members are the same, in the same order. */
function sameMembers(a: readonly Member[], b: readonly Member[]): boolean {
  return a.length === b.length && a.every((m, k) => JSON.stringify(m) === JSON.stringify(b[k]));
}

/** What made a set, said of it: the step, which of its exits, and what it holds. */
export function markMade(doc: WorkspaceDocument, id: number, made: NonNullable<WorkflowSet["made"]>): WorkspaceDocument {
  return withSet(doc, id, (b) => ({ ...b, made }));
}

/** The set a step's exit made, or - where the exit has none, a step read from a file written before its kind had it - one made now. */
export function setForExit(doc: WorkspaceDocument, step: WorkflowStep, exit: string): { doc: WorkspaceDocument; id: number } {
  const next = withExits(doc, step.id);
  return { doc: next, id: resultOf(next, step.id, exit)!.id };
}

/**
 * `doc` after an edit, its sets grown to keep inside them the structures
 * drawn on in them (docs/WORKFLOWS.md, *An input: a set from the
 * selection*): a structure that was in a set before the edit - its middle
 * inside the frame - and whose shape the edit changed - an atom added,
 * moved on its own, or made another element - is kept inside its frame,
 * its labels and all, the frame growing as far as it must. A structure
 * moved whole, or a frame sized anew, leaves the frame as it is: a
 * structure is dragged out of a set, and a set made smaller than what it
 * holds, on purpose.
 */
export function fitSets(doc: WorkspaceDocument, before: WorkspaceDocument): WorkspaceDocument {
  if (!doc.sets?.length || doc.model === before.model) return doc;
  const was = new Map(before.model.atoms.map((a) => [a.id, a]));
  const now = new Map(doc.model.atoms.map((a) => [a.id, a]));
  const shaped = structuresOf(doc.model).filter((ids) => {
    const atoms = ids.map((id) => now.get(id)!);
    if (atoms.some((a) => !was.has(a.id))) return true;
    const first = was.get(atoms[0].id)!;
    const dx = atoms[0].x - first.x;
    const dy = atoms[0].y - first.y;
    return atoms.some((a) => {
      const b = was.get(a.id)!;
      return a.el !== b.el || (a.charge ?? 0) !== (b.charge ?? 0) || Math.abs(a.x - b.x - dx) > 1e-9 || Math.abs(a.y - b.y - dy) > 1e-9;
    });
  });
  if (!shaped.length) return doc;
  let out = doc;
  for (const set of doc.sets) {
    const prior = before.sets?.find((b) => b.id === set.id);
    if (!prior) continue;
    const held = new Set(setMembers(before, prior).structures.flat());
    let frame: Frame = set;
    for (const ids of shaped) {
      if (!ids.some((id) => held.has(id))) continue;
      const atoms = new Set(ids);
      const b = drawnBox({ atoms: doc.model.atoms.filter((a) => atoms.has(a.id)), bonds: doc.model.bonds.filter((x) => atoms.has(x.a) && atoms.has(x.b)) });
      frame = {
        x0: Math.min(frame.x0, b.minX - SET_PAD),
        x1: Math.max(frame.x1, b.maxX + SET_PAD),
        y0: Math.min(frame.y0, b.minY - SET_PAD),
        y1: Math.max(frame.y1, b.maxY + SET_TOP),
      };
    }
    out = resizeSet(out, set.id, frame);
  }
  return out;
}
