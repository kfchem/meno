import type { StoreApi } from "zustand";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import type { DocumentStore } from "../../../../../lib/doc";
import { anyKindById, pluginById, type PythonPlugin } from "../../../../../lib/calc/catalog";
import type { CalcSource, ReaderOutput } from "../../../../../lib/calc/output";
import { readOutput } from "../../../../../lib/calc/read";
import { rememberOutput } from "../../../../../lib/calc/asks";
import { pluginClient } from "../../../../../lib/calc/workers";
import { finished, jobFiles, jobFolder, jobOf, listJobs, readJobFile, readJobLog, removeJob, runningOf, startJob, stopJob, type Job } from "../../../../../lib/jobs";
import type { OptionValues } from "../../../../../lib/options";
import { lookFor } from "../../../../../lib/plugins/installed";
import { pluginWorker } from "../../../../../lib/roles/worker";
import { useAppSettings } from "../../../../../lib/settings/appSettings";
import * as ops from "../../document";
import type { WorkspaceDocument } from "../../document";
import { blocksOf, moleculeOf } from "../../chem/make3d";
import { byOf, installedFor, optionsFor, programsFor } from "../../workflow/doers";
import { frameXyz, framesOf, setEntries, type SetEntry } from "../../workflow/entries";
import { findSet, inputKey, inputOf, resultOf, stateOf, stepOf, wireInto } from "../../workflow/flow";
import { kindInfo, optionsOf, type SetKind, type StepKind } from "../../workflow/kinds";
import { setRan, setRunning } from "../../workflow/model";
import { clock, conformersWorked, doneSaid, jobEntries, notFound, pluginEntry, readCollected, readKept, readPrepared, workedOf, type ToRead } from "../../workflow/programs";
import { keepRun, laidOver, LAID_OVER, resultsOf, runStep as runMenoStep, showRun, whyNot, withResults, type RunResults, type RunWith, type Worked } from "../../workflow/run";
import type { EditorState, JobSeen, StepJob, StepRan, Turn3D } from "../types";

type SetState = StoreApi<EditorState>["setState"];
type GetState = StoreApi<EditorState>["getState"];

/** How long a 3D structure may take to make: a large one's, on a slow machine. */
const MAKE_3D_MS = 5 * 60_000;
/** How long Meno waits for a stopped job to end before its files are taken away with its step. */
const STOP_WAIT_MS = 15_000;

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Running a workflow's steps (docs/WORKFLOWS.md, *Running*): Meno's own,
 * at once; a plugin's in its worker, asked; a plugin's program as jobs
 * (lib/jobs) - prepared by the plugin, run apart from Meno, looked at
 * until they end, and read back by the plugin - their results coming in
 * as one edit. A run under way is kept in the document with no step of its
 * own (`running`, amended in): undo does not take a run back, and the
 * workspace saved keeps it, so that one opened again picks its jobs up.
 */
