/**
 * A workflow as a workspace file keeps it (docs/WORKFLOWS.md, *Saving and
 * sharing*): its sets, steps and wires as they are, by their ids - read
 * back as data, what does not read left out, and a wire whose ends are
 * not there with it.
 */
import type { Member, Model, Molecule3D, StepJob, StepRan, StepRunKept, StepRunning, Wire, WireEnd, WireTo, WorkflowSet, WorkflowStep } from "../store/types";
import { readCarried3D, readDrawn } from "../utils/copyPaste";
import type { OptionValues } from "../../../../lib/options";
import { KINDS, type SetHolds, type SetKind, type StepKind } from "./kinds";
import { SET_KINDS } from "../../../../lib/plugins/steps";
import { RUNS_KEPT } from "./model";
import { readRefused } from "./programs";

export type SavedWorkflow = { sets: WorkflowSet[]; steps: WorkflowStep[]; wires: Wire[] };

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isId = (v: unknown): v is number => Number.isInteger(v) && (v as number) > 0;
const SETS: readonly SetKind[] = SET_KINDS;

/** A name a kind gives an input or an exit: a short word, as kinds.ts has them. */
const isName = (v: unknown): v is string => typeof v === "string" && /^[a-z][a-z0-9-]{0,31}$/.test(v);

/**
 * A set's members as a file says them: a structure by its atoms' ids, a
 * molecule in 3D or a picture by its place in the file's list (utils/workspace
 * puts them back as the ids they are given when it opens). What does not
 * read is left out.
 */
function membersIn(v: unknown): Member[] | undefined {
  if (!Array.isArray(v)) return undefined;
  return v.flatMap((m: { structure?: unknown; molecule?: unknown; picture?: unknown }): Member[] => {
    if (Array.isArray(m?.structure) && m.structure.length && m.structure.every((id) => isId(id))) return [{ structure: m.structure as number[] }];
    if (Number.isInteger(m?.molecule) && (m.molecule as number) >= 0) return [{ molecule: m.molecule as number }];
    if (Number.isInteger(m?.picture) && (m.picture as number) >= 0) return [{ picture: m.picture as number }];
    return [];
  });
}

function readSet(v: unknown): WorkflowSet | null {
  const b = v as Partial<Record<keyof WorkflowSet, unknown>> | null;
  if (!b || !isId(b.id) || !isNum(b.x0) || !isNum(b.y0) || !isNum(b.x1) || !isNum(b.y1)) return null;
  const made = b.made as { step?: unknown; exit?: unknown; holds?: unknown } | undefined;
  return {
    id: b.id,
    x0: Math.min(b.x0, b.x1),
    y0: Math.min(b.y0, b.y1),
    x1: Math.max(b.x0, b.x1),
    y1: Math.max(b.y0, b.y1),
    // (a step's exit: which step and exit made it - and what it holds, once its step has run; not run yet, nothing)
    ...(made && isId(made.step) && isName(made.exit) && (made.holds == null || SETS.includes(made.holds as SetKind) || made.holds === "pictures")
      ? { made: { step: made.step, exit: made.exit, ...(made.holds != null ? { holds: made.holds as SetHolds } : {}) } }
      : {}),
    // (the name the chemist gave it, where they gave one)
    ...(typeof b.name === "string" && b.name.trim() ? { name: b.name } : {}),
    ...(() => {
      const members = membersIn(b.members);
      return members ? { members } : {};
    })(),
    // (the atoms its step put on the page, by id, as members' are: a result set's alone)
    ...(made && Array.isArray(b.put) && b.put.length && b.put.every((id) => isId(id)) ? { put: b.put as number[] } : {}),
    // (a large result set's collection, each molecule read as the page's are - those that do not read counted, with those its file already said had not)
    ...(() => {
      if (!Array.isArray(b.collection) || !made) return {};
      const collection = b.collection.flatMap((m) => carriedMolecule(m));
      const unread = b.collection.length - collection.length + (Number.isInteger(b.unread) && (b.unread as number) > 0 ? (b.unread as number) : 0);
      return collection.length || unread ? { collection, ...(unread ? { unread } : {}) } : {};
    })(),
    // (a result set kept out of its file, and what it held when it was saved)
    ...(b.keep === false && made ? { keep: false as const } : {}),
    ...(() => {
      const n = b.notKept as { count?: unknown; hash?: unknown } | undefined;
      return n && Number.isInteger(n.count) && (n.count as number) >= 0 && typeof n.hash === "string" ? { notKept: { count: n.count as number, hash: n.hash } } : {};
    })(),
  };
}

/** A job's id, as Meno makes them: a UUID. */
const JOB = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** A file's name in a job's folder: inside it. */
const IN_FOLDER = /^(?!\/)(?![A-Za-z]:)(?!.*(?:^|[\\/])\.\.?(?:[\\/]|$)).{1,200}$/;

