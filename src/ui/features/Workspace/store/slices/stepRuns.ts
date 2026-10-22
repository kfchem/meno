import type { StoreApi } from "zustand";
import { join } from "@tauri-apps/api/path";
import { readFile } from "@tauri-apps/plugin-fs";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import type { DocumentStore } from "../../../../../lib/doc";
import { anyKindById, pluginById, type PythonPlugin } from "../../../../../lib/calc/catalog";
import type { CalcSource, ReaderOutput } from "../../../../../lib/calc/output";
import { readOutput } from "../../../../../lib/calc/read";
import { heldOutput, rememberOutput } from "../../../../../lib/calc/asks";
import { pluginClient } from "../../../../../lib/calc/workers";
import { finished, jobFiles, jobFolder, jobOf, listJobs, readJobFile, readJobLog, removeJob, runningOf, startJob, stopJob, type Job } from "../../../../../lib/jobs";
import type { OptionValues } from "../../../../../lib/options";
import { lookFor, tooOld } from "../../../../../lib/plugins/installed";
import { stopWorker } from "../../../../../lib/plugins/process";
import { chemAtHand, chemWorker, pluginWorker, rolePlugin } from "../../../../../lib/roles/worker";
import { useAppSettings } from "../../../../../lib/settings/appSettings";
import * as ops from "../../document";
import type { WorkspaceDocument } from "../../document";
import { blocksOf, CONFORMERS_MS, moleculeOf } from "../../chem/make3d";
import { byOf, installedFor, optionsFor, programsFor } from "../../workflow/doers";
import { frameXyz, framesOf, recordNumber, setEntries, type DrawnEntry, type SetEntry } from "../../workflow/entries";
import { findSet, inputKey, inputOf, stateOf, stepOf, stepsBefore, wireInto } from "../../workflow/flow";
import { kindInfo, optionsOf, type Holds3D, type SetKind, type StepKind } from "../../workflow/kinds";
import { setRan, setRunning } from "../../workflow/model";
import { clock, conformersWorked, doneSaid, entryFiles, jobEntries, notFound, pluginEntry, readCollected, readKept, readPrepared, workedOf, type ToRead, type ToSurfaces } from "../../workflow/programs";
import { cubeGrid } from "../../../../../lib/calc/cube";
import { resultKey, resultsOn } from "../../../../../lib/calc/results";
import { energiesBy, inputEntries, keepRun, keptOf, laidOver, LAID_OVER, ranAs, resultsOf, runStep as runMenoStep, showRun, whyNot, withResults, type RunResults, type RunWith, type Worked } from "../../workflow/run";
import { runMenoDrawn, runMenoInTurns } from "../../workflow/meno";
import { valenceFlagged } from "../../workflow/enumerateChecks";
import { perceiveStereo } from "../../workflow/configurations";
import { askerFor } from "../../workflow/configurationsAsker";
import type { EditorState, JobSeen, Model, StepJob, StepRan, StepRunning, Turn3D, WorkflowStep } from "../types";
import { askOf, finishEntry } from "../../render/renderOptions";
import { progressOf, SCENE } from "../../render/renders";
import { renderScene } from "../../render/renderScene";
import { style3dOf } from "../../style3d";
import { holdPicture } from "../../../../../lib/picture/held";
import { entryCarried, picturesSaid, placePictures, type Rendered } from "../../workflow/renderStep";
import { NOMINAL_BOND_LENGTH } from "../../../../../lib/chem/acs";

type SetState = StoreApi<EditorState>["setState"];
type GetState = StoreApi<EditorState>["getState"];

/** How long Meno waits for a stopped job to end before its files are taken away with its step. */
const STOP_WAIT_MS = 15_000;

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** What a step says that is asked to work, or give, as only Meno's own steps can on structures drawn. */
const ON_DRAWN = "Not on structures drawn: only Meno's own steps take or give them";

/**
 * Running a workflow's steps (docs/WORKFLOWS.md, *Running*): Meno's own,
 * at once; a plugin's in its worker, asked; a plugin's program as jobs
 * (lib/jobs) - prepared by the plugin, run apart from Meno, looked at
 * until they end, and read back by the plugin - their results coming in
 * as one edit. A run under way is kept in the document with no step of its
 * own (`running`, amended in): undo does not take a run back, and the
 * workspace saved keeps it, so that one opened again picks its jobs up.
 */
/** The structures that could not be made in 3D, by their places among `of`: "structure 3 of 4 could not be made in 3D". */
export function notMade(places: readonly number[], of: number): string {
  const which = places.length === 1 ? `structure ${places[0]}` : `structures ${places.slice(0, -1).join(", ")} and ${places[places.length - 1]}`;
  return `${which} of ${of} could not be made in 3D`;
}

/** How many structures drawn come into a step (flow `inputOf`): on the page, or held in a large result set. */
const drawnIn = (input: { structures: readonly unknown[]; held?: readonly unknown[] }) => input.held?.length ?? input.structures.length;

/** A molecule in 3D without its link to a drawing (`drawnFrom`, `drawnAs`): made from a structure held off the page, whose atoms' ids are no drawing's. */
function unlinked<M extends { drawnFrom?: unknown; drawnAs?: unknown }>({ drawnFrom: _f, drawnAs: _a, ...m }: M): Omit<M, "drawnFrom" | "drawnAs"> {
  return m;
}

