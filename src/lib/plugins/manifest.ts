/**
 * A plugin's manifest (docs/PLUGINS.md, *The manifest*): data in the
 * plugin's folder of its own, saying what it is; what makes its
 * environment, where it runs anything (its worker, worker.py, beside its
 * lock); every kind of file it knows (`kinds`) - those it reads (`reads`),
 * those it writes (`writes`), and the rest, texts it colours; the roles it
 * fills (`roles`) and the kinds of a workflow's step (`steps`), each with
 * its options; the systems it can be added on and the programs installed
 * separately its steps run; and, besides, a guide Meno shows once and a
 * catalogue of plugins it suggests - for files of the kinds it names, too.
 *
 * A plugin stands alone: it knows of no other, and Meno of no program. Two
 * plugins that read the same kind each bring it, by the same id; Meno puts
 * them together (lib/io/kinds). A plugin that runs nothing - no environment
 * - brings only data: a guide, a catalogue, texts it colours.
 *
 * It is read as data, and checked here, whoever wrote it: what reads wrong
 * in it is left out, and what it cannot do without makes it none. A kind is
 * told by marks - text a file's start holds - never by a pattern or code: a
 * pattern can be written so that matching it never ends, and would hold the
 * page up. A kind told only by how it is laid out is told by its plugin when
 * asked (`probe`).
 *
 * The plugins Meno carries for now (./known) are each read here as one
 * fetched would be.
 */
import { acceptOptions, type Option } from "../options";
import { TONE_NAMES, type Tone } from "../text/tones";
import { isRole, ROLES, type RoleId } from "./roles";
import { isStepKind, SET_KINDS, type SetKind, type StepKind } from "./steps";
import { GUIDE_EVENTS, GUIDE_PLACES, type GuideStep, type Suggestion } from "./guide";

/** Text a file's start holds, which tells a kind: anywhere, or at a line's start; runs of spaces counted as one. */
export type Mark = {
  text: string;
  /** Only at a line's start, spaces before it aside. */
  at?: "line-start";
  /** Whatever its letters' case. */
  anyCase?: true;
};

/**
 * How a text of a kind is coloured (docs/PDF.md, *A text*): a grammar in
 * Lezer's form, in a file in the plugin's folder, and the tone each of its
 * parts is drawn in, by the name the grammar gives it. Data, as all of a
 * manifest is: Meno makes the grammar into tables as it is first wanted
 * (lib/text/grammars) - a tokenizer that reads each letter once, a parser
 * that never goes back - and takes no code from it (`@external`,
 * `@context`). What does not read as its kind's grammar says is marked.
 */
export type GrammarDecl = { file: string; tones: Record<string, Tone> };

/**
 * A kind of file a plugin knows: what it is called, the names its files go
 * by, how one is told, and how a text of it is coloured. A kind it reads is
 * told by its marks - or, where it says, by asking it (`probe`); a kind it
 * only colours - an input to its program, written by hand - by its files'
 * names, and, among those that share them, by what its lines begin with
 * (`lines`).
 */
export type KindDecl = {
  id: string;
  /** What it is called, in Settings and in messages: "NBO output". */
  name: string;
  /** The program that writes it, as a molecule read from it names it; unsaid for a kind many programs write. */
  program?: string;
  /** The file names it goes by, lower case, with their dot. */
  extensions: string[];
  /** What the start of such a file says, one of them at least: how a file of a kind it reads is told. */
  marks: Mark[];
  /** What a line of a text of it begins with - one of them, in its first lines - where its files' names say too little. */
  lines: string[];
  /** Told by its plugin, asked, where no mark tells it. */
  probe?: true;
  /** How a text of it is coloured. */
  grammar?: GrammarDecl;
};

/**
 * A kind of file a plugin writes (docs/FILE-IO.md, *The contract for
 * files*), one of its `kinds`: what it is called and the names its files go
 * by - the first the one Export gives - as the kind says, and its options,
 * in the general form (lib/options), which Meno draws in Export. It is given
 * one molecule - one system of molecules in 3D, which Meno asks for where it
 * must.
 */
export type WriteDecl = {
  id: string;
  name: string;
  extensions: string[];
  options: Option[];
  /** How a text of it is coloured. */
  grammar?: GrammarDecl;
};

