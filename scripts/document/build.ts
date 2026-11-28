/**
 * A workspace (.meno) built from a manifest by script (README.md): a title,
 * Markdown texts, structures drawn from MOL, SD and RXN files with their
 * names under them, and molecules in 3D from XYZ files - with each frame's
 * energy, and the mark of a conformer set where the manifest says so - each
 * put on the page in reading order and the whole saved as Save saves a page.
 *
 * Everything goes through the app's own code: each file read as Open reads
 * it, a structure laid out as Clean-up lays it out, put down by the store's
 * own actions (`appendModel`, `addTexts`) and written by `workspaceFile`
 * (`workspaceText`, `menoFileBytes`) - so that a change to the document breaks
 * this build or its test, never quietly a file.
 *
 * Nothing here is part of the app, and its input may change.
 */
import { NOMINAL_BOND_LENGTH as L } from "../../src/lib/chem/acs";
import { STYLE_PRESETS, styleOf, type StyleChoice } from "../../src/lib/chem/style";
import { laidOut } from "../../src/ui/features/Workspace/chem/cleanUp";
import { addCaption, createWorkspaceDocument, emptyWorkspaceDocument, type ImportedScheme } from "../../src/ui/features/Workspace/document";
import { editorLayoutOptions } from "../../src/ui/features/Workspace/layoutOptions";
import { connectStoreToDocument, createEditorStore } from "../../src/ui/features/Workspace/store";
import type { Model } from "../../src/ui/features/Workspace/store/types";
import { style3dOf } from "../../src/ui/features/Workspace/style3dOf";
import { captionBox, type Box } from "../../src/ui/features/Workspace/utils/extent";
import { footOf, importedScheme } from "../../src/ui/features/Workspace/utils/freePlace";
import { editorModelOf, processFileContent, type ProcessedFileResult } from "../../src/ui/features/Workspace/utils/io";
import { sheetNameRoom, sheetOf } from "../../src/ui/features/Workspace/utils/textSheets";
import { workspaceFile } from "../../src/ui/features/Workspace/utils/workspace";
import { sendPieces } from "../../src/ui/features/Workspace/workflow/keptJobs";
import { withFilesAdded } from "../../src/lib/doc/menoFile";
import { xyzFrames } from "../../src/utils/structureParsers";
import { isMarkdown } from "../../src/lib/text/markdown";

/** A Markdown text, put on the page as its sheet and listed in the text column. */
export type TextEntry = { text: string; name?: string };
/** A structure drawn from a .mol, .sdf or .rxn file, with its name (`id`) under it. */
export type StructureEntry = { structure: string; id?: string; record?: number; keepLayout?: boolean };
/** A molecule in 3D from an .xyz file: one frame or several, each with its energy where its comment line gives one. */
export type Molecule3dEntry = { molecule3d: string; name?: string; conformers?: boolean };
/** The row ends here: what comes next starts the next one. */
export type BreakEntry = { break: true };
export type Entry = TextEntry | StructureEntry | Molecule3dEntry | BreakEntry;

export type Manifest = {
  /** Over everything, as a heading. */
  title: string;
  /** The file written, from the manifest's folder (the stage's; the builder itself writes nothing). */
  out?: string;
  /** The workspace's drawing style, a preset's id (`STYLE_PRESETS`); unset, Meno's own. */
  style?: string;
  /** How wide a row may grow before the next entry starts a new one, in bond lengths. */
  width?: number;
  entries: Entry[];
};

/** Something in the manifest that cannot be built: it says which entry. */
export class DocumentError extends Error {}

/** World units between two entries of a row, and between two rows: two bond lengths. */
export const GAP = 2 * L;
/** Between a structure and its name under it. */
const NAME_GAP = 0.8;
/** How wide a row grows, unless the manifest says (bond lengths): about two Markdown sheets side by side. */
export const WIDTH = 100;
/** The title's size, in points. */
const TITLE_PT = 18;

