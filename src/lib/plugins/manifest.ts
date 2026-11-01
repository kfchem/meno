/**
 * A plugin's manifest (docs/PLUGINS.md, *The manifest*): data in the
 * plugin's folder of its own, saying what it is; what makes its
 * environment, where it runs anything (its worker, worker.py, beside its
 * lock); every kind of file it knows (`kinds`) - those it reads (`reads`),
 * those it writes (`writes`), and the rest, texts it colours; the roles it
 * fills (`roles`) and the kinds of a workflow's step (`steps`), each with
 * its options; the systems it can be added on, the programs installed
 * separately its steps run, and the files it needs downloaded besides its
 * environment (`downloads`). Nothing else: no guide, and no word of another
 * plugin - which Meno would suggest for a file is worked out from what each
 * plugin says it reads (lib/io/kinds `offeredKinds`).
 *
 * A plugin stands alone: it knows of no other, and Meno of no program. Two
 * plugins that read the same kind each bring it, by the same id; Meno puts
 * them together (lib/io/kinds). A plugin that runs nothing - no environment
 * - brings only texts it colours.
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
import { rangeOf, type DependDecl, type InterfaceDecl, type UsedInterface, type UsedProgram } from "./depends";
import { acceptOptions, type Option } from "../options";
import { TONE_NAMES, type Tone } from "../text/tones";
import { isRole, ROLES, type RoleId } from "./roles";
import { isStepKind, LONE_ATOM_PASSES, MENO_ONLY, VALUE_KINDS, type StepKind, type ValueKind } from "./steps";

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
  /**
   * Which of the plugin's own programs writes it - one its steps or roles run, by the name they run it by: the kind
   * is that program's output, and the plugin its own reader, which reads it unless another is chosen (lib/calc/catalog
   * `readerFor`). Unsaid for a kind the plugin reads but whose program it does not run.
   */
  writtenBy?: string;
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

/**
 * How a program writes a frame's energy on an XYZ file's comment line: `pattern`, a regular expression with one capture group
 * holding the number (matched without regard to case); `unit` the number's, converted to hartrees. A frame's energy is read
 * only by the patterns of the plugins added: Meno knows no program's way of writing it.
 */
export const ENERGY_UNITS = ["hartree", "eV", "kcal/mol", "kJ/mol"] as const;
export type XyzEnergyDecl = { id: string; pattern: string; unit: (typeof ENERGY_UNITS)[number] };
/**
 * A line of its program's printout, giving an electronic energy, as a paper's supporting information quotes it
 * (`quotedEnergies`, docs/FILE-IO.md, *Coordinates in a text*): `pattern`, a regular expression (matched without regard to
 * case) with a named group `value` holding the number and, where the line names a method, one named `method`; `name`, what
 * the energy is called - "E", given "E(method)" where the method is named; `unit`, the number's, converted to hartrees.
 * Read only by the patterns of the plugins added: Meno knows no program's line.
 */
export type QuotedEnergyDecl = { id: string; pattern: string; name: string; unit: (typeof ENERGY_UNITS)[number] };
/** The columns of a table of atoms a program prints: its row's number, the atom's atomic number or its symbol, a number of the program's own (read as none), and where it stands. */
export const QUOTED_COLUMNS = ["centre", "atomic-number", "element", "type", "x", "y", "z"] as const;
export type QuotedColumn = (typeof QUOTED_COLUMNS)[number];
/**
 * A table of atoms its program prints, as a paper quotes it (`quotedTables`, docs/FILE-IO.md, *Coordinates in a text*): the
 * lines that head it (`headings`, each the start of its line, without regard to case), the lines of its columns' heads
 * (`heads`, the same), and its columns, in order. A row of it is read as an atom only where the plugin is added; where only a
 * plugin not added declares it, a table of such rows is said to be that plugin's to read, and none of it is read.
 */
export type QuotedTableDecl = { id: string; headings: string[]; heads: string[]; columns: QuotedColumn[] };
/**
 * An XYZ file a plugin's program writes whose frames are an optimisation's
 * steps, which of them converged not said in it (docs/FILE-IO.md): its id;
 * its file's name - `*` any run of characters - as the program's
 * documentation or its own output names it; and what each of its frames'
 * comment lines says, a pattern - so that the file is known renamed too.
 * One or both.
 */
export type XyzStepsDecl = { id: string; file?: string; comment?: string };

/**
 * A look a render plugin declares (docs/RENDER.md, docs/PLUGINS.md): its id, what the card calls it, a short description,
 * and what it is made of - a bundle of Meno's own parts (`parts`: what the molecules and the surfaces are made of, how it is
 * shaded and outlined; any left out are the plain ones), or `own`: made with materials and light of the plugin's own, the
 * molecules left as the scene's file has them. `seeThrough`: what is inside a ball shows, so the card offers where its sticks
 * stop. The options that adjust it are the role's, each `when` this look is chosen.
 */
export type LookParts = {
  molecules?: string;
  surfaces?: string;
  shading?: string;
  band?: number;
  outlines?: string;
  outline?: number;
  outline_colour?: string;
  sticks?: string;
};
export type LookDecl = { id: string; label: string; description?: string; parts?: LookParts; own?: true; seeThrough?: true };

/**
 * A motion a render plugin makes of a film (docs/RENDER.md, *Motions a renderer makes*): its id, what the card calls it, and a
 * short description. The plugin builds it from the scene and its molecules' atoms and bonds; Meno writes the scene still for it.
 * Its options - Once or Loop among them - are the role's, each `when` this motion is chosen.
 */
export type MotionDecl = { id: string; label: string; description?: string; shortest?: Shortest; fixed?: FixedChoice[] };

/**
 * A choice a motion is always made with, whatever was chosen - a renderer of light traced, say: the card shows it so, and says
 * why (`why`), rather than offering what the motion would not take. `id` is one of the role's options or Render's own.
 */
export type FixedChoice = { id: string; value: string; why: string };

/**
 * The shortest a film of a motion can be and still be read, in seconds (docs/RENDER.md, *How long a film can be*): the whole
 * film's (`film`), and its Loop's where that is longer (`loop`); and, for a motion that changes one molecule into the next, each
 * change's (`change`) - Meno counts the changes, one fewer than the molecules, or as many as a Loop that comes back to the first.
 */
export type Shortest = { film?: number; loop?: number; change?: number };

