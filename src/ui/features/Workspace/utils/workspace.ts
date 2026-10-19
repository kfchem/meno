/**
 * The workspace: everything on the canvas, as it is - the drawing, its
 * arrows and pluses, the molecules in 3D with their frames, energies, looks
 * and measurements, how each is turned and which frame it shows, a
 * workflow's sets, steps and wires, and the workspace's drawing style -
 * so that it opens again just as it was saved - and the texts it holds,
 * and which its column showed, and the PDFs and pictures on its page. JSON,
 * versioned; a reader keeps what it reads and leaves out what it does not.
 * Its file, `.meno`, is a zip (lib/doc/menoFile) holding it, the
 * calculations' outputs its molecules were read from, its texts, its PDFs
 * and its pictures.
 */
import { carriedDrawing, hiddenInStacks } from "./stacks";
import { acceptStyleChoice } from "../../../../lib/chem/styleFields";
import { fillsAmong } from "./rings";
import { styleOf, type StyleChoice } from "../../../../lib/chem/style";
import { POINT, pointFor } from "../../../../lib/pdf/layout";
import { acceptWorkspace3d, type Workspace3D } from "../../../../lib/chem/workspaceStyle3d";
import type { Carried3D, Drawn, EditorState, Member, PdfItem, PictureItem, TextOf, WorkspaceText } from "../store/types";
import { collectionHash, setMembers } from "../workflow/entries";
import { pdfBytes } from "../../../../lib/pdf/reader";
import { readPdfs } from "./pdfItems";
import { pictureBytes } from "../../../../lib/picture/held";
import { placesRead, readDrawn } from "./copyPaste";
import { calcShowing, heldOutput, outputsToKeep, sha256Of } from "../../../../lib/calc/asks";
import { writeMenoFile } from "../../../../lib/doc/menoFileWriter";
import type { KeptData } from "../../../../lib/doc/menoFile";
import type { CalcSource } from "../../../../lib/calc/output";
import { readWorkflow, type SavedWorkflow } from "../workflow/saved";

export const WORKSPACE = "meno-workspace";
/** The version a workspace's JSON is written at: 2 since sets keep their members (docs/FILE-IO.md, *The workspace file*). */
export const WORKSPACE_VERSION = 2;
/** The versions read: 1, its sets' members read from their frames once, as it opens. */
const READS = [1, 2];

/** What a workspace file holds, read. */
export type Workspace = {
  drawn: Drawn;
  /** The workspace's drawing style; a file saved without one (a procedure's) opens in Settings'. */
  style?: StyleChoice;
  /** Its styles in 3D (lib/chem/workspaceStyle3d); a file saved without them opens in Settings'. */
  style3d?: Workspace3D;
  aromaticEnabled: boolean;
  aromaticRings: Record<string, boolean>;
  /** A workflow on the page: its sets, steps and wires (docs/WORKFLOWS.md). */
  workflow?: SavedWorkflow;
  /** The texts it holds, as its file keeps them: each by its SHA-256 - and its words, once read (`readTexts`). */
  texts: SavedText[];
  /** Which of them its column showed, by its place among them; none, it was closed. */
  textShown?: number;
  /** The PDFs on its page, each by its file's SHA-256 (docs/PDF.md), and where each read in its column was. */
  pdfs: Omit<PdfItem, "id">[];
  /** Which of them its column showed, by its place among them - a text, or none, if it showed none of them. */
  pdfShown?: number;
};

/** A text as a workspace's file keeps it: its name, and the file kept with its words, by SHA-256 - and where its sheet lies on the page, whether it is made an icon, and whether it is read in the column; and what it is the text of - a step, by its id, or a molecule, by its place among `molecules3d`. */
export type SavedText = { name: string; sha256: string; text?: string; at?: { x: number; y: number }; point?: number; reading?: false; icon?: true; of?: TextOf };

