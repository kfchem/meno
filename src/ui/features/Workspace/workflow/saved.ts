/**
 * A workflow as a workspace file keeps it (docs/WORKFLOWS.md, *Saving and
 * sharing*): its sets, steps and wires as they are, by their ids - read
 * back as data, what does not read left out, and a wire whose ends are
 * not there with it.
 */
import type { AsideEntry, StepJob, StepRan, StepRunKept, StepRunning, Wire, WireEnd, WorkflowSet, WorkflowStep } from "../store/types";
import { readCarried3D } from "../utils/copyPaste";
import type { OptionValues } from "../../../../lib/options";
import { KINDS, type SetKind, type StepKind } from "./kinds";
import { SET_KINDS } from "../../../../lib/plugins/steps";
import { RUNS_KEPT } from "./model";

export type SavedWorkflow = { sets: WorkflowSet[]; steps: WorkflowStep[]; wires: Wire[] };

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isId = (v: unknown): v is number => Number.isInteger(v) && (v as number) > 0;
const SETS: readonly SetKind[] = SET_KINDS;

const asideIn = (v: unknown): AsideEntry[] =>
  (Array.isArray(v) ? v : []).flatMap((a: Partial<Record<keyof AsideEntry, unknown>>): AsideEntry[] =>
    Number.isInteger(a?.compound) && (a.compound as number) >= 0 && Number.isInteger(a.number)
      ? [{ compound: a.compound as number, number: a.number as number, ...(isNum(a.energy) ? { energy: a.energy } : {}) }]
      : [],
  );

function readSet(v: unknown): WorkflowSet | null {
  const b = v as Partial<Record<keyof WorkflowSet, unknown>> | null;
  if (!b || !isId(b.id) || !isNum(b.x0) || !isNum(b.y0) || !isNum(b.x1) || !isNum(b.y1)) return null;
  const made = b.made as { step?: unknown; holds?: unknown } | undefined;
  const aside = asideIn(b.aside);
  return {
    id: b.id,
    x0: Math.min(b.x0, b.x1),
    y0: Math.min(b.y0, b.y1),
    x1: Math.max(b.x0, b.x1),
    y1: Math.max(b.y0, b.y1),
    ...(made && isId(made.step) && SETS.includes(made.holds as SetKind) ? { made: { step: made.step, holds: made.holds as SetKind } } : {}),
    ...(aside.length ? { aside } : {}),
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

/** An earlier run a step keeps, as a file keeps it: what it did, its kind and options then, and what it gave - each molecule read as the page's are. */
function readKept(v: unknown): StepRunKept | null {
  const ran = readRan(v);
  const r = v as { kind?: unknown; options?: unknown; results?: { molecules?: unknown; aside?: unknown; holds?: unknown } } | null;
  if (!ran || !KINDS.some((k) => k.kind === r?.kind)) return null;
  const options = optionsIn(r?.options);
  const res = r?.results;
  const molecules = Array.isArray(res?.molecules)
    ? res.molecules.flatMap((m) => {
        const read = readCarried3D({ ...(m as object), at: { x: 0, y: 0 } });
        if (!read) return [];
        const { at: _at, turn: _turn, frame: _frame, list: _list, ...molecule } = read;
        return [molecule];
      })
    : [];
  const holds = SETS.includes(res?.holds as SetKind) ? (res!.holds as SetKind) : undefined;
  return {
    ...ran,
    kind: r!.kind as StepKind,
    ...(Object.keys(options).length ? { options } : {}),
    ...(holds && molecules.length ? { results: { molecules, aside: asideIn(res!.aside), holds } } : {}),
  };
}

/** A step's run under way, as a file keeps it: its jobs to be picked up. */
function readRunning(v: unknown): StepRunning | undefined {
  const r = v as { at?: unknown; input?: unknown; options?: unknown; jobs?: unknown } | undefined;
  if (!r || !isNum(r.at) || typeof r.input !== "string" || !Array.isArray(r.jobs)) return undefined;
  const jobs = r.jobs.flatMap((j: { id?: unknown; entries?: unknown; reads?: unknown } | null): StepJob[] =>
    typeof j?.id === "string" && JOB.test(j.id) && Array.isArray(j.entries) && j.entries.every((i) => Number.isInteger(i) && i >= 0)
      ? [{ id: j.id, entries: j.entries as number[], reads: Array.isArray(j.reads) ? j.reads.filter((n): n is string => typeof n === "string" && IN_FOLDER.test(n)) : [] }]
      : [],
  );
  const kind = (r as { kind?: unknown }).kind;
  return jobs.length ? { at: r.at, input: r.input, options: optionsIn(r.options), jobs, ...(KINDS.some((k) => k.kind === kind) ? { kind: kind as StepKind } : {}) } : undefined;
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
  const e = v as { set?: unknown; step?: unknown } | null;
  return e && isId(e.set) ? { set: e.set } : e && isId(e.step) ? { step: e.step } : null;
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
      if (!w || !isId(w.id) || !from || !isId(w.to) || !stepIds.has(w.to)) return null;
      if ("set" in from ? !setIds.has(from.set) : !stepIds.has(from.step)) return null;
      return { id: w.id, from, to: w.to };
    })
    .filter(fresh);
  // (a set made by a step not there is a set like any other)
  const kept = sets.map((b) => (b.made && !stepIds.has(b.made.step) ? (({ made: _m, aside: _a, ...rest }) => rest)(b) : b));
  return kept.length || steps.length ? { sets: kept, steps, wires } : undefined;
}

/** The counter a workflow's next part is numbered from: past every id it has. */
export const nextIdAfter = (w: SavedWorkflow) => 1 + Math.max(0, ...w.sets.map((b) => b.id), ...w.steps.map((s) => s.id), ...w.wires.map((x) => x.id));
