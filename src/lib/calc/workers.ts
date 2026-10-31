import { create } from "zustand";
import { ensurePyEnv, pyEnvReady, removePyEnv, setUpQuestions } from "../pyEnv";
import { anyPluginById, manifestOf, pluginsUsedBy, pluginsUsing, READERS, runs, type Plugin, type PythonPlugin, type ReaderPlugin } from "./catalog";
import { askToConnectAll } from "../net/network";
import { registerKinds } from "../io/kinds";
import type { Manifest } from "../plugins/manifest";
import type { ReaderClient, Reader } from "./client";
import { menoReader } from "./builtin";
import { stopWorker, workerOf } from "../plugins/process";
import { useAppSettings } from "../settings/appSettings";
import { forThisSystem } from "../plugins/here";
import { stopJobsAndWait } from "../jobs";

/**
 * The plugins on this computer, and the readers' workers: a plugin is added
 * - its environment set up, asking first for the network - in Settings,
 * *Plugins*, and taken away there; a plugin that fills a role is set up as
 * well the first time the role is needed, unless it was taken away
 * (lib/roles/worker). Its worker is started the first time it is asked to
 * read, write or do a step - or fill a role - then kept while it is used,
 * one for all of these (lib/plugins/process). Meno's own reading is always
 * there, and runs in the app (./builtin). The kinds a plugin brings are
 * registered while it is added, and only then (lib/io/kinds).
 */
export type ReaderState = "absent" | "waiting" | "adding" | "added" | "removing";

export const useReaders = create<{
  /** Each reader's, by id; unknown until looked at. */
  state: Record<string, ReaderState>;
  /** What went wrong last, for a reader, in words. */
  problem: Record<string, string>;
}>(() => ({ state: {}, problem: {} }));

const setState = (id: string, state: ReaderState, problem?: string) => {
  useReaders.setState((s) => ({
    state: { ...s.state, [id]: state },
    problem: problem ? { ...s.problem, [id]: problem } : Object.fromEntries(Object.entries(s.problem).filter(([k]) => k !== id)),
  }));
  // (the kinds of the plugins added - until one is taken away - registered with Meno's own)
  const now = useReaders.getState().state;
  registerKinds(
    Object.keys(now)
      .filter((p) => now[p] === "added" || now[p] === "removing")
      .map(manifestOf)
      .filter((m): m is Manifest => m != null),
  );
};

let meno: Reader | null = null;

/** The readers - and plugins - added on this computer, looked at afresh: Meno's own always; one that runs nothing unless taken away. */
export async function addedReaders(plugins: readonly (ReaderPlugin | Plugin)[] = READERS): Promise<Set<string>> {
  const added = new Set<string>();
  for (const p of plugins) {
    if (p.builtin) {
      setState(p.id, "added");
      added.add(p.id);
      continue;
    }
    const here = useReaders.getState().state[p.id];
    if (here === "waiting" || here === "adding" || here === "removing") continue;
    const ready = runs(p) ? await pyEnvReady(p.profile) : !useAppSettings.getState().plugins.removed.includes(p.id);
    // (one not added keeps what went wrong as it was last added: said until it is added again, never taken away by looking)
    setState(p.id, ready ? "added" : "absent", ready ? undefined : useReaders.getState().problem[p.id]);
    if (ready) added.add(p.id);
  }
  return added;
}

/** Whether the chemist took a plugin away, or brought it back: what sets it up again of itself (lib/roles/worker). */
function markTakenAway(p: Plugin, away: boolean) {
  const settings = useAppSettings.getState();
  const removed = settings.plugins.removed.filter((id) => id !== p.id);
  settings.setPlugins({ ...settings.plugins, removed: away ? [...removed, p.id] : removed });
}

/**
 * The set-ups asked for, one after another in the order asked: each waits
 * (`waiting`) until the one before it has ended, done or not - as several
 * set up at once share uv's Python and its cache, and on Windows a file
 * one holds is a failure of another's.
 */
let setUps: Promise<unknown> = Promise.resolve();
/** Each plugin's set-up asked for last, by its number: one whose turn comes and is no longer it - skipped (`skipSetUp`), or asked for again since - is passed over. */
const asked = new Map<string, number>();
let lastAsked = 0;