const KEYS = {
  manifest: ["title", "out", "style", "width", "entries"],
  text: ["text", "name"],
  structure: ["structure", "id", "record", "keepLayout"],
  molecule3d: ["molecule3d", "name", "conformers"],
  break: ["break"],
} as const;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const kindOf = (e: Record<string, unknown>) => (["text", "structure", "molecule3d", "break"] as const).filter((k) => k in e);
const where = (i: number, e?: Record<string, unknown>) => {
  const file = e && (["text", "structure", "molecule3d"] as const).map((k) => e[k]).find((v) => typeof v === "string");
  return `Entry ${i + 1}${file ? ` (${file})` : ""}`;
};
const unknownKeys = (o: Record<string, unknown>, known: readonly string[]) => Object.keys(o).filter((k) => !known.includes(k));

/** The manifest's own mistakes, found before any file is read. */
export function checked(manifest: unknown): Manifest {
  if (!isObject(manifest)) throw new DocumentError("The manifest must be an object.");
  const extra = unknownKeys(manifest, KEYS.manifest);
  if (extra.length) throw new DocumentError(`The manifest: unknown key ${JSON.stringify(extra[0])} (it takes ${KEYS.manifest.join(", ")}).`);
  if (typeof manifest.title !== "string" || !manifest.title.trim()) throw new DocumentError(`The manifest needs a "title".`);
  const presets = STYLE_PRESETS.map((p) => p.id);
  if (manifest.style != null && (typeof manifest.style !== "string" || !presets.includes(manifest.style)))
    throw new DocumentError(`The manifest: unknown style ${JSON.stringify(manifest.style)} (presets: ${presets.join(", ")}).`);
  if (manifest.width != null && !(typeof manifest.width === "number" && manifest.width > 0)) throw new DocumentError(`The manifest: "width" must be a number of bond lengths over 0.`);
  if (manifest.out != null && (typeof manifest.out !== "string" || !/\.meno$/i.test(manifest.out))) throw new DocumentError(`The manifest: "out" must be a file's path ending .meno.`);
  if (!Array.isArray(manifest.entries) || !manifest.entries.length) throw new DocumentError(`The manifest needs "entries", a list of at least one.`);
  manifest.entries.forEach((e: unknown, i) => {
    if (!isObject(e)) throw new DocumentError(`Entry ${i + 1} is not an object.`);
    const kinds = kindOf(e);
    if (kinds.length !== 1) throw new DocumentError(`${where(i, e)}: an entry is one of "text", "structure", "molecule3d" or "break".`);
    const kind = kinds[0];
    const extra = unknownKeys(e, KEYS[kind]);
    if (extra.length) throw new DocumentError(`${where(i, e)}: unknown key ${JSON.stringify(extra[0])} (a ${kind} entry takes ${KEYS[kind].join(", ")}).`);
    if (kind === "break") {
      if (e.break !== true) throw new DocumentError(`${where(i, e)}: "break" is true.`);
      return;
    }
    const file = e[kind];
    if (typeof file !== "string" || !file) throw new DocumentError(`${where(i, e)}: "${kind}" is a file's path.`);
    if (kind === "text" && !/\.(md|markdown)$/i.test(file)) throw new DocumentError(`${where(i, e)}: a text is a Markdown file (.md).`);
    if (kind === "structure" && !/\.(mol|sdf|rxn)$/i.test(file)) throw new DocumentError(`${where(i, e)}: a structure is a .mol, .sdf or .rxn file.`);
    if (kind === "molecule3d" && !/\.xyz$/i.test(file)) throw new DocumentError(`${where(i, e)}: a molecule in 3D is an .xyz file (a calculation's output is read in the app, by its plugin).`);
    for (const k of ["name", "id"] as const) if (e[k] != null && typeof e[k] !== "string") throw new DocumentError(`${where(i, e)}: "${k}" is a text.`);
    for (const k of ["keepLayout", "conformers"] as const) if (e[k] != null && typeof e[k] !== "boolean") throw new DocumentError(`${where(i, e)}: "${k}" is true or false.`);
    if (e.record != null && !(Number.isInteger(e.record) && (e.record as number) >= 1)) throw new DocumentError(`${where(i, e)}: "record" is a whole number from 1.`);
    if (e.record != null && !/\.sdf$/i.test(file)) throw new DocumentError(`${where(i, e)}: "record" is for an .sdf file.`);
  });
  return manifest as unknown as Manifest;
}