/**
 * What a preset plugin brings another plugin through an interface that one declares (docs/PLUGINS.md, *Presets*): looks,
 * studios and motions, each declared as a render role declares its own, with the file the plugin that runs them runs for it -
 * a path inside the preset plugin's folder - and the files those share (`files`); and its options, each shown only while one
 * of its looks, studios or motions is chosen, and `when` it says. Meno copies every file named here, unread, into the job of
 * the plugin it is for (`presets/<id>/`), and never runs one.
 */
export type PresetLook = LookDecl & { file: string };
export type PresetStudio = { id: string; label: string; description?: string; file: string };
export type PresetMotion = MotionDecl & { file: string };
export type PresetsDecl = {
  /** The interface it brings them through: one its `depends` uses, of the plugin that interface is that one's. */
  interface: string;
  /** That plugin, by its id: the one its `depends` uses the interface of. */
  for: string;
  looks: PresetLook[];
  studios: PresetStudio[];
  motions: PresetMotion[];
  files: string[];
  options: Option[];
};

/** A role a plugin fills (lib/plugins/roles), by the id Meno gives it; the programs it runs for it, by name, where it runs one as a job (Render: Blender); and its options where the role takes them. */
export type RoleDecl = {
  role: RoleId;
  programs: string[];
  options: Option[];
  /** Its conformer search takes how many to try, which Meno works out or the chemist sets (*Conformers sought*: lib/chem/conformersSought) and sends: the conformers role's alone. */
  tries?: true;
  /** The looks it makes, each declared in full, where the role has looks (Render: docs/RENDER.md); none declared, none said. */
  looks?: LookDecl[];
  /** The motions it makes of a film, each declared in full, where the role has them (Render); none declared, none said. */
  motions?: MotionDecl[];
  /**
   * Where the role takes one (Structures read from pictures): the confidence
   * its model reports, from 0 to 1, below which a part of its reading is
   * said to be unsure, and on what that was set (`basis`, in words); none
   * declared, nothing said unsure for its confidence.
   */
  unsure?: UnsureDecl;
};

/** A model's confidence below which what it reads is unsure, and on what that was set. */
export type UnsureDecl = { below: number; basis: string };

/**
 * A kind of step a plugin fills (docs/WORKFLOWS.md, *What changes in the
 * contract*): the kind, by the id Meno gives it; the programs it runs, by
 * their names, from its environment - none, where it does the step in its
 * worker; its options, in the general form (lib/options), which Meno draws
 * in the step and in Settings, *Calculations* - those of the role of the
 * same name, where it fills one and says none; and, where it takes less
 * than the kind does, what it takes (`takes`: CREST's conformer search,
 * molecules in 3D and conformer sets, not structures drawn); and the kinds
 * of file it takes besides, by their ids (`files`: Multiwfn's NCI, a
 * wavefunction - "molden", "gaussian-fchk", "wfn", "wfx"), each entry given
 * the file its molecule was read from where it is one of them - another
 * plugin's step's, or one opened - the two joined by the kind's id alone;
 * and, of a kind that takes nothing in (Generate), whether it makes its
 * molecules from seeds wired in (`seeds`: CReM's); and, of a kind a lone
 * atom passes through (steps `LONE_ATOM_PASSES`), whether its program
 * takes none (`noLoneAtom`).
 * A manifest may say several kinds in one, with the same programs and
 * options.
 */
