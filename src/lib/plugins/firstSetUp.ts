/**
 * Chemistry set up from one card as Meno first starts (docs/PLUGINS.md,
 * *First start*). Where no plugin here reads and writes SMILES, none was set
 * up here before (lib/plugins/usedBefore has its own flow), the card was never
 * answered and Meno is not offline, a card at the edge of the window asks once:
 * *Set up* or *Not now*. It holds up nothing: the page works whether or not it
 * is answered, and a question the chemist's own click asks meanwhile is asked
 * over the page as ever.
 *
 * The one yes covers only what the card named before the click - the list of
 * plugins online and the plugin's files from the list's hosts, uv and Python
 * from Astral, the packages from the Python Package Index - and nothing more
 * (the network's rule is kept, not widened). The plugin that fills the role is
 * found on the list by its role, never by a name in the core; the card names
 * it, its licence and its size once the list has them. Its set-up questions are
 * laid against what the card named: every host within it, taken as asked;
 * anything else - a host the card did not name, a file beside its packages,
 * terms, another plugin it uses first - stops the card, which shows that
 * question in its place and waits. More than one plugin online filling the
 * role, or none for this system: the card shows each to add, or why not.
 *
 * *Not now*: never asked again of itself. A failure: said on the card, with
 * *Try again* (*Dismiss* there is *Not now*). A yes whose set-up did not finish
 * is taken up again as Meno next starts, with no question; a plugin here whose
 * set-up did not finish is the one set up, its files not got again. *Stop* ends it for good: nothing more is fetched -
 * a step under way (a download, uv building the environment) runs to its end,
 * as nothing can cut it short today.
 */
import { setUpFailed } from "./failureSaid";
import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import { allowAnswered, formatBytes, useNetwork, type ConsentRequest } from "../net/network";
import { useAppSettings } from "../settings/appSettings";
import { ALL_PLUGINS, anyPluginById, manifestOf, pluginsFilling, pluginsUsedBy, runs } from "../calc/catalog";
import { addedReaders, addPlugin, useReaders } from "../calc/workers";
import { setUpQuestions } from "../pyEnv";
import { CATALOGUE_HOSTS, CATALOGUE_PURPOSE, offeredFor, offersOf, type Catalogue, type CatalogueEntry } from "./catalogue";
import { systemHere } from "./here";
import { refreshPlugins } from "./known";
import { CATALOGUE_REQUEST, getPlugin, listOnline, useOnline } from "./online";
import { firstSetUpWait } from "../roles/worker";
import { pypi, UV } from "./setUpSources";
import type { RoleId } from "./roles";

/** The role the card sets up a plugin for: Meno's everyday drawing rests on it. */
export const FIRST_ROLE: RoleId = "smiles";

/** What the card names before the click, line by line: the only sources its yes covers. */
export const CARD_SOURCES: readonly string[] = [...CATALOGUE_REQUEST.sources, UV.line, pypi("the plugin's packages").line];

/** The hosts those name: every host the card's yes lets the set-up reach (one list with the lines, lib/plugins/setUpSources). */
export const CARD_HOSTS: readonly string[] = [...new Set([...CATALOGUE_HOSTS, ...UV.hosts, ...pypi("").hosts])];

/** What the card asks first. */
export const CARD_TITLE = "Set up chemistry?";
export const CARD_DETAIL = "Meno draws structures from SMILES, and writes SMILES, with a plugin it gets from the list of plugins online and sets up once. Nothing else is fetched without asking.";

/** A question the card shows in its place, where the set-up needs more than the card named. */
export type CardQuestion = { title: string; detail: string; sources: readonly string[] };

/**
 * Where the card stands:
 * - `none`: no card;
 * - `offered`: asking *Set up* or *Not now*;
 * - `going`: under way, saying what it does, and the plugin once the list names it;
 * - `asking`: stopped on a question beyond what the card named, shown in its place;
 * - `choose`: the list offers no one plugin for the role here - each to add, or why not (ui `RoleOffer`);
 * - `failed`: why, with *Try again*.
 */