/**
 * One entry ready to put down: the room it takes about its own point
 * (`foot`), and how it is put down there. A structure's `foot` is its own,
 * without its name; its name (`named`) is set with the row's other names, on
 * one line under the row's tallest structure (`nameY`, the line's point). A
 * sheet's (`sheet`) is its paper's; its name under it is added as the page
 * draws it, at a size on the page the same at every zoom (`sheetNameRoom`).
 */
type Ready = {
  foot: Box;
  sheet?: true;
  /** Its name: half its height, and how far its box reaches below its point. */
  named?: { half: number; below: number };
  structure?: true;
  put: (at: { x: number; y: number }, nameY: number) => void;
};

/** The built workspace: its file's bytes, and where each entry went (the manifest's order, breaks left out) - each box as it stands on the page. */
export type Built = { bytes: Uint8Array; boxes: Box[]; title: Box };

/**
 * The workspace `manifest` makes. `read` gives a file's text by its path
 * from the manifest's folder, and throws where it cannot. A mistake in the
 * manifest or a file is a `DocumentError` naming the entry.
 */
export async function buildDocument(manifest: unknown, read: (path: string) => string): Promise<Built> {
  const given = checked(manifest);
  const choice: StyleChoice = { preset: given.style ?? STYLE_PRESETS[0].id, changes: {} };
  const style = styleOf(choice);
  const held = createWorkspaceDocument();
  const store = createEditorStore(held);
  connectStoreToDocument(store, held);
  held.reset(emptyWorkspaceDocument(choice), "built");
  const style3d = style3dOf(store.getState());
  const opts = editorLayoutOptions(style);

  const readFile = (path: string, at: string) => {
    try {
      return read(path);
    } catch {
      throw new DocumentError(`${at}: the file "${path}" cannot be read (is it missing?).`);
    }
  };
  const opened = async (name: string, text: string, at: string): Promise<ProcessedFileResult> => {
    try {
      return await processFileContent(name, text);
    } catch (e) {
      throw new DocumentError(`${at}: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const ready: (Ready | "break")[] = [];
  for (const [i, raw] of given.entries.entries()) {
    const at = where(i, raw as Record<string, unknown>);
    if ("break" in raw) {
      ready.push("break");
    } else if ("text" in raw) {
      const text = readFile(raw.text, at);
      const name = raw.name ?? raw.text.split(/[\\/]/).pop()!;
      // (Markdown as its file is, whatever it is named - as a file opened in the app)
      const markdown = isMarkdown(raw.text);
      const sheet = sheetOf(text, markdown);
      // (a sheet lies from its top left corner: `at`)
      ready.push({ foot: { x0: 0, x1: sheet.w, y0: -sheet.h, y1: 0 }, sheet: true, put: (p) => store.getState().addTexts([{ name, text, ...(markdown ? { markdown: true as const } : {}), at: p }]) });
    } else if ("structure" in raw) {
      let text = readFile(raw.structure, at);
      let name = raw.structure;
      if (/\.sdf$/i.test(raw.structure)) {
        const records = text.split(/^\$\$\$\$.*(?:\r?\n|$)/m).filter((r) => r.trim() !== "");
        const n = raw.record ?? 1;
        if (n > records.length) throw new DocumentError(`${at}: the file has ${records.length} record${records.length === 1 ? "" : "s"}; record ${n} is not one of them.`);
        text = records[n - 1];
        name = "record.mol";
      }
      const result = await opened(name, text, at);
      if (!result.model.atoms.length) throw new DocumentError(`${at}: "${raw.structure}" holds no flat structure (a molecule in 3D is an .xyz file's).`);
      const rxn = /\.rxn$/i.test(raw.structure);
      let model: Model = editorModelOf(result.model);
      // (laid out by Meno, as Clean-up lays out what is drawn; a reaction's file, and one whose layout is kept, as it is)
      if (!rxn && !raw.keepLayout) {
        try {
          model = await laidOut(model, style);
        } catch (e) {
          throw new DocumentError(`${at}: Meno could not lay it out: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      const n = model.atoms.length;
      const centroid = rxn ? result.centroid : { x: model.atoms.reduce((s, a) => s + a.x, 0) / n, y: model.atoms.reduce((s, a) => s + a.y, 0) / n };
      const laid = { ...result, model: { ...result.model, atoms: model.atoms }, centroid };
      const about = (dx: number, dy: number): ImportedScheme => importedScheme({ ...result, model: undefined }, dx, dy, style3d);
      // (its name under it, the middle of its words under the middle of its atoms)
      const bare = footOf(laid as ProcessedFileResult, about(-centroid.x, -centroid.y), style, style3d);
      const words = raw.id ? { x: 0, y: 0, text: raw.id } : null;
      const half = words ? (captionBox(words, opts).y1 - captionBox(words, opts).y0) / 2 : 0;
      // (how wide its name is, and how far its box reaches below its point - measured where it would stand under it alone)
      const alone = words ? footOf(laid as ProcessedFileResult, { ...about(-centroid.x, -centroid.y), captions: [{ ...words, y: bare.y0 - NAME_GAP - half }] }, style, style3d) : bare;
      const box = words ? captionBox({ ...words, y: bare.y0 - NAME_GAP - half }, opts) : null;
      ready.push({
        foot: { ...bare, x0: Math.min(bare.x0, alone.x0), x1: Math.max(bare.x1, alone.x1) },
        structure: true,
        ...(box ? { named: { half, below: box.y0 - (bare.y0 - NAME_GAP - half) } } : {}),
        put: (p, nameY) => {
          const dx = p.x - centroid.x;
          const dy = p.y - centroid.y;
          const shifted = { atoms: model.atoms.map((a) => ({ ...a, x: a.x + dx, y: a.y + dy })), bonds: model.bonds };
          // (its name the words that belong to it, as "Add text" on it writes them - tied to its first atom, numbered as
          //  `appendModel` numbers what it adds, from the page's next id; a reaction's names the scheme, of several
          //  structures, and stays free)
          const of = rxn ? undefined : { atom: held.getState().nextId };
          store.getState().appendModel(shifted, { ...about(dx, dy), captions: words ? [{ ...words, x: p.x, y: nameY, ...(of ? { of } : {}) }] : [] });
        },
      });
    } else {
      const text = readFile(raw.molecule3d, at);
      if (raw.conformers) {
        // (a conformer set is one molecule's places: every frame the same atoms, in the same order)
        const frames = xyzFrames(text.replace(/\r\n?/g, "\n"));
        if (frames.length < 2) throw new DocumentError(`${at}: a conformer set has several frames; the file has ${frames.length}.`);
        const first = frames[0].map((a) => a.el).join(" ");
        const other = frames.findIndex((f) => f.map((a) => a.el).join(" ") !== first);
        if (other > 0) throw new DocumentError(`${at}: frame ${other + 1} has other atoms than frame 1, so the frames are not conformers of one molecule.`);
      }
      const result = await opened(raw.molecule3d.split(/[\\/]/).pop()!, text, at);
      const found = result.molecules3d ?? [];
      if (found.length !== 1) throw new DocumentError(`${at}: "${raw.molecule3d}" holds no molecule in 3D.`);
      const named = { ...result, molecules3d: [{ ...found[0], ...(raw.name ? { name: raw.name } : {}), ...(raw.conformers ? { conformerSet: true } : {}) }] };
      const foot = footOf(named, importedScheme(named, 0, 0, style3d), style, style3d);
      ready.push({ foot, put: (p) => store.getState().appendModel({ atoms: [], bonds: [] }, importedScheme(named, 0, 0, style3d, p)) });
    }
  }

  // The title over all, from the page's top left corner; then the entries
  // in reading order: left to right, each row's tops level, a row as wide
  // as `width` at most (an entry wider than that alone in its row), the next
  // row under the lowest foot of the one before - GAP between all. The
  // names of a row's structures stand on one line, under its tallest
  // structure, each centred under its own (as a scheme's numbers are set),
  // each the words that belong to its structure. A sheet's name under it
  // takes room too, as large as the page draws it at every zoom.
  const titleWords = { x: 0, y: 0, text: given.title, size: TITLE_PT, align: "left" as const };
  const tb = captionBox(titleWords, opts);
  // (its box's left edge at 0 and its top at 0, however its words are set about their point)
  const title = { ...titleWords, x: -tb.x0, y: -tb.y1 };
  held.edit("title", (d) => addCaption(d, title));
  const titleBox = captionBox(title, opts);
  const most = (given.width ?? WIDTH) * L;
  // (where each entry goes - and its box on the page, a sheet's name's with it)
  const planned = () => {
    const out: { r: Ready; p: { x: number; y: number }; nameY: number; box: Box }[] = [];
    const roomOf = (r: Ready): Box => {
      if (!r.sheet) return r.foot;
      const name = sheetNameRoom(r.foot).room;
      return { ...r.foot, x1: Math.max(r.foot.x1, name.x1), y0: name.y0 };
    };
    let top = titleBox.y0 - GAP;
    let x = 0;
    let row: { r: Ready; room: Box; p: { x: number; y: number } }[] = [];
    // (the row: its names' line under its tallest structure; the next row's top under the lowest of all)
    const newRow = () => {
      if (!row.length) return;
      const structures = row.filter(({ r }) => r.structure);
      const lowest = structures.length ? Math.min(...structures.map(({ r, p }) => p.y + r.foot.y0)) : 0;
      const half = Math.max(0, ...row.map(({ r }) => r.named?.half ?? 0));
      const nameY = lowest - NAME_GAP - half;
      let foot = top;
      for (const { r, room, p } of row) {
        const y0 = Math.min(p.y + room.y0, r.named ? nameY + r.named.below : Infinity);
        out.push({ r, p, nameY, box: { x0: p.x + room.x0, x1: p.x + room.x1, y0, y1: p.y + room.y1 } });
        foot = Math.min(foot, y0);
      }
      top = foot - GAP;
      x = 0;
      row = [];
    };
    for (const r of ready) {
      if (r === "break") {
        newRow();
        continue;
      }
      const room = roomOf(r);
      const w = room.x1 - room.x0;
      if (x > 0 && x + w > most) newRow();
      row.push({ r, room, p: { x: x - room.x0, y: top - room.y1 } });
      x += w + GAP;
    }
    newRow();
    return out;
  };
  const plan = planned();
  for (const { r, p, nameY } of plan) r.put(p, nameY);
  const boxes = plan.map((q) => q.box);
  // (no Meno here to add the files it keeps from the disk: each, held by the page, added as Meno adds it)
  const file = await workspaceFile(store.getState());
  const sent = new Map<string, Uint8Array>();
  await sendPieces(file, async (_save, sha256, b) => void sent.set(sha256, b));
  const bytes = withFilesAdded(file.bytes, file.appended, (sha) => sent.get(sha));
  return { bytes, boxes, title: titleBox };
}