/** The plugins added now, by id. */
export function addedNow(): Set<string> {
  const now = useReaders.getState().state;
  return new Set(Object.keys(now).filter((id) => now[id] === "added"));
}

/** A list in words: "a", "a and b", "a, b and c". */
const listSaid = (names: readonly string[]) => (names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);

/**
 * Adds a plugin, and first the plugins it uses that are not added, each
 * before any that uses it (docs/PLUGINS.md, *Depends*) - all asked of the
 * network in one question; no, and none is set up. Where one of those it
 * uses is not set up, neither is it, saying why.
 */
export async function addPlugin(p: Plugin): Promise<void> {
  if (!forThisSystem(p)) throw new Error(`${p.name} is not made for this system.`);
  const first = runs(p) ? pluginsUsedBy(p.id).filter((q) => useReaders.getState().state[q.id] !== "added") : [];
  if (!first.length) return addOne(p);
  const missing = first.find((q) => !forThisSystem(q));
  if (missing) {
    const why = `${p.name} was not added: it uses ${missing.name}, which is not made for this system.`;
    setState(p.id, "absent", why);
    throw new Error(why);
  }
  // (one question for all of them: each one's own words under its name)
  const all = [...first, p as PythonPlugin];
  let asks: { name: string; request: Awaited<ReturnType<typeof setUpQuestions>>[number] }[];
  try {
    asks = (await Promise.all(all.map(async (q) => (await setUpQuestions(q.profile)).map((request) => ({ name: q.name, request }))))).flat();
  } catch (e) {
    const why = `${p.name} was not added: ${e instanceof Error ? e.message : String(e)}`;
    setState(p.id, "absent", why);
    throw e;
  }
  // (an interface to a program installed separately is set up, never that program downloaded: "the ORCA interface", as its own question says it)
  const named = (q: PythonPlugin) => (q.installed.length ? `the ${q.name}` : q.name);
  const them = listSaid(first.map(named));
  const allowed = await askToConnectAll(
    `${(p as PythonPlugin).installed.length ? "Set up" : "Download"} ${named(p as PythonPlugin)}, with ${them}?`,
    `It uses ${them}, which ${first.length === 1 ? "is" : "are"} set up first.`,
    asks,
  );
  if (!allowed) {
    const why = `${p.name} was not added: it needs the network, and was not allowed it (Meno is offline, or the download was declined).`;
    setState(p.id, "absent", why);
    throw new Error(why);
  }
  for (const q of first) {
    try {
      await addOne(q, true);
    } catch (e) {
      const why = `${p.name} was not added: ${q.name}, which it uses, could not be set up.`;
      setState(p.id, "absent", why);
      throw e;
    }
  }
  return addOne(p, true);
}

/**
 * Adds one plugin: sets its environment up, asking first whether it may
 * download - unless that was asked already, with others - after
 * any set-up asked for before it (`setUps`); one that runs nothing, at once.
 * Asked again while it waits or is being set up, nothing more. Where it is
 * not added, why is said on it (`problem`) until it is asked for again.
 */
async function addOne(p: Plugin, askedWithOthers = false): Promise<void> {
  if (!runs(p)) {
    markTakenAway(p, false);
    setState(p.id, "added");
    return;
  }
  const here = useReaders.getState().state[p.id];
  if (here === "waiting" || here === "adding") return;
  const mine = ++lastAsked;
  asked.set(p.id, mine);
  setState(p.id, "waiting");
  // (skipped while it waits: ended at once - not when its turn comes, after the set-up that holds the line)
  const skip = new Promise<never>((_, reject) => skips.set(p.id, () => reject(new Error(`${p.name}'s set-up was skipped.`))));
  const turn = setUps.then(async () => {
    if (asked.get(p.id) !== mine) throw new Error(`${p.name}'s set-up was skipped.`);
    skips.delete(p.id);
    setState(p.id, "adding");
    try {
      await ensurePyEnv(p.profile, askedWithOthers ? { asked: true } : undefined);
      markTakenAway(p, false);
      setState(p.id, "added");
    } catch (e) {
      const why = `${p.name} was not added: ${e instanceof Error ? e.message : String(e)}`;
      setState(p.id, "absent", why);
      // (said where it is known to have failed: never left to what the state seems to have done)
      for (const tell of failed) tell(p, why);
      throw e;
    }
  });
  setUps = turn.catch(() => undefined);
  return Promise.race([turn, skip]);
}