export type FirstSetUpCard =
  | { phase: "none" }
  | { phase: "offered" }
  | { phase: "going"; step: SetUpStep; plugin?: { id: string; name: string; licence: string; size: string }; stopping?: true }
  | { phase: "asking"; question: CardQuestion; answer: (yes: boolean) => void }
  | { phase: "choose" }
  | { phase: "failed"; why: string };

export const useFirstSetUp = create<FirstSetUpCard>(() => ({ phase: "none" }));

/** The steps the set-up says as it goes: the list of plugins, the plugin's files, its environment. */
export type SetUpStep = "list" | "files" | "environment";

/**
 * Where a set-up of chemistry stands, in one phrase said the same in each place that says it - the card (`firstSetUpSaid`), the
 * chip at the workspace's corner and the line under Quick Add's SMILES field (ui quickAddSmiles `chemistryStep`): its step, with
 * the plugin, and a share where Meno's backend reports one (a plugin's files as they download, lib/pyEnv `useDownloads`; none
 * for uv's set-up).
 */
export function firstSetUpStep(step: SetUpStep, plugin?: string, share?: number): string {
  const done = share != null && Number.isFinite(share) ? ` (${Math.round(Math.min(1, Math.max(0, share)) * 100)}%)` : "";
  if (step === "list" || !plugin) return "Setting up chemistry: listing the plugins online";
  if (step === "files") return `Setting up chemistry: downloading ${plugin}${done}`;
  return `Setting up chemistry: setting up ${plugin}'s environment${done}`;
}

/** The card's line: `firstSetUpStep` as a sentence. */
export const firstSetUpSaid = (step: SetUpStep, plugin?: string, share?: number): string => `${firstSetUpStep(step, plugin, share)}.`;

/** What the plugin got needs to be set up, as its own questions say it (lib/pyEnv `setUpQuestions`). */
export type SetUpPlan = {
  /** Its set-up's questions, and those of each plugin it uses that is here. */
  questions: readonly ConsentRequest[];
  /** Files it downloads besides its packages (its manifest's `downloads`). */
  files: number;
  /** The plugins it uses that are set up first, by name. */
  uses: readonly string[];
};

/** What setting up from the card uses, each given in a test. */
export type FirstSetUpDeps = {
  /** The plugins whose environments were set up here before, by id (installed.rs `set_up_before`). */
  setUpBefore(): Promise<string[]>;
  /**
   * Whether a plugin here fills the role and is added - each looked at first, as Meno starts (lib/calc/workers `addedReaders`), not
   * read off a state not yet known - or was taken away by the chemist (Settings, *Plugins*): their own choice, asked nothing of again.
   */
  filledHere(): boolean | Promise<boolean>;
  /**
   * The plugins on the list that fill the role and are here already at the list's version, but not added - their files got,
   * their set-up not finished: the one to set up, its files not got again.
   */
  here(catalogue: Catalogue): CatalogueEntry[];
  /** Purposes allowed by the card's yes (lib/net/network `allowAnswered`); false offline. */
  allow(purposes: readonly string[]): Promise<boolean>;
  /** The list of plugins online, fetched now; null and why where it could not be. */
  list(): Promise<{ catalogue: Catalogue } | { problem: string }>;
  /** The plugins on the list that fill the role, made for this system and this Meno, not here (ui offerSteps `offeredHere`). */
  offered(catalogue: Catalogue): CatalogueEntry[];
  /** A plugin's files got, and the plugins in place read again. */
  get(entry: CatalogueEntry): Promise<void>;
  /** What it needs to be set up, its files got. */
  plan(entry: CatalogueEntry): Promise<SetUpPlan>;
  /** It added, as any plugin is (lib/calc/workers `addPlugin`): its questions allowed already, none asked. */
  add(entry: CatalogueEntry): Promise<void>;
};

/** How the card was answered, kept (lib/settings/appSettings `PluginSettings.firstSetUp`). */
function keep(answer: "yes" | "no" | "done") {
  const settings = useAppSettings.getState();
  settings.setPlugins({ ...settings.plugins, firstSetUp: answer });
}

/** The set-up under way, where one is: what a SMILES typed meanwhile waits for (lib/roles/worker `chemWorker`). */
let underWay: Promise<void> | null = null;
/** Whether *Stop* was pressed for the set-up under way. */
let stopped = false;

