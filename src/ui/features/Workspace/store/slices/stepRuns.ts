import type { JobState } from "../../../../../lib/jobs";
import type { StoreApi } from "zustand";
import { join } from "@tauri-apps/api/path";
import { readFile } from "@tauri-apps/plugin-fs";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import type { DocumentStore } from "../../../../../lib/doc";
import { anyKindById, neededWhy, pluginById, stoppedOf, type PythonPlugin } from "../../../../../lib/calc/catalog";
import type { CalcSource, ReaderOutput } from "../../../../../lib/calc/output";
import { readOutput } from "../../../../../lib/calc/read";
import { heldOutput, rememberOutput } from "../../../../../lib/calc/asks";
import { addedNow, pluginClient } from "../../../../../lib/calc/workers";
import { computerCores, computerResources, finished, jobDigest, jobFiles, jobFolder, jobOf, limitsOf, listJobs, overLimits, processesOf, programStamp, readJobFile, readJobLog, removeJob, runningOf, startJob, stopJob, writeJobBack, type Job } from "../../../../../lib/jobs";
import { heldJobFile, heldJobSource, showFilesSaid } from "../../workflow/keptJobs";
import type { OptionValues } from "../../../../../lib/options";
import { lookFor, programKey, tooOld, useInstalled } from "../../../../../lib/plugins/installed";
import { jobKey, reusable } from "../../../../../lib/jobKeys";
import { stopWorker } from "../../../../../lib/plugins/process";
import { chemAtHand, chemWorker, pluginWorker, rolePlugin } from "../../../../../lib/roles/worker";
import type { By, Property } from "../../../../../lib/entry";
import { drawingOf, molblockOfSmiles, withoutStereoOpen, stereoOpenOf, stereoOpenSaid, type StereoOpen } from "../../chem/fromSmiles";
import { styleOf } from "../../../../../lib/chem/style";
import { useAppSettings } from "../../../../../lib/settings/appSettings";
import * as ops from "../../document";
import type { WorkspaceDocument } from "../../document";
import { bareAtomsOf, bareNames, blocksOf, CONFORMERS_MS, drawnBlocksOf, moleculeOf } from "../../chem/make3d";
import { byOf, installedFor, optionsFor, programsFor, takesNothingBy } from "../../workflow/doers";
import { partOf } from "../../chem/cleanUp";
import { compoundLetter, frameXyz, framesOf, madeFrom, recordNumber, setEntries, TAKEN_AT_THE_EDIT, skeletonEntries, skeletonsRefused, type DrawnEntry, type SetEntry } from "../../workflow/entries";
import { skeletonWhy } from "../../../../../lib/chem/skeleton";
import { allToRun, chainTo, findSet, inputKey, inputOf, stepOf, stepsAfter, wiresInto } from "../../workflow/flow";
import { kindInfo, optionsOf, takesNothing, type Holds3D, type SetKind, type StepKind, isSetKind } from "../../workflow/kinds";
import { failuresSaid, type Failure, type FailureKind } from "../../workflow/failures";
import { setRan, setRunning } from "../../workflow/model";
import { stoppedAt, clock, conformersWorked, doneSaid, PAIRED, drawnSaid, readDrawnAnswers, type DrawnValue, isFailure, entryFiles, notFound, pluginEntry, programEntries, readCollected, readGenerated, notReadSaid, seedsSaid, unreadWhy, readKept, readNote, readPrepared, readRefused, workedOf, type Refusal, type ToRead, type ToSurfaces } from "../../workflow/programs";
import { cubeGrid } from "../../../../../lib/calc/cube";
import { resultKey, resultsOn } from "../../../../../lib/calc/results";
import { emptyIn, energiesBy, energyLevels, inputEntries, keepRun, keptOf, keptRun, laidOver, LAID_OVER, ranAs, ranEmpty, resultsOf, runStep as runMenoStep, showRun, whyNot, withResults, type RunResults, type RunWith, type Worked } from "../../workflow/run";
import { runMenoDrawn, runMenoInTurns } from "../../workflow/meno";
import { atomMapPlan, atomMapSet, moleculeOfEntry, type EntriesMapped } from "../../workflow/structureSteps";
import { mapOntoOff } from "../../chem/mapProducts";
import { valenceFlagged } from "../../workflow/enumerateChecks";
import { perceiveStereo } from "../../workflow/configurations";
import { askerFor } from "../../workflow/configurationsAsker";
import type { DrawnRecord, EditorState, JobSeen, Model, StepJob, StepRan, StepRunning, Turn3D, WorkflowStep } from "../types";
import { askOf, finishEntry } from "../../render/renderOptions";
import { progressOf, SCENE } from "../../render/renders";
import { renderScene } from "../../render/renderScene";
import { style3dOf } from "../../style3d";
import { holdPicture } from "../../../../../lib/picture/held";
import { entryCarried, picturesSaid, placePictures, type Rendered } from "../../workflow/renderStep";
import { NOMINAL_BOND_LENGTH } from "../../../../../lib/chem/acs";

type SetState = StoreApi<EditorState>["setState"];
type GetState = StoreApi<EditorState>["getState"];

/** What a job's runner says of a folder holding what a job was to run but no record of how it ran (jobs.rs `NO_RECORD`). */
const NO_RECORD = "it has no record of how it ran";

/** How long before its run a job may have been asked for and be the run's own: the moments a run takes to ready its jobs. */
const STARTED_BEFORE_MS = 60_000;

/** How long Meno waits for a stopped job to end before its files are taken away - one started for a step gone since. */
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
/** Structures by their places among `of`: "structure 3", "structures 1, 2 and 4". */
const structuresAt = (places: readonly number[]) =>
  places.length === 1 ? `structure ${places[0]}` : `structures ${places.slice(0, -1).join(", ")} and ${places[places.length - 1]}`;

/** The structures that could not be made in 3D, by their places among `of`: "structure 3 of 4 could not be made in 3D". */
export function notMade(places: readonly number[], of: number): string {
  return `${structuresAt(places)} of ${of} could not be made in 3D`;
}

/**
 * The structures not made in 3D because their drawing leaves a stereocentre
 * or a double bond open that could go more than one way, by their places
 * among `of`: a conformer search never chooses a configuration the drawing
 * does not give.
 */
export function stereoOpen(places: readonly number[], of: number): string {
  return `${structuresAt(places)} of ${of} ${places.length === 1 ? "leaves" : "leave"} stereo open: draw it, wedges and all`;
}

/** Why a structure drawn was not made in 3D, as its record in the Failed exit says it: its stereo left open - so many centres, double bonds and axes, counted once each (`stereoOpenOf`) - to be given it first. */
export function openWhy(open: StereoOpen | undefined): string {
  return `${stereoOpenSaid(open) ?? "its stereo not specified"}: put Stereoisomers before Conformers`;
}
/** Why a structure drawn was not made in 3D: one atom alone, or what could not be made. */
export const BARE_WHY = "one atom alone has no 3D structure";
export const NOT_MADE_WHY = "could not be made in 3D";

/** The structures not made in 3D because each is a lone atom or ion alone, by their places among `of`: Na+, Cl-, a lone metal. */
export function bareLeft(places: readonly number[], of: number): string {
  return `${structuresAt(places)} of ${of} left out: one atom alone has no 3D structure`;
}

/** A structure made in 3D without some of its parts, by its place: its lone ions named, any other part counted - only its first is made. */
export function partsLeft(place: number, bare: string | undefined, others: number): string {
  const what = [...(bare ? [bare] : []), ...(others ? [`${others} other part${others === 1 ? "" : "s"}`] : [])].join(" and ");
  return `${structuresAt([place])}: its ${what} left out`;
}

/** The structures made in 3D with their stereo free, by their places among `of`: open, and no stereoisomer of them holds in 3D. */
export function stereoFree(places: readonly number[], of: number): string {
  return `${structuresAt(places)} of ${of} made with ${places.length === 1 ? "its" : "their"} stereo free: no stereoisomer of ${places.length === 1 ? "it" : "them"} holds in 3D`;
}