type Saved = Pick<
  EditorState,
  "model" | "arrows" | "pluses" | "captions" | "molecules3d" | "turns3d" | "frames3d" | "lists3d" | "aromaticEnabled" | "aromaticRings"
> &
  // (a procedure's file holds no style: opened, it is in Settings')
  Partial<Pick<EditorState, "docStyle" | "docStyle3d">> &
  Partial<Pick<EditorState, "pushes">> &
  Partial<Pick<EditorState, "ringFills">> &
  Partial<Pick<EditorState, "sets" | "steps" | "wires" | "texts" | "textShown" | "textsOpen" | "pdfs" | "pdfShown" | "pictures" | "slides" | "shapes" | "inks" | "cycles" | "stacksShown" | "fullModel" | "recordsShown">>;

/**
 * The canvas's molecules in 3D as a file carries them: each turned, and
 * showing the frame, as it is - and a calculation's promise it is showing
 * (a surface, a motion), given, as what it came to (lib/calc/asks).
 */
const NO_STACKS: Record<number, number> = {};

export function carriedOf(state: Pick<Saved, "molecules3d" | "turns3d" | "frames3d"> & Partial<Pick<Saved, "lists3d" | "stacksShown">>): Carried3D[] {
  // (and, of a stack, the one it shows: utils/stacks)
  const hidden = hiddenInStacks(state.molecules3d, state.stacksShown ?? NO_STACKS);
  return state.molecules3d.map(({ id, ...m }) => {
    const open = state.lists3d?.[id];
    return {
      ...m,
      ...(m.stack && !m.stack.spread && !hidden.has(id) ? { shown: true as const } : {}),
      ...(m.calc && open ? { calc: calcShowing(m.calc, open.list, open.row) } : {}),
      ...(state.turns3d[id] ? { turn: state.turns3d[id] } : {}),
      ...(state.frames3d[id] ? { frame: state.frames3d[id] } : {}),
      ...(open ? { list: { id: open.list, row: open.row, ...(open.iso != null ? { iso: open.iso } : {}) } } : {}),
    };
  });
}

/**
 * The canvas as a workspace's JSON. An output its file keeps (`kept`, by
 * SHA-256) is not said to be anywhere else: where it was is left out - nor
 * is a text's, which it always keeps (`texts`, each text's SHA-256, in
 * order).
 */
