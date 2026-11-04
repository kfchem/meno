/**
 * A workflow as a workspace file keeps it (docs/WORKFLOWS.md, *Saving and
 * sharing*): its sets, steps and wires as they are, by their ids - read
 * back as data, what does not read left out, and a wire whose ends are
 * not there with it.
 */
import type { JobState } from "../../../../lib/jobs";
import type { DrawnModel, KeptJob, KeptJobEntry, LeftJobEntry, Member, Model, Molecule3D, SeriesCore, StepJob, StepRan, StepRunKept, StepRunning, Wire, WireEnd, WireTo, WorkflowSet, WorkflowStep } from "../store/types";
import { readCarried3D, readDrawn } from "../utils/copyPaste";
import { numberIn, tableIn } from "../../../../lib/table";
import { chartIn } from "../../../../lib/chart";
import { diagramIn } from "../../../../lib/energyDiagram";
import type { OptionValues } from "../../../../lib/options";
import type { KeptRole } from "../../../../lib/jobs";
import { KINDS, type SetHolds, type SetKind, type StepKind } from "./kinds";
import { SET_KINDS } from "../../../../lib/plugins/steps";
import { readDrawnRecord, structureMember } from "./entries";
import { readRefused } from "./programs";
import { leftOut, readEach } from "../utils/readNotes";
import { isJobKey } from "../../../../lib/jobKeys";

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
/** The core a series shares, as a file keeps it: atoms' places, bonds between them, and each R's attach places. None where it does not read. */
function coreIn(v: unknown): SeriesCore | undefined {
  const c = v as { atoms?: unknown; bonds?: unknown; attach?: unknown } | null;
  const place = (x: unknown): x is number => Number.isInteger(x) && (x as number) >= 0;
  if (!c || !Array.isArray(c.atoms) || !c.atoms.every(place) || !Array.isArray(c.bonds) || !c.attach || typeof c.attach !== "object") return undefined;
  const bonds = c.bonds.filter((b): b is [number, number] => Array.isArray(b) && b.length === 2 && place(b[0]) && place(b[1]));
  const attach = Object.fromEntries(Object.entries(c.attach as Record<string, unknown>).filter(([k, v]) => /^R\d+$/.test(k) && Array.isArray(v) && v.length > 0 && v.every(place))) as Record<string, number[]>;
  return bonds.length === c.bonds.length && Object.keys(attach).length ? { atoms: c.atoms as number[], bonds, attach } : undefined;
}

function membersIn(v: unknown): Member[] | undefined {
  if (!Array.isArray(v)) return undefined;
  return readEach(v, (x): Member | null => {
    const m = x as { structure?: unknown; record?: unknown; molecule?: unknown; picture?: unknown } | null;
    // (a structure with its record, where a step gave it one: read as data, what does not read left out)
    if (Array.isArray(m?.structure) && m.structure.length && m.structure.every((id) => isId(id))) return structureMember(m.structure as number[], readDrawnRecord(m.record));
    if (Number.isInteger(m?.molecule) && (m!.molecule as number) >= 0) return { molecule: m!.molecule as number };
    if (Number.isInteger(m?.picture) && (m!.picture as number) >= 0) return { picture: m!.picture as number };
    return null;
  }, "member");
}