/** A role a plugin fills (lib/plugins/roles), by the id Meno gives it, and its options where the role takes them. */
export type RoleDecl = { role: RoleId; options: Option[] };

/**
 * A kind of step a plugin fills (docs/WORKFLOWS.md, *What changes in the
 * contract*): the kind, by the id Meno gives it; the programs it runs, by
 * their names, from its environment - none, where it does the step in its
 * worker; its options, in the general form (lib/options), which Meno draws
 * in the step and in Settings, *Calculations* - those of the role of the
 * same name, where it fills one and says none; and, where it takes less
 * than the kind does, what it takes (`takes`: CREST's conformer search,
 * molecules in 3D and conformer sets, not structures drawn). A manifest may
 * say several kinds in one, with the same programs and options.
 */
export type StepDecl = { kind: StepKind; programs: string[]; options: Option[]; takes?: SetKind[] };

/** The systems Meno runs on, as a plugin names those it can be added on. */
export const SYSTEMS = ["macos", "windows", "linux"] as const;
export type System = (typeof SYSTEMS)[number];

/**
 * A program installed separately - ORCA, Gaussian - that a plugin's steps
 * run (docs/WORKFLOWS.md, *Programs installed separately*): never fetched,
 * found where the system finds programs or where the chemist locates it.
 * Its name, as the steps name it; what it is called; its file's name on
 * each system it is made for; and, as it runs, the folders put first where
 * programs are looked for (`path`) and the variables it is given (`env`) -
 * each a place in its installation, `{folder}` (where its file is) or
 * `{parent}` (the folder above), with a path inside it. Meno's backend
 * reads and checks the same (src-tauri/src/jobs.rs `installed_named`).
 */
export type InstalledDecl = {
  name: string;
  label: string;
  files: Partial<Record<System, string>>;
  path: string[];
  env: Record<string, string[]>;
};

/** A kind of file a plugin's catalogue names, and the plugins it suggests for one: told by its marks, as a kind a plugin reads is. */
export type CatalogueFile = { id: string; name: string; extensions: string[]; marks: Mark[]; suggest: string[] };

/** What makes a plugin's environment: uv, from PyPI (its requirements.lock), or pixi, where it needs conda-forge (its pixi.toml and pixi.lock). */
export type Maker = "uv" | "pixi";

/** The lock in a plugin's folder that its environment is made from. */
export const lockOf = (maker: Maker) => (maker === "pixi" ? "pixi.lock" : "requirements.lock");
/** A plugin's worker, in its folder. */
export const WORKER = "worker.py";

/** A plugin's manifest, as Meno reads it. */
export type Manifest = {
  id: string;
  name: string;
  /** Its version: that of what it brings - the version its environment's lock pins, or its own. */
  version: string;
  /** One line on what it is. */
  description: string;
  licence: string;
  homepage: string;
  /** What makes its environment; none, where it runs nothing. */
  environment?: Maker;
  /** Every kind of file it knows. */
  kinds: KindDecl[];
  /** The kinds it reads, by id: its own (`kinds`), or Meno's. */
  reads: string[];
  /** The kinds it writes, of its own. */
  writes: WriteDecl[];
  /** The roles it fills besides reading and writing files. */
  roles: RoleDecl[];
  /** The kinds of step it fills, each once. */
  steps: StepDecl[];
  /** The systems it can be added on - its programs built for those alone; none said, every one. */
  systems: System[];
  /** The programs installed separately that its steps run. */
  installed: InstalledDecl[];
  /** Its guide: shown once, the first time it is there. */
  guide: GuideStep[];
  /** The plugins it suggests. */
  suggests: Suggestion[];
  /** The kinds of file it names, and the plugins it suggests for each. */
  files: CatalogueFile[];
};

const ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
const EXTENSION = /^\.[a-z0-9]{1,12}$/;
/** A mark shorter than this would claim too much. */
const MARK_LEAST = 6;
const MARK_MOST = 200;

/** Whether a string is an id: of a plugin, a kind, a text - lower case, digits and hyphens. Meno's backend takes the same (src-tauri/src/lib.rs, jobs.rs). */
export const isId = (v: unknown): v is string => typeof v === "string" && ID.test(v);

