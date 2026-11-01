import { isTauri } from "@tauri-apps/api/core";
import {
  BaseDirectory,
  exists,
  readTextFile,
} from "@tauri-apps/plugin-fs";
import { writeAppFile } from "../io/writeDocument";
import { MOST_WORKSPACE_FILE } from "../doc/menoFile";
import { create } from "zustand";
import { DEFAULT_STYLE_CHOICE, type OwnStyle2D, type StyleChoice } from "../chem/style";
import { acceptOwnStyles2d, acceptStyleChoice } from "../chem/styleFields";
import { acceptStyle3dChoice, DEFAULT_STYLE_3D_CHOICE, type Style3DChoice } from "../chem/style3d";
import { acceptColours, DEFAULT_COLOURS, type ColourSettings } from "../chem/palette";
import { MOST_CONFORMERS } from "../chem/conformersSought";
import { setCustomAbbreviations, structureProblem, type CustomAbbreviation } from "../chem/abbreviations";
import type { OptionValues } from "../options";
import { isRole } from "../plugins/roles";

/**
 * The application's own settings: what applies to every tab unless a tab
 * says otherwise. Kept in `settings.json` in the app's data folder, and in
 * the browser's storage when Meno runs outside the app (the dev server).
 */
export type AppSettings = {
  /** The drawing style a structure is drawn in unless its document has its own. */
  drawingStyle: StyleChoice;
  /** The user's own drawing styles, offered below the built-in ones in every workspace (lib/chem/style `OwnStyle2D`). */
  ownDrawingStyles: OwnStyle2D[];
  /** How molecules in 3D look, and how they turn. */
  style3d: Style3DChoice;
  network: NetworkSettings;
  chemistry: ChemistrySettings;
  updates: UpdateSettings;
  /** The options last chosen for each role, by the role ("write:sdf"): what is drawn first next time (lib/options). */
  options: Record<string, OptionValues>;
  /** The user's own abbreviations, known as Meno's own are (lib/chem/abbreviations). */
  abbreviations: CustomAbbreviation[];
  /** Who reads each kind of file (Settings, Files): its reader, and those that read it as well (lib/calc/catalog `readerFor`). */
  files: FileSettings;
  /** The plugins and the roles they fill (docs/PLUGINS.md). */
  plugins: PluginSettings;
  /** The pictures a copy puts beside a structure, for other programs (Workspace/picture). */
  pictures: PictureSettings;
  /** How the mouse and the trackpad work the canvas. */
  pointer: PointerSettings;
  /** How finely the canvas is drawn. */
  canvas: CanvasSettings;
  /** How an atom's label is read as it is typed. */
  labels: LabelSettings;
  /** How words on the page are written as they are typed. */
  words: WordSettings;
  /** How a workflow's jobs run (Settings, Calculations; docs/WORKFLOWS.md). */
  calculations: CalculationSettings;
  /** The procedures saved (docs/WORKFLOWS.md, *Procedures*): put down again from Quick Add. */
  procedures: SavedProcedure[];
  /** The user's own colour sets, and the one in use: what a part of a structure can be given from its colour card (lib/chem/palette). */
  colours: ColourSettings;
};

/**
 * A procedure saved: a workflow's steps, as they are set, the wires among
 * them and the empty sets they take their input from - without their data
 * - by an id of its own, with its name and when it was saved. Its flow is
 * kept as data; the workflow reads it, as it reads a workspace's
 * (Workspace/workflow/procedures).
 */
export type SavedProcedure = { id: string; name: string; saved: number; flow: { sets: unknown[]; steps: unknown[]; wires: unknown[] } };

/** How a workflow's steps run (Settings, Calculations). Each kind's default options, done by each, are kept with the options (`options`, as "step:<who>:<kind>"), set there alone. */
export type CalculationSettings = {
  /** How many cores each job takes; unset, all those jobs may use (lib/jobs `runningOf`). */
  cores?: number;
  /** How many cores this computer's jobs may use at once, in all; unset, all its cores (lib/jobs `limitsOf`). */
  coresAll?: number;
  /** How much memory this computer's jobs may use at once, in all, in MiB; unset, three quarters of its memory. */
  memoryAll?: number;
  /** The size, in MB, a save past which says the workspace is large (Settings, General; workflow/keptJobs); unset, 500. */
  largeWorkspaceMB?: number;
};