export function createStepRuns(doc: DocumentStore<WorkspaceDocument>, set: SetState, get: GetState, w: Pick<RunWith, "extentOf">) {
  /** Those waiting for a step's jobs to end: kept once it has none. */
  const waiters = new Map<number, (() => void)[]>();
  /** Steps whose results are being read back. */
  const finishing = new Set<number>();
  /**
   * What came into each step's run as it started, by step, for the run that
   * started then: what its jobs are on, and what it ends on - whatever comes
   * in since (an undo of its wire, a molecule moved out of its set), as
   * WORKFLOWS.md, *Undo*, has it. A workspace opened again has none: its run
   * ends on what comes in then, where that is still what came in.
   */
  const taken = new Map<number, { at: number; entries: SetEntry[]; holds: SetKind }>();
  /** What has been read of each job's log: how far, and its last line. */
  const logs = new Map<string, { from: number; line: string; tail?: string; progress?: { done: number; total: number } }>();
  // (the jobs whose folders were taken away with their step, deleted: no log or files of theirs to show, should it come back)
  const forgotten = new Set<string>();
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
    const prior = from ? findSet(d, from.set)?.made?.step : undefined;
    return prior != null ? stepOf(d, prior) : undefined;
  };

  /**
   * The steps to run to run `id`, in order: the furthest back before it
   * that has not run, has changed, failed, stopped or is running - however many done
   * lie between - and every step from it to `id`, which take anew what it
   * gives.
   */
  const chainTo = (d: WorkspaceDocument, id: number): number[] => {
    const back = stepsBefore(d, id).slice(0, 200);
    let far = -1;
    back.forEach((sid, k) => {
      const s = stepOf(d, sid);
      if (s && (s.running || stateOf(d, s, byOf(s)) !== "done")) far = k;
    });
    return [...back.slice(0, far + 1).reverse(), id];
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
    // (which stereoisomer each entry is, where the kind needs it known: asked first, every entry its own)
    if (by === "meno" && kindInfo(step.kind).perceives === "configurations") {
      const input = inputOf(d, id);
      if (input && input.holds !== "structures") await perceiveStereo(setEntries(input.molecules, input.holds), askerFor());
    }
    if (by === "meno" && step.kind === "duplicates") return menoInTurns(id, at);
    if (by === "meno" && step.kind === "enumerate") return enumerateChecked(id, at);
    if (by === "meno") return void doc.edit("run", (x) => runMenoStep(x, id, { ...w, byOf, now: at }));
    const plugin = pluginById(by);
    if (!plugin) return void fail(id, "Nothing added does this step", at, key);
    if (step.kind === "conformers" && inputOf(d, id)?.holds === "structures") return searchDrawn(id, plugin, at);
    if (step.kind === "render") return renderEach(id, plugin, at);
    if (programsFor(step.kind, by).length) return runJobs(id, plugin, at);
    return runAtOnce(id, plugin, at);
  }

  /**
   * Enumerate, its template and each of its options asked of the plugin
   * that does the checks first, where one is at hand without setting one up
   * (workflow/enumerateChecks): anything flagged stops it, in the checks'
   * words; else it runs as Meno's own steps do, in one edit, saying whether
   * its valence was checked and by what - never claiming a check not made.
   */
  async function enumerateChecked(id: number, at: number): Promise<void> {
    const d = doc.getState();
    const step = stepOf(d, id)!;
    const key = inputKey(d, step, "meno");
    const input = inputOf(d, id)!;
    if (input.holds !== "structures") return void fail(id, ON_DRAWN, at, key);
    // (what came in when it was asked to run: checked and run on that, as Meno's steps in turns are)
    const entries = inputEntries(d.model, input);
    const lists = String(optionsOf(kindInfo("enumerate").options ?? [], step.options).lists ?? "");
    let checked: string;
    const by = rolePlugin("checks");
    if (entries.length === 1 && by && (await chemAtHand("checks"))) {
      let flagged: string[] | null;
      try {
        const chem = await chemWorker("checks");
        flagged = await valenceFlagged(entries[0].drawn, lists, (molblock) => chem.request("analyse", { molblock }));
      } catch {
        flagged = null;
      }
      if (flagged?.length) return void fail(id, flagged.join(" \u00b7 "), at, key);
      checked = flagged ? `Valence checked by ${by.name}` : `Valence not checked: ${by.name} could not be asked`;
    } else checked = "Valence not checked: no plugin does the checks";
    const now = doc.getState();
    if (!stepOf(now, id)) return;
    // (made from the lists as they were checked: typed on meanwhile, they are what the card then says has changed)
    const made = runMenoDrawn("enumerate", entries, step.options, now.style, [checked]);
    menoStops.delete(id);
    const open = made.ok ? await leftOpen(id, at, made.kept) : "";
    // (stopped while its products were asked about: nothing put in, and the step says so, as Meno's say it)
    if (open == null) {
      menoStops.delete(id);
      const still = stepOf(doc.getState(), id);
      if (!still) return;
      const took = Date.now() - at;
      const as = { kind: still.kind, ...(step.options ? { options: step.options } : {}) };
      return void doc.edit("run", (x) => setRan(keepRun(x, still), id, { at, ok: false, stopped: true, said: `Stopped after ${clock(took)}`, input: key, took, ...as }));
    }
    const outcome = made.ok ? { ...made, said: `${made.said} \u00b7 ${open}` } : made;
    doc.edit("run", (x) => ranAs(x, id, outcome, key, { ...w, byOf, now: at }));
  }

  /**
   * Of Enumerate's products, those with a stereocentre or double bond whose
   * configuration is not given - a group that makes one its definition
   * does not set (a sec-butyl, as written) - asked of the plugin that finds
   * a structure's stereoisomers, where one is at hand without setting one
   * up: counted, and named by number. Made all the same: such a product is
   * a real structure, its configuration open. Its card says how many it has
   * been through as it asks; stopped, it stops asking, and says none (null).
   */
  async function leftOpen(id: number, at: number, kept: readonly DrawnEntry[]): Promise<string | null> {
    const by = rolePlugin("stereoisomers");
    if (!by || !(await chemAtHand("stereoisomers"))) return "Configurations left open not looked for: no plugin finds stereoisomers";
    const working = (patch: { done: number } | null) =>
      set((prev) => {
        const rest = { ...prev.menoWorking };
        if (patch) rest[id] = { since: at, total: kept.length, ...patch };
        else delete rest[id];
        return { ...prev, menoWorking: rest };
      });
    const open: number[] = [];
    // (those that could not be written for it to read: never counted as having none open)
    const unasked: number[] = [];
    working({ done: 0 });
    try {
      const chem = await chemWorker("stereoisomers");
      for (const [k, e] of kept.entries()) {
        if (menoStops.has(id)) return null;
        const block = blocksOf(e.drawn, e.drawn.atoms.map((a) => a.id))[0];
        if (block) {
          const found = await chem.request("open_stereo", { molblock: block.molblock });
          if (found.atoms.length || found.bonds.length) open.push(recordNumber(e.record) ?? k + 1);
        } else unasked.push(recordNumber(e.record) ?? k + 1);
        if (k % 25 === 24) working({ done: k + 1 });
      }
    } catch {
      if (menoStops.has(id)) return null;
      return `Configurations left open not looked for: ${by.name} could not be asked`;
    } finally {
      working(null);
    }
    const listed = (ns: number[]) => (ns.length > 12 ? `${ns.slice(0, 12).join(", ")} and ${ns.length - 12} more` : ns.join(", "));
    const notAsked = unasked.length ? ` \u00b7 ${unasked.length} not looked at, as ${by.name} could not be given ${unasked.length === 1 ? "it" : "them"}: ${listed(unasked)}` : "";
    if (!open.length) return `No configuration left open${unasked.length ? " in those looked at" : ""} (${by.name})${notAsked}`;
    return `${open.length} with a configuration left open: ${listed(open)} (${by.name})${notAsked}`;
  }

  /** Meno's steps working in turns asked to stop: given up at their next turn. */
  const menoStops = new Set<number>();
  /** How to stop at once a step worked in a plugin's worker as Meno's are (a conformer search on structures drawn): its worker stopped. */
  const menoKills = new Map<number, () => void>();

  /**
   * Meno's Duplicates, worked out in turns that let the page go on - a
   * window that freezes for the seconds thousands of conformers alike
   * take is none - its card saying how many entries it has been through,
   * and its results put in at the end as one edit, as Meno's other steps'.
   */
  async function menoInTurns(id: number, at: number): Promise<void> {
    // (working already: Run pressed again meanwhile starts nothing)
    if (get().menoWorking[id]) return;
    menoStops.delete(id);
    const d = doc.getState();
    const step = stepOf(d, id)!;
    const key = inputKey(d, step, "meno");
    const input = inputOf(d, id)!;
    // (worked in turns on molecules in 3D alone: structures drawn refused here, where it is relied on)
    if (input.holds === "structures") return void fail(id, ON_DRAWN, at, key);
    const holds = input.holds;
    const entries = setEntries(input.molecules, holds);
    const working = (patch: { done: number } | null) =>
      set((prev) => {
        const rest = { ...prev.menoWorking };
        if (patch) rest[id] = { since: at, total: entries.length, ...patch };
        else delete rest[id];
        return { ...prev, menoWorking: rest };
      });
    working({ done: 0 });
    let outcome;
    try {
      outcome = await runMenoInTurns(step.kind, entries, holds, step.options, energiesBy(input.molecules), { onDone: (done) => working({ done }), stopped: () => menoStops.has(id) });
    } finally {
      working(null);
      menoStops.delete(id);
    }
    const now = doc.getState();
    const still = stepOf(now, id);
    // (deleted meanwhile: nothing to put in)
    if (!still) return;
    const took = Date.now() - at;
    const as = { kind: still.kind, ...(still.options ? { options: still.options } : {}) };
    if (!outcome) return void doc.edit("run", (x) => setRan(keepRun(x, still), id, { at, ok: false, stopped: true, said: `Stopped after ${clock(took)}`, input: key, took, ...as }));
    // (what came in changed meanwhile - an edit, an undo, its set deleted: its results are of what came in when it started, put in all the same, and the step says it has changed)
    // (how long it took said first, as a program's step says it: it may take seconds)
    const said = outcome.ok ? { ...outcome, said: `${clock(took)} \u00b7 ${outcome.said}` } : outcome;
    doc.edit("run", (x) => ranAs(x, id, said, key, { ...w, byOf, now: at }));
  }

  /**
   * The kind of set a program's results make, for what came in (Render's
   * pictures are laid by `finishRender`): molecules in 3D, or a conformer
   * set. None, where that would be structures drawn - which only Meno's own
   * steps give, so a program's step that would is refused.
   */
  const givesFor = (kind: Parameters<typeof kindInfo>[0], holds: SetKind): Holds3D | null => {
    const g = kindInfo(kind).gives;
    const made = g === "same" || g === "pictures" ? holds : g;
    return made === "structures" ? null : made;
  };

  /** The results of a step put in, as one edit - what it set aside in its second exit's set - and what it did kept with it; a molecule that is an optimisation's path shown at its end. */
  function bringIn(id: number, worked: Worked[], holds: Holds3D, ran: StepRan, aside: SetEntry[] = []) {
    const d = doc.getState();
    const step = stepOf(d, id);
    if (!step) return;
    const before = new Set((d.molecules3d ?? []).map((m) => m.id));
    // (what it did before kept among its runs)
    if (!worked.length) return void doc.edit("run", (x) => setRan(keepRun(x, stepOf(x, id)!), id, ran));
    const outcome = { ok: true as const, holds, kept: worked, aside, said: ran.said };
    const turns = turnsFor(d, id, ran.kind ?? step.kind, resultsOf(outcome, ran.kind ?? step.kind));
    doc.edit("results", (x) => setRan(withResults(keepRun(x, stepOf(x, id)!), step, outcome, w, turns), id, ran));
    atTheirEnds(before);
    turnNew(before, turns);
    listsShown(before);
  }

  /** Molecules new on the page with a list to be opened at once - NCI's surfaces - shown with it open, its row chosen. */
  function listsShown(before: ReadonlySet<number>) {
    const open: EditorState["lists3d"] = {};
    for (const m of doc.getState().molecules3d ?? []) {
      if (before.has(m.id)) continue;
      const list = resultsOn(m.calc?.results, "list").find((r) => r.shown != null);
      if (list?.shown != null) open[m.id] = { list: resultKey(list), row: list.shown, pointed: null };
    }
    if (Object.keys(open).length) set((prev) => ({ ...prev, lists3d: { ...prev.lists3d, ...open } }));
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
      // (every exit's set: what any of them gives comes down to the steps wired from it)
      const made = new Set((d.sets ?? []).filter((b) => b.made?.step === at).map((b) => b.id));
      for (const wire of d.wires ?? []) {
        if (made.has(wire.from.set) && !seen.has(wire.to.step)) {
          seen.add(wire.to.step);
          out.push(wire.to.step);
          queue.push(wire.to.step);
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
  /**
   * The runs this window has begun, by step: so that a step asked to run
   * again while its run starts - Run pressed twice, Run all after Run -
   * waits for that run, never starting its jobs twice (its `running` is
   * set only once they have started).
   */
  const begun = new Map<number, Promise<void>>();
  const runOnce = (id: number): Promise<void> => {
    let going = begun.get(id);
    if (!going) {
      going = runOne(id).finally(() => begun.delete(id));
      begun.set(id, going);
    }
    return going;
  };

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
          if (begun.has(id) || step.running) {
            // (a run already under way, waited for - and, where it ended stopped, run anew: Run pressed after Stop)
            await (begun.get(id) ?? ended(id));
            if (stepOf(doc.getState(), id)?.ran?.stopped) await runOnce(id);
          } else await runOnce(id);
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
    // (working already: Run pressed again meanwhile starts nothing)
    if (get().menoWorking[id]) return;
    const d = doc.getState();
    const step = stepOf(d, id)!;
    const key = inputKey(d, step, plugin.id);
    const input = inputOf(d, id);
    if (!input) return void fail(id, "Nothing comes into it", at, key);
    // (working, as Meno's steps are said to be - how many structures it has been through - and stopped as they are: its worker stopped, started afresh when next asked)
    menoStops.delete(id);
    const working = (patch: { done: number } | null) =>
      set((prev) => {
        const rest = { ...prev.menoWorking };
        if (patch) rest[id] = { since: at, total: drawnIn(input), ...patch };
        else delete rest[id];
        return { ...prev, menoWorking: rest };
      });
    working({ done: 0 });
    menoKills.set(id, () => void stopWorker(plugin.id, `${plugin.name} was stopped with the step it worked for`));
    try {
      await searchEach(id, plugin, at, key, input, step, working);
    } finally {
      working(null);
      menoStops.delete(id);
      menoKills.delete(id);
    }
  }

  async function searchEach(
    id: number,
    plugin: PythonPlugin,
    at: number,
    key: string,
    input: NonNullable<ReturnType<typeof inputOf>>,
    step: WorkflowStep,
    working: (patch: { done: number }) => void,
  ): Promise<void> {
    const d = doc.getState();
    const options = optionsOf(optionsFor(step.kind, plugin.id), step.options);
    const worked: Worked[] = [];
    let compounds = 0;
    // (those that could not be made, by their places among the structures: the others made all the same)
    const failed: number[] = [];
    try {
      let chem = await pluginWorker(plugin);
      // (each structure drawn: on the page, by its atoms; or held in a large result set, as it holds it)
      const sources = input.held ? input.held.map((m) => ({ model: m as Model, atoms: m.atoms.map((a) => a.id), off: true })) : input.structures.map((atoms) => ({ model: d.model, atoms, off: false }));
      for (const [place, { model, atoms, off }] of sources.entries()) {
        if (menoStops.has(id)) break;
        working({ done: place });
        const block = blocksOf(model, atoms)[0];
        if (!block) continue;
        let made;
        try {
          // (as long as the canvas allows the same question: the plugin, the molecule and how many are sought are the same)
          made = (await chem.request("conformers", { molblock: block.molblock, isomers: "one", options }, CONFORMERS_MS)).isomers[0];
        } catch {
          if (menoStops.has(id)) break;
          // (said by its place, in words: what the plugin's library says of it is none of the chemist's to read)
          failed.push(place + 1);
          // (its worker may have gone with it - held past its time, or stopped: the next is asked of the one running now, started afresh where need be)
          chem = await pluginWorker(plugin);
          continue;
        }
        // (none made of it, said so too)
        if (!made) {
          failed.push(place + 1);
          continue;
        }
        // (one made from a structure on no page is linked to no drawing: its atoms' ids are its own, not the page's)
        const m = off ? unlinked(moleculeOf(made, block)) : moleculeOf(made, block);
        // (what worked out their energies, for the steps that rank them: the plugin, and its force field)
        const calc = { readers: [], program: plugin.name, ...(made.field ? { method: made.field } : {}) };
        // (each conformer with them, and with what the molecule keeps: the conformers of one compound are made alike - entries `unlikeMade`)
        const keep = keptOf(m);
        for (let f = 0; f < framesOf(m); f++) {
          worked.push({
            compound: compounds,
            number: f + 1,
            atoms: m.atoms,
            bonds: m.bonds,
            xyz: frameXyz(m, f),
            ...(m.energies?.[f] != null ? { energy: m.energies[f] } : {}),
            calc,
            keep,
          });
        }
        compounds++;
      }
    } catch (e) {
      if (!menoStops.has(id)) return void fail(id, message(e), at, key);
    }
    // (stopped: nothing put in, and the step says so, as Meno's say it)
    if (menoStops.has(id)) {
      const still = stepOf(doc.getState(), id);
      if (!still) return;
      const took = Date.now() - at;
      const as = { kind: still.kind, ...(still.options ? { options: still.options } : {}) };
      return void doc.edit("run", (x) => setRan(keepRun(x, still), id, { at, ok: false, stopped: true, said: `Stopped after ${clock(took)}`, input: key, took, ...as }));
    }
    if (!worked.length) return void fail(id, "No structure drawn could be made in 3D", at, key);
    const took = Date.now() - at;
    const left = failed.length ? ` \u00b7 ${notMade(failed, drawnIn(input))}` : "";
    bringIn(id, worked, "conformers", {
      at,
      ok: true,
      said: `${clock(took)} \u00b7 ${worked.length} conformer${worked.length === 1 ? "" : "s"}${compounds > 1 ? ` of ${compounds} compounds` : ""}${left}`,
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
    if (input.holds === "structures") return void fail(id, ON_DRAWN, at, key);
    const gives = givesFor(step.kind, input.holds);
    if (!gives) return void fail(id, ON_DRAWN, at, key);
    const entries = setEntries(input.molecules, input.holds);
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
      gives,
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
    taken.set(id, { at, entries, holds: input.holds });
    const options: OptionValues = optionsOf(optionsFor(step.kind, plugin.id), step.options);
    const { slots, cores } = runningOf(useAppSettings.getState().calculations);
    // (a program installed separately: where it is, looked for again - and found, or said not to be)
    const paths = new Map<string, string>();
    for (const decl of installedFor(step.kind, plugin.id)) {
      const where = await lookFor(plugin.id, decl.name);
      if (!where) return void fail(id, tooOld(plugin.id, decl.name) ?? notFound(decl.label), at, key);
      paths.set(decl.name, where);
    }
    // (the files its kind of step takes besides, where an entry's molecule was read from one: Multiwfn's wavefunction)
    const kinds = plugin.steps.find((s) => s.kind === step.kind)?.files ?? [];
    const sourcesOf = (id: number | undefined) => {
      const calc = input.molecules.find((m) => m.id === id)?.calc;
      return [calc?.source, calc?.wavefunction];
    };
    const given = await Promise.all(entries.map((e) => entryFiles(e, sourcesOf(e.from), kinds, heldOutput)));
    let prepared;
    try {
      const client = await pluginClient(plugin);
      const sent = entries.map((e, i) => ({ ...pluginEntry(e), ...(given[i].length ? { files: given[i] } : {}) }));
      prepared = readPrepared(await client.prepare(step.kind, sent, options, cores), entries.length);
    } catch (e) {
      return void fail(id, message(e), at, key);
    }
    if (typeof prepared === "string") return void fail(id, prepared, at, key);
    const jobs: StepJob[] = [];
    try {
      for (const p of prepared) {
        if (gone(id)) break;
        const path = paths.get(p.program);
        const ask = {
          plugin: plugin.id,
          program: p.program,
          args: p.args,
          files: p.files,
          ...(p.stdin ? { stdin: p.stdin } : {}),
          ...(p.then ? { then: p.then } : {}),
          slots,
          cores,
          ...(path ? { path } : {}),
        };
        jobs.push({ id: await startJob(ask), entries: p.entries, reads: p.reads });
      }
    } catch (e) {
      for (const j of jobs) void stopJob(j.id).catch(() => {});
      return void fail(id, `It could not be started: ${message(e)}`, at, key);
    }
    if (gone(id)) return forgetStarted(jobs);
    doc.amend((x) => setRunning(x, id, { at, input: key, options, jobs, kind: step.kind }), { unsaved: true });
    set((prev) => ({ ...prev, jobsSeen: { ...prev.jobsSeen, ...Object.fromEntries(jobs.map((j): [string, JobSeen] => [j.id, { state: "waiting", created: at }])) } }));
    void lookAtJobs();
    await ended(id);
  }

  /**
   * Whether a step is gone while its jobs are readied or started - deleted,
   * its adding undone - for which none is to be started, and those that
   * were are stopped and taken away (`forgetStarted`): none left running,
   * unseen, for no step. (Its `running` is set only once they have started.)
   */
  const gone = (id: number) => !stepOf(doc.getState(), id);

  /** Jobs started for a step that has gone since: stopped, and their folders taken away once they have ended. */
  const forgetStarted = (jobs: readonly StepJob[]) => {
    for (const j of jobs) {
      forgotten.add(j.id);
      void (async () => {
        await stopJob(j.id).catch(() => {});
        const until = Date.now() + STOP_WAIT_MS;
        while (Date.now() < until) {
          const r = await jobOf(j.id).catch(() => null);
          if (!r || finished(r.state)) break;
          await new Promise((go) => setTimeout(go, 500));
        }
        await removeJob(j.id).catch(() => {});
      })();
    }
  };

  /** A Render step's options split: Meno's own choices (the picture's size, shape and materials), and the plugin's. */
  const renderChoices = (kind: StepKind, options: OptionValues) => {
    const own = new Set((kindInfo(kind).own ?? []).map((o) => o.id));
    return { ask: askOf("picture", options), theirs: Object.fromEntries(Object.entries(options).filter(([k]) => !own.has(k))) as OptionValues };
  };

  /**
   * Render, as a step (docs/RENDER.md, *Render as a step*): each entry a
   * picture of its own - its scene written by Meno as the render command
   * writes one, a job of the plugin's for each - laid beside the step as
   * they end (`finishRender`).
   */
  async function renderEach(id: number, plugin: PythonPlugin, at: number): Promise<void> {
    const d = doc.getState();
    const step = stepOf(d, id)!;
    const key = inputKey(d, step, plugin.id);
    const input = inputOf(d, id)!;
    const entries = input.holds === "structures" ? [] : setEntries(input.molecules, input.holds);
    if (!entries.length) return void fail(id, "Nothing came in", at, key);
    const options: OptionValues = optionsOf(optionsFor(step.kind, plugin.id), step.options);
    const { ask, theirs } = renderChoices(step.kind, options);
    const { slots, cores } = runningOf(useAppSettings.getState().calculations);
    const paths = new Map<string, string>();
    for (const decl of installedFor(step.kind, plugin.id)) {
      const where = await lookFor(plugin.id, decl.name);
      if (!where) return void fail(id, tooOld(plugin.id, decl.name) ?? notFound(decl.label), at, key);
      paths.set(decl.name, where);
    }
    const style = style3dOf(get());
    const turns = get().turns3d;
    const jobs: StepJob[] = [];
    try {
      const client = await pluginClient(plugin);
      for (const [i, e] of entries.entries()) {
        if (gone(id)) break;
        const source = input.molecules.find((m) => m.id === e.from);
        const rendered = renderScene([{ m: entryCarried(e, source, e.from != null ? turns[e.from] : undefined) }], style, ask);
        const entry = { scene: SCENE, film: false, width: rendered.width, height: rendered.height, frames: rendered.frames, fps: rendered.fps, ...finishEntry(ask.finish) };
        const prepared = readPrepared(await client.prepare("render", [entry], theirs, cores), 1);
        if (typeof prepared === "string") throw new Error(prepared);
        const p = prepared[0];
        if (p.files.some((f) => f.name === SCENE)) throw new Error("It prepared a job Meno cannot run");
        const path = paths.get(p.program);
        const job = await startJob({ plugin: plugin.id, program: p.program, args: p.args, files: [...p.files, { name: SCENE, text: rendered.gltf }], slots, cores, ...(path ? { path } : {}) });
        const { page } = rendered;
        jobs.push({ id: job, entries: [i], reads: [], size: [page.maxX - page.minX, page.maxY - page.minY] });
      }
    } catch (e) {
      for (const j of jobs) void stopJob(j.id).catch(() => {});
      return void fail(id, `It could not be started: ${message(e)}`, at, key);
    }
    if (gone(id)) return forgetStarted(jobs);
    doc.amend((x) => setRunning(x, id, { at, input: key, options, jobs, kind: step.kind }), { unsaved: true });
    set((prev) => ({ ...prev, jobsSeen: { ...prev.jobsSeen, ...Object.fromEntries(jobs.map((j): [string, JobSeen] => [j.id, { state: "waiting", created: at }])) } }));
    void lookAtJobs();
    await ended(id);
  }

  /**
   * A Render step's jobs ended: the picture each made read, and - where
   * any was made - put in the step's result set, a set of pictures, in
   * place of those it held, with what it did, as one edit; why not, where
   * none was.
   */
  async function finishRender(id: number, run: StepRunning, records: readonly (Job | null)[], plugin: PythonPlugin | undefined, ran: Omit<StepRan, "ok" | "said">) {
    const client = plugin ? await pluginClient(plugin).catch(() => null) : null;
    const { theirs } = renderChoices("render", run.options);
    const made: Rendered[] = [];
    const whys: string[] = [];
    const notes: string[] = [];
    for (const [k, j] of run.jobs.entries()) {
      const record = records[k];
      // (gone without finishing - the computer restarted, say - while others were done: said so, the others' pictures made)
      if (!record || record.state === "gone") {
        whys.push("It stopped without finishing");
        continue;
      }
      if (!client) {
        whys.push("What did it is not added");
        continue;
      }
      try {
        const said = (await client.collect("render", [{ scene: SCENE, film: false }], theirs, {}, await wholeLog(j.id), record.state)) as { why?: unknown; made?: unknown; note?: unknown };
        if (typeof said?.why === "string") {
          whys.push(said.why.trim().slice(0, 300) || "It did not say why");
          continue;
        }
        if (typeof said?.note === "string" && said.note.trim()) notes.push(said.note.trim().slice(0, 60));
        const m = Array.isArray(said?.made) ? (said.made[0] as { file?: unknown; media?: unknown } | undefined) : undefined;
        const file = typeof m?.file === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(m.file) ? m.file : null;
        if (!file || m?.media !== "image/png") {
          whys.push("It said it made nothing Meno can show");
          continue;
        }
        const name = `Render ${id}.${k + 1}.png`;
        // (held as it is: a render's PNG, no camera's turn to read)
        const held = await holdPicture(await readFile(await join(await jobFolder(j.id), file)));
        if (!held) {
          whys.push("What it made cannot be shown");
          continue;
        }
        // (as large as its molecules are drawn; where that was not kept, its pixels' shape, ten bonds wide)
        const size = j.size ?? [10 * NOMINAL_BOND_LENGTH, (10 * NOMINAL_BOND_LENGTH * held.height) / held.width];
        made.push({ picture: { name, sha256: held.sha256, media: held.media, px: [held.width, held.height] }, size });
      } catch (e) {
        whys.push(message(e));
      }
    }
    const total = run.jobs.length;
    const ok = !whys.length && made.length > 0;
    // (a word the plugin says of how it rendered - "Rendered on the processor", where it fell back from the graphics processor it was asked for)
    const note = notes[0] ? ` \u00b7 ${notes[0]}` : "";
    const said = ok ? `${clock(ran.took ?? 0)} \u00b7 ${picturesSaid(made.length, total)}${note}` : whys.length >= total ? whys[0] : `${whys.length} of ${total} failed \u00b7 ${whys[0]}`;
    const first = doc.getState().nextPictureId ?? 1;
    // (one edit: what it did before kept, its pictures - where it made any - in its set in place of those it held, and what it did)
    doc.edit("render", (x) => {
      if (!stepOf(x, id)) return x;
      const kept = keepRun(x, stepOf(x, id)!);
      const next = made.length ? placePictures(kept, stepOf(kept, id)!, made) : kept;
      return setRan(next, id, { ...ran, ok, said });
    });
    // (laid as the view is: a step's pictures come in its set, not where the chemist looks)
    if (made.length) set((prev) => ({ ...prev, picturesLaid: new Set([...prev.picturesLaid, ...made.map((_, i) => first + i)]) }));
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
  async function lastLine(job: string): Promise<{ line?: string; progress?: { done: number; total: number } }> {
    const was = logs.get(job) ?? { from: 0, line: "" };
    let { from, line, progress, tail = "" } = was;
    for (let k = 0; k < 40; k++) {
      const read = await readJobLog(job, from).catch(() => null);
      if (!read || read.next === from) break;
      // (how far it is, where its program says so - "progress 12/240" - kept apart from what it says besides;
      // read from whole lines only, a line read in part kept for the next: "1/240" is no "1/24")
      const text = tail + read.text;
      const cut = text.lastIndexOf("\n") + 1;
      const whole = text.slice(0, cut);
      // (a program that never ends its line keeps no more than a line's worth waiting)
      tail = text.slice(Math.max(cut, text.length - 256));
      progress = progressOf(whole) ?? progress;
      const lines = whole.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !/^progress \d+\/\d+$/.test(l));
      if (lines.length) line = lines[lines.length - 1];
      from = read.next;
    }
    logs.set(job, { from, line, tail, ...(progress ? { progress } : {}) });
    return { ...(line ? { line } : {}), ...(progress ? { progress } : {}) };
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

  /** The results of a step whose jobs have all ended, read back by its plugin and brought in - or what stopped them, or why they failed, or what went wrong bringing them in. */
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

      // stopped - or every one gone without saying how it ended: nothing comes in. (Some gone - the computer restarted,
      // say - and others done: those done come in, the others said failed, as WORKFLOWS.md, When Meno closes, has it.)
      const lost = records.map((r) => !r || r.state === "gone");
      if (records.some((r) => r?.state === "stopped") || lost.every(Boolean)) {
        bringIn(id, [], "molecules", { at: run.at, ok: false, stopped: true, said: `Stopped after ${clock(took)}`, input: run.input, took, jobs: ids, ...as });
        return close();
      }
      // (Render's: pictures, beside the step - no set)
      if (kind === "render") {
        await finishRender(id, run, records, plugin, { at: run.at, input: run.input, took, jobs: ids, ...as });
        return close();
      }
      // (what came in when it started, as it was taken then; opened again, what comes in now, where it is still what came in - its options aside, which may change as it runs)
      const snap = taken.get(id)?.at === run.at ? taken.get(id) : undefined;
      taken.delete(id);
      const input = snap ? null : inputOf(d, id);
      const same = !snap && inputKey(d, { ...step, kind, options: run.options }, by) === run.input;
      const entries: SetEntry[] = snap ? snap.entries : same && input && input.holds !== "structures" ? jobEntries(kind, setEntries(input.molecules, input.holds), input.holds) : [];
      const holds = snap?.holds ?? input?.holds;
      const total = run.jobs.reduce((n, j) => n + j.entries.length, 0);
      const worked: Worked[] = [];
      const whys: string[] = [];
      // (how many of its entries failed, and why: a job that failed fails each entry it was for)
      let failed = 0;
      const fails = (n: number, why: string) => {
        failed += n;
        whys.push(why);
      };
      const client = plugin ? await pluginClient(plugin).catch(() => null) : null;
      for (const [k, j] of run.jobs.entries()) {
        const mine = j.entries.map((i) => entries[i]);
        if (lost[k]) {
          fails(j.entries.length, "It stopped without finishing");
          continue;
        }
        const record = records[k]!;
        if (!client || !plugin) {
          fails(j.entries.length, "What did it is not added");
          continue;
        }
        if (mine.some((e) => !e)) {
          fails(j.entries.length, "What came into it changed while it ran");
          continue;
        }
        // (failed before its program could say: its runner's own words - "orca could not be started", say)
        if (record.state === "failed" && record.why) {
          fails(j.entries.length, record.why);
          continue;
        }
        const log = await wholeLog(j.id);
        const files: Record<string, string> = {};
        let unread: string | undefined;
        // (what it wrote, ended well or not: a program may say why it failed in its output - Gaussian does)
        if (record.state === "done" || record.state === "failed") {
          const there = new Set(await jobFiles(j.id).catch(() => []));
          for (const name of j.reads) {
            if (!there.has(name)) continue;
            try {
              files[name] = await readJobFile(j.id, name);
            } catch (e) {
              unread ??= message(e);
            }
          }
        }
        // (one there that could not be read - past the size Meno reads, say - said so, not taken for one written empty)
        if (unread) {
          fails(j.entries.length, unread);
          continue;
        }
        let said;
        try {
          said = readCollected(await client.collect(kind, mine.map(pluginEntry), run.options, files, log, record.state), mine.length);
        } catch (e) {
          fails(mine.length, message(e));
          continue;
        }
        if ("why" in said) {
          fails(mine.length, said.why);
          continue;
        }
        // (an output for Meno's readers: read as one opened is, and kept as it is)
        if ("read" in said) {
          for (const [i, r] of said.read.entries()) {
            const text = "log" in r ? log : files[r.file];
            const read = text ? await readWithReaders(r, text) : `It wrote no ${r.name}`;
            if (typeof read === "string") {
              fails(1, read);
              continue;
            }
            const made =
              kind === "conformers" ? conformersWorked(mine[i], read.output, read.readers, read.source) : workedOf(kind, mine[i], read.output, read.readers, read.source);
            if (typeof made === "string") {
              fails(1, made);
              continue;
            }
            // (the wavefunction it wrote besides, where it did: kept with what was read, for a step that takes one)
            const wrote = r.wavefunction && files[r.wavefunction.file];
            const kept = wrote ? await rememberOutput(r.wavefunction!.name, wrote, r.wavefunction!.kind) : undefined;
            const withIt = (w: Worked): Worked => (kept && w.calc ? { ...w, calc: { ...w.calc, wavefunction: kept } } : w);
            worked.push(...(Array.isArray(made) ? made : [made]).map(withIt));
          }
          continue;
        }
        // (its log kept with the workspace, as an output it was read from)
        const { kind: _kind, ...source } = await rememberOutput(`${kindInfo(kind).name} ${k + 1}.log`, log, "");
        // (surfaces in cube files, which Meno reads itself: the molecule as it went, with them)
        if ("surfaces" in said) {
          const there = new Set(await jobFiles(j.id).catch(() => []));
          for (const [i, s] of said.surfaces.entries()) {
            const out = await surfacesRead(j.id, mine[i], s, there);
            if (typeof out === "string") {
              fails(1, out);
              continue;
            }
            const made = workedOf(kind, mine[i], out, [`${plugin.id} ${client.version || plugin.version}`], log ? source : undefined);
            if (typeof made === "string") fails(1, made);
            else worked.push(made);
          }
          continue;
        }
        for (const [i, out] of said.entries()) {
          // (by the version its worker said it runs, as a reader's is kept)
          const readers = [`${plugin.id} ${client.version || plugin.version}`];
          const made = kind === "conformers" ? conformersWorked(mine[i], out, readers, log ? source : undefined) : workedOf(kind, mine[i], out, readers, log ? source : undefined);
          if (typeof made === "string") fails(1, made);
          else worked.push(...(Array.isArray(made) ? made : [made]));
        }
      }
      const ok = !whys.length && worked.length > 0;
      // (a search says how many conformers it found, of how many compounds)
      const found =
        kind === "conformers"
          ? `${clock(took)} \u00b7 ${worked.length} conformer${worked.length === 1 ? "" : "s"}${total > 1 ? ` of ${total} compounds` : ""}`
          : doneSaid(worked, total, took);
      const said = ok ? found : failed >= total ? whys[0] : `${failed} of ${total} failed \u00b7 ${whys[0]}`;
      const gives = givesFor(kind, holds ?? "molecules");
      // (refused, and its run closed as any other)
      if (gives) bringIn(id, worked, gives, { at: run.at, ok, said, input: run.input, took, jobs: ids, ...as });
      else fail(id, ON_DRAWN, run.at, run.input);
      close();
    } catch (e) {
      // (whatever went wrong bringing its results in: said as how it ended, and its run closed - its jobs looked at no more, those waiting for it let go)
      const step = stepOf(doc.getState(), id);
      const run = step?.running;
      if (step && run) {
        // (where its results came in before it went wrong, they stay)
        if (step.ran?.at !== run.at) {
          const said = `Its results could not be brought in: ${message(e)}`;
          bringIn(id, [], "molecules", { at: run.at, ok: false, said, input: run.input, took: Date.now() - run.at, jobs: run.jobs.map((j) => j.id), kind: run.kind ?? step.kind, options: run.options });
        }
        doc.amend((x) => setRunning(x, id, undefined), { unsaved: true });
      }
    } finally {
      finishing.delete(id);
    }
  }

  /**
   * Surfaces a job wrote for an entry, read from its cube files by Meno's
   * own reader (lib/calc/cube): the entry's molecule as it went, with a list
   * of them - opened at once, its first shown - each its grid at the value
   * said, coloured by the other grid where it says so. Why not, where a file
   * is not there or not a cube.
   */
  async function surfacesRead(job: string, entry: SetEntry, s: ToSurfaces, there: ReadonlySet<string>): Promise<ReaderOutput | string> {
    const grid = async (file: string, iso?: number) => {
      if (!there.has(file)) throw new Error(`It wrote no ${file}`);
      const g = cubeGrid(file, await readJobFile(job, file), "grid:0");
      return iso != null ? { ...g, iso } : g;
    };
    try {
      const rows = [];
      for (const r of s.rows) {
        const surface = await grid(r.file, r.iso);
        const colour = r.colour ? { by: await grid(r.colour.file), from: r.colour.from, to: r.colour.to, ...(r.colour.label ? { label: r.colour.label } : {}) } : undefined;
        rows.push({ cells: [r.label], frame: 0, surface: colour ? { ...surface, signed: undefined } : surface, ...(colour ? { colour } : {}) });
      }
      return {
        schema: 1,
        atoms: entry.atoms.map((a) => a.el),
        frames: [[...entry.xyz]],
        results: [{ id: "surfaces", on: "list", group: s.name, label: s.name, columns: [{ label: "Surface" }], rows, shown: 0 }],
      };
    } catch (e) {
      return message(e);
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
          const { line, progress } = job.state === "running" ? await lastLine(j.id) : {};
          seen[j.id] = {
            state: job.state,
            created: job.created,
            ...(job.started != null ? { started: job.started } : {}),
            ...(job.ended != null ? { ended: job.ended } : {}),
            ...(place > 0 ? { place } : {}),
            ...(line ? { line } : {}),
            ...(progress ? { progress } : {}),
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
    menoWorking: {} as Record<number, { since: number; done: number; total: number }>,
    runStep: (id: number) => runSteps([id]),
    runFrom: (id: number) => runSteps([id, ...after(doc.getState(), id)]),
    runAll: () => {
      const d = doc.getState();
      // (every step that is not done - not run, changed, failed or stopped - or is running; one with nothing coming in left as it is - and every step after one, which takes anew what it gives)
      const stale = (d.steps ?? []).filter((s) => s.running || !["done", "no-input"].includes(stateOf(d, s, byOf(s)))).map((s) => s.id);
      return runSteps([...new Set(stale.flatMap((id) => [id, ...after(d, id)]))]);
    },
    stopStep: (id: number) => {
      if (get().menoWorking[id]) menoStops.add(id);
      menoKills.get(id)?.();
      for (const j of stepOf(doc.getState(), id)?.running?.jobs ?? []) void stopJob(j.id).catch(() => {});
      void lookAtJobs();
    },
    stopAll: () => {
      for (const id of Object.keys(get().menoWorking)) menoStops.add(Number(id));
      menoKills.forEach((kill) => kill());
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
    /** Whether a step's last run's jobs are kept still: not where their folders were taken away with it, deleted - and back by an undo. */
    jobsKept: (step: { ran?: StepRan }) => (step.ran?.jobs ?? []).some((j) => !forgotten.has(j)),
    /** A step deleted: its jobs stopped, and their files taken away once they have ended - those of every run it keeps, not its last alone - and those waiting for its run let go, as when it is stopped. */
    forgetJobs: (step: { id: number; running?: { jobs: StepJob[] }; ran?: StepRan; runs?: readonly StepRan[] }) => {
      // (not left to the next look at the jobs: where it was the only step running, there is none)
      const waiting = waiters.get(step.id) ?? [];
      waiters.delete(step.id);
      waiting.forEach((f) => f());
      const jobs = [...new Set([...(step.running?.jobs.map((j) => j.id) ?? []), ...(step.ran?.jobs ?? []), ...(step.runs ?? []).flatMap((r) => r.jobs ?? [])])];
      for (const job of jobs) {
        forgotten.add(job);
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