const text = (v: unknown, most: number): string | null => (typeof v === "string" && v.trim() && v.length <= most ? v.trim() : null);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const ids = (v: unknown): string[] => [...new Set(list(v).filter(isId))];
const extensionsOf = (v: unknown): string[] => list(v).filter((e): e is string => typeof e === "string" && EXTENSION.test(e));

function markOf(v: unknown): Mark | null {
  const m = v as Record<string, unknown> | null;
  const t = text(m?.text, MARK_MOST);
  if (!t || folded(t).length < MARK_LEAST) return null;
  return { text: t, ...(m?.at === "line-start" ? { at: "line-start" as const } : {}), ...(m?.anyCase === true ? { anyCase: true as const } : {}) };
}
const marksOf = (v: unknown): Mark[] => list(v).map(markOf).filter((m): m is Mark => m != null);

/** A grammar's file, in the plugin's folder: a name, not a path. */
const GRAMMAR_FILE = /^[a-z0-9][a-z0-9-]{0,40}\.grammar$/;
/** A part of a grammar, by the name it gives it. */
const NODE = /^[A-Za-z_][A-Za-z0-9_]{0,39}$/;
/** How many parts a grammar gives tones at most. */
const TONES_MOST = 60;

function grammarOf(v: unknown): { grammar?: GrammarDecl } {
  const g = v as Record<string, unknown> | null;
  const file = typeof g?.file === "string" && GRAMMAR_FILE.test(g.file) ? g.file : null;
  const given = g?.tones && typeof g.tones === "object" && !Array.isArray(g.tones) ? (g.tones as Record<string, unknown>) : null;
  if (!file || !given) return {};
  const tones: Record<string, Tone> = {};
  for (const [node, tone] of Object.entries(given).slice(0, TONES_MOST)) if (NODE.test(node) && (TONE_NAMES as readonly unknown[]).includes(tone)) tones[node] = tone as Tone;
  return Object.keys(tones).length ? { grammar: { file, tones } } : {};
}

function kindOf(v: unknown): KindDecl | null {
  const k = v as Record<string, unknown> | null;
  const id = isId(k?.id) ? k.id : null;
  const name = text(k?.name, 80);
  if (!id || !name) return null;
  const program = text(k?.program, 80);
  // (what a line begins with tells a text among those of its files' names, and claims no file: as short as a letter)
  const lines = list(k?.lines)
    .map((l) => text(l, MARK_MOST))
    .filter((l): l is string => l != null);
  return {
    id,
    name,
    ...(program ? { program } : {}),
    extensions: extensionsOf(k?.extensions),
    marks: marksOf(k?.marks),
    lines,
    ...(k?.probe === true ? { probe: true as const } : {}),
    ...grammarOf(k?.grammar),
  };
}

/** A program's name, as a job is given it: a name, not a path. */
const PROGRAM = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,39}$/;

/** The kinds of step a manifest's step says - each one Meno defines - with what they share. */
function stepsOf(v: unknown, roles: readonly RoleDecl[]): StepDecl[] {
  const s = v as Record<string, unknown> | null;
  const kinds = list(s?.kinds).filter((k): k is StepKind => typeof k === "string" && isStepKind(k));
  const programs = [...new Set(list(s?.programs).filter((p): p is string => typeof p === "string" && PROGRAM.test(p)))];
  const takes = Array.isArray(s?.takes) ? SET_KINDS.filter((t) => (s.takes as unknown[]).includes(t)) : [];
  const options = acceptOptions(s?.options);
  // (none said, and it fills the role of the kind's name: the role's - the same work, asked as a step)
  const optionsFor = (kind: StepKind) => (s?.options !== undefined ? options : (roles.find((r) => r.role === kind)?.options ?? []));
  return kinds.map((kind) => ({ kind, programs, options: optionsFor(kind), ...(takes.length ? { takes: [...takes] } : {}) }));
}

/** A program's file, as a system has it: a name, not a path. */
const FILE = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,59}$/;
/** Variables a program installed separately is never given by a plugin: how programs are found and loaded, the network's way out, and the threads Meno sets. Meno's backend refuses the same (src-tauri/src/jobs.rs). */
const ENV_NEVER = ["PATH", "LD_PRELOAD", "LD_AUDIT", "DYLD_INSERT_LIBRARIES", "HTTPS_PROXY", "HTTP_PROXY", "ALL_PROXY", "NO_PROXY", "OMP_NUM_THREADS", "MKL_NUM_THREADS", "OPENBLAS_NUM_THREADS"];
const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;