function optionsIn(v: unknown): OptionValues {
  const options: OptionValues = {};
  if (v && typeof v === "object" && !Array.isArray(v)) {
    for (const [k, o] of Object.entries(v)) if (typeof o === "string" || typeof o === "boolean" || isNum(o)) options[k] = o;
  }
  return options;
}

function readRan(v: unknown): StepRan | undefined {
  const r = v as { at?: unknown; ok?: unknown; said?: unknown; input?: unknown; stopped?: unknown; took?: unknown; jobs?: unknown; kind?: unknown; options?: unknown } | undefined;
  if (!r || !isNum(r.at) || typeof r.ok !== "boolean" || typeof r.said !== "string" || typeof r.input !== "string") return undefined;
  const jobs = Array.isArray(r.jobs) ? r.jobs.filter((j): j is string => typeof j === "string" && JOB.test(j)) : [];
  const options = optionsIn(r.options);
  return {
    at: r.at,
    ok: r.ok,
    said: r.said,
    input: r.input,
    ...(r.stopped === true ? { stopped: true as const } : {}),
    ...(isNum(r.took) && r.took >= 0 ? { took: r.took } : {}),
    ...(jobs.length ? { jobs } : {}),
    ...(KINDS.some((k) => k.kind === r.kind) ? { kind: r.kind as StepKind } : {}),
    ...(Object.keys(options).length ? { options } : {}),
  };
}

/** A molecule in 3D a set or a run keeps, read as the page's are; none where it does not read. */
function carriedMolecule(m: unknown): Omit<Molecule3D, "id" | "at">[] {
  const read = readCarried3D({ ...(m as object), at: { x: 0, y: 0 } });
  if (!read) return [];
  const { at: _at, turn: _turn, frame: _frame, list: _list, shown: _shown, ...molecule } = read;
  return [molecule];
}

/** An earlier run a step keeps, as a file keeps it: what it did, its kind and options then, and what it gave - each molecule read as the page's are, each structure drawn as the page's drawing is. */
function readKept(v: unknown): StepRunKept | null {
  const ran = readRan(v);
  const r = v as { kind?: unknown; options?: unknown; results?: { molecules?: unknown; rest?: unknown; holds?: unknown; unread?: unknown; restUnread?: unknown; drawn?: { made?: unknown; rest?: unknown } } } | null;
  if (!ran || !KINDS.some((k) => k.kind === r?.kind)) return null;
  const options = optionsIn(r?.options);
  const res = r?.results;
  // (each exit's molecules read as the page's are - those that do not read counted, with those its file already said had not: never left out unsaid)
  const read = (list: unknown, was: unknown) => {
    const given: unknown[] = Array.isArray(list) ? list : [];
    const molecules = given.flatMap(carriedMolecule);
    return { molecules, unread: given.length - molecules.length + (Number.isInteger(was) && (was as number) > 0 ? (was as number) : 0) };
  };
  const { molecules, unread } = read(res?.molecules, res?.unread);
  const rest = read(res?.rest, res?.restUnread);
  const holds = SETS.includes(res?.holds as SetKind) ? (res!.holds as SetKind) : undefined;
  if (holds === "structures") {
    // (each structure read as the page's drawing is - those that do not read counted, as molecules are)
    const drawn = (list: unknown, was: unknown) => {
      const given: unknown[] = Array.isArray(list) ? list : [];
      const models = given.flatMap((m): Model[] => {
        const got = readDrawn({ atoms: (m as Model | null)?.atoms, bonds: (m as Model | null)?.bonds });
        return got?.atoms.length ? [{ atoms: got.atoms, bonds: got.bonds }] : [];
      });
      return { models, unread: given.length - models.length + (Number.isInteger(was) && (was as number) > 0 ? (was as number) : 0) };
    };
    const made = drawn(res?.drawn?.made, res?.unread);
    const aside = drawn(res?.drawn?.rest, res?.restUnread);
    return {
      ...ran,
      kind: r!.kind as StepKind,
      ...(Object.keys(options).length ? { options } : {}),
      ...(made.models.length || made.unread || aside.models.length || aside.unread
        ? { results: { molecules: [], rest: [], holds, drawn: { made: made.models, rest: aside.models }, ...(made.unread ? { unread: made.unread } : {}), ...(aside.unread ? { restUnread: aside.unread } : {}) } }
        : {}),
    };
  }
  return {
    ...ran,
    kind: r!.kind as StepKind,
    ...(Object.keys(options).length ? { options } : {}),
    ...(holds && (molecules.length || unread || rest.molecules.length || rest.unread)
      ? { results: { molecules, rest: rest.molecules, holds, ...(unread ? { unread } : {}), ...(rest.unread ? { restUnread: rest.unread } : {}) } }
      : {}),
  };
}