export function workspaceText(given: Saved, kept: ReadonlySet<string> = new Set(), texts: readonly string[] = []): string {
  // (a result set kept out of the file: its molecules not written, only how many it held and their hash - *Don't keep in the file*)
  const page = { model: given.model, molecules3d: given.molecules3d, pictures: given.pictures };
  const notKept = new Set((given.sets ?? []).filter((b) => b.keep === false && b.made).flatMap((b) => setMembers(page, b).molecules));
  const state = notKept.size ? { ...given, molecules3d: given.molecules3d.filter((m) => !notKept.has(m.id)) } : given;
  const moleculeAt = new Map(state.molecules3d.map((m, i) => [m.id, i]));
  const pictureAt = new Map((state.pictures ?? []).map((p, i) => [p.id, i]));
  // (each set's members by what a file can say them by: a structure by its atoms' ids, kept; a molecule or a picture by its place in its list)
  const savedSets = (state.sets ?? []).map(({ members, ...b }) => {
    if (b.keep === false && b.made) return { ...b, notKept: { count: members?.length ?? 0, hash: collectionHash(page, { ...b, members }) } };
    const saved = (members ?? []).flatMap((m): Member[] => {
      if ("structure" in m) return [m];
      if ("molecule" in m) return moleculeAt.has(m.molecule) ? [{ molecule: moleculeAt.get(m.molecule)! }] : [];
      return pictureAt.has(m.picture) ? [{ picture: pictureAt.get(m.picture)! }] : [];
    });
    return members ? { ...b, members: saved } : b;
  });
  const molecules3d = carriedOf(state).map((m) => {
    if (!m.calc?.source?.path || !kept.has(m.calc.source.sha256)) return m;
    const { path: _, ...source } = m.calc.source;
    return { ...m, calc: { ...m.calc, source } };
  });
  const pdfShown = state.textsOpen && state.pdfShown != null ? (state.pdfs?.findIndex((p) => p.id === state.pdfShown) ?? -1) : -1;
  const shown = state.textsOpen && pdfShown < 0 ? (state.texts?.findIndex((t) => t.id === state.textShown) ?? -1) : -1;
  // (a molecule a text is of, by its place: molecules are numbered again from the first as a workspace opens)
  const ofSaved = (of: TextOf | undefined): { of?: TextOf } => {
    if (!of) return {};
    if ("step" in of) return { of };
    const at = state.molecules3d.findIndex((m) => m.id === of.molecule);
    return at < 0 ? {} : { of: { molecule: at } };
  };
  // (the whole drawing - every record of each stack of drawings, the one it shows marked: utils/stacks)
  const drawing = carriedDrawing(state.fullModel ?? state.model, state.recordsShown ?? NO_STACKS);
  const drawn = new Set(drawing.atoms.map((a) => a.id));
  const fills = fillsAmong(state.ringFills, drawn);
  // (whether a ring's circle is drawn, of rings still drawn only: an atom's id is given again once the workspace opens, and a ring of new atoms would take a gone ring's)
  const aromatic = fillsAmong(state.aromaticRings, drawn);
  return (
    JSON.stringify({
      format: WORKSPACE,
      version: WORKSPACE_VERSION,
      atoms: drawing.atoms,
      bonds: drawing.bonds,
      ...(state.pushes?.length ? { pushes: state.pushes } : {}),
      // (the fills of rings still drawn)
      ...(Object.keys(fills).length ? { ringFills: fills } : {}),
      arrows: state.arrows,
      pluses: state.pluses,
      ...(state.captions.length ? { captions: state.captions } : {}),
      molecules3d,
      ...(state.sets?.length || state.steps?.length ? { sets: savedSets, steps: state.steps ?? [], wires: state.wires ?? [] } : {}),
      ...(state.docStyle ? { style: state.docStyle } : {}),
      // (its styles in 3D, each whole: it opens the same on any computer)
      ...(state.docStyle3d ? { style3d: state.docStyle3d } : {}),
      ...(state.aromaticEnabled ? { aromaticEnabled: true } : {}),
      ...(Object.keys(aromatic).length ? { aromaticRings: aromatic } : {}),
      ...(state.texts?.length
        ? { texts: state.texts.map((t, i) => ({ name: t.name, sha256: texts[i], ...(t.at ? { at: t.at } : {}), ...(t.point != null ? { point: t.point } : {}), ...(t.reading === false ? { reading: false } : {}), ...(t.icon ? { icon: true } : {}), ...ofSaved(t.of) })) }
        : {}),
      ...(shown >= 0 ? { textShown: shown } : {}),
      ...(state.pdfs?.length ? { pdfs: state.pdfs.map(({ id: _id, ...p }) => p) } : {}),
      ...(pdfShown >= 0 ? { pdfShown } : {}),
      ...(state.pictures?.length ? { pictures: state.pictures } : {}),
      // (the slides, in the talk's order: docs/PRESENTING.md)
      ...(state.slides?.length ? { slides: state.slides } : {}),
      // (the shapes, from the back: docs/PRESENTING.md, *Shapes*)
      ...(state.shapes?.length ? { shapes: state.shapes } : {}),
      // (writing by hand, each piece in the order written: docs/PRESENTING.md, *Handwriting*)
      ...(state.inks?.length ? { inks: state.inks } : {}),
      // (catalytic cycles: lib/chem/cycle)
      ...(state.cycles?.length ? { cycles: state.cycles } : {}),
    }) + "\n"
  );
}