/** Whether `t` is a place in a program's installation: `{folder}` or `{parent}`, and after it, if anything, a path inside that, never above. */
function placeOk(t: unknown): t is string {
  if (typeof t !== "string") return false;
  const rest = t.startsWith("{folder}") ? t.slice(8) : t.startsWith("{parent}") ? t.slice(8) : null;
  if (rest == null) return false;
  if (rest === "") return true;
  return rest.startsWith("/") && rest.slice(1).split("/").every((part) => part !== "" && part !== "." && part !== "..");
}

/** Places, as a manifest gives them: one, or several; null where any is not one. */
function placesOf(v: unknown): string[] | null {
  const given = typeof v === "string" ? [v] : Array.isArray(v) ? v : null;
  return given && given.every(placeOk) ? (given as string[]) : null;
}

function installedOf(v: unknown): InstalledDecl | null {
  const d = v as Record<string, unknown> | null;
  const name = typeof d?.name === "string" && PROGRAM.test(d.name) ? d.name : null;
  const label = text(d?.label, 60);
  const given = (d?.files ?? {}) as Record<string, unknown>;
  const files: Partial<Record<System, string>> = {};
  for (const s of SYSTEMS) if (typeof given[s] === "string" && FILE.test(given[s] as string)) files[s] = given[s] as string;
  const path = d?.path === undefined ? [] : placesOf(d.path);
  const env: Record<string, string[]> = {};
  let envOk = true;
  if (d?.env !== undefined) {
    if (!d.env || typeof d.env !== "object" || Array.isArray(d.env)) envOk = false;
    else
      for (const [k, raw] of Object.entries(d.env as Record<string, unknown>)) {
        const places = placesOf(raw);
        if (!ENV_NAME.test(k) || ENV_NEVER.some((x) => x.toLowerCase() === k.toLowerCase()) || !places) envOk = false;
        else env[k] = places;
      }
  }
  // (one it cannot be run as it says - a place outside its installation, a variable it may not set - is none)
  return name && label && Object.keys(files).length && path && envOk ? { name, label, files, path, env } : null;
}

/** How long a guide's words may be: a title, a step's text. */
const TITLE_MOST = 60;
const STEP_MOST = 300;
/** How many steps a guide has at most. */
const STEPS_MOST = 12;

function guideStepOf(v: unknown): GuideStep | null {
  const s = v as Record<string, unknown> | null;
  const title = text(s?.title, TITLE_MOST);
  const said = text(s?.text, STEP_MOST);
  if (!title || !said) return null;
  const at = GUIDE_PLACES.find((p) => p === s?.at);
  const until = GUIDE_EVENTS.find((e) => e === s?.until);
  const suggest = ids(s?.suggest);
  return { title, text: said, ...(at ? { at } : {}), ...(until ? { until } : {}), ...(suggest.length ? { suggest } : {}) };
}

function suggestionOf(v: unknown): Suggestion | null {
  const s = v as Record<string, unknown> | null;
  const plugin = isId(s?.plugin) ? s.plugin : null;
  const what = text(s?.for, 120);
  return plugin && what ? { plugin, for: what } : null;
}

function catalogueFileOf(v: unknown): CatalogueFile | null {
  const f = v as Record<string, unknown> | null;
  const id = isId(f?.id) ? f.id : null;
  const name = text(f?.name, 80);
  const marks = marksOf(f?.marks);
  const suggest = ids(f?.suggest);
  // (told by its marks - no plugin added to ask - and some plugin to suggest)
  return id && name && marks.length && suggest.length ? { id, name, extensions: extensionsOf(f?.extensions), marks, suggest } : null;
}

/** Each of a list read, those that do not read left out, and of those with the same key the first. */
function read<T>(raw: unknown, one: (v: unknown) => T | null, key: (t: T) => string): T[] {
  const out: T[] = [];
  for (const v of list(raw)) {
    const t = one(v);
    if (t && !out.some((o) => key(o) === key(t))) out.push(t);
  }
  return out;
}