/** How to end each set-up that waits at once, as it is skipped (`skipSetUp`). */
const skips = new Map<string, () => void>();
/** Those told of each set-up that fails (`onSetUpFailed`). */
const failed = new Set<(p: Plugin, why: string) => void>();

/** Tells `tell` of each set-up that fails from now on - the plugin, and why, in words; the returned function stops it. */
export function onSetUpFailed(tell: (p: Plugin, why: string) => void): () => void {
  failed.add(tell);
  return () => void failed.delete(tell);
}

/**
 * A set-up that waits, taken out of the line: not set up, and saying so -
 * where the one before it holds the line, a download that goes on and on, a
 * question not answered. One not waiting, nothing.
 */
export function skipSetUp(p: Plugin): void {
  if (useReaders.getState().state[p.id] !== "waiting") return;
  asked.delete(p.id);
  skips.get(p.id)?.();
  skips.delete(p.id);
  const before = settingUp();
  const name = before ? (anyPluginById(before)?.name ?? before) : null;
  setState(p.id, "absent", `${p.name} was not added: skipped${name ? ` while it waited for ${name}'s set-up` : ""}.`);
}

/** The plugin whose set-up runs now, where one does: what one waiting waits for. */
export function settingUp(now: Record<string, ReaderState> = useReaders.getState().state): string | undefined {
  return Object.keys(now).find((id) => now[id] === "adding");
}

/** What a plugin waiting to be set up says: whose set-up it waits for - "Waiting for <its name>'s set-up…". */
export function waitingSaid(now: Record<string, ReaderState>): string {
  const running = settingUp(now);
  const name = running ? (anyPluginById(running)?.name ?? running) : null;
  return name ? `Waiting for ${name}'s set-up…` : "Waiting…";
}

/** The plugins added that use a plugin, and those that use them in turn, in the order they are taken away: what taking it away takes away too. */
export function addedUsing(id: string): PythonPlugin[] {
  const added = addedNow();
  return pluginsUsing(id).filter((q) => added.has(q.id));
}

/**
 * Takes a plugin away, and first the plugins added that use it, each before
 * the one it uses (docs/PLUGINS.md, *Depends*) - never one alone that
 * another added uses: the jobs named (`stopping`) stopped and ended first -
 * the chemist having said they may be.
 */
export async function removePlugin(p: Plugin, stopping: readonly string[] = []): Promise<void> {
  for (const q of addedUsing(p.id)) await removeOne(q, stopping);
  return removeOne(p, stopping);
}

/**
 * Takes one plugin away: the jobs named (`stopping`) stopped and ended
 * first, its worker stopped, its environment removed - and, where it fills
 * a role, not set up again of itself; one that runs nothing, at once.
 */
async function removeOne(p: Plugin, stopping: readonly string[] = []): Promise<void> {
  if (!runs(p)) {
    markTakenAway(p, true);
    setState(p.id, "absent");
    return;
  }
  setState(p.id, "removing");
  try {
    if (stopping.length) await stopJobsAndWait(stopping);
    await stopWorker(p.id);
    await removePyEnv(p.profile);
    markTakenAway(p, true);
    setState(p.id, "absent");
  } catch (e) {
    setState(p.id, "added", e instanceof Error ? e.message : String(e));
    throw e;
  }
}

/** A reader's worker, started the first time it is asked for; the reader must be added. */
export function readerClient(p: ReaderPlugin): Promise<Reader> {
  if (p.builtin) return Promise.resolve((meno ??= menoReader()));
  return workerOf(p).then((w) => w.reader);
}

/** A plugin's worker, as its client: what a step it fills is asked of (`prepare`, `collect`); the plugin must be added. */
export function pluginClient(p: PythonPlugin): Promise<ReaderClient> {
  return workerOf(p).then((w) => w.reader);
}