/** `roleOptions`: its options are its role's, the step having said none of its own (Settings' choices for the role its defaults: workflow/doers `optionsFor`). */
export type StepDecl = { kind: StepKind; programs: string[]; options: Option[]; roleOptions?: true; takes?: ValueKind[]; files?: string[]; seeds?: true; noLoneAtom?: true };

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
 * `{parent}` (the folder above), with a path inside it; and the folders it
 * is usually installed in, on each system (`places`) - each from `/`,
 * `{home}` or `{programs}` (Windows' Program Files), a `*` in a folder's
 * name for any text, a version's, the newest found first; and how it says
 * its version, and the least Meno takes (`version`: run with `args`, options
 * alone, it prints a line beginning `after`, then the version) - the newest
 * copy new enough then taken; and the programs installed with it, in its
 * folder, that a job may run after it (`beside`: each by its name, and its
 * file on each system - ORCA's orca_2mkl); and how it runs in parallel
 * (`parallel`: "threads", unsaid, or "processes" - MPI, ORCA's `%pal` - each
 * process a physical core, told one thread). Meno's backend reads and checks
 * the same (src-tauri/src/jobs.rs `installed_named`, `installed_choice`).
 */
export type InstalledDecl = {
  name: string;
  label: string;
  files: Partial<Record<System, string>>;
  path: string[];
  env: Record<string, string[]>;
  places: Partial<Record<System, string[]>>;
  version?: VersionRule;
  beside?: Record<string, Partial<Record<System, string>>>;
  parallel?: "threads" | "processes";
};

/**
 * A file a plugin needs besides its environment (docs/PLUGINS.md, *The
 * manifest*, `downloads`) - a model's trained weights, say: what it is, in
 * words, and under what licence; where it is fetched from, over HTTPS; its
 * SHA-256 and size in bytes, which it is checked against before it is
 * kept; and its name in the plugin's `files` folder, which the worker is
 * given. Fetched as the plugin is set up, under the same leave - the user
 * told of it and its size first. Or a program the plugin runs, Meno's own
 * copy of it (`provides`: its name, as the plugin's steps and roles run
 * it - Blender): an archive for one system - and processor, where it says
 * one - unpacked (`unpack`), the program at `program` in it (`*` for the
 * one folder there is); fetched as the rest are (docs/PLUGINS.md, *A
 * program Meno fetches*). Or one data file compressed with gzip
 * (`unpack: "gz"` - a fragment database), unpacked by Meno into its folder,
 * how large it is then said (`unpackedBytes`). Where its makers ask to be
 * cited, how (`cite`), said as asking to set it up says the rest. A file
 * for another system, or processor, is not fetched. Meno's backend reads and checks the same
 * (src-tauri/src/plugfiles.rs).
 */
export type DownloadDecl = {
  file: string;
  name: string;
  licence: string;
  url: string;
  sha256: string;
  bytes: number;
  system?: System;
  arch?: Arch;
  unpack?: Unpack;
  program?: string;
  provides?: string;
  /** Its size once unpacked, in bytes: one compressed with gzip. */
  unpackedBytes?: number;
  /** How its makers ask that work using it cite them. */
  cite?: string;
};

/** The processors a program is built for, as the system names them. */
export type Arch = "aarch64" | "x86_64";
const ARCHES: readonly Arch[] = ["aarch64", "x86_64"];
/** How an archive is opened, by its ending. */
export type Unpack = "dmg" | "zip" | "tar.xz" | "gz";
const UNPACKS: readonly Unpack[] = ["dmg", "zip", "tar.xz", "gz"];

/** How a program installed separately says its version, and the least Meno takes. */
export type VersionRule = { args: string[]; after: string; least: string };


/** What makes a plugin's environment: uv, from PyPI (its requirements.lock), or pixi, where it needs conda-forge (its pixi.toml and pixi.lock). */
export type Maker = "uv" | "pixi";

/** The lock in a plugin's folder that its environment is made from. */
export const lockOf = (maker: Maker) => (maker === "pixi" ? "pixi.lock" : "requirements.lock");
/** A plugin's worker, in its folder. */
export const WORKER = "worker.py";

/** A program or library a plugin wraps, and the version its lock or pin fixes (a test checks it against them). */
export type UsesDecl = { name: string; version: string };

/** A plugin's manifest, as Meno reads it. */
export type Manifest = {
  id: string;
  name: string;
  /** Its own version, semver, bumped whenever its files change (docs/PLUGINS.md, *Versions*). What it uses is `uses`, never this. */
  version: string;
  /** The programs and libraries it wraps, each with the version its lock or pin fixes: said beside its own version. */
  uses: UsesDecl[];
  /** One line on what it is. */
  description: string;
  licence: string;
  homepage: string;
  /** What makes its environment; none, where it runs nothing. */
  environment?: Maker;
  /** About how much room its environment takes once set up, in bytes, as measured - said as asking to set it up says what it fetches; unsaid, where none was measured. */
  setUpBytes?: number;
  /** Every kind of file it knows. */
  kinds: KindDecl[];
  /** The kinds it reads, by id: its own (`kinds`), or Meno's. */
  reads: string[];
  /** The kinds it writes, of its own. */
  writes: WriteDecl[];
  /** How the XYZ files its program writes carry a frame's energy on a comment line, from that program's documentation (docs/FILE-IO.md). */
  xyzEnergies: XyzEnergyDecl[];
  /** The XYZ files its program writes whose frames are an optimisation's steps, none of them said to be converged: none of them an entry. */
  xyzSteps: XyzStepsDecl[];
  /** Its program's energy lines, as papers quote them: from that program's documentation and its printout. */
  quotedEnergies?: QuotedEnergyDecl[];
  /** Its program's tables of atoms, as papers quote them: from that program's documentation and its printout. */
  quotedTables?: QuotedTableDecl[];
  /** The roles it fills besides reading and writing files. */
  roles: RoleDecl[];
  /** The kinds of step it fills, each once. */
  steps: StepDecl[];
  /** The systems it can be added on - its programs built for those alone; none said, every one. */
  systems: System[];
  /** The programs installed separately that its steps run. */
  installed: InstalledDecl[];
  /** The files it needs downloaded besides its environment. */
  downloads: DownloadDecl[];
  /** The other plugins it uses, where it declares any: each by id, with the versions it works with and what of it is used (./depends `DependDecl`). */
  depends?: DependDecl[];
  /** The interfaces it declares, for other plugins to use it through, each by id with its version (docs/PLUGINS.md, *Interfaces*). */
  interfaces?: InterfaceDecl[];
  /** What it brings another plugin through that one's interface, where it brings any (`PresetsDecl`). */
  presets?: PresetsDecl;
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
  const writtenBy = typeof k?.writtenBy === "string" && PROGRAM.test(k.writtenBy) ? k.writtenBy : null;
  // (what a line begins with tells a text among those of its files' names, and claims no file: as short as a letter)
  const lines = list(k?.lines)
    .map((l) => text(l, MARK_MOST))
    .filter((l): l is string => l != null);
  return {
    id,
    name,
    ...(program ? { program } : {}),
    ...(writtenBy ? { writtenBy } : {}),
    extensions: extensionsOf(k?.extensions),
    marks: marksOf(k?.marks),
    lines,
    ...(k?.probe === true ? { probe: true as const } : {}),
    ...grammarOf(k?.grammar),
  };
}

/** A program's name, as a job is given it: a name, not a path. */
/**
 * The XYZ files a plugin says are an optimisation's steps: an id, and a
 * file's name of letters, digits, `.`, `_`, `-` and `*`, or a pattern of
 * its comment lines that compiles, or both - what is not that is left out.
 */
function acceptXyzSteps(v: unknown): XyzStepsDecl[] {
  const out: XyzStepsDecl[] = [];
  for (const raw of list(v)) {
    const r = raw as Record<string, unknown> | null;
    if (typeof r?.id !== "string" || !/^[a-z][a-z0-9-]{0,39}$/.test(r.id)) continue;
    const file = typeof r.file === "string" && /^[A-Za-z0-9._*-]{1,80}$/.test(r.file) && /[A-Za-z0-9]/.test(r.file) ? r.file : undefined;
    let comment = typeof r.comment === "string" && r.comment.length <= 200 ? r.comment : undefined;
    try {
      if (comment) new RegExp(comment);
    } catch {
      comment = undefined;
    }
    if (!file && !comment) continue;
    out.push({ id: r.id, ...(file ? { file } : {}), ...(comment ? { comment } : {}) });
    if (out.length >= 8) break;
  }
  return out;
}

/**
 * Whether an XYZ file of more than one frame is the one a plugin's
 * `xyzSteps` names: by its name - `*` any run of characters, the rest as it
 * is, any case - or by its frames' comment lines, each one as the pattern
 * says.
 */
export function xyzStepsFile(name: string, comments: readonly string[], decl: XyzStepsDecl): boolean {
  if (decl.file && new RegExp(`^${decl.file.split("*").map((p) => p.replace(/\./g, "\\.")).join(".*")}$`, "i").test(name)) return true;
  if (!decl.comment || comments.length < 2) return false;
  const pattern = new RegExp(decl.comment);
  return comments.every((c) => pattern.test(c));
}
/** The ways a plugin says its program writes an XYZ frame's energy: an id, and a pattern that compiles and has one capture group - what is not that is left out. */
function acceptXyzEnergies(v: unknown): XyzEnergyDecl[] {
  const out: XyzEnergyDecl[] = [];
  for (const raw of list(v)) {
    const r = raw as Record<string, unknown> | null;
    if (typeof r?.id !== "string" || !/^[a-z][a-z0-9-]{0,39}$/.test(r.id) || typeof r.pattern !== "string" || r.pattern.length > 200) continue;
    const unit = (ENERGY_UNITS as readonly string[]).includes(r.unit as string) ? (r.unit as XyzEnergyDecl["unit"]) : "hartree";
    try {
      // (one capture group: its alternative with the empty string gives the match and one group)
      if (new RegExp(`${r.pattern}|`, "i").exec("")!.length !== 2) continue;
    } catch {
      continue;
    }
    out.push({ id: r.id, pattern: r.pattern, unit });
    if (out.length >= 8) break;
  }
  return out;
}

/** A plugin's energy lines, as papers quote its program's, each checked: an id, a pattern that compiles with a named group `value`, a name; what is not understood left out. */
function acceptQuotedEnergies(v: unknown): QuotedEnergyDecl[] {
  const out: QuotedEnergyDecl[] = [];
  for (const raw of list(v)) {
    const r = raw as Record<string, unknown> | null;
    if (typeof r?.id !== "string" || !/^[a-z][a-z0-9-]{0,39}$/.test(r.id) || typeof r.pattern !== "string" || r.pattern.length > 200) continue;
    const name = typeof r.name === "string" ? r.name.trim().slice(0, 40) : "";
    if (!name) continue;
    const unit = (ENERGY_UNITS as readonly string[]).includes(r.unit as string) ? (r.unit as QuotedEnergyDecl["unit"]) : "hartree";
    try {
      if (!/\(\?<value>/.test(r.pattern)) continue;
      new RegExp(r.pattern, "i");
    } catch {
      continue;
    }
    out.push({ id: r.id, pattern: r.pattern, name, unit });
    if (out.length >= 8) break;
  }
  return out;
}

/** A plugin's tables of atoms, as papers quote its program's, each checked: an id, at least one heading, columns of the vocabulary - each once, x, y and z among them, and the atom's atomic number or its symbol; what is not understood left out. */
function acceptQuotedTables(v: unknown): QuotedTableDecl[] {
  const out: QuotedTableDecl[] = [];
  const lines = (x: unknown) => list(x).flatMap((l) => (typeof l === "string" && l.trim() && l.length <= 80 ? [l.trim()] : [])).slice(0, 8);
  for (const raw of list(v)) {
    const r = raw as Record<string, unknown> | null;
    if (typeof r?.id !== "string" || !/^[a-z][a-z0-9-]{0,39}$/.test(r.id)) continue;
    const headings = lines(r.headings);
    const columns = list(r.columns).filter((c): c is QuotedColumn => typeof c === "string" && (QUOTED_COLUMNS as readonly string[]).includes(c));
    if (!headings.length || columns.length !== list(r.columns).length || new Set(columns).size !== columns.length) continue;
    if (!["x", "y", "z"].every((c) => columns.includes(c as QuotedColumn)) || columns.includes("atomic-number") === columns.includes("element")) continue;
    out.push({ id: r.id, headings, heads: lines(r.heads), columns });
    if (out.length >= 4) break;
  }
  return out;
}

const LOOK_ID = /^[a-z][a-z0-9-]{0,39}$/;
const LOOK_MOLECULES = ["meno", "glossy", "metal", "glass", "matte", "clay", "white"];
const LOOK_SURFACES = ["meno", "glass", "glossy", "matte"];
const LOOK_SHADING = ["lit", "toon"];
const LOOK_OUTLINES = ["none", "thin", "outer", "mixed"];
const LOOK_COLOURS = ["black", "white", "grey"];
const LOOK_STICKS = ["shown", "stopped"];
const oneOf = (v: unknown, among: readonly string[]) => (typeof v === "string" && among.includes(v) ? v : undefined);
const inRange = (v: unknown, least: number, most: number) => (typeof v === "number" && Number.isFinite(v) && v >= least && v <= most ? v : undefined);

/** The looks a render role declares, each checked: an id, a label, and parts from the vocabulary Meno's render knows - what is not understood is left out. */
function acceptLooks(v: unknown): LookDecl[] {
  const seen = new Set<string>();
  const out: LookDecl[] = [];
  for (const raw of list(v)) {
    const r = raw as Record<string, unknown> | null;
    if (typeof r?.id !== "string" || !LOOK_ID.test(r.id) || seen.has(r.id) || r.id === "meno") continue;
    const label = typeof r.label === "string" ? r.label.trim().slice(0, 80) : "";
    if (!label) continue;
    seen.add(r.id);
    const description = typeof r.description === "string" && r.description.trim() ? r.description.trim().slice(0, 200) : undefined;
    const p = (r.parts ?? {}) as Record<string, unknown>;
    const parts: LookParts = {};
    const put = <K extends keyof LookParts>(k: K, x: LookParts[K] | undefined) => {
      if (x !== undefined) parts[k] = x;
    };
    put("molecules", oneOf(p.molecules, LOOK_MOLECULES));
    put("surfaces", oneOf(p.surfaces, LOOK_SURFACES));
    put("shading", oneOf(p.shading, LOOK_SHADING));
    put("band", inRange(p.band, 0.05, 1));
    put("outlines", oneOf(p.outlines, LOOK_OUTLINES));
    put("outline", inRange(p.outline, 0.5, 20));
    put("outline_colour", oneOf(p.outline_colour, LOOK_COLOURS));
    put("sticks", oneOf(p.sticks, LOOK_STICKS));
    out.push({
      id: r.id,
      label,
      ...(description ? { description } : {}),
      ...(Object.keys(parts).length ? { parts } : {}),
      ...(r.own === true ? { own: true as const } : {}),
      ...(r.seeThrough === true ? { seeThrough: true as const } : {}),
    });
    if (out.length >= 60) break;
  }
  return out;
}

/** The ids Meno's own film motions have (render/renderScene): a plugin's motion takes none of them. */
export const MENO_MOTIONS = ["turn", "frames", "vibration"] as const;

/** A motion's shortest lengths, each a number of seconds from 0 to 600; what is not that is left out, and none of them, none. */
function shortestOf(v: unknown): Shortest | undefined {
  if (!v || typeof v !== "object" || Array.isArray(v)) return undefined;
  const r = v as Record<string, unknown>;
  const out: Shortest = {};
  for (const k of ["film", "loop", "change"] as const) {
    const x = r[k];
    if (typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= 600) out[k] = x;
  }
  return Object.keys(out).length ? out : undefined;
}

/** The choices a motion is always made with, each an option's id, its value and why, read as data; what is not that is left out. */
function fixedOf(v: unknown): FixedChoice[] {
  const out: FixedChoice[] = [];
  for (const raw of list(v).slice(0, 10)) {
    const r = raw as Record<string, unknown> | null;
    const why = typeof r?.why === "string" ? r.why.trim().slice(0, 120) : "";
    if (typeof r?.id !== "string" || !/^[a-z][a-z0-9_-]{0,39}$/.test(r.id) || typeof r.value !== "string" || !r.value || !why) continue;
    if (!out.some((f) => f.id === r.id)) out.push({ id: r.id, value: r.value.slice(0, 80), why });
  }
  return out;
}

/** A role's `unsure` as declared: a confidence between 0 and 1, and its basis said; otherwise none. */
function unsureOf(v: unknown): UnsureDecl | undefined {
  const u = v as { below?: unknown; basis?: unknown } | null | undefined;
  const below = u?.below;
  const basis = typeof u?.basis === "string" ? u.basis.trim() : "";
  return typeof below === "number" && Number.isFinite(below) && below > 0 && below < 1 && basis && basis.length <= 300 ? { below, basis } : undefined;
}

/** The motions a render role declares, each checked: an id (none of Meno's own), a label, a description - what is not understood is left out. */
function acceptMotions(v: unknown): MotionDecl[] {
  const seen = new Set<string>();
  const out: MotionDecl[] = [];
  for (const raw of list(v)) {
    const r = raw as Record<string, unknown> | null;
    if (typeof r?.id !== "string" || !LOOK_ID.test(r.id) || seen.has(r.id) || (MENO_MOTIONS as readonly string[]).includes(r.id)) continue;
    const label = typeof r.label === "string" ? r.label.trim().slice(0, 80) : "";
    if (!label) continue;
    seen.add(r.id);
    const description = typeof r.description === "string" && r.description.trim() ? r.description.trim().slice(0, 200) : undefined;
    const shortest = shortestOf(r.shortest);
    const fixed = fixedOf(r.fixed);
    out.push({ id: r.id, label, ...(description ? { description } : {}), ...(shortest ? { shortest } : {}), ...(fixed.length ? { fixed } : {}) });
    if (out.length >= 40) break;
  }
  return out;
}

/** What a plugin says it uses: each a name and the version its lock fixes; what is not that is left out. */
function acceptUses(v: unknown): UsesDecl[] {
  const out: UsesDecl[] = [];
  for (const raw of list(v)) {
    const r = raw as Record<string, unknown> | null;
    const name = typeof r?.name === "string" ? r.name.trim().slice(0, 40) : "";
    const version = typeof r?.version === "string" ? r.version.trim().slice(0, 40) : "";
    if (name && version && !out.some((u) => u.name === name)) out.push({ name, version });
    if (out.length >= 6) break;
  }
  return out;
}

const PROGRAM = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,39}$/;

/** The kinds of step a manifest's step says - each one Meno defines - with what they share. */
function stepsOf(v: unknown, roles: readonly RoleDecl[]): StepDecl[] {
  const s = v as Record<string, unknown> | null;
  const kinds = list(s?.kinds).filter((k): k is StepKind => typeof k === "string" && isStepKind(k) && !MENO_ONLY.includes(k));
  const programs = [...new Set(list(s?.programs).filter((p): p is string => typeof p === "string" && PROGRAM.test(p)))];
  // (of what flows: a kind of set, a table, a number - nothing a manifest makes up)
  const takes = Array.isArray(s?.takes) ? VALUE_KINDS.filter((t) => (s.takes as unknown[]).includes(t)) : [];
  const files = [...new Set(list(s?.files).filter((f): f is string => typeof f === "string" && ID.test(f)))];
  const options = acceptOptions(s?.options);
  // (none said, and it fills the role of the kind's name: the role's - the same work, asked as a step)
  const roleOf = (kind: StepKind) => (s?.options === undefined ? roles.find((r) => r.role === kind && r.options.length) : undefined);
  const optionsFor = (kind: StepKind) => (s?.options !== undefined ? options : (roleOf(kind)?.options ?? []));
  return kinds.map((kind) => ({
    kind,
    programs,
    options: optionsFor(kind),
    ...(roleOf(kind) ? { roleOptions: true as const } : {}),
    ...(takes.length ? { takes: [...takes] } : {}),
    ...(files.length ? { files: [...files] } : {}),
    ...(s?.seeds === true ? { seeds: true as const } : {}),
    // (said only of a kind a lone atom passes through: of any other, what its program cannot take is its to refuse)
    ...(s?.noLoneAtom === true && LONE_ATOM_PASSES.includes(kind) ? { noLoneAtom: true as const } : {}),
  }));
}

/** A program's file, as a system has it: a name, not a path. */
const FILE = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,59}$/;
/** Programs a job never runs, whatever names them: shells, and interpreters that take code in their arguments. The backend's list (src-tauri/src/jobs.rs `NEVER`). */
const NEVER_RUN = ["sh", "bash", "zsh", "dash", "ksh", "csh", "tcsh", "fish", "env", "cmd", "powershell", "pwsh", "perl", "ruby", "node", "osascript", "wscript", "cscript"];
/** Whether a program installed separately may be run by its file - a name: by that name without its last ending, in any case, never a shell, such an interpreter, or Python, which runs only a plugin's script. The backend's rule (`program_file_ok`). */
function fileRuns(file: string): boolean {
  const dot = file.lastIndexOf(".");
  const stem = (dot > 0 ? file.slice(0, dot) : file).toLowerCase();
  return !NEVER_RUN.includes(stem) && !stem.startsWith("python");
}
/** Whether `f` is a program's file a job may run: a name, not a path, and never a shell or Python. */
const programFileOk = (f: unknown): f is string => typeof f === "string" && FILE.test(f) && fileRuns(f);
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

/**
 * Another plugin a plugin uses (docs/PLUGINS.md, *Depends*): that plugin, by
 * its id; the versions of it it works with (`>=0.1.4 <0.2.0`, ./depends
 * `rangeOf`); whether only some of its work needs it (`optional`: not set
 * up with it, and missing, only a job that needs it refused); and what of
 * it is used - a program it declares, by its name,
 * with the variable a job is told where it is in. A job uses one only where
 * its plugin's worker says so of that job; Meno finds it as the other
 * plugin's own jobs would, puts it in the job's folder, and names it there -
 * so that a path with a space in it is never given (src-tauri jobs.rs
 * `need_value`). Core names no plugin and no program: the manifest does.
 */
function dependOf(v: unknown, self: string): DependDecl | null {
  const d = v as Record<string, unknown> | null;
  if (!isId(d?.plugin) || d.plugin === self) return null;
  const range = rangeOf(d.versions);
  if (!range) return null;
  if (d.programs !== undefined && !Array.isArray(d.programs)) return null;
  const programs = list(d.programs).map((v): UsedProgram | null => {
    const p = v as Record<string, unknown> | null;
    if (typeof p?.program !== "string" || !FILE.test(p.program) || !fileRuns(p.program)) return null;
    if (typeof p.env !== "string" || !ENV_NAME.test(p.env) || ENV_NEVER.some((x) => x.toLowerCase() === (p.env as string).toLowerCase())) return null;
    return { program: p.program, env: p.env };
  });
  if (programs.some((p) => p == null) || new Set(programs.map((p) => p!.env)).size !== programs.length) return null;
  if (d.interfaces !== undefined && (!Array.isArray(d.interfaces) || d.interfaces.length > 8)) return null;
  const interfaces = list(d.interfaces).map((v): UsedInterface | null => {
    const i = v as Record<string, unknown> | null;
    const r = rangeOf(i?.versions);
    return isId(i?.id) && r ? { id: i.id, versions: (i.versions as string).trim(), range: r } : null;
  });
  if (interfaces.some((i) => i == null) || new Set(interfaces.map((i) => i!.id)).size !== interfaces.length) return null;
  if (d.optional !== undefined && typeof d.optional !== "boolean") return null;
  return {
    plugin: d.plugin,
    versions: (d.versions as string).trim(),
    range,
    programs: programs as UsedProgram[],
    ...(interfaces.length ? { interfaces: interfaces as UsedInterface[] } : {}),
    ...(d.optional ? { optional: true as const } : {}),
  };
}

const SEMVER = /^\d{1,6}\.\d{1,6}\.\d{1,6}$/;

/** The interfaces a plugin declares, each an id and a version of three numbers, each once; null where any is not so. */
function interfacesOf(v: unknown): InterfaceDecl[] | null {
  if (v === undefined) return [];
  if (!Array.isArray(v) || v.length > 8) return null;
  const out: InterfaceDecl[] = [];
  for (const raw of v) {
    const i = raw as Record<string, unknown> | null;
    if (!isId(i?.id) || typeof i.version !== "string" || !SEMVER.test(i.version) || out.some((o) => o.id === i.id)) return null;
    out.push({ id: i.id, version: i.version });
  }
  return out;
}

/** A file a preset names: a file's name in its plugin's folder - plain, no folder, as Meno carries only the files of a plugin's folder itself - never the worker or manifest Meno reads. The backend's rule (`preset_file_ok`). */
const PRESET_FILE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
function presetFileOk(f: unknown): f is string {
  // (in any case: on a system whose files' names take none, `Manifest.json` is the manifest)
  return typeof f === "string" && PRESET_FILE.test(f) && f.toLowerCase() !== "manifest.json" && f.toLowerCase() !== WORKER;
}

/** The most files a preset plugin may hand over, all told. */
const PRESET_FILES_MOST = 64;
/** What a studio may not be called: the card's plain scene, "As asked". */
export const PLAIN_STUDIO = "asked";

/**
 * What a plugin brings another through that one's interface (`PresetsDecl`), checked: through an interface one of its
 * `depends` uses; its looks, studios and motions each as a render role's are, each with a file, and its own files - at most
 * 64 all told, each a path inside its folder. None, where it brings none; null, where what it says is not as it must be.
 */
function presetsOf(v: unknown, depends: readonly DependDecl[]): PresetsDecl | null | undefined {
  if (v === undefined) return undefined;
  const r = v as Record<string, unknown> | null;
  if (!r || typeof r !== "object" || Array.isArray(r) || !isId(r.interface)) return null;
  const through = depends.filter((d) => d.interfaces?.some((i) => i.id === r.interface));
  if (through.length !== 1) return null;
  // (each item as a render role declares its own, and its file: one without a file, or a file not as it must be, makes none)
  const withFile = <T extends { id: string }>(raw: unknown, accepted: T[]): (T & { file: string })[] | null => {
    const given = list(raw) as (Record<string, unknown> | null)[];
    if (raw !== undefined && !Array.isArray(raw)) return null;
    if (accepted.length !== given.length) return null;
    const out = accepted.map((a) => ({ ...a, file: given.find((g) => g?.id === a.id)?.file }));
    return out.every((o) => presetFileOk(o.file)) ? (out as (T & { file: string })[]) : null;
  };
  const looks = withFile(r.looks, acceptLooks(r.looks));
  const motions = withFile(r.motions, acceptMotions(r.motions));
  const studios = withFile(
    r.studios,
    list(r.studios).flatMap((raw): { id: string; label: string; description?: string }[] => {
      const x = raw as Record<string, unknown> | null;
      const label = typeof x?.label === "string" ? x.label.trim().slice(0, 80) : "";
      if (typeof x?.id !== "string" || !LOOK_ID.test(x.id) || x.id === PLAIN_STUDIO || !label) return [];
      const description = typeof x.description === "string" && x.description.trim() ? x.description.trim().slice(0, 200) : undefined;
      return [{ id: x.id, label, ...(description ? { description } : {}) }];
    }),
  );
  if (!looks || !motions || !studios || new Set(studios.map((x) => x.id)).size !== studios.length) return null;
  if (r.files !== undefined && !Array.isArray(r.files)) return null;
  const files = list(r.files);
  if (!files.every(presetFileOk) || new Set(files).size !== files.length) return null;
  const all = new Set([...looks, ...studios, ...motions].map((x) => x.file).concat(files as string[]));
  if (all.size > PRESET_FILES_MOST || !(looks.length + studios.length + motions.length)) return null;
  return { interface: r.interface, for: through[0].plugin, looks, studios, motions, files: files as string[], options: acceptOptions(r.options) };
}

/** Places, as a manifest gives them: one, or several; null where any is not one. */
function placesOf(v: unknown): string[] | null {
  const given = typeof v === "string" ? [v] : Array.isArray(v) ? v : null;
  return given && given.every(placeOk) ? (given as string[]) : null;
}

/** Whether `t` is a usual place for a program: from `/`, `{home}` or `{programs}`, and after it folders' names - never `.` or `..`, a `*` at most once in each. The backend's rule (`usual_place_ok`). */
export function usualPlaceOk(t: unknown): t is string {
  if (typeof t !== "string" || t.length > 300) return false;
  const token = ["{home}", "{programs}"].find((b) => t.startsWith(b));
  const rest = token ? t.slice(token.length) : t;
  if (token && rest === "") return true;
  if (!rest.startsWith("/")) return false;
  return rest
    .slice(1)
    .split("/")
    .every((part) => part !== "" && part !== "." && part !== ".." && (part.match(/\*/g) ?? []).length <= 1 && !/[\\:{}]/.test(part));
}

/** Whether `v` is a version as a rule says one: digits, dots between them. */
const versionOk = (v: unknown): v is string => typeof v === "string" && v.length <= 20 && /^\d{1,6}(\.\d{1,6})*$/.test(v);

/** A version rule as a manifest gives it - options alone, never a file or a path; text to find; a version - or null where it is not one. */
function versionRuleOf(v: unknown): VersionRule | null {
  const r = v as Record<string, unknown> | null;
  const args = Array.isArray(r?.args) ? r.args : [];
  const argsOk = args.length > 0 && args.length <= 4 && args.every((a) => typeof a === "string" && /^-[A-Za-z0-9-]{0,39}$/.test(a));
  const after = typeof r?.after === "string" && r.after && r.after.length <= 40 && !/[\n\r]/.test(r.after) ? r.after : null;
  return argsOk && after && versionOk(r?.least) ? { args: [...(args as string[])], after, least: r.least } : null;
}

function installedOf(v: unknown): InstalledDecl | null {
  const d = v as Record<string, unknown> | null;
  const name = typeof d?.name === "string" && PROGRAM.test(d.name) ? d.name : null;
  const label = text(d?.label, 60);
  const given = (d?.files ?? {}) as Record<string, unknown>;
  const files: Partial<Record<System, string>> = {};
  for (const s of SYSTEMS) if (programFileOk(given[s])) files[s] = given[s];
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
  const placesGiven = (d?.places ?? {}) as Record<string, unknown>;
  const places: Partial<Record<System, string[]>> = {};
  let placesOk = typeof placesGiven === "object" && !Array.isArray(placesGiven);
  for (const sys of SYSTEMS) {
    const given = placesGiven[sys];
    if (given === undefined) continue;
    if (Array.isArray(given) && given.every(usualPlaceOk)) places[sys] = [...(given as string[])];
    else placesOk = false;
  }
  const version = d?.version === undefined ? undefined : versionRuleOf(d.version);
  const beside = d?.beside === undefined ? undefined : besideOf(d.beside);
  const parallel = d?.parallel === undefined ? undefined : d.parallel === "threads" || d.parallel === "processes" ? d.parallel : null;
  // (one it cannot be run as it says - a place outside its installation, a variable it may not set, a usual place that is not one, a version it cannot be asked for, a program beside it that is not one, a way of running in parallel Meno does not know - is none)
  return name && label && Object.keys(files).length && path && envOk && placesOk && version !== null && beside !== null && parallel !== null
    ? { name, label, files, path, env, places, ...(version ? { version } : {}), ...(beside ? { beside } : {}), ...(parallel ? { parallel } : {}) }
    : null;
}

/** The programs beside one installed separately, as a manifest gives them: a few, each by a program's name, its file's name on each system; null where they are not. */
function besideOf(v: unknown): Record<string, Partial<Record<System, string>>> | null {
  if (!v || typeof v !== "object" || Array.isArray(v) || Object.keys(v).length > 4) return null;
  const out: Record<string, Partial<Record<System, string>>> = {};
  for (const [k, given] of Object.entries(v as Record<string, unknown>)) {
    if (!PROGRAM.test(k) || !given || typeof given !== "object" || Array.isArray(given)) return null;
    const files: Partial<Record<System, string>> = {};
    for (const [sys, f] of Object.entries(given as Record<string, unknown>)) {
      if (!SYSTEMS.includes(sys as System) || !programFileOk(f)) return null;
      files[sys as System] = f;
    }
    out[k] = files;
  }
  return out;
}

/** A kept file's name: a name, not a path. The backend's rule (`file_ok`). */
const DOWNLOAD_FILE = /^[a-z0-9][a-z0-9._-]{0,63}$/;
/** The most a file may be: a model's weights, a few gigabytes at most. */
const DOWNLOAD_MOST = 20e9;

/** Whether a URL is one a file may be fetched from: HTTPS, with a host, and nothing in it that is not a URL's. The backend's rule (`url_ok`). */
function downloadUrlOk(v: unknown): v is string {
  if (typeof v !== "string" || v.length > 500 || !v.startsWith("https://") || !/^[\x21-\x7e]+$/.test(v)) return false;
  const host = v.slice(8).split(/[/?#]/)[0];
  return host !== "" && !host.includes("@");
}

function downloadOf(v: unknown): DownloadDecl | null {
  const d = v as Record<string, unknown> | null;
  const file = typeof d?.file === "string" && DOWNLOAD_FILE.test(d.file) && !d.file.endsWith(".part") ? d.file : null;
  const name = text(d?.name, 80);
  const licence = text(d?.licence, 60);
  const sha256 = typeof d?.sha256 === "string" && /^[0-9a-f]{64}$/.test(d.sha256) ? d.sha256 : null;
  const bytes = typeof d?.bytes === "number" && Number.isInteger(d.bytes) && d.bytes > 0 && d.bytes <= DOWNLOAD_MOST ? d.bytes : null;
  if (!file || !name || !licence || !downloadUrlOk(d?.url) || !sha256 || !bytes) return null;
  const decl: DownloadDecl = { file, name, licence, url: d!.url as string, sha256, bytes };
  // (a program: an archive for one system, the program in it said - as the backend takes it)
  const given = (k: string) => (d![k] === undefined ? undefined : typeof d![k] === "string" ? (d![k] as string) : null);
  const said = ["system", "arch", "unpack", "program", "provides"].map(given);
  if (said.some((v) => v === null)) return null;
  const [system, arch, unpack, program, provides] = said as (string | undefined)[];
  if (system !== undefined && !SYSTEMS.includes(system as System)) return null;
  if (arch !== undefined && !ARCHES.includes(arch as Arch)) return null;
  if (unpack !== undefined && (!UNPACKS.includes(unpack as Unpack) || !file.endsWith(`.${unpack}`) || file === `.${unpack}`)) return null;
  if (program !== undefined && (!unpack || unpack === "gz" || !programPathOk(program) || (unpack === "dmg" && program.startsWith("*")))) return null;
  if (provides !== undefined && (!PROGRAM.test(provides) || !program || !system)) return null;
  // (data compressed with gzip: how large it is unpacked, said - and only of such a file)
  const unpackedBytes = d!.unpackedBytes;
  if (unpackedBytes !== undefined && (unpack !== "gz" || typeof unpackedBytes !== "number" || !Number.isInteger(unpackedBytes) || unpackedBytes <= 0 || unpackedBytes > DOWNLOAD_MOST * 10))
    return null;
  if (unpack === "gz" && unpackedBytes === undefined) return null;
  const cite = d!.cite === undefined ? undefined : text(d!.cite, 200);
  if (cite === null) return null;
  return {
    ...decl,
    ...(system ? { system: system as System } : {}),
    ...(arch ? { arch: arch as Arch } : {}),
    ...(unpack ? { unpack: unpack as Unpack } : {}),
    ...(program ? { program } : {}),
    ...(provides ? { provides } : {}),
    ...(unpackedBytes !== undefined ? { unpackedBytes: unpackedBytes as number } : {}),
    ...(cite ? { cite } : {}),
  };
}

/** Whether `p` is a path inside an unpacked archive: names, or `*` for the one folder there is, never above it. */
function programPathOk(p: string): boolean {
  const parts = p.split("/");
  return p.length <= 200 && parts.length >= 1 && parts.length <= 8 && parts.every((x) => x === "*" || (!!x && x !== "." && x !== ".." && !/[\\:*]/.test(x) && /^[\x20-\x7e]+$/.test(x)));
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
          const programs = [...new Set(list(r.programs).filter((p): p is string => typeof p === "string" && PROGRAM.test(p)))];
          // (options only for a role that takes them)
          const looks = acceptLooks(r.looks);
          const motions = acceptMotions(r.motions);
          const unsure = "unsure" in ROLES[r.role] ? unsureOf(r.unsure) : undefined;
          return {
            role: r.role,
            programs,
            options: "options" in ROLES[r.role] ? acceptOptions(r.options) : [],
            ...(r.role === "conformers" && r.tries === true ? { tries: true as const } : {}),
            ...(looks.length ? { looks } : {}),
            ...(motions.length ? { motions } : {}),
            ...(unsure ? { unsure } : {}),
          };
        },
        (r) => r.role,
      )
    : [];
  // (each kind of step once)
  const steps = environment ? list(m.steps).flatMap((v) => stepsOf(v, roles)).filter((d, i, all) => all.findIndex((e) => e.kind === d.kind) === i) : [];
  // (a kind it reads is told: by its marks, or by asking it - and then by its files' names first)
  const told = (k: KindDecl) => k.marks.length > 0 || (!!k.probe && k.extensions.length > 0);
  const readable = reads.filter((r) => !own(r) || told(own(r)!));
  // (a text it only colours: by its files' names, with its grammar)
  const colours = kinds.some((k) => !readable.includes(k.id) && !writes.some((w) => w.id === k.id) && k.extensions.length && k.grammar);
  // (the other plugins it uses: each as it must be, each once, or the plugin is none - the backend reads the same)
  if (m.depends !== undefined && !Array.isArray(m.depends)) return null;
  const depends = list(m.depends).map((v) => dependOf(v, id));
  if (depends.some((d) => d == null) || new Set(depends.map((d) => d!.plugin)).size !== depends.length) return null;
  // (each variable once, whichever plugin's program it names)
  const envs = depends.flatMap((d) => d!.programs.map((p) => p.env));
  if (new Set(envs).size !== envs.length) return null;
  // (the interfaces it declares, and what it brings through another's: as they must be, or the plugin is none)
  const interfaces = interfacesOf(m.interfaces);
  const presets = presetsOf(m.presets, depends as DependDecl[]);
  if (!interfaces || presets === null) return null;
  // (a plugin that does nothing is none)
  if (!readable.length && !writes.length && !roles.length && !steps.length && !colours && !presets) return null;
  const systems = SYSTEMS.filter((s) => list(m.systems).includes(s));
  // (each program installed separately once, and only one a step or a role runs)
  const installed = read(m.installed, installedOf, (d) => d.name).filter((d) => [...steps, ...roles].some((s) => s.programs.includes(d.name)));
  // (files to download, where it runs something to use them: all as they must be, or the plugin is none - the backend refuses the list whole)
  if (environment && m.downloads !== undefined && !Array.isArray(m.downloads)) return null;
  const downloads = environment ? list(m.downloads).map(downloadOf) : [];
  if (downloads.some((d) => d == null) || new Set(downloads.map((d) => d!.file)).size !== downloads.length) return null;
  return {
    id,
    name,
    version,
    uses: acceptUses(m.uses),
    description: text(m.description, 300) ?? "",
    licence: text(m.licence, 60) ?? "",
    homepage: text(m.homepage, 200) ?? "",
    ...(environment ? { environment } : {}),
    ...(Number.isInteger(m.setUpBytes) && (m.setUpBytes as number) > 0 && (m.setUpBytes as number) <= DOWNLOAD_MOST ? { setUpBytes: m.setUpBytes as number } : {}),
    // (written by one of its own programs - one its steps or roles run - or by none it says)
    kinds: kinds.map(({ writtenBy, ...k }) => (writtenBy && [...steps, ...roles].some((s) => s.programs.includes(writtenBy)) ? { ...k, writtenBy } : k)),
    reads: readable,
    writes,
    xyzEnergies: acceptXyzEnergies(m.xyzEnergies),
    xyzSteps: acceptXyzSteps(m.xyzSteps),
    ...(() => {
      const energies = acceptQuotedEnergies(m.quotedEnergies);
      const tables = acceptQuotedTables(m.quotedTables);
      return { ...(energies.length ? { quotedEnergies: energies } : {}), ...(tables.length ? { quotedTables: tables } : {}) };
    })(),
    roles,
    steps,
    systems,
    installed,
    downloads: downloads as DownloadDecl[],
    ...(depends.length ? { depends: depends as DependDecl[] } : {}),
    ...(interfaces.length ? { interfaces } : {}),
    ...(presets ? { presets } : {}),
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
