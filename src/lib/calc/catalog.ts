/**
 * The readers Meno knows of (docs/PLUGINS.md, docs/FILE-IO.md): the plugins
 * on offer, each from its manifest in its folder (lib/plugins/known) - those
 * Meno carries, for now; a list fetched online needs a way to trust it, and
 * comes later - and Meno itself, which reads some kinds under the same
 * contract (./menoReads). The kinds a plugin brings are registered while it
 * is added (lib/io/kinds, ./workers); those of every plugin on offer are
 * looked at only to say which plugin would read a file nothing added reads.
 *
 * A reader is known by its id. What it gave - results, the readers a
 * molecule was read by - keeps the id; its name is looked up only to show
 * it.
 */
import { lockOf, WORKER, type CatalogueFile, type InstalledDecl, type Manifest, type StepDecl, type System, type WriteDecl } from "../plugins/manifest";
import type { GuideStep, Suggestion } from "../plugins/guide";
import type { Option } from "../options";
import { MANIFESTS, PLUGINS_ROOT } from "../plugins/known";
import type { RoleId } from "../plugins/roles";
import { MENO_READS } from "./menoReads";
import { cataloguedKinds, kindById, MENO_KINDS, registered, type Kind } from "../io/kinds";

type Described = {
  id: string;
  name: string;
  /** The version of what it brings; Meno's own, none. */
  version: string;
  /** One line on what it is. */
  description: string;
  licence: string;
  homepage: string;
};
type ReaderBase = Described & {
  /** The kinds it reads, by id. */
  reads: readonly string[];
};
/** What any plugin may bring besides what it runs: a guide, shown once; the plugins it suggests; the kinds of file it names, and the plugins it suggests for each (lib/plugins/guide). */
type Brings = {
  /** The systems it can be added on; none, every one. */
  systems: readonly System[];
  guide: readonly GuideStep[];
  suggests: readonly Suggestion[];
  files: readonly CatalogueFile[];
};
/** A plugin that runs something: what it reads and writes, the roles it fills besides, and what it runs - a worker in a Python environment of its own. */
export type PythonPlugin = ReaderBase &
  Brings & {
    builtin?: undefined;
    /** The roles it fills besides reading files (lib/plugins/roles). */
    roles: readonly RoleId[];
    /** The kinds it writes (lib/io/writers): none of Meno's, which Meno writes itself. */
    writes: readonly WriteDecl[];
    /** The options it takes for the roles it fills, by role (Settings, where each role is chosen). */
    roleOptions: Partial<Record<RoleId, readonly Option[]>>;
    /** The kinds of a workflow's step it fills (docs/WORKFLOWS.md). */
    steps: readonly StepDecl[];
    /** The programs installed separately that its steps run: found or located, never fetched (lib/plugins/installed). */
    installed: readonly InstalledDecl[];
    /** Its Python environment's profile, and its lock and worker, in its folder among Meno's resources. */
    profile: `plugin-${string}`;
    lock: string;
    worker: string;
    /** What makes its environment: uv from PyPI (unsaid), or pixi - its lock a pixi.lock - where it needs conda-forge. */
    env?: "pixi";
  };
/** A plugin that runs nothing: what it brings is data - a guide, a catalogue - shown by Meno. Nothing to download, nothing to start; added or taken away at once. */
export type DataPlugin = Described & Brings & { builtin?: undefined; data: true };
/** A plugin, whether it runs something or not. */
export type Plugin = PythonPlugin | DataPlugin;
/** Meno itself, reading what it reads under the readers' contract: nothing to add or take away, nothing downloaded. */
export type MenoReader = ReaderBase & { builtin: true };
export type ReaderPlugin = PythonPlugin | MenoReader;

/** Whether a plugin runs something - a worker in an environment of its own - rather than bring data alone. */
export const runs = (p: Plugin): p is PythonPlugin => !("data" in p);

const MENO_IDS: ReadonlySet<string> = new Set(Object.values(MENO_KINDS).map((k) => k.id));

const brings = (m: Manifest): Brings => ({ systems: m.systems, guide: m.guide, suggests: m.suggests, files: m.files });

/** A plugin, from its manifest. */
export const pluginOf = (m: Manifest): Plugin => {
  const described = { id: m.id, name: m.name, version: m.version, description: m.description, licence: m.licence, homepage: m.homepage };
  if (!m.environment) return { ...described, ...brings(m), data: true };
  return {
    ...described,
    ...brings(m),
    // (its own kinds, and Meno's: never another plugin's, which it does not know)
    reads: m.reads.filter((id) => MENO_IDS.has(id) || m.kinds.some((k) => k.id === id)),
    roles: m.roles.map((r) => r.role),
    writes: m.writes.filter((w) => !MENO_IDS.has(w.id)),
    steps: m.steps,
    installed: m.installed,
    roleOptions: Object.fromEntries(m.roles.filter((r) => r.options.length).map((r) => [r.role, r.options])),
    profile: `plugin-${m.id}`,
    lock: `${PLUGINS_ROOT}/${m.id}/${lockOf(m.environment)}`,
    worker: `${PLUGINS_ROOT}/${m.id}/${WORKER}`,
    ...(m.environment === "pixi" ? { env: "pixi" as const } : {}),
  };
};