/** The most cores, and memory in MiB, Settings takes. */
export const CORES_MOST = 1024;
export const MEMORY_MOST = 64 * 1024 * 1024;
/** The most a workspace may come to, in MB, before a save says it is large: Settings takes up to this - the most a workspace's file may come to at all. */
export const LARGE_WORKSPACE_MOST = MOST_WORKSPACE_FILE / 2 ** 20;
/** The energy window a structure's 3D conformers are kept within, made on the canvas, in kcal/mol, unless Settings says otherwise; and the widest Settings takes. */
export const WINDOW_3D = 30;
export const WINDOW_3D_MOST = 1000;

/**
 * How finely the canvas is drawn (docs/WORKSPACE.md, *Drawing resolution*):
 * twice as finely as its size on the screen - the sharpest - as finely as
 * the screen itself shows things (the default), or once. Pictures made of it
 * are drawn at their own sizes, whichever is chosen.
 */
export type CanvasSettings = { resolution: 2 | "display" | 1 };

/** How the mouse and the trackpad work the canvas: which way a turn of the wheel zooms, and how long a press is held to be a long press. */
export type PointerSettings = {
  /** A turn of the wheel upwards zooms in (as maps do), or out. */
  wheelUp: "in" | "out";
  /** How long a press held still takes to be a long press (Workspace/constants `LONG_PRESSES`); unset, normal. */
  longPress?: LongPress;
};

/** How long a long press is: shorter, normal or longer (Workspace/constants `LONG_PRESSES`). */
export type LongPress = "shorter" | "normal" | "longer";

/** How an atom's label is read as it is typed (Workspace/LabelTyping2D; lib/chem/smartLabel). */
export type LabelSettings = {
  /** As it was meant - nh2 as NH2, obz as OBz - or, off, exactly as typed. */
  smart: boolean;
};

/** How words on the page are written as they are typed (Workspace/CaptionTyping2D; lib/text/smartWords). */
export type WordSettings = {
  /** As they are meant - 60dc as 60 °C, -78 as −78, 1-2 h as 1–2 h - or, off, exactly as typed. */
  smart: boolean;
};

/** The resolutions a copied picture may be made at, in pixels to the inch. */
export const PICTURE_DPIS = [300, 600, 1200] as const;

/**
 * The pictures a copy puts beside a structure: how many pixels to the inch
 * where they are made of pixels - the picture for programs that take no
 * drawing in vectors, and molecules in 3D in any picture.
 */
export type PictureSettings = { dpi: (typeof PICTURE_DPIS)[number] };

/**
 * The plugins: those the chemist took away in Settings, Plugins - by id -
 * which are not set up again of themselves when a role they fill is
 * needed; who fills each role, where the chemist chose (lib/plugins/roles);
 * where the chemist located each program installed separately that a
 * plugin's steps run, by "plugin:program" (lib/plugins/installed).
 */
export type PluginSettings = {
  removed: string[];
  roles: Record<string, string>;
  programs: Record<string, string>;
};

/** Who reads each kind of file, by the kind's id: its reader - unset, Meno where Meno reads it, or else the first added that reads it - and the readers that read it as well. */
export type FileSettings = {
  read: Record<string, string>;
  also: Record<string, string[]>;
  /** macOS: the app each format opened with before Meno was made its default there, by extension - offered back by name (lib/defaultApps). */
  before?: Record<string, { name: string; path: string }>;
};

/** Meno keeping itself up to date (lib/update). */
export type UpdateSettings = {
  /**
   * Whether Meno has asked, of its own accord, to keep itself up to date:
   * it asks once, and after that only when the user turns it on.
   */
  asked: boolean;
  /** Whether each look for a newer Meno shows its notice in the corner, as every other use of the network does: on unless turned off - the one notice that can be. */
  notice: boolean;
};