/** The canvas as its workspace file: its JSON, every output its molecules were read from that is held this session, and its texts. */
export async function workspaceFile(state: Saved): Promise<Uint8Array> {
  // (the outputs they were read from, and the wavefunctions kept with them)
  const sources = state.molecules3d.flatMap((m): CalcSource[] => [m.calc?.source, m.calc?.wavefunction].filter((s): s is CalcSource => !!s));
  const kept = await outputsToKeep(sources);
  const texts = await textsToKeep(state.texts ?? []);
  const pdfs = await pdfsToKeep(state.pdfs ?? []);
  return writeMenoFile(
    workspaceText(state, new Set(kept.map((k) => k.sha256)), texts.map((t) => t.sha256)),
    [...kept, ...texts, ...pdfs, ...picturesToKeep(state.pictures ?? [])],
  );
}

/** The pictures as a workspace's file keeps them: each image as it is, once - those held this session (lib/picture/held). */
function picturesToKeep(pictures: readonly PictureItem[]): KeptData[] {
  const seen = new Map<string, PictureItem>();
  for (const p of pictures) if (!seen.has(p.sha256)) seen.set(p.sha256, p);
  return [...seen.values()].flatMap((p) => {
    const data = pictureBytes(p.sha256);
    return data ? [{ sha256: p.sha256, name: p.name, media: p.media, data }] : [];
  });
}

/** The PDFs as a workspace's file keeps them: each as it was, once, read from where Meno holds it (lib/pdf/reader). */
async function pdfsToKeep(pdfs: readonly PdfItem[]): Promise<KeptData[]> {
  const seen = new Map<string, string>();
  for (const p of pdfs) if (!seen.has(p.sha256)) seen.set(p.sha256, p.name);
  return Promise.all([...seen].map(async ([sha256, name]) => ({ sha256, name, media: "application/pdf", data: await pdfBytes(sha256) })));
}

/** The texts as a workspace's file keeps them, in order: each as UTF-8, by its SHA-256 - one an output's too kept once. */
async function textsToKeep(texts: readonly WorkspaceText[]): Promise<KeptData[]> {
  const encoder = new TextEncoder();
  return Promise.all(
    texts.map(async (t) => ({ sha256: await sha256Of(t.text), name: t.name, media: "text/plain", data: encoder.encode(t.text) })),
  );
}

/**
 * A workspace's texts read from its file, held as it was opened (lib/calc/
 * asks): each with its words, and which its column showed - those not to
 * be had left out, and named (`missing`).
 */
export async function readTexts(ws: Workspace): Promise<{ ws: Workspace; missing: string[] }> {
  const read = await Promise.all(ws.texts.map(async (t) => ({ ...t, text: t.text ?? (await heldOutput(t.sha256))?.text })));
  const texts = read.filter((t) => t.text != null);
  const shown = ws.textShown != null ? texts.indexOf(read[ws.textShown]) : -1;
  return {
    ws: { ...ws, texts, ...(shown >= 0 ? { textShown: shown } : { textShown: undefined }) },
    missing: read.filter((t) => t.text == null).map((t) => t.name),
  };
}

/** A workspace's JSON read, or null where `text` is not one this version reads. */
/** What a saved text is the text of, as a file says: a step's id, or a molecule's place - anything else, nothing. */
function textOfRead(v: unknown): { of?: TextOf } {
  const o = v as { step?: unknown; molecule?: unknown } | null | undefined;
  if (Number.isInteger(o?.step)) return { of: { step: o!.step as number } };
  if (Number.isInteger(o?.molecule) && (o!.molecule as number) >= 0) return { of: { molecule: o!.molecule as number } };
  return {};
}