/** A step's run under way, as a file keeps it: its jobs to be picked up. */
function readRunning(v: unknown): StepRunning | undefined {
  const r = v as { at?: unknown; input?: unknown; options?: unknown; jobs?: unknown } | undefined;
  if (!r || !isNum(r.at) || typeof r.input !== "string" || !Array.isArray(r.jobs)) return undefined;
  const jobs = r.jobs.flatMap((j: { id?: unknown; entries?: unknown; reads?: unknown; size?: unknown } | null): StepJob[] =>
    typeof j?.id === "string" && JOB.test(j.id) && Array.isArray(j.entries) && j.entries.every((i) => Number.isInteger(i) && i >= 0)
      ? [
          {
            id: j.id,
            entries: j.entries as number[],
            reads: Array.isArray(j.reads) ? j.reads.filter((n): n is string => typeof n === "string" && IN_FOLDER.test(n)) : [],
            // (a Render's: the size its picture takes on the page)
            ...(Array.isArray(j.size) && j.size.length === 2 && j.size.every((n) => isNum(n) && n > 0) ? { size: [j.size[0], j.size[1]] as [number, number] } : {}),
          },
        ]
      : [],
  );
  const kind = (r as { kind?: unknown }).kind;
  // (those its plugin refused as it prepared the others' jobs: kept to be said failed when it ends)
  const refused = readRefused({ refused: (r as { refused?: unknown }).refused }, Number.MAX_SAFE_INTEGER);
  return jobs.length
    ? { at: r.at, input: r.input, options: optionsIn(r.options), jobs, ...(KINDS.some((k) => k.kind === kind) ? { kind: kind as StepKind } : {}), ...(refused.length ? { refused } : {}) }
    : undefined;
}

function readStep(v: unknown): WorkflowStep | null {
  const s = v as Partial<Record<keyof WorkflowStep, unknown>> | null;
  if (!s || !isId(s.id) || !KINDS.some((k) => k.kind === s.kind) || !isNum(s.x) || !isNum(s.y)) return null;
  const options = optionsIn(s.options);
  const ran = readRan(s.ran);
  const running = readRunning(s.running);
  const runs = (Array.isArray(s.runs) ? s.runs : []).map(readKept).filter((k): k is StepRunKept => k != null).slice(0, RUNS_KEPT);
  return {
    id: s.id,
    kind: s.kind as StepKind,
    x: s.x,
    y: s.y,
    ...(typeof s.by === "string" && /^[a-z0-9-]{1,40}$/.test(s.by) ? { by: s.by } : {}),
    ...(Object.keys(options).length ? { options } : {}),
    ...(ran ? { ran } : {}),
    ...(runs.length ? { runs } : {}),
    ...(running ? { running } : {}),
  };
}

function readEnd(v: unknown): WireEnd | null {
  const e = v as { set?: unknown } | null;
  return e && isId(e.set) ? { set: e.set } : null;
}

function readTo(v: unknown): WireTo | null {
  const e = v as { step?: unknown; port?: unknown } | null;
  return e && isId(e.step) && isName(e.port) ? { step: e.step, port: e.port } : null;
}

/** A workflow from a workspace's JSON; none where it holds none. Ids are each one's own: one used twice keeps the first. */
export function readWorkflow(data: unknown): SavedWorkflow | undefined {
  const r = data as { sets?: unknown; steps?: unknown; wires?: unknown } | null;
  const seen = new Set<number>();
  const fresh = <T extends { id: number }>(t: T | null): t is T => !!t && !seen.has(t.id) && !!seen.add(t.id);
  const sets = (Array.isArray(r?.sets) ? r.sets : []).map(readSet).filter(fresh);
  const steps = (Array.isArray(r?.steps) ? r.steps : []).map(readStep).filter(fresh);
  const setIds = new Set(sets.map((b) => b.id));
  const stepIds = new Set(steps.map((s) => s.id));
  const wires = (Array.isArray(r?.wires) ? r.wires : [])
    .map((w: { id?: unknown; from?: unknown; to?: unknown }): Wire | null => {
      const from = readEnd(w?.from);
      const to = readTo(w?.to);
      if (!w || !isId(w.id) || !from || !to || !stepIds.has(to.step) || !setIds.has(from.set)) return null;
      return { id: w.id, from, to };
    })
    .filter(fresh);
  // (a set made by a step not there is a set like any other)
  const kept = sets.map((b) => (b.made && !stepIds.has(b.made.step) ? (({ made: _m, ...rest }) => rest)(b) : b));
  return kept.length || steps.length ? { sets: kept, steps, wires } : undefined;
}

/** The counter a workflow's next part is numbered from: past every id it has. */
export const nextIdAfter = (w: SavedWorkflow) => 1 + Math.max(0, ...w.sets.map((b) => b.id), ...w.steps.map((s) => s.id), ...w.wires.map((x) => x.id));
