/**
 * Who does a step (docs/WORKFLOWS.md, *Who does a step*): a step is one
 * plugin's - or Meno's, which stands among the plugins for the steps it
 * does itself - and of one of the kinds of step it fills (its manifest's
 * `steps`), which can be changed in the step to another it fills. Only
 * the plugins added are offered. Who does a step says what options it
 * takes.
 */
import { renderOptions } from "../render/renderOptions";
import { pluginById, PLUGINS } from "../../../../lib/calc/catalog";
import { useReaders } from "../../../../lib/calc/workers";
import { valuesOf, type Option } from "../../../../lib/options";
import { isRole, roleOptionsRole } from "../../../../lib/plugins/roles";
import { useAppSettings } from "../../../../lib/settings/appSettings";
import type { InstalledDecl } from "../../../../lib/plugins/manifest";
import { tooOld, whereIs } from "../../../../lib/plugins/installed";
import { systemHere } from "../../../../lib/plugins/here";
import type { WorkflowSet, WorkflowStep } from "../store/types";
import { exitOf, exitsOf, inputsOf, KINDS, kindInfo, madeName, MENO_DOES, needsOf, takenBy, takes, type StepKind, type StepPort, type ValueKind } from "./kinds";

export type Doer = { id: string; name: string };

export const MENO: Doer = { id: "meno", name: "Meno" };

/**
 * The kinds of step one does, in Meno's order: Meno's own; a plugin's,
 * those of Meno's its manifest says it fills - but not one that runs a
 * program installed separately that is not made for this system (Gaussian's
 * on Windows, where Meno does not run it).
 */
export function kindsOf(by: string): StepKind[] {
  if (by === MENO.id) return [...MENO_DOES];
  const p = pluginById(by);
  if (!p) return [];
  const here = systemHere();
  const runsHere = (programs: readonly string[]) => here == null || p.installed.every((d) => !programs.includes(d.name) || !!d.files[here]);
  return KINDS.filter((k) => p.steps.some((d) => d.kind === k.kind && runsHere(d.programs))).map((k) => k.kind);
}

/**
 * Whether a step of `kind` done by `by` takes a set that holds `holds`:
 * the kind takes it, and - done by a plugin - its manifest does not leave
 * it out (`takes`: CREST's conformer search starts from molecules in 3D,
 * not from structures drawn).
 */
export function takesBy(kind: StepKind, by: string, holds: ValueKind): boolean {
  // (a kind that takes nothing in, made from seeds by this one: the seeds' input's own)
  if (!inputsOf(kind).length) return inputsFor(kind, by).some((p) => takenBy(p.takes, holds));
  if (!takes(kind, holds)) return false;
  if (!by || by === MENO.id) return true;
  const decl = pluginById(by)?.steps.find((d) => d.kind === kind);
  return !decl?.takes || takenBy(decl.takes, holds);
}

/** The input a kind that takes nothing in takes where its plugin makes from seeds (a manifest's `seeds`): structures drawn, each a seed. */
export const SEEDS_INPUT: StepPort = { id: "seeds", name: "Seeds", takes: ["structures"] };

/**
 * The inputs a step of `kind` done by `by` takes: the kind's own - and, of
 * a kind that takes nothing in (*Generate*), *Seeds* where its plugin's
 * manifest says it makes its structures from seeds (`seeds`), none where
 * it does not.
 */
export function inputsFor(kind: StepKind, by: string): readonly StepPort[] {
  const own = inputsOf(kind);
  if (own.length || !pluginById(by)?.steps.find((d) => d.kind === kind)?.seeds) return own;
  return [SEEDS_INPUT];
}

/** Whether a step of `kind` done by `by` takes nothing in: no input, nothing wired to it (*Generate* from a model alone). */
export const takesNothingBy = (kind: StepKind, by: string): boolean => inputsFor(kind, by).length === 0;

/**
 * What a plugin is called where its steps are - a card, Quick Add,
 * Settings' defaults: the program installed separately it runs, where it
 * runs one (ORCA - its plugin, in Settings' list, the ORCA interface);
 * else its name.
 */
export const doerName = (p: { name: string; installed: readonly { label: string }[] }) => p.installed[0]?.label ?? p.name;

/** Those that do steps, as they are offered: the plugins added that fill any, in Meno's order - those that run a program first - then Meno. */
export function doersAdded(): Doer[] {
  const added = useReaders.getState().state;
  const plugins = PLUGINS.filter((p) => added[p.id] === "added" && kindsOf(p.id).length);
  const programs = (id: string) => kindsOf(id).some((k) => kindInfo(k).runs === "program");
  return [...[...plugins.filter((p) => programs(p.id)), ...plugins.filter((p) => !programs(p.id))].map((p) => ({ id: p.id, name: doerName(p) })), MENO];
}