function readSet(v: unknown): WorkflowSet | null {
  const b = v as Partial<Record<keyof WorkflowSet, unknown>> | null;
  if (!b || !isId(b.id) || !isNum(b.x0) || !isNum(b.y0) || !isNum(b.x1) || !isNum(b.y1)) return null;
  const made = b.made as { step?: unknown; exit?: unknown; holds?: unknown } | undefined;
  const madeRead =
    made && isId(made.step) && isName(made.exit) && (made.holds == null || SETS.includes(made.holds as SetKind) || ["pictures", "chart", "table", "number"].includes(made.holds as string))
      ? { step: made.step, exit: made.exit, ...(made.holds != null ? { holds: made.holds as SetHolds } : {}) }
      : undefined;
  // (one that says it was made by a step, but not by which as it reads: a set like any other - and said)
  if (made !== undefined && !madeRead) leftOut("made");
  return {
    id: b.id,
    x0: Math.min(b.x0, b.x1),
    y0: Math.min(b.y0, b.y1),
    x1: Math.max(b.x0, b.x1),
    y1: Math.max(b.y0, b.y1),
    // (a step's exit: which step and exit made it - and what it holds, once its step has run; not run yet, nothing)
    ...(madeRead ? { made: madeRead } : {}),
    // (the name the chemist gave it, where they gave one)
    ...(typeof b.name === "string" && b.name.trim() ? { name: b.name } : {}),
    ...(() => {
      const members = membersIn(b.members);
      return members ? { members } : {};
    })(),
    // (the core its series shares, by its atoms' places: a result set's alone)
    ...(() => {
      const core = made ? coreIn(b.core) : undefined;
      return core ? { core } : {};
    })(),
    // (a set copied: the records its structures drawn carry, to be taken up as it is put down)
    ...(() => {
      const carried = readEach(b.carried, (x) => {
        const c = x as { structure?: unknown; record?: unknown } | null;
        const record = readDrawnRecord(c?.record);
        return Array.isArray(c?.structure) && c.structure.length && c.structure.every((id) => isId(id)) && record ? { structure: c.structure as number[], record } : null;
      }, "member");
      return carried.length ? { carried } : {};
    })(),
    // (the atoms its step put on the page, by id, as members' are: a result set's alone)
    ...(made && Array.isArray(b.put) && b.put.length && b.put.every((id) => isId(id)) ? { put: b.put as number[] } : {}),
    // (a large set's collection, each molecule read as the page's are - those that do not read counted, with those its file already said had not)
    ...(() => {
      // (a set whose step was deleted holds its collection still: a chemist's set now, made by none)
      if (!Array.isArray(b.collection)) return {};
      const collection = b.collection.flatMap((m) => carriedMolecule(m));
      const unread = b.collection.length - collection.length + (Number.isInteger(b.unread) && (b.unread as number) > 0 ? (b.unread as number) : 0);
      return collection.length || unread ? { collection, ...(unread ? { unread } : {}) } : {};
    })(),
    // (or its structures drawn off the page - those it does not show - each read as the page's drawing is, with what its step said of it - those that do not read counted, as molecules are; a set whose step was deleted holds them still, as it does a collection)
    ...(() => {
      if (!Array.isArray(b.drawnCollection) || Array.isArray(b.collection)) return {};
      const drawnCollection = b.drawnCollection.flatMap(drawnModelIn);
      const unread = b.drawnCollection.length - drawnCollection.length + (Number.isInteger(b.unread) && (b.unread as number) > 0 ? (b.unread as number) : 0);
      return drawnCollection.length || unread ? { drawnCollection, ...(unread ? { unread } : {}) } : {};
    })(),
    // (a table, a number or a chart it holds, read as the file kept it - what does not read left out, and counted)
    ...(() => {
      const table = b.table != null ? tableIn(b.table, leftOut) : undefined;
      const number = b.number != null ? numberIn(b.number, leftOut) : undefined;
      const chart = b.chart == null ? undefined : (b.chart as { kind?: unknown }).kind === "diagram" ? diagramIn(b.chart) : chartIn(b.chart);
      // (a chart is read whole or not at all - a point or a level unread would leave it drawn short of one: counted)
      if (b.chart != null && !chart) leftOut("chart");
      return { ...(table ? { table } : {}), ...(number ? { number } : {}), ...(chart ? { chart } : {}) };
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
// (a job's id, as Meno names one - its label, path-safe, and eight hex of its own (jobs.rs `job_id_ok`) - or as it did, a UUID)
/** How a job may have ended, or stood, as a run's record says (lib/jobs `JobState`). */
const JOB_STATES: readonly JobState[] = ["waiting", "running", "done", "failed", "stopped", "gone"];
/** A job's id, as jobs are named (lib/jobs): what a file may name one by. */
export const JOB = /^(?:[a-z0-9]+(?:-[a-z0-9]+)*-[0-9a-f]{8}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;
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
  const r = v as { at?: unknown; ok?: unknown; said?: unknown; input?: unknown; stopped?: unknown; took?: unknown; jobs?: unknown; kind?: unknown; options?: unknown; kept?: unknown; keep?: unknown } | undefined;
  if (!r || !isNum(r.at) || typeof r.ok !== "boolean" || typeof r.said !== "string" || typeof r.input !== "string") return undefined;
  const jobs = Array.isArray(r.jobs) ? r.jobs.filter((j): j is string => typeof j === "string" && JOB.test(j)) : [];
  // (a key for each job, or none: one missing would take a job up again by another's)
  const given = (r as { keys?: unknown }).keys;
  const keys = Array.isArray(given) && given.length === jobs.length && jobs.length === (r.jobs as unknown[]).length && given.every(isJobKey) ? (given as string[]) : undefined;
  // (what each gave, as one digest, beside its key: or none - one out of place would check a job by another's)
  const digests = (r as { gave?: unknown }).gave;
  const gave = keys && Array.isArray(digests) && digests.length === jobs.length && digests.every((g) => g === null || isJobKey(g)) ? (digests as (string | null)[]) : undefined;
  const options = optionsIn(r.options);
  // (how each of several jobs ended, one for each: or none)
  const told = (r as { states?: unknown }).states;
  const states = jobs.length > 1 && Array.isArray(told) && told.length === jobs.length && told.every((x) => JOB_STATES.includes(x as JobState)) ? (told as JobState[]) : undefined;
  return {
    at: r.at,
    ok: r.ok,
    said: r.said,
    input: r.input,
    ...(r.stopped === true ? { stopped: true as const } : {}),
    ...(isNum(r.took) && r.took >= 0 ? { took: r.took } : {}),
    ...(jobs.length ? { jobs } : {}),
    ...(keys ? { keys } : {}),
    ...(gave ? { gave } : {}),
    ...(states ? { states } : {}),
    ...readAccounting(r),
    ...(KINDS.some((k) => k.kind === r.kind) ? { kind: r.kind as StepKind } : {}),
    ...(Object.keys(options).length ? { options } : {}),
    // (a run the chemist keeps: never dropped while kept)
    ...(r.keep === true ? { keep: true as const } : {}),
    // (every seed its line counts but does not name)
    ...(typeof (r as { named?: unknown }).named === "string" && (r as { named: string }).named ? { named: (r as { named: string }).named.slice(0, 4000) } : {}),
    ...(() => {
      const kept = readKeptJobs(r.kept, new Set(jobs));
      return kept.length ? { kept } : {};
    })(),
  };
}

const SHA = /^[0-9a-f]{64}$/;
const ROLES: readonly KeptRole[] = ["input", "read", "log", "raw"];
const sizeOk = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 0;

/** What a file kept of a run's jobs - each one of its own (`jobs`) - each file read as written, or left out of the list where it does not read. */
function readKeptJobs(v: unknown, jobs: ReadonlySet<string>): KeptJob[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((k: { job?: unknown; files?: unknown; left?: unknown } | null): KeptJob[] => {
    if (typeof k?.job !== "string" || !jobs.has(k.job) || !Array.isArray(k.files)) return [];
    const files = k.files.flatMap((f: Partial<Record<keyof KeptJobEntry, unknown>> | null): KeptJobEntry[] =>
      typeof f?.name === "string" && keptName(f.name) && typeof f.sha256 === "string" && SHA.test(f.sha256) && sizeOk(f.size) && ROLES.includes(f.role as KeptRole)
        ? [{ name: f.name, sha256: f.sha256, size: f.size, role: f.role as KeptRole }]
        : [],
    );
    const left = (Array.isArray(k.left) ? k.left : []).flatMap((f: Partial<Record<keyof LeftJobEntry, unknown>> | null): LeftJobEntry[] =>
      typeof f?.name === "string" && keptName(f.name) && sizeOk(f.size) && (f.why === "raw" || f.why === "not had") ? [{ name: f.name, size: f.size, why: f.why }] : [],
    );
    return [{ job: k.job, files, ...(left.length ? { left } : {}) }];
  });
}

/** Whether `name` is one a job's kept file may have (src-tauri keptjobs.rs `kept_name`): in its work folder, or one of its logs. */
export const keptName = (name: string) => name === "log.txt" || name === "after.txt" || (name.startsWith("work/") && IN_FOLDER.test(name.slice(5)));

/** A molecule in 3D a set or a run keeps, read as the page's are; none where it does not read. */
function carriedMolecule(m: unknown): Omit<Molecule3D, "id" | "at">[] {
  const read = readCarried3D({ ...(m as object), at: { x: 0, y: 0 } });
  if (!read) return [];
  const { at: _at, turn: _turn, frame: _frame, list: _list, shown: _shown, ...molecule } = read;
  return [molecule];
}

/** A structure drawn a run gave, as a file keeps it - read as the page's drawing is, with its record; none where it does not read. */
function drawnModelIn(m: unknown): DrawnModel[] {
  const got = readDrawn({ atoms: (m as Model | null)?.atoms, bonds: (m as Model | null)?.bonds });
  const record = readDrawnRecord((m as DrawnModel | null)?.record);
  return got?.atoms.length ? [{ atoms: got.atoms, bonds: got.bonds, ...(record ? { record } : {}) }] : [];
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
      const models = given.flatMap(drawnModelIn);
      return { models, unread: given.length - models.length + (Number.isInteger(was) && (was as number) > 0 ? (was as number) : 0) };
    };
    const made = drawn(res?.drawn?.made, res?.unread);
    const core = coreIn((res?.drawn as { core?: unknown } | undefined)?.core);
    const aside = drawn(res?.drawn?.rest, res?.restUnread);
    return {
      ...ran,
      kind: r!.kind as StepKind,
      ...(Object.keys(options).length ? { options } : {}),
      ...(made.models.length || made.unread || aside.models.length || aside.unread
        ? { results: { molecules: [], rest: [], holds, drawn: { made: made.models, rest: aside.models, ...(core ? { core } : {}) }, ...(made.unread ? { unread: made.unread } : {}), ...(aside.unread ? { restUnread: aside.unread } : {}) } }
        : {}),
    };
  }
  // (structures drawn it could not make in 3D, set aside as they came - Conformers' - read as the page's drawing is)
  const drawnRest = Array.isArray(res?.drawn?.rest) ? (res!.drawn!.rest as unknown[]).flatMap(drawnModelIn) : [];
  const restUnread = rest.unread + (Array.isArray(res?.drawn?.rest) ? (res!.drawn!.rest as unknown[]).length - drawnRest.length : 0);
  return {
    ...ran,
    kind: r!.kind as StepKind,
    ...(Object.keys(options).length ? { options } : {}),
    ...(holds && (molecules.length || unread || rest.molecules.length || restUnread || drawnRest.length)
      ? { results: { molecules, rest: rest.molecules, holds, ...(drawnRest.length ? { drawn: { made: [], rest: drawnRest } } : {}), ...(unread ? { unread } : {}), ...(restUnread ? { restUnread } : {}) } }
      : {}),
  };
}

/** Jobs adopted, by id, with when: ids as Meno gives them, times as numbers. */
function adoptedIn(v: unknown): Record<string, number> | undefined {
  if (!v || typeof v !== "object" || Array.isArray(v)) return undefined;
  const out = Object.fromEntries(Object.entries(v).filter(([id, at]) => JOB.test(id) && isNum(at)));
  return Object.keys(out).length ? (out as Record<string, number>) : undefined;
}

/** What a run stopped on output Meno could not account for keeps, as a file has it: those jobs, the run as it stood, and the jobs adopted. */
function readAccounting(r: object): Pick<StepRan, "unaccounted" | "held" | "adopted"> {
  const v = r as { unaccounted?: unknown; held?: unknown; adopted?: unknown };
  const unaccounted = Array.isArray(v.unaccounted) ? v.unaccounted.filter((j): j is string => typeof j === "string" && JOB.test(j)) : [];
  const held = unaccounted.length ? readRunning(v.held) : undefined;
  const adopted = adoptedIn(v.adopted);
  return { ...(held ? { unaccounted, held } : {}), ...(adopted ? { adopted } : {}) };
}

/** A step's run under way, as a file keeps it: its jobs to be picked up. */
function readRunning(v: unknown): StepRunning | undefined {
  const r = v as { at?: unknown; input?: unknown; options?: unknown; jobs?: unknown } | undefined;
  if (!r || !isNum(r.at) || typeof r.input !== "string" || !Array.isArray(r.jobs)) return undefined;
  const jobs = readEach(r.jobs, (x): StepJob | null => {
    const j = x as { id?: unknown; entries?: unknown; reads?: unknown; size?: unknown } | null;
    return typeof j?.id === "string" && JOB.test(j.id) && Array.isArray(j.entries) && j.entries.every((i) => Number.isInteger(i) && i >= 0)
      ? {
            id: j.id,
            entries: j.entries as number[],
            reads: Array.isArray(j.reads) ? j.reads.filter((n): n is string => typeof n === "string" && IN_FOLDER.test(n)) : [],
            // (a Render's: the size its picture takes on the page)
            ...(Array.isArray(j.size) && j.size.length === 2 && j.size.every((n) => isNum(n) && n > 0) ? { size: [j.size[0], j.size[1]] as [number, number] } : {}),
            ...(isJobKey((j as { key?: unknown }).key) ? { key: (j as { key: string }).key } : {}),
            ...((j as { reused?: unknown }).reused === true ? { reused: true as const } : {}),
            ...(isJobKey((j as { gave?: unknown }).gave) ? { gave: (j as { gave: string }).gave } : {}),
          }
      : null;
  }, "job");
  const kind = (r as { kind?: unknown }).kind;
  const over = (r as { over?: unknown }).over;
  const note = (r as { note?: unknown }).note;
  const paired = (r as { paired?: unknown }).paired;
  const adopted = adoptedIn((r as { adopted?: unknown }).adopted);
  // (those its plugin refused as it prepared the others' jobs: kept to be said failed when it ends)
  const refused = readRefused({ refused: (r as { refused?: unknown }).refused }, Number.MAX_SAFE_INTEGER);
  // (the lone atoms it passed through as they came: kept to be brought in when it ends)
  const passedIn = (r as { passed?: unknown }).passed;
  const passed = Array.isArray(passedIn) ? [...new Set(passedIn.filter((i): i is number => Number.isInteger(i) && i >= 0))] : [];
  return jobs.length
    ? {
        at: r.at,
        input: r.input,
        options: optionsIn(r.options),
        jobs,
        ...(KINDS.some((k) => k.kind === kind) ? { kind: kind as StepKind } : {}),
        ...(typeof over === "string" && over ? { over: over.slice(0, 300) } : {}),
        ...(typeof note === "string" && note ? { note: note.slice(0, 300) } : {}),
        ...(typeof paired === "string" && paired ? { paired: paired.slice(0, 300) } : {}),
        ...(refused.length ? { refused } : {}),
        ...(passed.length ? { passed } : {}),
        ...(adopted ? { adopted } : {}),
      }
    : undefined;
}

function readStep(v: unknown): WorkflowStep | null {
  const s = v as Partial<Record<keyof WorkflowStep, unknown>> | null;
  if (!s || !isId(s.id) || !KINDS.some((k) => k.kind === s.kind) || !isNum(s.x) || !isNum(s.y)) return null;
  const options = optionsIn(s.options);
  const ran = readRan(s.ran);
  const running = readRunning(s.running);
  const runs = readEach(s.runs, readKept, "run");
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
    ...(s.keepRaw === false ? { keepRaw: false as const } : {}),
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
  // (one whose id is another's already - of any kind - is left out, and said)
  const fresh = <T extends { id: number }>(t: T | null): T | null => (t && !seen.has(t.id) && !!seen.add(t.id) ? t : null);
  const sets = readEach(r?.sets, (v) => fresh(readSet(v)), "set");
  const steps = readEach(r?.steps, (v) => fresh(readStep(v)), "step");
  const setIds = new Set(sets.map((b) => b.id));
  const stepIds = new Set(steps.map((s) => s.id));
  const wires = readEach(r?.wires, (v) => {
    const w = v as { id?: unknown; from?: unknown; to?: unknown } | null;
    const from = readEnd(w?.from);
    const to = readTo(w?.to);
    if (!w || !isId(w.id) || !from || !to || !stepIds.has(to.step) || !setIds.has(from.set)) return null;
    return fresh({ id: w.id, from, to } as Wire);
  }, "wire");
  // (a set made by a step not there is a set like any other - and said)
  const kept = sets.map((b) => (b.made && !stepIds.has(b.made.step) ? (leftOut("made"), (({ made: _m, ...rest }) => rest)(b)) : b));
  return kept.length || steps.length ? { sets: kept, steps, wires } : undefined;
}

/** The counter a workflow's next part is numbered from: past every id it has. */
export const nextIdAfter = (w: SavedWorkflow) => 1 + Math.max(0, ...w.sets.map((b) => b.id), ...w.steps.map((s) => s.id), ...w.wires.map((x) => x.id));