/** What the plugin that does the checks points out on a structure as it is drawn. */
export type ChemistrySettings = {
  /** Atoms with more bonds than they can have. (R and S, E and Z are shown on what they are asked for on, and kept in the document: docs/EDITOR-2D.md, *R and S*.) */
  valenceWarnings: boolean;
  /** The energy window a structure's 3D conformers are kept within, made on the canvas, in kcal/mol - unset, `WINDOW_3D`. A workflow's conformer step keeps every one. */
  window3d?: number;
  /** How many conformers the page's 3D structure tries (*Conformers sought*, lib/chem/conformersSought): a number of the chemist's own ("fixed"), else - unset - as many as the molecule needs. */
  sought3d?: "fixed";
  /** The number tried where `sought3d` is "fixed": 1 to `MOST_CONFORMERS` - unset, `RING_CONFORMERS`. */
  count3d?: number;
};

export type NetworkSettings = {
  /** Nothing leaves the computer. */
  offline: boolean;
  /** The purposes the user has allowed to use the network. */
  granted: string[];
};

export const DEFAULT_APP_SETTINGS: AppSettings = {
  drawingStyle: DEFAULT_STYLE_CHOICE,
  ownDrawingStyles: [],
  style3d: DEFAULT_STYLE_3D_CHOICE,
  network: { offline: false, granted: [] },
  chemistry: { valenceWarnings: true },
  updates: { asked: false, notice: true },
  options: {},
  abbreviations: [],
  files: { read: {}, also: {} },
  plugins: { removed: [], roles: {}, programs: {} },
  pictures: { dpi: 600 },
  pointer: { wheelUp: "in" },
  canvas: { resolution: "display" },
  labels: { smart: true },
  words: { smart: true },
  calculations: {},
  procedures: [],
  colours: DEFAULT_COLOURS,
};

/** The file's layout; bumped when it changes in a way old files need reading round. */
const FORMAT = 1;

/** Settings from what the file holds; anything unreadable falls back to its default. */
export function acceptAppSettings(raw: unknown): AppSettings {
  if (typeof raw !== "object" || raw === null) return DEFAULT_APP_SETTINGS;
  const r = raw as Record<string, unknown>;
  return {
    drawingStyle: acceptStyleChoice(r.drawingStyle),
    ownDrawingStyles: acceptOwnStyles2d(r.ownDrawingStyles),
    style3d: acceptStyle3dChoice(r.style3d),
    network: acceptNetwork(r.network),
    chemistry: acceptChemistry(r.chemistry),
    updates: acceptUpdates(r.updates),
    options: acceptOptions(r.options),
    abbreviations: acceptAbbreviations(r.abbreviations),
    files: acceptFiles(r.files, r.calcReaders),
    plugins: acceptPlugins(r.plugins),
    pictures: acceptPictures(r.pictures),
    pointer: acceptPointer(r.pointer),
    canvas: acceptCanvas(r.canvas),
    labels: { smart: (r.labels as { smart?: unknown } | undefined)?.smart !== false },
    words: { smart: (r.words as { smart?: unknown } | undefined)?.smart !== false },
    calculations: acceptCalculations(r.calculations),
    procedures: acceptProcedures(r.procedures),
    colours: acceptColours(r.colours),
  };
}

/** How a workflow's jobs run, as the file holds it: the cores each takes, and the cores and memory they may use in all - whole numbers within reason. */
function acceptCalculations(raw: unknown): CalculationSettings {
  const r = raw as { cores?: unknown; coresAll?: unknown; memoryAll?: unknown; largeWorkspaceMB?: unknown } | null;
  const whole = (v: unknown, most: number) => (typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= most ? v : undefined);
  const cores = whole(r?.cores, CORES_MOST);
  const coresAll = whole(r?.coresAll, CORES_MOST);
  const memoryAll = whole(r?.memoryAll, MEMORY_MOST);
  const largeWorkspaceMB = whole(r?.largeWorkspaceMB, LARGE_WORKSPACE_MOST);
  return { ...(cores ? { cores } : {}), ...(coresAll ? { coresAll } : {}), ...(memoryAll ? { memoryAll } : {}), ...(largeWorkspaceMB ? { largeWorkspaceMB } : {}) };
}