/** A manifest as Meno reads it, or null where it does not read as one: what reads wrong in it is left out, what it cannot do without makes it none. */
export function acceptManifest(raw: unknown): Manifest | null {
  const m = raw as Record<string, unknown> | null;
  if (!m || typeof m !== "object") return null;
  const id = isId(m.id) ? m.id : null;
  const name = text(m.name, 60);
  const version = text(m.version, 40);
  if (!id || !name || !version) return null;
  if (m.environment !== undefined && m.environment !== "uv" && m.environment !== "pixi") return null;
  const environment = m.environment as Maker | undefined;
  const kinds = read(m.kinds, kindOf, (k) => k.id);
  const own = (kind: string) => kinds.find((k) => k.id === kind);
  // (what it does, where it runs something to do it)
  const reads = environment ? ids(m.reads) : [];
  const writes = environment
    ? read(
        m.writes,
        (v): WriteDecl | null => {
          const w = v as Record<string, unknown> | null;
          const k = typeof w?.kind === "string" ? own(w.kind) : undefined;
          // (one of its own kinds, with a name its files go by: Export gives the first)
          if (!k || !k.extensions.length) return null;
          return { id: k.id, name: k.name, extensions: k.extensions, options: acceptOptions(w?.options), ...(k.grammar ? { grammar: k.grammar } : {}) };
        },
        (w) => w.id,
      )
    : [];
  const roles = environment
    ? read(
        m.roles,
        (v): RoleDecl | null => {
          const r = v as Record<string, unknown> | null;
          if (typeof r?.role !== "string" || !isRole(r.role)) return null;
          // (options only for a role that takes them)
          return { role: r.role, options: "options" in ROLES[r.role] ? acceptOptions(r.options) : [] };
        },
        (r) => r.role,
      )
    : [];
  // (each kind of step once)
  const steps = environment ? list(m.steps).flatMap((v) => stepsOf(v, roles)).filter((d, i, all) => all.findIndex((e) => e.kind === d.kind) === i) : [];
  const guide = list(m.guide)
    .map(guideStepOf)
    .filter((g): g is GuideStep => g != null)
    .slice(0, STEPS_MOST);
  const suggests = read(m.suggests, suggestionOf, (s) => s.plugin).filter((s) => s.plugin !== id);
  const files = read(m.files, catalogueFileOf, (f) => f.id);
  // (a kind it reads is told: by its marks, or by asking it - and then by its files' names first)
  const told = (k: KindDecl) => k.marks.length > 0 || (!!k.probe && k.extensions.length > 0);
  const readable = reads.filter((r) => !own(r) || told(own(r)!));
  // (a text it only colours: by its files' names, with its grammar)
  const colours = kinds.some((k) => !readable.includes(k.id) && !writes.some((w) => w.id === k.id) && k.extensions.length && k.grammar);
  // (a plugin that does nothing is none)
  if (!readable.length && !writes.length && !roles.length && !steps.length && !colours && !guide.length && !suggests.length && !files.length) return null;
  const systems = SYSTEMS.filter((s) => list(m.systems).includes(s));
  // (each program installed separately once, and only one a step runs)
  const installed = read(m.installed, installedOf, (d) => d.name).filter((d) => steps.some((s) => s.programs.includes(d.name)));
  return {
    id,
    name,
    version,
    description: text(m.description, 300) ?? "",
    licence: text(m.licence, 60) ?? "",
    homepage: text(m.homepage, 200) ?? "",
    ...(environment ? { environment } : {}),
    kinds,
    reads: readable,
    writes,
    roles,
    steps,
    systems,
    installed,
    guide,
    suggests,
    files,
  };
}

/** Text with each run of spaces and tabs one space: how marks, and what a file's start holds, are compared. */
export function folded(text: string): string {
  return text.replace(/[ \t]+/g, " ");
}

/** Where a file's start - folded, its line ends "\n" - first holds a mark; -1 where it does not. */
export function markAt(head: string, mark: Mark): number {
  const said = folded(mark.text.trim());
  const where = mark.anyCase ? head.toLowerCase() : head;
  const what = mark.anyCase ? said.toLowerCase() : said;
  if (mark.at !== "line-start") return where.indexOf(what);
  let at = 0;
  for (const line of where.split("\n")) {
    if (line.trimStart().startsWith(what)) return at;
    at += line.length + 1;
  }
  return -1;
}

/** Whether a file's start - folded, its line ends "\n" - holds a mark. */
export const holdsMark = (head: string, mark: Mark): boolean => markAt(head, mark) >= 0;