/** Every plugin Meno knows of, in Meno's order: those that run something, and those that bring data alone. */
export const ALL_PLUGINS: readonly Plugin[] = MANIFESTS.map(pluginOf);

/** The plugins Meno knows of that run something, in Meno's order: each that reads or writes something, or fills a role or a kind of step. */
export const PLUGINS: readonly PythonPlugin[] = ALL_PLUGINS.filter(runs).filter((p) => p.reads.length || p.roles.length || p.writes.length || p.steps.length);

/** The plugins that read files. */
export const READER_PLUGINS: readonly PythonPlugin[] = PLUGINS.filter((p) => p.reads.length);

/** The plugins that write files. */
export const WRITER_PLUGINS: readonly PythonPlugin[] = PLUGINS.filter((p) => p.writes.length);

/** A plugin of that id, whether it runs something or not. */
export const anyPluginById = (id: string): Plugin | undefined => ALL_PLUGINS.find((p) => p.id === id);

/** The plugin of that id. */
export const pluginById = (id: string): PythonPlugin | undefined => PLUGINS.find((p) => p.id === id);

/** The plugins that fill a role, in Meno's order. */
export const pluginsFilling = (role: RoleId): PythonPlugin[] => PLUGINS.filter((p) => p.roles.includes(role));

/** The manifest of a plugin Meno knows of. */
export const manifestOf = (id: string): Manifest | undefined => MANIFESTS.find((m) => m.id === id);

/**
 * The marks of the plugins Meno carries refused - each would have claimed
 * one of Meno's own files - added or not: said in Settings, Plugins.
 */
export const REFUSED = registered(MANIFESTS).refused;

/** The kind of that id: registered, or else one the catalogue of a plugin added names. */
export const anyKindById = (id: string): Kind | undefined => kindById(id) ?? kindById(id, cataloguedKinds());

/**
 * Meno's own reading, as a reader: what it reads under the contract, in its
 * worker (./menoReads) - RXN, MOL, SD and XYZ files, and the cube - and,
 * besides, its own workspace, which is no reader's to read but Meno's
 * core's (docs/FILE-IO.md, *The line*).
 */
export const MENO: MenoReader = {
  id: "meno",
  name: "Meno",
  version: "",
  description: "",
  licence: "",
  homepage: "",
  reads: [MENO_KINDS.workspace.id, ...Object.keys(MENO_READS)],
  builtin: true,
};

/** Every reader: Meno's own, then the plugins, in Meno's order. */
export const READERS: readonly ReaderPlugin[] = [MENO, ...READER_PLUGINS];

/** The reader of that id. */
export function readerById(id: string, readers: readonly ReaderPlugin[] = READERS): ReaderPlugin | undefined {
  return readers.find((r) => r.id === id);
}

/** A reader's id, from a reader as a molecule keeps it: its id and version, "cclib 1.9rc1"; Meno's own, "meno". */
export function readerIdOfLine(line: string): string {
  return line.split(" ")[0];
}

/** A reader's name, as the chemist knows it, by its id; one Meno does not know, by its id. */
export function readerNameOf(id: string | undefined, readers: readonly ReaderPlugin[] = READERS): string {
  if (!id) return "";
  return readerById(id, readers)?.name ?? id;
}

/** The readers that read a kind, in Meno's order: Meno first, where it reads it. */
export function readersOf(kind: string, readers: readonly ReaderPlugin[] = READERS): ReaderPlugin[] {
  return readers.filter((p) => p.reads.includes(kind));
}

/** Who reads a kind, as the chemist has it in Settings, Files: its reader, and the readers that add to it. */
export type FileChoices = {
  /** The reader chosen for a kind, by the kind's id. */
  read: Record<string, string>;
  /** The readers that read a kind as well, their results added, by the kind's id. */
  also: Record<string, string[]>;
};

/**
 * The reader of a kind: the one chosen for it, where it is added and reads
 * it; else Meno, where Meno reads it - Meno keeps its kinds; else the first
 * added that reads it, in Meno's order. None, where nothing added reads it.
 */
export function readerFor(
  kind: string,
  added: ReadonlySet<string>,
  choices: FileChoices,
  readers: readonly ReaderPlugin[] = READERS,
): ReaderPlugin | null {
  const can = readersOf(kind, readers).filter((p) => p.builtin || added.has(p.id));
  return can.find((p) => p.id === choices.read[kind]) ?? can.find((p) => p.builtin) ?? can[0] ?? null;
}

/** The readers that read a kind as well as its reader, as chosen: each added, each reading it, the reader itself not again. */
export function alsoReadersFor(
  kind: string,
  added: ReadonlySet<string>,
  choices: FileChoices,
  readers: readonly ReaderPlugin[] = READERS,
): ReaderPlugin[] {
  const reader = readerFor(kind, added, choices, readers);
  const wanted = new Set(choices.also[kind] ?? []);
  return readersOf(kind, readers).filter((p) => p !== reader && wanted.has(p.id) && (p.builtin || added.has(p.id)));
}