/** The procedures saved, as the file holds them: each with an id, a name and its flow's parts as lists - read further as they are used. */
function acceptProcedures(raw: unknown): SavedProcedure[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  return raw.flatMap((v): SavedProcedure[] => {
    const r = v as { id?: unknown; name?: unknown; saved?: unknown; flow?: { sets?: unknown; steps?: unknown; wires?: unknown } } | null;
    const id = typeof r?.id === "string" && /^[a-z0-9-]{1,40}$/.test(r.id) ? r.id : null;
    const name = typeof r?.name === "string" && r.name.trim() && r.name.length <= 80 ? r.name.trim() : null;
    const f = r?.flow;
    if (!id || !name || seen.has(id) || !f || !Array.isArray(f.steps) || !f.steps.length) return [];
    seen.add(id);
    const list = (x: unknown) => (Array.isArray(x) ? x : []);
    return [{ id, name, saved: typeof r.saved === "number" && Number.isFinite(r.saved) ? r.saved : 0, flow: { sets: list(f.sets), steps: f.steps, wires: list(f.wires) } }];
  });
}

/**
 * How finely the canvas is drawn, as the file holds it: a choice saved is
 * kept, whichever it is; none saved - a file from before there was a choice
 * - or one that does not read, the default, as the screen shows things (the
 * maintainer, 2026-10-21: the default changed, no one's saved choice).
 */
function acceptCanvas(raw: unknown): CanvasSettings {
  const r = (raw as { resolution?: unknown } | null)?.resolution;
  return { resolution: r === 1 || r === 2 ? r : "display" };
}

/** How the pointer works, as the file holds it; what does not read, as it is by default. */
function acceptPointer(raw: unknown): PointerSettings {
  const r = (raw ?? {}) as { wheelUp?: unknown; longPress?: unknown };
  const longPress = r.longPress === "shorter" || r.longPress === "longer" ? r.longPress : undefined;
  return { wheelUp: r.wheelUp === "out" ? "out" : "in", ...(longPress ? { longPress } : {}) };
}

function acceptPictures(raw: unknown): PictureSettings {
  const dpi = (raw as { dpi?: unknown } | null)?.dpi;
  return PICTURE_DPIS.includes(dpi as PictureSettings["dpi"]) ? { dpi: dpi as PictureSettings["dpi"] } : DEFAULT_APP_SETTINGS.pictures;
}

const ID = /^[a-z0-9-]{1,40}$/;

/**
 * Who reads each kind, as the file holds it: a kind's id to a reader's, and
 * to the readers that read it as well. A file from before (`calcReaders`,
 * a kind's id to the reader chosen for it) is read as the readers chosen.
 */
function acceptFiles(raw: unknown, before: unknown): FileSettings {
  const read: Record<string, string> = {};
  const also: Record<string, string[]> = {};
  const entries = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? Object.entries(v) : []);
  for (const [kind, reader] of entries((before as { chosen?: unknown } | null)?.chosen)) {
    if (ID.test(kind) && typeof reader === "string" && ID.test(reader)) read[kind] = reader;
  }
  const f = raw as { read?: unknown; also?: unknown } | null;
  for (const [kind, reader] of entries(f?.read)) {
    if (ID.test(kind) && typeof reader === "string" && ID.test(reader)) read[kind] = reader;
  }
  for (const [kind, readers] of entries(f?.also)) {
    const ids = Array.isArray(readers) ? [...new Set(readers.filter((r): r is string => typeof r === "string" && ID.test(r)))] : [];
    if (ID.test(kind) && ids.length) also[kind] = ids;
  }
  // (an extension's app, by a name and an absolute path of some length)
  const apps: Record<string, { name: string; path: string }> = {};
  for (const [ext, app] of entries((raw as { before?: unknown } | null)?.before)) {
    const a = app as { name?: unknown; path?: unknown } | null;
    if (/^[a-z0-9]{1,8}$/.test(ext) && typeof a?.name === "string" && a.name && a.name.length <= 200 && typeof a.path === "string" && a.path.startsWith("/") && a.path.length <= 1024)
      apps[ext] = { name: a.name, path: a.path };
  }
  return { read, also, ...(Object.keys(apps).length ? { before: apps } : {}) };
}