/** How many structures drawn come into a step (flow `inputOf`): on the page, and held in its result set after them. */
const drawnIn = (input: { structures: readonly unknown[]; held?: readonly unknown[] }) => input.structures.length + (input.held?.length ?? 0);

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
  // (each log text's latest asking for a job to show, counted: one read late is let go)
  const logAsked = new Map<number, number>();
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

  /** The steps before a step: each that gives what comes into one of its inputs, once - a step of two inputs may have two. */
  const before = (d: WorkspaceDocument, id: number) => {
    const ids = new Set(wiresInto(d, id).flatMap((w) => findSet(d, w.from.set)?.made?.step ?? []));
    return [...ids].flatMap((k) => stepOf(d, k) ?? []);
  };


  /** A step that could not run, said so - with what it was to run as. */
  const fail = (id: number, said: string, at: number, input: string) =>
    doc.edit("run", (d) => {
      const step = stepOf(d, id);
      // (a run that could not start: nothing it did, so nothing dropped for it)
      return step ? setRan(keepRun(d, step, false), id, { at, ok: false, said, input, kind: step.kind, ...(step.options ? { options: step.options } : {}) }) : d;
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
    // (a branch that gave nothing this time: ended at once, its exits empty - no job, no worker asked)
    const none = emptyIn(d, step, by);
    if (none) return void doc.edit("run", (x) => ranEmpty(x, id, none, key, { ...w, byOf, now: at }));
    // (which stereoisomer each entry is, where the kind needs it known: asked first, every entry its own)
    const kind = kindInfo(step.kind);
    if (by === "meno" && kind.perceives === "configurations" && (kind.perceivesWith?.(optionsOf(kind.options ?? [], step.options)) ?? true)) {
      const input = inputOf(d, id);
      if (input && input.holds !== "structures") await perceiveStereo(setEntries(input.molecules, input.holds), askerFor());
    }
    if (by === "meno" && step.kind === "duplicates") return menoInTurns(id, at);
    if (by === "meno" && step.kind === "atom-map") return menoAtomMap(id, at);
    if (by === "meno" && step.kind === "enumerate") return enumerateChecked(id, at);
    if (by === "meno") return void doc.edit("run", (x) => runMenoStep(x, id, { ...w, byOf, now: at }));
    const plugin = pluginById(by);
    if (!plugin) return void fail(id, "Nothing added does this step", at, key);
    // (a plugin stopped - one it uses not added, or not of a version it works with - runs nothing, saying why)
    const stopped = stoppedOf(plugin, addedNow());
    if (stopped) return void fail(id, `${plugin.name} is stopped. ${stopped}.`, at, key);
    if (takesNothing(step.kind)) return runGenerate(id, plugin, at);
    if (step.kind === "conformers" && inputOf(d, id)?.holds === "structures") return searchDrawn(id, plugin, at);
    if (step.kind === "render") return renderEach(id, plugin, at);
    // (a plugin's step that gives structures drawn of structures drawn: at once, in its worker)
    if (kindInfo(step.kind).gives === "structures" && inputOf(d, id)?.holds === "structures") return runDrawnAtOnce(id, plugin, at);
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
    const own = optionsOf(kindInfo("enumerate").options ?? [], step.options);
    const way = own.way === "substituents" ? "substituents" : "rgroups";
    const lists = String((way === "substituents" ? own.groups : own.lists) ?? "");
    let checked: string;
    const by = rolePlugin("checks");
    if (entries.length === 1 && by && (await chemAtHand("checks"))) {
      let flagged: string[] | null;
      try {
        const chem = await chemWorker("checks");
        flagged = await valenceFlagged(entries[0].drawn, lists, (molblock) => chem.request("analyse", { molblock }), way);
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
      outcome = await runMenoInTurns(step.kind, entries, holds, step.options, energiesBy(input.molecules), { onDone: (done) => working({ done }), stopped: () => menoStops.has(id) }, energyLevels(input.molecules));
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
   * Meno's Atom map, its entries mapped in a worker (chem/mapProducts) -
   * each can take seconds, which the page does not wait on - those of each
   * reference in turn, its card saying how many are done, and stopped with
   * the step; its results put in at the end as one edit, as Meno's other
   * steps'.
   */
  async function menoAtomMap(id: number, at: number): Promise<void> {
    if (get().menoWorking[id]) return;
    menoStops.delete(id);
    const d = doc.getState();
    const step = stepOf(d, id)!;
    const key = inputKey(d, step, "meno");
    const [m, r] = [inputOf(d, id, "molecules")!, inputOf(d, id, "reference")!];
    const entries = setEntries(m.molecules, m.holds as Holds3D);
    const references = setEntries(r.molecules, r.holds as Holds3D);
    const v = optionsOf(kindInfo("atom-map").options ?? [], step.options);
    const plan = atomMapPlan(entries, references, v);
    if ("refused" in plan) return void fail(id, plan.refused, at, key);
    const total = plan.groups.reduce((n, g) => n + g.sides.length, 0);
    const working = (patch: { done: number } | null) =>
      set((prev) => {
        const rest = { ...prev.menoWorking };
        if (patch) rest[id] = { since: at, total, ...patch };
        else delete rest[id];
        return { ...prev, menoWorking: rest };
      });
    working({ done: 0 });
    const mapped: EntriesMapped[] = [];
    let stopped = false;
    try {
      // (each reference's entries in turn, the count done going on across them)
      let before = 0;
      for (const g of plan.groups) {
        const job = mapOntoOff(
          g.reference.map((i) => moleculeOfEntry(references[i])),
          g.sides.map((side) => side.map((i) => moleculeOfEntry(entries[i]))),
          { bonds: v.bonds === "same" ? "same" : "change", every: v.maps === "every" },
          (done) => working({ done: before + done }),
        );
        menoKills.set(id, job.stop);
        mapped.push(await job.result);
        before += g.sides.length;
        if (menoStops.has(id)) break;
      }
    } catch (e) {
      stopped = true;
      if (!menoStops.has(id)) return void fail(id, `The mapping stopped: ${e instanceof Error ? e.message : String(e)}`, at, key);
    } finally {
      working(null);
      menoKills.delete(id);
    }
    const still = stepOf(doc.getState(), id);
    if (!still) return;
    const took = Date.now() - at;
    const as = { kind: still.kind, ...(still.options ? { options: still.options } : {}) };
    if (stopped || menoStops.has(id) || mapped.length < plan.groups.length) {
      menoStops.delete(id);
      return void doc.edit("run", (x) => setRan(keepRun(x, still), id, { at, ok: false, stopped: true, said: `Stopped after ${clock(took)}`, input: key, took, ...as }));
    }
    // (no time said: Meno's own steps say none)
    const outcome = atomMapSet(entries, references, m.holds as Holds3D, v, mapped);
    doc.edit("run", (x) => ranAs(x, id, outcome, key, { ...w, byOf, now: at }));
  }

  /**
   * The kind of set a program's results make, for what came in (Render's
   * pictures are laid by `finishRender`): molecules in 3D, or a conformer
   * set. None, where that would be structures drawn - which only Meno's own
   * steps give, so a program's step that would is refused.
   */
  const givesFor = (kind: Parameters<typeof kindInfo>[0], holds: SetKind): Holds3D | null => {
    const g = kindInfo(kind).gives;
    const made = isSetKind(g) ? g : holds;
    return made === "structures" ? null : made;
  };

  /** The results of a step put in, as one edit - what it set aside in its second exit's set - and what it did kept with it; a molecule that is an optimisation's path shown at its end. */
  function bringIn(id: number, worked: Worked[], holds: Holds3D, ran: StepRan, aside: SetEntry[] = [], asideDrawn: DrawnEntry[] = []) {
    const d = doc.getState();
    const step = stepOf(d, id);
    if (!step) return;
    const before = new Set((d.molecules3d ?? []).map((m) => m.id));
    // (what it did before kept among its runs)
    // (nothing it gave and nothing set aside: its run alone - those that failed out of its Failed exit even where none was done,
    //  for a run again to start from)
    if (!worked.length && !aside.length && !asideDrawn.length) return void doc.edit("run", (x) => setRan(keepRun(x, stepOf(x, id)!), id, ran));
    const outcome = { ok: true as const, holds, kept: worked, aside, said: ran.said, ...(asideDrawn.length ? { asideDrawn } : {}) };
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

  /** Molecules new on the page that are an optimisation's path, shown at their ends; and those of one entry frame - a path search's point refined, among its images - at it: what the step gave, as a set takes it. */
  function atTheirEnds(before: ReadonlySet<number>) {
    for (const m of doc.getState().molecules3d ?? []) {
      if (before.has(m.id) || !m.frames?.length) continue;
      if (m.path) get().setFrame3d(m.id, m.frames.length);
      else if (m.entryFrames?.length === 1) get().setFrame3d(m.id, m.entryFrames[0]);
    }
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
          // (each step before it run first, or its run under way waited for: a step of two inputs, both - never after the first alone)
          const priors = before(doc.getState(), id).filter((prior) => wanted.has(prior.id) || prior.running);
          if (priors.length) {
            const went = await Promise.all(priors.map((prior) => (wanted.has(prior.id) ? run(prior.id) : ended(prior.id).then(() => true))));
            if (went.includes(false)) return false;
          }
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
    // (those whose drawing leaves a stereocentre or a double bond open that could go more than one way, by their places: not made, a configuration never chosen for them)
    const open: number[] = [];
    // (those left open where no stereoisomer holds in 3D - a strained cage's: made as the embedding places them, and said so)
    const free: number[] = [];
    // (those that are a lone atom or ion alone, by their places: one atom alone has no 3D structure - left out, and said so)
    const bareOnly: number[] = [];
    // (those made without some of their parts - a salt's counter-ion, which has no 3D structure; any part past the first: said, each by its place)
    const partly: string[] = [];
    // (each structure drawn not made, as it came, with why: in the step's Failed exit, to be followed and wired on - into Stereoisomers, one left open)
    const notMadeDrawn: DrawnEntry[] = [];
    try {
      let chem = await pluginWorker(plugin);
      // (each structure drawn: on the page, by its atoms; then those held in its result set off the page, as it holds them)
      const sources = [
        ...input.structures.map((atoms, i) => ({ model: d.model, atoms, off: false, record: input.records[i] })),
        ...(input.held ?? []).map((m) => ({ model: m as Model, atoms: m.atoms.map((a) => a.id), off: true, record: m.record })),
      ];
      for (const [place, { model, atoms, off, record }] of sources.entries()) {
        if (menoStops.has(id)) break;
        working({ done: place });
        const blocks = blocksOf(model, atoms);
        const bare = bareAtomsOf(model, atoms);
        const block = blocks[0];
                // (failed - no result to stand on: a table says so, a chart refuses it, "state = finished" leaves it - what it was set aside for before kept beside why)
        const asideAs = (why: string) => {
          const { status, ...kept } = record ?? {};
          const earlier = status && typeof status === "object" ? ("aside" in status ? status.aside : status.failed) : undefined;
          notMadeDrawn.push({ place, drawn: partOf(model, new Set(atoms)), record: { ...kept, status: { failed: earlier ? `${why} (earlier: ${earlier})` : why } } });
        };
        if (!block) {
          if (bare.length) bareOnly.push(place + 1);
          else failed.push(place + 1);
          asideAs(bare.length ? BARE_WHY : NOT_MADE_WHY);
          continue;
        }
        let made;
        try {
          // (a step cannot ask, as the canvas's 3D structure does, which stereoisomer is meant: one whose drawing leaves any open that could go
          //  more than one way in 3D is not made - an allene's axis always could, its stereoisomers not counted; a bridgehead whose rings allow
          //  it one way only is no choice, and is made so)
          const left = await chem.request("open_stereo", { molblock: block.molblock }, CONFORMERS_MS);
          const unset = left.atoms.length + left.bonds.length > 0;
          if (unset && (left.isomers > 1 || (left.cumulenes?.length ?? 0) > 0)) {
            open.push(place + 1);
            asideAs(openWhy(stereoOpenOf(left)));
            continue;
          }
          if (unset && left.free) free.push(place + 1);
          // (as long as the canvas allows the same question: the plugin, the molecule and how many are sought are the same)
          made = (await chem.request("conformers", { molblock: block.molblock, isomers: "one", options }, CONFORMERS_MS)).isomers[0];
        } catch {
          if (menoStops.has(id)) break;
          // (said by its place, in words: what the plugin's library says of it is none of the chemist's to read)
          failed.push(place + 1);
          asideAs(NOT_MADE_WHY);
          // (its worker may have gone with it - held past its time, or stopped: the next is asked of the one running now, started afresh where need be)
          chem = await pluginWorker(plugin);
          continue;
        }
        // (none made of it, said so too)
        if (!made) {
          failed.push(place + 1);
          asideAs(NOT_MADE_WHY);
          continue;
        }
        // (one made from a structure on no page is linked to no drawing: its atoms' ids are its own, not the page's)
        const m = off ? unlinked(moleculeOf(made, block)) : moleculeOf(made, block);
        // (what worked out their energies, for the steps that rank them: the plugin, and its force field)
        const calc = { readers: [], program: plugin.name, ...(made.field ? { method: made.field } : {}) };
        // (each conformer with them, and with what the molecule keeps: the conformers of one compound are made alike - entries `unlikeMade`)
        const keep = keptOf(m);
        // (what was worked out of the structure drawn - a model's values, its descriptors, its SMILES - is of each of its
        //  conformers too, the same structure: carried on with them, for a Filter or a table to read)
        const properties = record?.properties && Object.keys(record.properties).length ? record.properties : undefined;
        for (let f = 0; f < framesOf(m); f++) {
          worked.push({
            compound: compounds,
            number: f + 1,
            atoms: m.atoms,
            bonds: m.bonds,
            xyz: frameXyz(m, f),
            ...(m.energies?.[f] != null ? { energy: m.energies[f] } : {}),
            ...(properties ? { properties } : {}),
            calc,
            keep,
          });
        }
        compounds++;
        if (bare.length || blocks.length > 1) partly.push(partsLeft(place + 1, bare.length ? bareNames(bare) : undefined, blocks.length - 1));
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
    const of = drawnIn(input);
    // (each not made said: those that could not be, and those whose stereo is left open)
    const unmade = [...(failed.length ? [notMade(failed, of)] : []), ...(open.length ? [stereoOpen(open, of)] : []), ...(bareOnly.length ? [bareLeft(bareOnly, of)] : [])];
    // (made, but said: their stereo not held - only those that were made)
    const freed = free.filter((p) => !failed.includes(p));
    // (none made, and none to set aside: nothing came that could be - else those not made, in the Failed exit, each saying why)
    if (!worked.length && !notMadeDrawn.length) return void fail(id, "No structure drawn could be made in 3D", at, key);
    const took = Date.now() - at;
    const left = [...unmade, ...(freed.length ? [stereoFree(freed, of)] : []), ...partly].map((u) => ` \u00b7 ${u}`).join("");
    bringIn(id, worked, "conformers", {
      at,
      ok: true,
      said: `${clock(took)} \u00b7 ${worked.length} conformer${worked.length === 1 ? "" : "s"}${compounds > 1 ? ` of ${compounds} compounds` : ""}${left}`,
      input: key,
      took,
      kind: step.kind,
      ...(step.options ? { options: step.options } : {}),
    }, [], notMadeDrawn);
  }

  /**
   * A step a plugin does at once on structures drawn (`run`, docs/PLUGINS.md,
   * *Steps on structures drawn*): each structure given as its MOL blocks,
   * one for each of its parts, and what the plugin says of each taken in,
   * in their order - kept as drawn, with its record; made anew, each of its
   * drawings read and laid out as a SMILES's are (chem/fromSmiles
   * `drawingOf`), each with the record of the one it was made of; or set
   * aside, its record saying why. Nothing taken in part.
   */
  /**
   * How long a step on structures drawn may take at once (ms), by how many came in: a request's own two minutes,
   * or half a minute for each - its stereoisomers each tried in 3D, a camphor's take some 10 s - where that is
   * longer, but never more than ten minutes. Its plugin sets aside, alone, a structure it has looked at longer than
   * that half minute (RDKit's `EXAMINE_S`); this limit is what is left, for a worker gone quiet, and fails the
   * whole run.
   */
  const DRAWN_EACH_MS = 30_000;
  const DRAWN_MOST_MS = 10 * 60_000;
  const drawnMs = (n: number) => Math.min(DRAWN_MOST_MS, Math.max(2 * 60_000, n * DRAWN_EACH_MS));

  async function runDrawnAtOnce(id: number, plugin: PythonPlugin, at: number): Promise<void> {
    const d = doc.getState();
    const step = stepOf(d, id)!;
    const key = inputKey(d, step, plugin.id);
    const input = inputOf(d, id)!;
    // (those on the page, or those a large result set holds off it)
    const entries = inputEntries(d.model, input);
    if (!entries.length) return void fail(id, "Nothing came in", at, key);
    const options: OptionValues = optionsOf(optionsFor(step.kind, plugin.id), step.options);
    let answers;
    const made: DrawnEntry[][] = [];
    try {
      const client = await pluginClient(plugin);
      // (each as its entry draws it: on the page, then held - inputEntries)
      const given = entries.map((e) => ({ molblocks: drawnBlocksOf(e.drawn, e.drawn.atoms.map((a) => a.id)).map((b) => b.molblock) }));
      answers = readDrawnAnswers(await client.run(step.kind, given, options, "structures", drawnMs(given.length)), entries.length);
      if (typeof answers === "string") return void fail(id, answers, at, key);
      const style = styleOf(get().docStyle);
      for (const [i, a] of answers.entries()) {
        if (!("made" in a)) {
          made.push([]);
          continue;
        }
        // (each made one drawn as Meno draws a SMILES's - one that cannot be, its structure set aside whole, saying so)
        try {
          made.push(await Promise.all(a.made.map(async (block) => ({ place: 0, drawn: withoutStereoOpen(await drawingOf(block, style)) }))));
        } catch {
          made.push([]);
          answers[i] = { aside: "what it was made into could not be drawn", kind: "drawing" };
        }
      }
    } catch (e) {
      return void fail(id, message(e), at, key);
    }
    // (a record without the status it came in with: what this step says of it is its own)
    const carried = (e: DrawnEntry) => {
      const { status: _status, ...rest } = e.record ?? {};
      return Object.keys(rest).length ? rest : undefined;
    };
    // (one made anew - a stereoisomer of it - is another structure: none of the values worked out of the one it was made
    //  of as its own, which were not of it, but what that came from; which of how many it is, and its own SMILES; and
    //  each value of the one it was made from, as that one's - named so, `made_from.nll`, by what worked it out then -
    //  never as its own, which stay to be worked out. That one's own made from another: what it carried of that one
    //  carried as it is, one level - of the structure it was made from still, at a remove - its own values over
    //  them, and which of how many it was left out)
    const madeRecord = (e: DrawnEntry, k: number, a: { made: string[]; smiles?: string[]; properties?: Record<string, DrawnValue> }): DrawnRecord => {
      const by: By = { plugin: plugin.id, version: plugin.version, ...(program ? { program } : {}), method: `${kindInfo(step.kind).name}: ${a.made.length} made of one` };
      const said = (value: string): Property => ({ value, unit: "none", status: "computed", by });
      const parents = madeFrom(e.record);
      return {
        ...(e.record?.from?.length ? { from: e.record.from } : {}),
        properties: {
          made: said(`${k + 1} of ${a.made.length}`),
          ...(a.smiles ? { smiles: said(a.smiles[k]) } : {}),
          // (what the step worked out of each it made: a C=N whose E/Z it left alone, say, and why)
          ...Object.fromEntries(Object.entries(a.properties ?? {}).map(([name, p]) => [name, valueOf(p)])),
          ...Object.fromEntries(parents),
        },
      };
    };
    // (each value as an entry's property: worked out by the plugin, its version and the program it runs, and how)
    const program = plugin.uses?.[0] ? `${plugin.uses[0].name} ${plugin.uses[0].version}` : undefined;
    const valueOf = (p: DrawnValue): Property => ({
      value: p.value,
      unit: p.unit,
      status: "computed",
      by: { plugin: plugin.id, version: plugin.version, ...(program ? { program } : {}), ...(p.method ? { method: p.method } : {}) },
    });
    const kept: DrawnEntry[] = [];
    const aside: DrawnEntry[] = [];
    answers.forEach((a, i) => {
      const e = entries[i];
      // (kept as drawn - with what the step worked out of it, where it did, on its record beside what it had. Kept,
      //  it is not what an earlier step set aside, whatever it came in saying; and given values worked out of it as it
      //  now is - at least one - its record says those it had before an edit were taken away, not that these are of it)
      if ("as" in a) {
        const { stale, ...rest } = carried(e) ?? {};
        const record: DrawnRecord =
          a.properties && Object.keys(a.properties).length
            ? {
                ...rest,
                properties: { ...rest.properties, ...Object.fromEntries(Object.entries(a.properties).map(([name, p]) => [name, valueOf(p)])) },
                ...(stale ? { stale: TAKEN_AT_THE_EDIT } : {}),
              }
            : { ...rest, ...(stale ? { stale } : {}) };
        kept.push({ ...e, record: Object.keys(record).length ? record : undefined });
      }
      else if ("made" in a) made[i].forEach((m, k) => kept.push({ place: kept.length, drawn: m.drawn, record: madeRecord(e, k, a) }));
      else aside.push({ ...e, record: { ...carried(e), status: { aside: a.aside } } });
    });
    doc.edit("run", (x) => ranAs(x, id, { ok: true, holds: "structures", kept, aside, said: drawnSaid(answers) }, key, { ...w, byOf, now: at }));
  }

  /**
   * How long a step that makes structures from nothing may take at once (ms): a model sampling, on a computer busy
   * with other work. A wall-clock limit only ever fails the whole run: what one asking makes is the same however
   * long it took.
   */
  const GENERATE_MS = 10 * 60_000;

  /**
   * A step that takes nothing in, a plugin's at once (`run`, with no entries: Generate's - docs/PLUGINS.md,
   * *Generate*): what the model made, each SMILES read as one pasted is (the roles' `from_smiles`, then Meno's
   * engine: chem/fromSmiles `drawingOf`) - its stereo as written, what it leaves open counted and kept on its
   * record (`stereo_open`), never chosen - each a structure drawn of its own, its record holding the SMILES as
   * given and the model's own values, named, and what made them. A SMILES that cannot be read is counted as not
   * read, never dropped unsaid.
   */
  async function runGenerate(id: number, plugin: PythonPlugin, at: number): Promise<void> {
    const d = doc.getState();
    const step = stepOf(d, id)!;
    const key = inputKey(d, step, plugin.id);
    const options: OptionValues = optionsOf(optionsFor(step.kind, plugin.id), step.options);
    // (made from seeds, where its plugin says so: the structures wired in, each given as its blocks - those a large
    //  result set holds off the page too)
    const seeded = !takesNothingBy(step.kind, plugin.id);
    const input = seeded ? inputOf(d, id) : null;
    const seeds = input && input.holds === "structures" ? inputEntries(d.model, input) : [];
    if (seeded && !seeds.length) return void fail(id, "No seed came in", at, key);
    let read;
    try {
      const client = await pluginClient(plugin);
      const given = seeds.map((e) => ({ molblocks: drawnBlocksOf(e.drawn, e.drawn.atoms.map((a) => a.id)).map((b) => b.molblock) }));
      read = readGenerated(await client.run(step.kind, given, options, "structures", GENERATE_MS), given.length);
    } catch (e) {
      return void fail(id, message(e), at, key);
    }
    if (typeof read === "string") return void fail(id, read, at, key);
    // (made from seeds: each seed told - how many it made, or why it was not read - or none of the run taken)
    if (seeded && !read.seeds) return void fail(id, "Its seeds are not told one by one", at, key);
    // (each seed it made none of, or could not read, named from its tally - never left to what it said, cut short -
    //  the first few on the line, every one where the line is pointed at)
    const seedLine = read.seeds ? seedsSaid(read.seeds) : "";
    const named = read.seeds && seedsSaid(read.seeds, Infinity) !== seedLine ? seedsSaid(read.seeds, Infinity) : "";
    if (!read.made.length) return void (fail(id, [read.said, ...(seedLine ? [seedLine] : [])].join(" \u00b7 "), at, key), nameAll(id, named));
    // (what made them: the plugin, its version - and the program, the model and how, as the plugin says)
    const by: By = { ...read.by, plugin: plugin.id, version: plugin.version, ...(read.by.program ? { program: [read.by.program, read.by.version].filter(Boolean).join(" ") } : {}) };
    const stereoBy: By = { plugin: rolePlugin("stereoisomers")?.id ?? "" };
    const computed = (value: number | string | boolean, of: By): Property => ({ value, unit: "none", status: "computed", by: of });
    const style = styleOf(get().docStyle);
    const kept: DrawnEntry[] = [];
    // (each not read, with why - the first few named on the step's line)
    const notRead: { smiles: string; why: string }[] = [];
    let open = 0;
    let unexamined = 0;
    try {
      const smiles = await chemWorker("smiles");
      const stereo = await chemWorker("stereoisomers");
      for (const g of read.made) {
        let block: string;
        try {
          block = await molblockOfSmiles(smiles, g.smiles);
        } catch (e) {
          notRead.push({ smiles: g.smiles, why: unreadWhy(message(e)) });
          continue;
        }
        // (only whether stereo is left open, and where: none of its stereoisomers tried in 3D, which Stereoisomers and Conformers do -
        //  a structure it cannot be asked of is kept, its stereo said not examined, and the run goes on)
        let unset: number | null = null;
        try {
          const left = await stereo.request("stereo_left_open", { molblock: block });
          unset = left.atoms.length + left.bonds.length;
        } catch {
          unexamined++;
        }
        if (unset) open++;
        const properties: Record<string, Property> = {
          smiles: computed(g.smiles, by),
          ...Object.fromEntries(Object.entries(g.properties).map(([name, p]) => [name, { value: p.value, unit: p.unit, status: "computed" as const, by }])),
          ...(unset ? { stereo_open: computed(unset, stereoBy) } : {}),
        };
        // (made from a seed: what that one was made from, and its values as that one's - never as this one's own)
        const seed = g.seed != null ? seeds[g.seed]?.record : undefined;
        const record: DrawnRecord = {
          ...(seed?.from?.length ? { from: seed.from } : {}),
          properties: { ...properties, ...Object.fromEntries(madeFrom(seed)) },
        };
        kept.push({ place: kept.length, drawn: withoutStereoOpen(await drawingOf(block, style)), record });
      }
    } catch (e) {
      return void fail(id, message(e), at, key);
    }
    if (!kept.length) return void (fail(id, [read.said, ...(seedLine ? [seedLine] : []), "none could be read", ...(notRead.length ? [notReadSaid(notRead)] : [])].join(" \u00b7 "), at, key), nameAll(id, named));
    const said = [
      read.said,
      ...(seedLine ? [seedLine] : []),
      `${kept.length} made`,
      ...(open ? [`${open} with stereo left open`] : []),
      ...(unexamined ? [`${unexamined} with stereo not examined`] : []),
      ...(notRead.length ? [notReadSaid(notRead)] : []),
    ].join(" \u00b7 ");
    doc.edit("run", (x) => ranAs(x, id, { ok: true, holds: "structures", kept, aside: [], said }, key, { ...w, byOf, now: at }));
    nameAll(id, named);
  }

  /** Every seed a step's line counts but does not name (`StepRan.named`), kept with its run: shown where the line is pointed at. */
  function nameAll(id: number, named: string): void {
    if (!named) return;
    doc.amend((x) => ({ ...x, steps: (x.steps ?? []).map((s) => (s.id === id && s.ran ? { ...s, ran: { ...s.ran, named } } : s)) }), { unsaved: true });
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
    // (skeletons, their hydrogens not there, refused before anything is sent: lib/chem/skeleton)
    const refused = skeletonsRefused(step.kind, entries);
    if (refused) return void fail(id, refused, at, key);
    const options: OptionValues = optionsOf(optionsFor(step.kind, plugin.id), step.options);
    let kept;
    try {
      const client = await pluginClient(plugin);
      const given = entries.map((e) => ({ ...pluginEntry(e), compound: e.compound, ...(e.energy != null ? { energy: e.energy } : {}), ...(e.degeneracy != null ? { degeneracy: e.degeneracy } : {}) }));
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
    const options: OptionValues = optionsOf(optionsFor(step.kind, plugin.id), step.options);
    // (what it takes: what came in - or, a kind of two inputs, each start paired with an end, those that cannot be worked out refused with why)
    const taking = programEntries(d, id, step.kind, options);
    if (taking && "why" in taking) return void fail(id, taking.why, at, key);
    const entries = taking?.entries ?? [];
    if (!entries.length) return void fail(id, "Nothing came in", at, key);
    const unpaired = taking?.refused ?? [];
    // (skeletons, their hydrogens not there, refused before anything is sent - each to the Failed exit, the rest run:
    //  lib/chem/skeleton. All of them skeletons, the step itself refused)
    const skeletons = skeletonEntries(step.kind, entries).filter((i) => !unpaired.some((u) => u.entry === i));
    if (skeletons.length === entries.length) return void fail(id, skeletonWhy(entries.length), at, key);
    const sendIdx = entries.flatMap((_, i) => (skeletons.includes(i) || unpaired.some((u) => u.entry === i) ? [] : [i]));
    // (every pair refused: nothing to send - why the first was, and how many)
    if (!sendIdx.length) return void fail(id, unpaired.length > 1 ? `${unpaired[0].why}; and ${unpaired.length - 1} more cannot be worked out` : (unpaired[0]?.why ?? "Nothing came in"), at, key);
    taken.set(id, { at, entries, holds: taking?.holds ?? (input.holds as Holds3D) });
    // (the cores it takes, as Settings says - a program running as processes, one to each physical core: never two on one)
    const { cores: settled } = runningOf(useAppSettings.getState().calculations);
    const asProcesses = installedFor(step.kind, plugin.id).some((d) => d.parallel === "processes");
    const cores = asProcesses ? processesOf(settled, (await computerResources().catch(() => null))?.physical ?? settled) : settled;
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
    const sending = sendIdx.map((i) => entries[i]);
    const given = await Promise.all(sending.map((e) => entryFiles(e, sourcesOf(e.from), kinds, heldOutput)));
    let prepared;
    // (what its worker says it runs: the program's version where none installed separately says its own)
    let said = "";
    let refused: Refusal[] = [];
    let note: string | undefined;
    try {
      const client = await pluginClient(plugin);
      const sent = sending.map((e, i) => ({ ...pluginEntry(e), ...(given[i].length ? { files: given[i] } : {}) }));
      const raw = await client.prepare(step.kind, sent, options, cores, Object.fromEntries(paths));
      prepared = readPrepared(raw, sending.length);
      refused = readRefused(raw, sending.length);
      note = readNote(raw);
      said = client.version ?? "";
    } catch (e) {
      return void fail(id, message(e), at, key);
    }
    if (typeof prepared === "string") return void fail(id, prepared, at, key);
    // (what the plugin was given, by its places among all that came in; and the skeletons refused beside)
    prepared = prepared.map((p) => ({ ...p, entries: p.entries.map((k) => sendIdx[k]) }));
    refused = [
      ...refused.map((r) => ({ ...r, entry: sendIdx[r.entry] })),
      ...skeletons.map((entry): Refusal => ({ entry, kind: "refused", why: skeletonWhy() })),
      ...unpaired.map((u): Refusal => ({ entry: u.entry, kind: "refused", why: u.why })),
    ];
    // (each program installed separately as it is now, for its jobs' keys - one replaced gives other keys, though it
    //  says the same version or none: one that cannot be told, and no job is taken up again)
    let stamps: string[] | null = [];
    for (const where of paths.values()) {
      const stamp = await programStamp(where).catch(() => null);
      if (stamp == null) {
        stamps = null;
        break;
      }
      stamps.push(stamp);
    }
    // (the jobs this workspace ran before, and how each stands now: one whose key ran to the end is not run again)
    const states = new Map((await listJobs().catch((): Job[] => [])).map((j) => [j.id, j.state]));
    // (jobs asking for more memory than Settings lets jobs use - though no more than the computer has, or they are
    //  refused - run with nothing else that declares memory beside them: said, on the step's line)
    const over = overLimits(prepared, limitsOf(useAppSettings.getState().calculations, await computerResources().catch(() => ({ cores: computerCores(), memory: 0 }))));
    // (a program of another plugin its jobs need - the xTB plugin's xtb, for ORCA's xTB methods: of one its manifest says it uses,
    //  that plugin added and of a version it works with - or no job starts, said, naming it; one used only for some of its work
    //  stops the plugin for nothing else)
    for (const n of [...new Set(prepared.flatMap((p) => p.needs ?? []))]) {
      const why = neededWhy(plugin, n, addedNow());
      if (why) return void fail(id, `${why}.`, at, key);
    }
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
          // (the cores Settings gives it - or fewer, where its plugin says it takes fewer: ORCA with no MPI, one)
          cores: p.cores ? Math.min(p.cores, cores) : cores,
          ...(p.memory ? { memory: p.memory } : {}),
          // (its folder named from its first entry's name, or its compound's letter, and its step's kind)
          label: `${entries[p.entries[0]]?.name ?? compoundLetter(entries[p.entries[0]]?.compound ?? 0)} ${kindInfo(step.kind).name}`,
          ...(path ? { path } : {}),
          reads: p.reads,
          ...(p.needs ? { needs: p.needs } : {}),
        };
        const jobKeyed = await jobKey({
          plugin: plugin.id,
          pluginVersion: plugin.version,
          program: p.program,
          programVersion: useInstalled.getState().chosen[programKey(plugin.id, p.program)]?.version ?? said,
          // (and the version of each plugin whose program it needs: another xtb is another run)
          stamps: [...(stamps ?? []), ...(p.needs ?? []).map((n) => `${n} ${pluginById(n)?.version ?? ""}`)],
          args: p.args,
          ...(p.stdin ? { stdin: p.stdin } : {}),
          ...(p.then ? { then: p.then } : {}),
          files: p.files,
        });
        const again = stamps ? reusable([...(doc.getState().steps ?? [])], jobKeyed, (j) => states.get(j)) : null;
        jobs.push({
          id: again?.id ?? (await startJob({ ...ask, key: jobKeyed })),
          entries: p.entries,
          reads: p.reads,
          key: jobKeyed,
          ...(again ? { reused: true as const, gave: again.gave } : {}),
        });
      }
    } catch (e) {
      for (const j of jobs) void stopJob(j.id).catch(() => {});
      return void fail(id, `It could not be started: ${message(e)}`, at, key);
    }
    if (gone(id)) return forgetStarted(jobs);
    doc.amend((x) => setRunning(x, id, { at, input: key, options, jobs, kind: step.kind, ...(over ? { over } : {}), ...(note ? { note } : {}), ...(taking?.paired ? { paired: taking.paired } : {}), ...(refused.length ? { refused } : {}) }), { unsaved: true });
    set((prev) => ({ ...prev, jobsSeen: { ...prev.jobsSeen, ...Object.fromEntries(jobs.map((j): [string, JobSeen] => [j.id, { state: j.reused ? "done" : "waiting", created: at }])) } }));
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

  /**
   * Jobs started for a step that has gone since: stopped, and their folders taken away once they have ended -
   * those this run started alone: a job taken up again is an earlier run's, or another step's, and stays.
   */
  const forgetStarted = (jobs: readonly StepJob[]) => {
    for (const j of jobs) {
      if (j.reused) continue;
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
    const { cores } = runningOf(useAppSettings.getState().calculations);
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
        const job = await startJob({ plugin: plugin.id, program: p.program, args: p.args, files: [...p.files, { name: SCENE, text: rendered.gltf }], cores, ...(path ? { path } : {}), label: `${e.name ?? compoundLetter(e.compound)} Render` });
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

  /**
   * A step's log text showing the `k`th of its jobs: that job's log, written
   * in it - no step to undo, as a log followed is - and followed while it
   * runs; the others followed no more in it.
   */
  async function showLogJob(text: number, jobs: string[], k: number) {
    // (the last asked for wins: one asked for before it, read after it, is let go)
    const asked = (logAsked.get(text) ?? 0) + 1;
    logAsked.set(text, asked);
    const all = await wholeLog(jobs[k]);
    if (logAsked.get(text) !== asked) return;
    const t = (doc.getState().texts ?? []).find((x) => x.id === text);
    if (!t?.of || !("step" in t.of)) return;
    const step = t.of.step;
    doc.amend((x) => ops.setTextOf(ops.editText(x, text, all || "(Nothing yet)"), text, { step, ...(jobs.length > 1 ? { jobs, job: k } : {}) }), { unsaved: true });
    for (const [job, at] of [...shown]) if (at === text) shown.delete(job);
    const seen = get().jobsSeen[jobs[k]];
    if (!seen || !finished(seen.state)) shown.set(jobs[k], text);
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
      // (and, of several jobs, how each ended: said of each in its log's chooser, the workspace reopened)
      const as = { kind, options: run.options, ...(ids.length > 1 ? { states: records.map((r): JobState => r?.state ?? "gone") } : {}) };
      const close = () => doc.amend((x) => setRunning(x, id, undefined), { unsaved: true });

      // stopped - or every one gone without saying how it ended: nothing comes in. (Some gone - the computer restarted,
      // say - and others done: those done come in, the others said failed, as WORKFLOWS.md, When Meno closes, has it.)
      // (a job's folder without its record - whatever is in it, nothing Meno can say ran - is no job gone: it is
      //  output Meno cannot account for, below; adopted, it is read as one done)
      const unrecorded = records.map((r) => r?.state === "gone" && r.why === NO_RECORD);
      const lost = records.map((r, k) => (!r || r.state === "gone") && !unrecorded[k]);
      if (records.some((r) => r?.state === "stopped") || (lost.every(Boolean) && !unrecorded.some(Boolean))) {
        bringIn(id, [], "molecules", { at: run.at, ok: false, stopped: true, said: `Stopped after ${clock(took)}`, input: run.input, took, jobs: ids, ...as });
        return close();
      }
      // (what each job gave, as one digest - its log and every file it wrote: kept with the run, and one taken up again
      //  checked by it)
      const digests = await Promise.all(run.jobs.map((j, k) => (!records[k] || lost[k] ? null : jobDigest(j.id).catch(() => null))));
      // (outputs Meno cannot account for - a job whose key is not the one it was asked for with, one taken up again
      //  whose files changed since they were read, or one it took up that this run did not start nor took up again -
      //  stop the step, naming them: nothing comes in)
      const unaccounted = run.jobs.flatMap((j, k) => {
        const r = records[k];
        if (!r || lost[k] || run.adopted?.[j.id] != null) return [];
        if (unrecorded[k]) return [{ id: j.id, why: "its folder has no record of how it ran" }];
        if (j.key && r.key !== j.key) return [{ id: j.id, why: "its key is not the one it was asked for with" }];
        if (j.reused && j.gave && digests[k] !== j.gave) return [{ id: j.id, why: "its files have changed since they were read" }];
        if (!j.reused && r.created < run.at - STARTED_BEFORE_MS) return [{ id: j.id, why: "made before this run began" }];
        return [];
      });
      if (unaccounted.length) {
        const said = `Output Meno cannot account for: ${unaccounted.map((u) => `${u.id} (${u.why})`).join("; ")}`;
        bringIn(id, [], "molecules", { at: run.at, ok: false, said, input: run.input, took, jobs: ids, unaccounted: unaccounted.map((u) => u.id), held: run, ...as });
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
      // (taken now as the run took them: a kind of two inputs, its pairs - workflow/programs `programEntries`)
      const now = !snap && same ? programEntries(d, id, kind, optionsOf(optionsFor(kind, by), run.options)) : null;
      const entries: SetEntry[] = snap ? snap.entries : now && !("why" in now) ? now.entries : [];
      const holds = snap?.holds ?? (now && !("why" in now) ? now.holds : input?.holds);
      const total = run.jobs.reduce((n, j) => n + j.entries.length, 0) + (run.refused?.length ?? 0);
      const worked: Worked[] = [];
      // (each entry it could not do, with why - a job that failed fails each entry it was for - counted, and kept
      //  for its Failed exit as it came in; one that came in changed while it ran, counted alone)
      const failures: Failure[] = [];
      const failedOnes: Worked[] = [];
      // (those that stopped and left where they got to, out of Failed: something to go on with - Runs again)
      let reached = 0;
      const fails = (these: readonly (SetEntry | undefined)[], kind: FailureKind, why: string) => {
        for (const e of these) {
          failures.push({ kind, why });
          if (e) failedOnes.push({ ...e, failed: { kind, why } });
        }
      };
      // (what a job gave for an entry: what it made - or as far as it came, where that is not done - or why not)
      const gave = (e: SetEntry, made: Worked | Worked[] | Failure) => {
        if (isFailure(made)) return fails([e], made.kind, made.why);
        for (const w of Array.isArray(made) ? made : [made]) (w.failed ? failedOnes : worked).push(w);
        if (!Array.isArray(made) && made.failed) failures.push(made.failed);
      };
      // (those its plugin would not prepare a job for: refused, each with why - the others run)
      for (const r of run.refused ?? []) fails([entries[r.entry]], r.kind, r.why);
      const client = plugin ? await pluginClient(plugin).catch(() => null) : null;
      // (where each job's results begin among those worked: those of a job adopted marked so, below)
      const begins: { from: number; adopted?: number }[] = [];
      for (const [k, j] of run.jobs.entries()) {
        begins.push({ from: worked.length, ...(run.adopted?.[j.id] != null ? { adopted: run.adopted[j.id] } : {}) });
        const mine = j.entries.map((i) => entries[i]);
        if (lost[k]) {
          fails(mine, "stopped", "It stopped without finishing");
          continue;
        }
        const record = records[k]!;
        if (!client || !plugin) {
          fails(mine, "not-started", "What did it is not added");
          continue;
        }
        if (mine.some((e) => !e)) {
          fails(mine.map(() => undefined), "failed", "What came into it changed while it ran");
          continue;
        }
        // (failed before its program could say: its runner's own words - "orca could not be started", say)
        if (record.state === "failed" && record.why) {
          fails(mine, "not-started", record.why);
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
          fails(mine, "failed", unread);
          continue;
        }
        let said;
        try {
          // (a folder with no record, adopted: read as one that ran to its end - the chemist took what it holds)
          said = readCollected(await client.collect(kind, mine.map(pluginEntry), run.options, files, log, unrecorded[k] ? "done" : record.state), mine.length);
        } catch (e) {
          // (its plugin refused what it was given, or what came back)
          fails(mine, "refused", message(e));
          continue;
        }
        if ("why" in said) {
          // (a run that stopped: where its plugin says to, what it wrote read for the geometry it reached alone - its entry
          //  out of Failed there, its way there as frames from where it came in, no energy of it a result; one whose
          //  writing holds no geometry, as it came in)
          for (const [i, r] of (said.partial ?? []).entries()) {
            const text = "log" in r ? log : files[r.file];
            const read = text ? await readWithReaders(r, text) : null;
            const at = read && typeof read !== "string" ? stoppedAt(kind, mine[i], read.output, read.readers, read.source) : null;
            if (at) {
              gave(mine[i], { ...at, failed: { kind: said.kind ?? "failed", why: said.why } });
              reached++;
            }
            else fails([mine[i]], said.kind ?? "failed", said.why);
          }
          if (!said.partial) fails(mine, said.kind ?? "failed", said.why);
          continue;
        }
        // (an output for Meno's readers: read as one opened is, and kept as it is)
        if ("read" in said) {
          for (const [i, r] of said.read.entries()) {
            const text = "log" in r ? log : files[r.file];
            const read = text ? await readWithReaders(r, text) : `It wrote no ${r.name}`;
            if (typeof read === "string") {
              fails([mine[i]], "failed", read);
              continue;
            }
            const made =
              kind === "conformers" ? conformersWorked(mine[i], read.output, read.readers, read.source) : workedOf(kind, mine[i], read.output, read.readers, read.source);
            if (isFailure(made)) {
              fails([mine[i]], made.kind, made.why);
              continue;
            }
            // (the wavefunction it wrote besides, where it did: kept with what was read, for a step that takes one)
            const wrote = r.wavefunction && files[r.wavefunction.file];
            const kept = wrote ? await rememberOutput(r.wavefunction!.name, wrote, r.wavefunction!.kind) : undefined;
            const withIt = (w: Worked): Worked => (kept && w.calc ? { ...w, calc: { ...w.calc, wavefunction: kept } } : w);
            gave(mine[i], Array.isArray(made) ? made.map(withIt) : withIt(made));
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
              fails([mine[i]], "failed", out);
              continue;
            }
            gave(mine[i], workedOf(kind, mine[i], out, [`${plugin.id} ${client.version || plugin.version}`], log ? source : undefined));
          }
          continue;
        }
        for (const [i, out] of said.entries()) {
          // (that entry alone failed, saying why)
          if (isFailure(out)) {
            fails([mine[i]], out.kind, out.why);
            continue;
          }
          // (by the version its worker said it runs, as a reader's is kept)
          const readers = [`${plugin.id} ${client.version || plugin.version}`];
          gave(mine[i], kind === "conformers" ? conformersWorked(mine[i], out, readers, log ? source : undefined) : workedOf(kind, mine[i], out, readers, log ? source : undefined));
        }
      }
      // (what a job adopted gave says so in its calculation, wherever that is shown: never taken for checked)
      begins.forEach((b, k) => {
        if (b.adopted == null) return;
        for (let w = b.from; w < (begins[k + 1]?.from ?? worked.length); w++) {
          const c = worked[w].calc;
          if (c) worked[w] = { ...worked[w], calc: { ...c, adopted: b.adopted } };
        }
      });
      // (done where anything was: those it could not do go out of its Failed exit, counted by why, and what follows
      //  runs on what was done - failed only where nothing was, saying why in the program's own words)
      // (done where anything was - or where a run that stopped left the geometry it reached, for a run again to start
      //  from: a step after it starts there, never running this one again first)
      const ok = worked.length > 0 || reached > 0;
      // (a search says how many conformers it found, of how many compounds)
      const found =
        kind === "conformers"
          ? `${clock(took)} \u00b7 ${worked.length} conformer${worked.length === 1 ? "" : "s"}${total > 1 ? ` of ${total} compounds` : ""}`
          : doneSaid(worked, total, took);
      const warned = worked.filter((w) => w.calc?.warnings?.length).length;
      // (those it started from a failed run's geometry - Runs again: said, as its start was no result)
      const restarted = entries.filter((e) => e?.failed).length;
      // (a path search's pairs that carried how a pair was made already - an earlier path's: replaced by this one's, said, never silently)
      const carried = kind === "path-search" ? entries.filter((e) => e.properties?.[PAIRED]).length - failedOnes.filter((e) => e.properties?.[PAIRED]).length : 0;
      // (jobs whose key ran to the end before: not run again, what they gave taken up again - said, counted)
      const again = run.jobs.filter((j) => j.reused).length;
      const took_up = run.adopted ? Object.keys(run.adopted).length : 0;
      // (one that came in and failed: its why alone; what Settings kept off said after, as it was)
      const said = `${
        !ok && failures.length && total === 1
          ? failures[0].why
          : [...(ok ? [found] : []), ...(failures.length ? [failuresSaid(failures, total)] : []), ...(!ok && failures.length ? [failures[0].why] : []), ...(warned ? [`${warned} with warnings`] : []), ...(restarted ? [`${restarted === total ? (total === 1 ? "started" : "each started") : `${restarted} started`} from a failed run's geometry`] : [])].join(" \u00b7 ")
      }${again ? ` \u00b7 ${again === run.jobs.length ? "Reused" : `${again} reused`}` : ""}${took_up ? ` \u00b7 ${took_up} adopted` : ""}${run.note && ok ? ` \u00b7 ${run.note}` : ""}${run.paired && ok ? ` \u00b7 ${run.paired}` : ""}${carried > 0 ? ` \u00b7 the ${PAIRED} ${carried === 1 ? "a pair" : `${carried} pairs`} carried replaced` : ""}${run.over ? ` \u00b7 ${run.over}` : ""}`;
      const keys = run.jobs.every((j) => j.key) ? { keys: run.jobs.map((j) => j.key!), gave: digests } : {};
      // (jobs adopted: taken as its result, with when - said, so that what came of them is never taken for checked)
      const adopted = run.adopted && Object.keys(run.adopted).length ? { adopted: run.adopted } : {};
      const gives = givesFor(kind, holds ?? "molecules");
      // (refused, and its run closed as any other)
      if (gives) bringIn(id, worked, gives, { at: run.at, ok, said, input: run.input, took, jobs: ids, ...keys, ...adopted, ...as }, failedOnes);
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
    runFrom: (id: number) => runSteps([id, ...stepsAfter(doc.getState(), id)]),
    runAll: () => runSteps(allToRun(doc.getState())),
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
    keepRunOf: (id: number, index: number, keep: boolean) => doc.edit(keep ? "keep run" : "keep run no longer", (x) => keptRun(x, id, index, keep)),
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
      // (one text for the step's log, whatever its jobs - several, a chooser of them in the column, the first shown: the maintainer, 2026-10-28)
      const several = jobs.length > 1;
      const open = (doc.getState().texts ?? []).find((t) => t.of && "step" in t.of && t.of.step === id && !t.at);
      let last: number;
      if (open) {
        last = open.id;
        // (a log of one of several jobs as it was named before - *Optimise log 1* - named as the step's log now)
        if (open.name !== `${name} log`) doc.amend((x) => ({ ...x, texts: (x.texts ?? []).map((t) => (t.id === open.id ? { ...t, name: `${name} log` } : t)) }), { unsaved: true });
        const of = open.of as { step: number; jobs?: string[]; job?: number };
        // (its jobs as they are now - run again since: the first shown; one job: its log as it is now)
        if (!several || JSON.stringify(of.jobs) !== JSON.stringify(jobs)) await showLogJob(open.id, jobs, 0);
      } else {
        const text = await wholeLog(jobs[0]);
        const made = ops.addTexts(doc.getState(), [{ name: `${name} log`, text: text || "(Nothing yet)", of: { step: id, ...(several ? { jobs, job: 0 } : {}) } }]);
        if (made.doc !== doc.getState()) doc.edit("open text", () => made.doc);
        if (made.last == null) return;
        last = made.last;
        if (step.running) shown.set(jobs[0], made.last);
      }
      // (rising out of its step into the column, where the column is not showing it already)
      set({ textShown: last, textsOpen: true, pdfShown: null, setTableShown: null, ...(showing === last ? {} : { textFlight: { id: last, to: "column" as const, start: performance.now() } }) });
    },
    showStepLogJob: (text: number, k: number) => {
      const t = (doc.getState().texts ?? []).find((x) => x.id === text);
      const of = t?.of && "step" in t.of ? t.of : null;
      if (!of?.jobs || k < 0 || k >= of.jobs.length || k === (of.job ?? 0)) return Promise.resolve();
      return showLogJob(text, of.jobs, k);
    },
    showStepFiles: async (id: number) => {
      const step = stepOf(doc.getState(), id);
      const job = step?.running?.jobs[0]?.id ?? step?.ran?.jobs?.[0];
      if (!step || !job) return;
      const there = await jobFolder(job).catch(() => null);
      if (there) return void (await revealItemInDir(there));
      // (its folder not on this computer - a workspace saved elsewhere: what the file kept of it written back out, and shown)
      const kept = [step.ran, ...(step.runs ?? [])].flatMap((r) => r?.kept ?? []).find((k) => k.job === job);
      let work: string | null = null;
      // (each file not written back, and why: never one there already written over)
      const differs: string[] = [];
      const notHad: string[] = [...(kept?.left ?? []).map((l) => l.name)];
      for (const f of kept?.files ?? []) {
        const from = await heldJobSource(f.sha256);
        const bytes = from ? null : heldJobFile(f.sha256);
        if (!from && !bytes) {
          notHad.push(f.name);
          continue;
        }
        const back = await writeJobBack(job, f.name, f.sha256, from ? { from } : { bytes: bytes! }).catch(() => null);
        if (!back) {
          notHad.push(f.name);
          continue;
        }
        work = back.work;
        if (back.differs) differs.push(f.name);
      }
      if (!work) throw new Error("Its files are not on this computer, and the workspace's file keeps none of them.");
      await revealItemInDir(work);
      return showFilesSaid(differs, notHad);
    },
    lookAtJobs,
    /**
     * A job whose output Meno could not account for, adopted by the
     * chemist: taken as the step's result, recorded with when - its run
     * taken up again as it stood, every other job checked as before.
     */
    adoptJob: async (id: number, job: string) => {
      const step = stepOf(doc.getState(), id);
      const held = step?.ran?.held;
      if (!held || !step?.ran?.unaccounted?.includes(job)) return;
      doc.amend((x) => setRunning(x, id, { ...held, adopted: { ...(held.adopted ?? {}), [job]: Date.now() } }), { unsaved: true });
      await finishStep(id);
    },
    /** Whether a step's last run's jobs are kept still: not those taken away as the step went while they were being started. */
    jobsKept: (step: { ran?: StepRan }) => (step.ran?.jobs ?? []).some((j) => !forgotten.has(j)),
    /**
     * A step deleted: the jobs of its run stopped, and those waiting for its
     * run let go, as when it is stopped. No job's folder is taken away with
     * it: another step may have taken a job up again, and a copy of the
     * workspace saved elsewhere names the same jobs - their folders go when
     * finished jobs are cleared (Settings, *Calculations*, *Jobs*).
     */
    forgetJobs: (step: { id: number; running?: { jobs: StepJob[] }; ran?: StepRan; runs?: readonly StepRan[] }) => {
      // (not left to the next look at the jobs: where it was the only step running, there is none)
      const waiting = waiters.get(step.id) ?? [];
      waiters.delete(step.id);
      waiting.forEach((f) => f());
      for (const j of step.running?.jobs ?? []) if (!j.reused) void stopJob(j.id).catch(() => {});
    },
  };
}

export type StepRuns = ReturnType<typeof createStepRuns>;