/** Whether one is added, and so can run a step: Meno always. */
export const isAdded = (by: string) => by === MENO.id || useReaders.getState().state[by] === "added";

/** Who does a step, by id: as it says - or, a step saved before steps said, Meno where Meno does its kind. */
export const byOf = (step: Pick<WorkflowStep, "kind" | "by">): string => step.by ?? (MENO_DOES.includes(step.kind) ? MENO.id : "");

/** Who does a step, by name: Meno, or a plugin Meno knows of - by its id, one it does not. */
export function doerOf(step: Pick<WorkflowStep, "kind" | "by">): Doer | undefined {
  const by = byOf(step);
  if (!by) return undefined;
  const p = pluginById(by);
  return by === MENO.id ? MENO : { id: by, name: p ? doerName(p) : by };
}

/**
 * What of the one doing a step its results hang on, beyond the step's
 * options: a plugin's version, and the files it was set up with - a model's
 * weights, by hash. What a step that takes nothing in (*Generate*) is keyed
 * by, so that another prior is another run, never one taken up again.
 */
export function doerStamp(by: string): string {
  const p = pluginById(by);
  return p ? [p.version, ...p.downloads.map((d) => d.sha256)].join("|") : "";
}

/**
 * The options a kind of step takes, done by `by`: Meno's own, or those the
 * plugin declares for the kind - whether it is added now or not, so that a
 * step keeps saying how it was set.
 */
export function optionsFor(kind: StepKind, by: string): readonly Option[] {
  if (by === MENO.id) return kindInfo(kind).options ?? [];
  const plugin = pluginById(by);
  const decl = plugin?.steps.find((d) => d.kind === kind);
  const own = decl?.options ?? [];
  // (a step that says no options of its own takes its role's - lib/plugins/manifest - and starts, as that
  // role does wherever it is asked, from those chosen in Settings: a conformer search as 3D structures makes one)
  const role = decl?.roleOptions && isRole(kind) ? kind : undefined;
  const chosen: Record<string, unknown> = role ? valuesOf(own, useAppSettings.getState().options[roleOptionsRole(role)]) : {};
  // (Meno's own choices for the kind, whoever does it - Render's - then the plugin's)
  // (Render's: its looks are the plugin's, declared in its manifest)
  const meno = kind === "render" && plugin?.roleLooks.render ? renderOptions("picture", [], true, plugin.roleLooks.render) : (kindInfo(kind).own ?? []);
  return [...meno, ...own.map((o) => (o.id in chosen ? ({ ...o, default: chosen[o.id] } as Option) : o))];
}

/** The options a step takes, as who does it declares them. */
export const stepOptions = (step: Pick<WorkflowStep, "kind" | "by">) => optionsFor(step.kind, byOf(step));

/**
 * A set's name, as its frame says it: a step's first exit's, as the kind
 * names what it makes, as it was set; another exit's, by its own name; a
 * chemist's, theirs, or "Input".
 */
export function setName(set: Pick<WorkflowSet, "made" | "name">, steps: readonly WorkflowStep[]): string {
  const made = set.made ? steps.find((s) => s.id === set.made!.step) : undefined;
  const exit = made && set.made ? exitOf(made.kind, set.made.exit) : undefined;
  // (any exit but the first by its own name: an Atom map's Bond changes, as much as what a step set aside)
  return made && exit ? (exit.id !== exitsOf(made.kind)[0].id ? exit.name : madeName(made.kind, stepOptions(made), made.options)) : (set.name ?? "Input");
}

/** The programs a plugin runs for a kind of step; none, where it does the step in its worker - or Meno does it. */
export function programsFor(kind: StepKind, by: string): readonly string[] {
  return pluginById(by)?.steps.find((d) => d.kind === kind)?.programs ?? [];
}

/** The programs installed separately a plugin runs for a kind of step (lib/plugins/installed): ORCA's, Gaussian's. */
export function installedFor(kind: StepKind, by: string): readonly InstalledDecl[] {
  const programs = programsFor(kind, by);
  return pluginById(by)?.installed.filter((d) => programs.includes(d.name)) ?? [];
}

/** What a step cannot run without, said: the first program installed separately it runs that Meno looked for and found nowhere ("ORCA not found"), or only too old ("Blender too old"). */
export function missingFor(step: Pick<WorkflowStep, "kind" | "by">): string | undefined {
  const by = byOf(step);
  const d = installedFor(step.kind, by).find((d) => whereIs(by, d.name) === null);
  return d && `${d.label} ${tooOld(by, d.name) ? "too old" : "not found"}`;
}

/** What step `s`'s card says where it would say *Ready*, where it cannot run: a program it runs found nowhere or too old (`missingFor`), else what it still needs of its options (kinds `needsOf`). */
export function notReadyFor(s: Pick<WorkflowStep, "kind" | "by" | "options">): string | undefined {
  return missingFor(s) ?? needsOf(s);
}