/** The plugins taken away, the roles' choices and the programs located, that read: ids only. */
function acceptPlugins(raw: unknown): PluginSettings {
  const r = (raw ?? {}) as { removed?: unknown; roles?: unknown; programs?: unknown };
  const id = (v: unknown): v is string => typeof v === "string" && /^[a-z0-9][a-z0-9-]{0,39}$/.test(v);
  const removed = Array.isArray(r.removed) ? [...new Set(r.removed.filter(id))] : [];
  const roles: Record<string, string> = {};
  if (r.roles && typeof r.roles === "object" && !Array.isArray(r.roles)) {
    // (the roles Meno defines only)
    for (const [role, plugin] of Object.entries(r.roles)) if (isRole(role) && id(plugin)) roles[role] = plugin;
  }
  // (each a place the chemist located: a full path, of some length - on Windows a drive's, or a share's on the network (\\server\share\...); whether a program is there is the app's to say)
  const programs: Record<string, string> = {};
  if (r.programs && typeof r.programs === "object" && !Array.isArray(r.programs)) {
    for (const [key, path] of Object.entries(r.programs)) {
      const [plugin, program] = key.split(":");
      if (id(plugin) && /^[A-Za-z0-9][A-Za-z0-9._+-]{0,39}$/.test(program ?? "") && typeof path === "string" && path.length <= 1024 && /^(\/|[A-Za-z]:[\\/]|\\\\[^\\/])/.test(path)) programs[key] = path;
    }
  }
  return { removed, roles, programs };
}

/** The options remembered that read: by a role's name, each a value that is a string, a number or a switch. Whether each still fits its option is asked when it is drawn (lib/options `valuesOf`). */
function acceptOptions(raw: unknown): Record<string, OptionValues> {
  const out: Record<string, OptionValues> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [role, given] of Object.entries(raw)) {
    if (!/^[a-z0-9:-]{1,60}$/.test(role) || !given || typeof given !== "object" || Array.isArray(given)) continue;
    const values: OptionValues = {};
    for (const [id, v] of Object.entries(given)) {
      const fits = typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v)) || (typeof v === "string" && v.length <= 500);
      if (/^[a-zA-Z0-9_-]{1,40}$/.test(id) && fits) values[id] = v;
    }
    out[role] = values;
  }
  return out;
}

/** The user's abbreviations the file holds that read: a label, a name, other names and a structure Meno reads. */
function acceptAbbreviations(raw: unknown): CustomAbbreviation[] {
  if (!Array.isArray(raw)) return [];
  const text = (v: unknown, most: number) => (typeof v === "string" && v.trim() && v.length <= most ? v.trim() : null);
  const out: CustomAbbreviation[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const r = item as Record<string, unknown>;
    const label = text(r.label, 24);
    const smiles = text(r.smiles, 500);
    if (!label || /\s/.test(label) || !smiles || structureProblem(smiles)) continue;
    const also = Array.isArray(r.also) ? r.also.map((a) => text(a, 24)).filter((a): a is string => !!a && !/\s/.test(a)) : [];
    out.push({ label, smiles, name: text(r.name, 200) ?? "", ...(also.length ? { also } : {}) });
  }
  return out;
}

function acceptUpdates(raw: unknown): UpdateSettings {
  if (typeof raw !== "object" || raw === null) return DEFAULT_APP_SETTINGS.updates;
  const r = raw as Record<string, unknown>;
  return { asked: r.asked === true, notice: r.notice !== false };
}

function acceptChemistry(raw: unknown): ChemistrySettings {
  const d = DEFAULT_APP_SETTINGS.chemistry;
  if (typeof raw !== "object" || raw === null) return d;
  const { valenceWarnings, window3d, sought3d, count3d } = raw as Record<string, unknown>;
  return {
    valenceWarnings:
      typeof valenceWarnings === "boolean" ? valenceWarnings : d.valenceWarnings,
    ...(typeof window3d === "number" && Number.isFinite(window3d) && window3d >= 0 && window3d <= WINDOW_3D_MOST ? { window3d } : {}),
    ...(sought3d === "fixed" ? { sought3d } : {}),
    ...(typeof count3d === "number" && Number.isInteger(count3d) && count3d >= 1 && count3d <= MOST_CONFORMERS ? { count3d } : {}),
  };
}