export function readWorkspace(text: string): Workspace | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  const r = data as {
    format?: unknown;
    version?: unknown;
    style?: unknown;
    style3d?: unknown;
    aromaticEnabled?: unknown;
    aromaticRings?: unknown;
    texts?: unknown;
    textShown?: unknown;
    pdfs?: unknown;
    pdfShown?: unknown;
  };
  if (r?.format !== WORKSPACE || !READS.includes(r.version as number)) return null;
  // (what is drawn read at the point of the style it was drawn in)
  const style = r.style != null ? acceptStyleChoice(r.style) : undefined;
  const drawn = readDrawn(data, style ? pointFor(styleOf(style).bondLengthPt) : POINT);
  if (!drawn) return null;
  const rings: Record<string, boolean> = {};
  if (typeof r.aromaticRings === "object" && r.aromaticRings) {
    for (const [k, v] of Object.entries(r.aromaticRings)) if (typeof v === "boolean") rings[k] = v;
  }
  const read = readWorkflow(data);
  // (each set's members as the ids its molecules and pictures are given as the workspace opens: numbered from the first, in the order read)
  const places = placesRead(data);
  const asOpened = (m: Member): Member[] => {
    if ("structure" in m) return [m];
    if ("molecule" in m) {
      const k = places.molecules3d.indexOf(m.molecule);
      return k < 0 ? [] : [{ molecule: k + 1 }];
    }
    const k = places.pictures.indexOf(m.picture);
    return k < 0 ? [] : [{ picture: k + 1 }];
  };
  const workflow = read && r.version === 2 ? { ...read, sets: read.sets.map((b) => (b.members ? { ...b, members: b.members.flatMap(asOpened) } : b)) } : read;
  const texts: SavedText[] = [];
  for (const t of Array.isArray(r.texts) ? (r.texts as Partial<SavedText>[]) : []) {
    if (typeof t?.name !== "string" || typeof t.sha256 !== "string" || !SHA.test(t.sha256)) continue;
    const at = t.at && Number.isFinite(t.at.x) && Number.isFinite(t.at.y) ? { at: { x: t.at.x, y: t.at.y } } : {};
    texts.push({ name: t.name.slice(0, 260), sha256: t.sha256, ...at, ...(typeof t.point === "number" && t.point > 0 && Number.isFinite(t.point) ? { point: t.point } : {}), ...(t.reading === false ? { reading: false as const } : {}), ...(t.icon === true && at.at ? { icon: true as const } : {}), ...textOfRead(t.of) });
  }
  const shown = typeof r.textShown === "number" && Number.isInteger(r.textShown) && r.textShown >= 0 && r.textShown < texts.length;
  const pdfs = readPdfs(r.pdfs);
  const pdfShown = typeof r.pdfShown === "number" && Number.isInteger(r.pdfShown) && !!pdfs[r.pdfShown]?.reading;
  return {
    drawn,
    ...(workflow ? { workflow } : {}),
    ...(style !== undefined ? { style } : {}),
    ...(acceptWorkspace3d(r.style3d) ? { style3d: acceptWorkspace3d(r.style3d)! } : {}),
    aromaticEnabled: r.aromaticEnabled === true,
    aromaticRings: rings,
    texts,
    ...(shown ? { textShown: r.textShown as number } : {}),
    pdfs,
    ...(pdfShown ? { pdfShown: r.pdfShown as number } : {}),
  };
}

const SHA = /^[0-9a-f]{64}$/;

/**
 * Why a workspace's JSON does not open, in words to follow "could not be
 * read:" - saved by a newer Meno, or none Meno reads - or null, where it
 * opens: asked before a tab is made for it, so that none is left empty.
 */
export function workspaceProblem(text: string): string | null {
  if (readWorkspace(text)) return null;
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return "it is not a workspace Meno reads";
  }
  const r = data as { format?: unknown; version?: unknown } | null;
  if (r?.format === WORKSPACE && typeof r.version === "number" && r.version > WORKSPACE_VERSION) return "it was saved by a newer Meno - update Meno to open it";
  return "it is not a workspace Meno reads";
}

/** Whether a file's name says it is a workspace. */
export const isWorkspaceFile = (name: string) => /\.meno$/i.test(name);