/** The set-up from the card under way, where one is - ended, done or not, as it ends. */
export const firstSetUpUnderWay = (): Promise<void> | null => underWay;
// (what a role asked of meanwhile waits for: lib/roles/worker)
firstSetUpWait.now = firstSetUpUnderWay;

/**
 * As Meno starts: the card offered where all hold (the module's own words), or a
 * yes whose set-up did not finish taken up again, with no question. Offline:
 * nothing - looked at again as Meno next starts.
 */
export async function offerFirstSetUp(deps: FirstSetUpDeps): Promise<void> {
  const answered = useAppSettings.getState().plugins.firstSetUp;
  if (answered === "no" || answered === "done" || (await deps.filledHere())) return;
  if (useNetwork.getState().offline) return;
  // (an upgraded Meno whose plugins were set up here before: its own flow, lib/plugins/usedBefore)
  if (!answered && (await deps.setUpBefore()).length) return;
  if (answered === "yes") return void setUpChemistry(deps);
  useFirstSetUp.setState({ phase: "offered" }, true);
}

/** *Not now*: gone, never asked again of itself. */
export function notNow(): void {
  keep("no");
  useFirstSetUp.setState({ phase: "none" }, true);
}

/** *Stop*: nothing more is fetched; never taken up again. A step under way runs to its end, then the card goes. */
export function stopFirstSetUp(): void {
  keep("no");
  stopped = true;
  const now = useFirstSetUp.getState();
  if (now.phase === "asking") now.answer(false);
  else if (now.phase === "going") useFirstSetUp.setState({ ...now, stopping: true }, true);
  else useFirstSetUp.setState({ phase: "none" }, true);
}

/** The card gone, where the role came to be filled otherwise (a plugin the chemist added meanwhile): nothing more asked. */
export function filledOtherwise(): void {
  const now = useFirstSetUp.getState();
  if (now.phase === "offered" || now.phase === "choose" || now.phase === "failed") {
    keep("done");
    useFirstSetUp.setState({ phase: "none" }, true);
  }
}

/**
 * *Set up* (and *Try again*, and a yes taken up again): the list fetched, the
 * plugin that fills the role got and set up, each step said on the card. Ends
 * with the card gone, or stopped on a question, a choice or a failure, saying so.
 */
export function setUpChemistry(deps: FirstSetUpDeps): Promise<void> {
  if (underWay) return underWay;
  stopped = false;
  keep("yes");
  underWay = run(deps).finally(() => {
    underWay = null;
  });
  return underWay;
}

async function run(deps: FirstSetUpDeps): Promise<void> {
  const going = (step: SetUpStep, plugin?: { id: string; name: string; licence: string; size: string }) => useFirstSetUp.setState({ phase: "going", step, ...(plugin ? { plugin } : {}) }, true);
  const failed = (why: string) => useFirstSetUp.setState({ phase: "failed", why }, true);
  // (stopped: the card goes, nothing more done)
  const end = () => useFirstSetUp.setState({ phase: "none" }, true);
  // (the plugin set up, by its name, once it is known: what a failure is said of)
  let named = "The plugin";
  try {
    going("list");
    if (!(await deps.allow([CATALOGUE_PURPOSE]))) return failed("Meno is offline: nothing was fetched.");
    const listed = await deps.list();
    if (stopped) return end();
    if ("problem" in listed) return failed(listed.problem);
    // (one here already, its files got and its set-up not finished: that one, set up - else what the list offers to add)
    const here = deps.here(listed.catalogue);
    const offered = here.length === 1 ? here : deps.offered(listed.catalogue);
    // (none, or more than one: the chemist chooses - each to add, or why not - as where the role is asked of)
    if (offered.length !== 1) return void useFirstSetUp.setState({ phase: "choose" }, true);
    const entry = offered[0];
    named = entry.name;
    const plugin = { id: entry.id, name: entry.name, licence: entry.licence, size: formatBytes(entry.source.bytes) };
    if (here.length !== 1) {
      going("files", plugin);
      await deps.get(entry);
      if (stopped) return end();
    }
    const plan = await deps.plan(entry);
    if (stopped) return end();
    const beyond = beyondCard(entry, plan);
    if (beyond) {
      const yes = await new Promise<boolean>((answer) => useFirstSetUp.setState({ phase: "asking", question: beyond, answer }, true));
      if (!yes || stopped) {
        if (!stopped) keep("no");
        return end();
      }
    }
    going("environment", plugin);
    // (its questions allowed by the card's yes - or by the yes to the question in its place: none asked again)
    if (!(await deps.allow(plan.questions.map((q) => q.purpose)))) return failed("Meno is offline: it was not set up.");
    await deps.add(entry);
    keep("done");
    end();
  } catch (e) {
    if (stopped) return end();
    // (in Meno's words, or by its kind - what the back end said never on the card: ./failureSaid)
    failed(setUpFailed(named, e));
  }
}