function acceptNetwork(raw: unknown): NetworkSettings {
  if (typeof raw !== "object" || raw === null)
    return DEFAULT_APP_SETTINGS.network;
  const { offline, granted } = raw as Record<string, unknown>;
  return {
    offline: offline === true,
    granted: Array.isArray(granted)
      ? [
          ...new Set(
            granted.filter(
              (p): p is string =>
                typeof p === "string" && /^[a-z0-9:-]{1,64}$/.test(p),
            ),
          ),
        ]
      : [],
  };
}

/**
 * The settings as the file holds them: only what differs from the defaults
 * - what the user changed - so that a default changed later reaches everyone
 * who never touched it (the maintainer, 2026-10-21). Read back, what is not
 * there is the default (`acceptAppSettings`).
 */
export function settingsFileText(settings: AppSettings): string {
  const changed: Record<string, unknown> = {};
  for (const k of Object.keys(settings) as (keyof AppSettings)[]) {
    const d = WHOLE.has(k) ? (sameValue(settings[k], DEFAULT_APP_SETTINGS[k]) ? undefined : settings[k]) : changedFrom(settings[k], DEFAULT_APP_SETTINGS[k]);
    if (d !== undefined) changed[k] = d;
  }
  return JSON.stringify({ format: FORMAT, ...changed }, null, 2) + "\n";
}

/**
 * The settings written whole where any part of them was changed: a drawing
 * style chosen is its preset and the changes made to it, read only together;
 * a 3D style chosen, its primary and secondary looks, which are never the
 * same - one of them kept and the other a later default could be.
 */
const WHOLE: ReadonlySet<keyof AppSettings> = new Set(["drawingStyle", "style3d"]);

/**
 * What of `value` differs from `given`: nothing where they are the same;
 * of two objects, each field that differs, and only those, worked out the
 * same way within it; anything else - a list, a number, a text, an object
 * against something else - whole.
 */
export function changedFrom(value: unknown, given: unknown): unknown {
  if (sameValue(value, given)) return undefined;
  if (!isRecord(value) || !isRecord(given)) return value;
  // (a field of the defaults it no longer has - taken away, not changed: the whole of it, which says so)
  if (Object.keys(given).some((k) => given[k] !== undefined && value[k] === undefined)) return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    const d = k in given ? changedFrom(v, given[k]) : v;
    if (d !== undefined) out[k] = d;
  }
  return out;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Whether two values a settings file holds are the same: the same numbers, texts and true/false, in lists of the same order and objects of the same fields. */
function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => sameValue(v, b[i]));
  if (isRecord(a) && isRecord(b)) {
    const ka = Object.keys(a).filter((k) => a[k] !== undefined);
    const kb = Object.keys(b).filter((k) => b[k] !== undefined);
    return ka.length === kb.length && ka.every((k) => k in b && sameValue(a[k], b[k]));
  }
  return false;
}

const FILE = "settings.json";
const STORAGE_KEY = "meno.settings";

async function readSettingsText(): Promise<string | null> {
  if (isTauri()) {
    const there = await exists(FILE, { baseDir: BaseDirectory.AppData });
    return there
      ? readTextFile(FILE, { baseDir: BaseDirectory.AppData })
      : null;
  }
  return globalThis.localStorage?.getItem(STORAGE_KEY) ?? null;
}

async function writeSettingsText(text: string): Promise<void> {
  if (isTauri()) {
    // (whole, or not at all: a file left half written would lose every
    // setting; the folder made, on a first launch, as it is written)
    await writeAppFile(FILE, text, "data");
    return;
  }
  globalThis.localStorage?.setItem(STORAGE_KEY, text);
}