export function createStepRuns(doc: DocumentStore<WorkspaceDocument>, set: SetState, get: GetState, w: Pick<RunWith, "extentOf">) {
  /** Those waiting for a step's jobs to end: kept once it has none. */
  const waiters = new Map<number, (() => void)[]>();
  /** Steps whose results are being read back. */
  const finishing = new Set<number>();
  /** What has been read of each job's log: how far, and its last line. */
  const logs = new Map<string, { from: number; line: string }>();
  /** The texts that show a job's log, by the job. */
  const shown = new Map<string, number>();
  let looking = false;

  const ended = (id: number) =>
    new Promise<void>((resolve) => {
      if (!stepOf(doc.getState(), id)?.running) return resolve();
      waiters.set(id, [...(waiters.get(id) ?? []), resolve]);
    });
  const keep = () => {
    for (const [id, all] of waiters) {
      if (stepOf(doc.getState(), id)?.running) continue;
      waiters.delete(id);
      all.forEach((f) => f());
    }
  };

  /** The step before a step, where one gives what comes into it. */
  const before = (d: WorkspaceDocument, id: number) => {
    const from = wireInto(d, id)?.from;
    const prior = from ? ("step" in from ? from.step : findSet(d, from.set)?.made?.step) : undefined;
    return prior != null ? stepOf(d, prior) : undefined;
  };

  /** The steps to run to run `id`, in order: those before it that have not run, or have changed, or are running - and it. */
  const chainTo = (d: WorkspaceDocument, id: number): number[] => {
    const out = [id];
    for (let prior = before(d, id); prior && out.length < 200; prior = before(d, prior.id)) {
      if (!prior.running && stateOf(d, prior, byOf(prior)) === "done") break;
      out.unshift(prior.id);
    }
    return out;
  };

  /** A step that could not run, said so - with what it was to run as. */
  const fail = (id: number, said: string, at: number, input: string) =>
    doc.edit("run", (d) => {
      const step = stepOf(d, id);
      return step ? setRan(keepRun(d, step), id, { at, ok: false, said, input, kind: step.kind, ...(step.options ? { options: step.options } : {}) }) : d;
    });

  /** One step run: Meno's at once; a plugin's in its worker, or as jobs. */
  async function runOne(id: number): Promise<void> {
    const d = doc.getState();
    const step = stepOf(d, id);
    if (!step) return;
    const by = byOf(step);
    const at = Date.now();
    const key = inputKey(d, step, by);
    const why = whyNot(d, step, by);
    if (why) return void fail(id, why, at, key);
    if (by === "meno") return void doc.edit("run", (x) => runMenoStep(x, id, { ...w, byOf, now: at }));
    const plugin = pluginById(by);
    if (!plugin) return void fail(id, "Nothing added does this step", at, key);
    if (step.kind === "conformers" && inputOf(d, id)?.holds === "structures") return searchDrawn(id, plugin, at);
    if (programsFor(step.kind, by).length) return runJobs(id, plugin, at);
    return runAtOnce(id, plugin, at);
  }

  /** The kind of set a step's results make, for what came in. */
  const givesFor = (kind: Parameters<typeof kindInfo>[0], holds: SetKind): SetKind => {
    const g = kindInfo(kind).gives;
    return g === "same" ? holds : g;
  };

  /** The results of a step put in, as one edit - with the entries it set aside - and what it did kept with it; a molecule that is an optimisation's path shown at its end. */
  function bringIn(id: number, worked: Worked[], holds: SetKind, ran: StepRan, aside: SetEntry[] = []) {
    const d = doc.getState();
    const step = stepOf(d, id);
    if (!step) return;
    const before = new Set((d.molecules3d ?? []).map((m) => m.id));
    // (what it did before kept among its runs)
    if (!worked.length) return void doc.edit("run", (x) => setRan(keepRun(x, stepOf(x, id)!), id, ran));
    const outcome = { ok: true as const, holds, kept: worked, aside, said: ran.said };
    const turns = turnsFor(d, id, ran.kind ?? step.kind, resultsOf(outcome));
    doc.edit("results", (x) => setRan(withResults(keepRun(x, stepOf(x, id)!), step, outcome, w, turns), id, ran));
    atTheirEnds(before);
    turnNew(before, turns);
  }

  /** Molecules new on the page that are an optimisation's path, shown at their ends. */
  function atTheirEnds(before: ReadonlySet<number>) {
    for (const m of doc.getState().molecules3d ?? []) if (!before.has(m.id) && m.path && m.frames?.length) get().setFrame3d(m.id, m.frames.length);
  }

  /** How a step's results are first turned, where they are what came in worked out: each laid over what it was worked out from, turned as that is (workflow/run `laidOver`). */
  function turnsFor(d: WorkspaceDocument, id: number, kind: StepKind, results: RunResults): (Turn3D | undefined)[] | undefined {
    const input = inputOf(d, id);
    if (!LAID_OVER.includes(kind) || !input || input.holds === "structures" || results.holds === "conformers") return undefined;
    const turns = get().turns3d;
    return laidOver(results.molecules, setEntries(input.molecules, input.holds), (e) => (e.from != null ? turns[e.from] : undefined));
  }

  /** Molecules new on the page, in the order they were put down, turned as `turns` says. */
  function turnNew(before: ReadonlySet<number>, turns: readonly (Turn3D | undefined)[] | undefined) {
    if (!turns) return;
    const made = (doc.getState().molecules3d ?? []).filter((m) => !before.has(m.id));
    made.forEach((m, i) => {
      const turn = turns[i];
      if (turn) get().setTurn3d(m.id, turn);
    });
  }

  /** The steps after a step: those that take what it gives, and those after them. */
  const after = (d: WorkspaceDocument, id: number): number[] => {
    const out: number[] = [];
    const seen = new Set([id]);
    const queue = [id];
    while (queue.length) {
      const at = queue.shift()!;
      const made = resultOf(d, at)?.id;
      for (const wire of d.wires ?? []) {
        const from = wire.from;
        const fromIt = "step" in from ? from.step === at : made != null && from.set === made;
        if (fromIt && !seen.has(wire.to)) {
          seen.add(wire.to);
          out.push(wire.to);
          queue.push(wire.to);
        }
      }
    }
    return out;
  };

  /**
   * Steps run (docs/WORKFLOWS.md, *Starting and stopping*): each, and first
   * those before it that have not run or have changed, in the order their
   * wires give - those that do not wait on one another at once (*Several at
   * once*); a step after one that failed, not. Kept when all have ended.
   */
  async function runSteps(targets: readonly number[]): Promise<void> {
    const d = doc.getState();
    const wanted = new Set<number>();
    for (const t of targets) for (const id of chainTo(d, t)) wanted.add(id);
    const runs = new Map<number, Promise<boolean>>();
    const run = (id: number): Promise<boolean> => {
      let going = runs.get(id);
      if (!going) {
        going = (async () => {
          const prior = before(doc.getState(), id);
          if (prior && wanted.has(prior.id)) {
            if (!(await run(prior.id))) return false;
          } else if (prior?.running) await ended(prior.id);
          const step = stepOf(doc.getState(), id);
          if (!step) return false;
          if (step.running) await ended(id);
          else await runOne(id);
          return !!stepOf(doc.getState(), id)?.ran?.ok;
        })();
        runs.set(id, going);
      }
      return going;
    };
    await Promise.all([...wanted].map(run));
  }

  /**
   * A conformer search on structures drawn, in the plugin's worker - as *3D
   * structures* on the canvas makes them (its `conformers`), with the
   * step's own options: the first stereoisomer of each structure, its
   * conformers lowest energy first, a compound each (docs/WORKFLOWS.md,
   * *Kinds of step*).
   */
  async function searchDrawn(id: number, plugin: PythonPlugin, at: number): Promise<void> {
    const d = doc.getState();
    const step = stepOf(d, id)!;
    const key = inputKey(d, step, plugin.id);
    const input = inputOf(d, id);
    if (!input) return void fail(id, "Nothing comes into it", at, key);
    const options = optionsOf(optionsFor(step.kind, plugin.id), step.options);
    const worked: Worked[] = [];
    let compounds = 0;
    try {
      const chem = await pluginWorker(plugin);
      for (const atoms of input.structures) {
        const block = blocksOf(d.model, atoms)[0];
        if (!block) continue;
        const made = (await chem.request("conformers", { molblock: block.molblock, isomers: "one", options }, MAKE_3D_MS)).isomers[0];
        if (!made) continue;
        const m = moleculeOf(made, block);
        // (what worked out their energies, for the steps that rank them: the plugin, and its force field)
        const calc = { readers: [], program: plugin.name, ...(made.field ? { method: made.field } : {}) };
        for (let f = 0; f < framesOf(m); f++) {
          worked.push({
            compound: compounds,
            number: f + 1,
            atoms: m.atoms,
            bonds: m.bonds,
            xyz: frameXyz(m, f),
            ...(m.energies?.[f] != null ? { energy: m.energies[f] } : {}),
            ...(f === 0 ? { calc, keep: { drawnFrom: m.drawnFrom, drawnAs: m.drawnAs, ...(m.stereo ? { stereo: m.stereo } : {}), ...(m.made ? { made: m.made } : {}) } } : {}),
          });
        }
        compounds++;
      }
    } catch (e) {
      return void fail(id, message(e), at, key);
    }
    if (!worked.length) return void fail(id, "No structure drawn could be made in 3D", at, key);
    const took = Date.now() - at;
    bringIn(id, worked, "conformers", {
      at,
      ok: true,
      said: `${clock(took)} \u00b7 ${worked.length} conformer${worked.length === 1 ? "" : "s"}${compounds > 1 ? ` of ${compounds} compounds` : ""}`,
      input: key,
      took,
      kind: step.kind,
      ...(step.options ? { options: step.options } : {}),
    });
  }

  /** A step a plugin does at once on the entries that came in (`run`): those it keeps, the rest set aside. */
  async function runAtOnce(id: number, plugin: PythonPlugin, at: number): Promise<void> {
    const d = doc.getState();
    const step = stepOf(d, id)!;
    const key = inputKey(d, step, plugin.id);
    const input = inputOf(d, id)!;
    const entries = setEntries(input.molecules, input.holds as "molecules" | "conformers");
    if (!entries.length) return void fail(id, "Nothing came in", at, key);
    const options: OptionValues = optionsOf(optionsFor(step.kind, plugin.id), step.options);
    let kept;
    try {
      const client = await pluginClient(plugin);
      const given = entries.map((e) => ({ ...pluginEntry(e), compound: e.compound, ...(e.energy != null ? { energy: e.energy } : {}) }));
      kept = readKept(await client.run(step.kind, given, options, input.holds), entries.length);
    } catch (e) {
      return void fail(id, message(e), at, key);
    }
    if (typeof kept === "string") return void fail(id, kept, at, key);
    const keep = new Set(kept);
    const took = Date.now() - at;
    bringIn(
      id,
      entries.filter((_, i) => keep.has(i)),
      givesFor(step.kind, input.holds),
      { at, ok: true, said: `${keep.size} of ${entries.length} kept`, input: key, took, kind: step.kind, ...(step.options ? { options: step.options } : {}) },
      entries.filter((_, i) => !keep.has(i)),
    );
  }

  /** A step a plugin's program does: prepared by the plugin, a job for each entry, started - and waited for. */
  async function runJobs(id: number, plugin: PythonPlugin, at: number): Promise<void> {
    const d = doc.getState();
    const step = stepOf(d, id)!;
    const key = inputKey(d, step, plugin.id);
    const input = inputOf(d, id)!;
    const entries = jobEntries(step.kind, setEntries(input.molecules, input.holds as "molecules" | "conformers"), input.holds);
    if (!entries.length) return void fail(id, "Nothing came in", at, key);
    const options: OptionValues = optionsOf(optionsFor(step.kind, plugin.id), step.options);
    const { slots, cores } = runningOf(useAppSettings.getState().calculations);
    // (a program installed separately: where it is, looked for again - and found, or said not to be)
    const paths = new Map<string, string>();
    for (const decl of installedFor(step.kind, plugin.id)) {
      const where = await lookFor(plugin.id, decl.name);
      if (!where) return void fail(id, notFound(decl.label), at, key);
      paths.set(decl.name, where);
    }
    let prepared;
    try {
      const client = await pluginClient(plugin);
      prepared = readPrepared(await client.prepare(step.kind, entries.map(pluginEntry), options, cores), entries.length);
    } catch (e) {
      return void fail(id, message(e), at, key);
    }
    if (typeof prepared === "string") return void fail(id, prepared, at, key);
    const jobs: StepJob[] = [];
    try {
      for (const p of prepared) {
        const path = paths.get(p.program);
        const ask = { plugin: plugin.id, program: p.program, args: p.args, files: p.files, ...(p.stdin ? { stdin: p.stdin } : {}), slots, cores, ...(path ? { path } : {}) };
        jobs.push({ id: await startJob(ask), entries: p.entries, reads: p.reads });
      }
    } catch (e) {
      for (const j of jobs) void stopJob(j.id).catch(() => {});
      return void fail(id, `It could not be started: ${message(e)}`, at, key);
    }
    doc.amend((x) => setRunning(x, id, { at, input: key, options, jobs, kind: step.kind }), { unsaved: true });
    set((prev) => ({ ...prev, jobsSeen: { ...prev.jobsSeen, ...Object.fromEntries(jobs.map((j): [string, JobSeen] => [j.id, { state: "waiting", created: at }])) } }));
    void lookAtJobs();
    await ended(id);
  }

  /** A job's log, all of it. */
  async function wholeLog(job: string): Promise<string> {
    let text = "";
    for (let from = 0, k = 0; k < 4000; k++) {
      const read = await readJobLog(job, from).catch(() => null);
      if (!read || read.next === from) break;
      text += read.text;
      from = read.next;
    }
    return text;
  }

  /** What a running job's log says last. */
  async function lastLine(job: string): Promise<string | undefined> {
    const was = logs.get(job) ?? { from: 0, line: "" };
    let { from, line } = was;
    for (let k = 0; k < 40; k++) {
      const read = await readJobLog(job, from).catch(() => null);
      if (!read || read.next === from) break;
      const lines = read.text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      if (lines.length) line = lines[lines.length - 1];
      from = read.next;
    }
    logs.set(job, { from, line });
    return line || undefined;
  }

  /** The texts that show a job's log, followed: what it has said since, added - with no step to undo, and to be kept when the workspace is saved. */
  async function followShown() {
    for (const [job, text] of shown) {
      const t = (doc.getState().texts ?? []).find((x) => x.id === text);
      if (!t) {
        shown.delete(job);
        continue;
      }
      const seen = get().jobsSeen[job];
      const all = await wholeLog(job);
      if (all !== t.text) doc.amend((x) => ops.editText(x, text, all), { unsaved: true });
      if (seen && finished(seen.state)) shown.delete(job);
    }
  }

  /** The results of a step whose jobs have all ended, read back by its plugin and brought in - or what stopped them, or why they failed. */
  async function finishStep(id: number): Promise<void> {
    if (finishing.has(id)) return;
    finishing.add(id);
    try {
      const d = doc.getState();
      const step = stepOf(d, id);
      const run = step?.running;
      if (!step || !run) return;
      const by = byOf(step);
      const plugin = pluginById(by);
      const records = await Promise.all(run.jobs.map((j) => jobOf(j.id).catch((): Job | null => null)));
      const starts = records.flatMap((r) => (r?.started != null ? [r.started] : []));
      const ends = records.flatMap((r) => (r?.ended != null ? [r.ended] : []));
      const took = ends.length && starts.length ? Math.max(...ends) - Math.min(...starts) : Date.now() - run.at;
      const ids = run.jobs.map((j) => j.id);
      // (the kind and options it ran as: the step's may have changed since)
      const kind = run.kind ?? step.kind;
      const as = { kind, options: run.options };
      const close = () => doc.amend((x) => setRunning(x, id, undefined), { unsaved: true });

      // stopped - or gone without saying how it ended: nothing comes in
      if (records.some((r) => !r || r.state === "stopped" || r.state === "gone")) {
        bringIn(id, [], "molecules", { at: run.at, ok: false, stopped: true, said: `Stopped after ${clock(took)}`, input: run.input, took, jobs: ids, ...as });
        return close();
      }
      // (what comes in now, where it is what came in when it started - its options aside, which may change as it runs)
      const input = inputOf(d, id);
      const same = inputKey(d, { ...step, kind, options: run.options }, by) === run.input;
      const entries: SetEntry[] = same && input && input.holds !== "structures" ? jobEntries(kind, setEntries(input.molecules, input.holds), input.holds) : [];
      const total = run.jobs.reduce((n, j) => n + j.entries.length, 0);
      const worked: Worked[] = [];
      const whys: string[] = [];
      const client = plugin ? await pluginClient(plugin).catch(() => null) : null;
      for (const [k, j] of run.jobs.entries()) {
        const record = records[k]!;
        const mine = j.entries.map((i) => entries[i]);
        if (!client || !plugin) {
          whys.push("What did it is not added");
          continue;
        }
        if (mine.some((e) => !e)) {
          whys.push("What came into it changed while it ran");
          continue;
        }
        const log = await wholeLog(j.id);
        const files: Record<string, string> = {};
        // (what it wrote, ended well or not: a program may say why it failed in its output - Gaussian does)
        if (record.state === "done" || record.state === "failed") {
          const there = new Set(await jobFiles(j.id).catch(() => []));
          for (const name of j.reads) if (there.has(name)) files[name] = await readJobFile(j.id, name).catch(() => "");
        }
        let said;
        try {
          said = readCollected(await client.collect(kind, mine.map(pluginEntry), run.options, files, log, record.state), mine.length);
        } catch (e) {
          whys.push(message(e));
          continue;
        }
        if ("why" in said) {
          whys.push(said.why);
          continue;
        }
        // (an output for Meno's readers: read as one opened is, and kept as it is)
        if ("read" in said) {
          for (const [i, r] of said.read.entries()) {
            const text = "log" in r ? log : files[r.file];
            const read = text ? await readWithReaders(r, text) : `It wrote no ${r.name}`;
            if (typeof read === "string") {
              whys.push(read);
              continue;
            }
            const made =
              kind === "conformers" ? conformersWorked(mine[i], read.output, read.readers, read.source) : workedOf(kind, mine[i], read.output, read.readers, read.source);
            if (typeof made === "string") whys.push(made);
            else worked.push(...(Array.isArray(made) ? made : [made]));
          }
          continue;
        }
        // (its log kept with the workspace, as an output it was read from)
        const { kind: _kind, ...source } = await rememberOutput(`${kindInfo(kind).name} ${k + 1}.log`, log, "");
        for (const [i, out] of said.entries()) {
          // (by the version its worker said it runs, as a reader's is kept)
          const readers = [`${plugin.id} ${client.version || plugin.version}`];
          const made = kind === "conformers" ? conformersWorked(mine[i], out, readers, log ? source : undefined) : workedOf(kind, mine[i], out, readers, log ? source : undefined);
          if (typeof made === "string") whys.push(made);
          else worked.push(...(Array.isArray(made) ? made : [made]));
        }
      }
      const ok = !whys.length && worked.length > 0;
      // (a search says how many conformers it found, of how many compounds)
      const found =
        kind === "conformers"
          ? `${clock(took)} \u00b7 ${worked.length} conformer${worked.length === 1 ? "" : "s"}${total > 1 ? ` of ${total} compounds` : ""}`
          : doneSaid(worked, total, took);
      const said = ok ? found : whys.length >= total ? whys[0] : `${whys.length} of ${total} failed \u00b7 ${whys[0]}`;
      bringIn(id, worked, givesFor(kind, input?.holds ?? "molecules"), { at: run.at, ok, said, input: run.input, took, jobs: ids, ...as });
      close();
    } finally {
      finishing.delete(id);
    }
  }

  /** An output a job wrote, read by Meno's readers as one opened is (lib/calc/read) - every reader of its kind added, put together - and kept, by its kind, as what the molecules it gave were read from; why not, where nothing added reads it. */
  async function readWithReaders(r: ToRead, text: string): Promise<{ output: ReaderOutput; readers: string[]; source: CalcSource } | string> {
    const kind = anyKindById(r.kind);
    if (!kind) return `No plugin added reads ${r.name}`;
    const source = await rememberOutput(r.name, text, kind.id);
    try {
      const { output, readers } = await readOutput(r.name, text, kind, source.sha256);
      return { output, readers, source };
    } catch (e) {
      return message(e);
    }
  }

  /** The jobs of the steps that have any looked at: where each is; the logs shown, followed; the steps whose jobs have all ended, finished. */
  async function lookAtJobs(): Promise<void> {
    if (looking) return;
    looking = true;
    try {
      const runs = (doc.getState().steps ?? []).filter((s) => s.running);
      if (!runs.length) return;
      let all: Job[];
      try {
        all = await listJobs();
      } catch {
        return;
      }
      const byId = new Map(all.map((j) => [j.id, j]));
      const waiting = all.filter((j) => j.state === "waiting").sort((a, b) => a.created - b.created);
      const seen: Record<string, JobSeen> = {};
      for (const s of runs) {
        for (const j of s.running!.jobs) {
          const job = byId.get(j.id);
          if (!job) {
            seen[j.id] = { state: "gone", created: s.running!.at };
            continue;
          }
          const place = job.state === "waiting" ? waiting.findIndex((x) => x.id === j.id) + 1 : 0;
          const line = job.state === "running" ? await lastLine(j.id) : undefined;
          seen[j.id] = {
            state: job.state,
            created: job.created,
            ...(job.started != null ? { started: job.started } : {}),
            ...(job.ended != null ? { ended: job.ended } : {}),
            ...(place > 0 ? { place } : {}),
            ...(line ? { line } : {}),
          };
        }
      }
      set((prev) => ({ ...prev, jobsSeen: { ...prev.jobsSeen, ...seen } }));
      await followShown();
      for (const s of runs) if (s.running!.jobs.every((j) => finished(seen[j.id]?.state ?? "gone"))) await finishStep(s.id);
    } finally {
      looking = false;
      keep();
    }
  }

  return {
    jobsSeen: {} as Record<string, JobSeen>,
    runStep: (id: number) => runSteps([id]),
    runFrom: (id: number) => runSteps([id, ...after(doc.getState(), id)]),
    runAll: () => {
      const d = doc.getState();
      // (every step that has not run or has changed - one with nothing coming in left as it is)
      return runSteps((d.steps ?? []).filter((s) => s.running || !["done", "no-input"].includes(stateOf(d, s, byOf(s)))).map((s) => s.id));
    },
    stopStep: (id: number) => {
      for (const j of stepOf(doc.getState(), id)?.running?.jobs ?? []) void stopJob(j.id).catch(() => {});
      void lookAtJobs();
    },
    stopAll: () => {
      for (const s of doc.getState().steps ?? []) for (const j of s.running?.jobs ?? []) void stopJob(j.id).catch(() => {});
      void lookAtJobs();
    },
    showRun: (id: number, index: number) => {
      const was = new Set((doc.getState().molecules3d ?? []).map((m) => m.id));
      let turns: (Turn3D | undefined)[] | undefined;
      doc.edit("show run", (x) => showRun(x, id, index, w, (results, kind) => (turns = turnsFor(x, id, kind, results))));
      atTheirEnds(was);
      turnNew(was, turns);
    },
    showStepLog: async (id: number) => {
      const step = stepOf(doc.getState(), id);
      const jobs = step?.running?.jobs.map((j) => j.id) ?? step?.ran?.jobs ?? [];
      if (!step || !jobs.length) return;
      const name = kindInfo(step.kind).name;
      // (what the column shows as it is asked: a log come is shown by the store at once)
      const was = get();
      const showing = was.textsOpen && was.pdfShown == null ? was.textShown : null;
      let last: number | null = null;
      for (const [k, job] of jobs.entries()) {
        const open = shown.get(job);
        if (open != null && (doc.getState().texts ?? []).some((t) => t.id === open)) {
          last ??= open;
          continue;
        }
        const text = await wholeLog(job);
        const made = ops.addTexts(doc.getState(), [{ name: `${name} log${jobs.length > 1 ? ` ${k + 1}` : ""}`, text: text || "(Nothing yet)", of: { step: id } }]);
        if (made.doc !== doc.getState()) doc.edit("open text", () => made.doc);
        if (made.last != null) {
          last ??= made.last;
          if (step.running) shown.set(job, made.last);
        }
      }
      // (rising out of its step into the column, where the column is not showing it already)
      if (last != null) set({ textShown: last, textsOpen: true, pdfShown: null, ...(showing === last ? {} : { textFlight: { id: last, to: "column" as const, start: performance.now() } }) });
    },
    showStepFiles: async (id: number) => {
      const step = stepOf(doc.getState(), id);
      const job = step?.running?.jobs[0]?.id ?? step?.ran?.jobs?.[0];
      if (!job) return;
      await revealItemInDir(await jobFolder(job));
    },
    lookAtJobs,
    /** A step deleted: its jobs stopped, and their files taken away once they have ended. */
    forgetJobs: (step: { running?: { jobs: StepJob[] }; ran?: StepRan }) => {
      const jobs = [...(step.running?.jobs.map((j) => j.id) ?? []), ...(step.ran?.jobs ?? [])];
      for (const job of jobs) {
        void (async () => {
          await stopJob(job).catch(() => {});
          const until = Date.now() + STOP_WAIT_MS;
          while (Date.now() < until) {
            const r = await jobOf(job).catch(() => null);
            if (!r || finished(r.state)) break;
            await new Promise((go) => setTimeout(go, 500));
          }
          await removeJob(job).catch(() => {});
        })();
      }
    },
  };
}

export type StepRuns = ReturnType<typeof createStepRuns>;