/**
 * The question the card stops on, where setting the plugin up needs more than
 * the card named: terms to agree to, another plugin it uses first, a file
 * beside its packages, or a host the card did not name - in its own words,
 * with all it fetches. None where all is within the card's yes.
 */
export function beyondCard(entry: CatalogueEntry, plan: SetUpPlan): CardQuestion | null {
  const outside = plan.questions.flatMap((q) => q.hosts.filter((h) => !CARD_HOSTS.includes(h)));
  const why = [
    entry.terms ? `Its terms: ${entry.terms}` : "",
    plan.uses.length ? `It uses ${plan.uses.join(" and ")}, set up first.` : "",
    plan.files ? `It downloads ${plan.files === 1 ? "a file" : `${plan.files} files`} besides its packages.` : "",
    outside.length ? `It reaches ${[...new Set(outside)].join(", ")}, which the card did not name.` : "",
  ].filter(Boolean);
  if (!why.length) return null;
  return {
    title: `Set up ${entry.name}?`,
    detail: [...why, ...plan.questions.map((q) => q.detail)].join(" "),
    sources: [...new Set(plan.questions.flatMap((q) => q.sources))],
  };
}

/** The plugin got, as Meno now has it: none where it could not be read. */
function gotHere(entry: CatalogueEntry) {
  const p = anyPluginById(entry.id);
  if (!p) throw new Error(`${entry.name} was got, but Meno could not read it.`);
  return p;
}

export const DEPS: FirstSetUpDeps = {
  setUpBefore: () => invoke<string[]>("plugins_set_up_before"),
  filledHere: async () => {
    const filling = pluginsFilling(FIRST_ROLE);
    const removed = useAppSettings.getState().plugins.removed;
    if (filling.some((p) => removed.includes(p.id))) return true;
    const added = await addedReaders(filling);
    return filling.some((p) => added.has(p.id));
  },
  here: (catalogue) => {
    const added = useReaders.getState().state;
    const notAdded = new Map(pluginsFilling(FIRST_ROLE).filter((p) => added[p.id] !== "added").map((p) => [p.id, p.version]));
    return catalogue.plugins.filter((e) => e.roles.includes(FIRST_ROLE) && notAdded.get(e.id) === e.version);
  },
  allow: allowAnswered,
  list: async () => {
    await listOnline(true);
    const online = useOnline.getState();
    return online.state === "listed" && online.catalogue ? { catalogue: online.catalogue } : { problem: online.problem ?? "The list of plugins online could not be fetched." };
  },
  offered: (catalogue) => offeredFor(FIRST_ROLE, offersOf(catalogue, new Map(ALL_PLUGINS.map((p) => [p.id, p.version])), systemHere())),
  get: async (entry) => {
    await getPlugin(entry);
    await refreshPlugins();
  },
  plan: async (entry) => {
    const p = gotHere(entry);
    const added = useReaders.getState().state;
    // (those it uses not added yet, and those it needs that are not here at all: set up first)
    const used = pluginsUsedBy(p.id).filter((q) => added[q.id] !== "added");
    const missing = (manifestOf(p.id)?.depends ?? []).filter((d) => !d.optional && !anyPluginById(d.plugin)).map((d) => d.plugin);
    const asked = await Promise.all([...used, p].filter(runs).map((q) => setUpQuestions(q.profile)));
    return { questions: asked.flat(), files: runs(p) ? p.downloads.length : 0, uses: [...used.map((q) => q.name), ...missing] };
  },
  add: async (entry) => addPlugin(gotHere(entry)),
};