type SettingsState = AppSettings & {
  /** False until the saved settings have been read. */
  loaded: boolean;
  /** What went wrong reading or writing the file, if anything. */
  error: string | null;
  setDrawingStyle: (choice: StyleChoice) => void;
  setOwnDrawingStyles: (own: OwnStyle2D[]) => void;
  setStyle3d: (choice: Style3DChoice) => void;
  setNetwork: (network: NetworkSettings) => void;
  setChemistry: (chemistry: ChemistrySettings) => void;
  setUpdates: (updates: UpdateSettings) => void;
  /** Remembers the options chosen for a role. */
  rememberOptions: (role: string, values: OptionValues) => void;
  setAbbreviations: (abbreviations: CustomAbbreviation[]) => void;
  setFiles: (files: FileSettings) => void;
  setPlugins: (plugins: PluginSettings) => void;
  setPictures: (pictures: PictureSettings) => void;
  setPointer: (pointer: PointerSettings) => void;
  setCanvas: (canvas: CanvasSettings) => void;
  setLabels: (labels: LabelSettings) => void;
  setWords: (words: WordSettings) => void;
  setCalculations: (calculations: CalculationSettings) => void;
  setProcedures: (procedures: SavedProcedure[]) => void;
  setColours: (colours: ColourSettings) => void;
};

/** How long after the last change the file is written. */
const SAVE_DELAY_MS = 400;
let saveTimer: ReturnType<typeof setTimeout> | undefined;

export const useAppSettings = create<SettingsState>((set, get) => {
  const scheduleSave = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const { drawingStyle, ownDrawingStyles, style3d, network, chemistry, updates, options, abbreviations, files, plugins, pictures, pointer, canvas, labels, words, calculations, procedures, colours } = get();
      writeSettingsText(
        settingsFileText({ drawingStyle, ownDrawingStyles, style3d, network, chemistry, updates, options, abbreviations, files, plugins, pictures, pointer, canvas, labels, words, calculations, procedures, colours }),
      ).then(
        () => set({ error: null }),
        (e) => set({ error: `Settings could not be saved: ${String(e)}` }),
      );
    }, SAVE_DELAY_MS);
  };
  return {
    ...DEFAULT_APP_SETTINGS,
    loaded: false,
    error: null,
    setDrawingStyle: (drawingStyle) => {
      set({ drawingStyle });
      scheduleSave();
    },
    setOwnDrawingStyles: (ownDrawingStyles) => {
      set({ ownDrawingStyles });
      scheduleSave();
    },
    setStyle3d: (style3d) => {
      set({ style3d });
      scheduleSave();
    },
    setNetwork: (network) => {
      set({ network });
      scheduleSave();
    },
    setChemistry: (chemistry) => {
      set({ chemistry });
      scheduleSave();
    },
    setFiles: (files) => {
      set({ files });
      scheduleSave();
    },
    setPlugins: (plugins) => {
      set({ plugins });
      scheduleSave();
    },
    setPictures: (pictures) => {
      set({ pictures });
      scheduleSave();
    },
    setPointer: (pointer) => {
      set({ pointer });
      scheduleSave();
    },
    setCanvas: (canvas) => {
      set({ canvas });
      scheduleSave();
    },
    setLabels: (labels) => {
      set({ labels });
      scheduleSave();
    },
    setWords: (words) => {
      set({ words });
      scheduleSave();
    },
    setCalculations: (calculations) => {
      set({ calculations });
      scheduleSave();
    },
    setProcedures: (procedures) => {
      set({ procedures });
      scheduleSave();
    },
    setColours: (colours) => {
      set({ colours: acceptColours(colours) });
      scheduleSave();
    },
    setUpdates: (updates) => {
      set({ updates });
      scheduleSave();
    },
    rememberOptions: (role, values) => {
      set({ options: { ...get().options, [role]: values } });
      scheduleSave();
    },
    setAbbreviations: (abbreviations) => {
      setCustomAbbreviations(abbreviations);
      set({ abbreviations });
      scheduleSave();
    },
  };
});

let loading: Promise<void> | undefined;

/** Reads the saved settings into the store, once. */
export function loadAppSettings(): Promise<void> {
  loading ??= readSettingsText()
    .then((text) => {
      const settings = text
        ? acceptAppSettings(JSON.parse(text))
        : DEFAULT_APP_SETTINGS;
      setCustomAbbreviations(settings.abbreviations);
      useAppSettings.setState({ ...settings, loaded: true });
    })
    .catch((e) =>
      useAppSettings.setState({
        loaded: true,
        error: `Settings could not be read, so the defaults are in use: ${String(e)}`,
      }),
    );
  return loading;
}
