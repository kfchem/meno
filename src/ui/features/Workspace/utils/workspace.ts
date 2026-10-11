/**
 * The workspace: everything on the canvas, as it is - the drawing, its
 * arrows and pluses, the molecules in 3D with their frames, energies, looks
 * and measurements, how each is turned and which frame it shows, a
 * workflow's sets, steps and wires, and the document's own drawing style -
 * so that it opens again just as it was saved - and the texts it holds,
 * and which its column showed, and the PDFs and pictures on its page. JSON,
 * versioned; a reader keeps what it reads and leaves out what it does not.
 * Its file, `.meno`, is a zip (lib/doc/menoFile) holding it, the
 * calculations' outputs its molecules were read from, its texts, its PDFs
 * and its pictures.
 */
import { acceptStyleChoice } from "../../../../lib/chem/styleFields";
import type { StyleChoice } from "../../../../lib/chem/style";
import type { Carried3D, Drawn, EditorState, PdfItem, PictureItem, TextOf, WorkspaceText } from "../store/types";
import { pdfBytes } from "../../../../lib/pdf/reader";
import type { PagePlace } from "../../../../lib/pdf/layout";
import { pictureBytes } from "../../../../lib/picture/held";
import { readDrawn } from "./copyPaste";
import { readingOf } from "../document";
import { calcShowing, heldOutput, outputsToKeep, sha256Of } from "../../../../lib/calc/asks";
import { writeMenoFile } from "../../../../lib/doc/menoFileWriter";
import type { KeptData } from "../../../../lib/doc/menoFile";
import type { CalcSource } from "../../../../lib/calc/output";
import { readWorkflow, type SavedWorkflow } from "../workflow/saved";

export const WORKSPACE = "meno-workspace";
export const WORKSPACE_VERSION = 1;

/** What a workspace file holds, read. */
export type Workspace = {
  drawn: Drawn;
  /** The document's own drawing style; unset, the application's. */
  style?: StyleChoice;
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
export type SavedText = { name: string; sha256: string; text?: string; at?: { x: number; y: number }; reading?: false; icon?: true; of?: TextOf };

type Saved = Pick<
  EditorState,
  "model" | "arrows" | "pluses" | "captions" | "molecules3d" | "turns3d" | "frames3d" | "lists3d" | "docStyle" | "aromaticEnabled" | "aromaticRings"
> &
  Partial<Pick<EditorState, "sets" | "steps" | "wires" | "texts" | "textShown" | "textsOpen" | "pdfs" | "pdfShown" | "pictures">>;

/**
 * The canvas's molecules in 3D as a file carries them: each turned, and
 * showing the frame, as it is - and a calculation's promise it is showing
 * (a surface, a motion), given, as what it came to (lib/calc/asks).
 */
export function carriedOf(state: Pick<Saved, "molecules3d" | "turns3d" | "frames3d"> & Partial<Pick<Saved, "lists3d">>): Carried3D[] {
  return state.molecules3d.map(({ id, ...m }) => {
    const open = state.lists3d?.[id];
    return {
      ...m,
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
export function workspaceText(state: Saved, kept: ReadonlySet<string> = new Set(), texts: readonly string[] = []): string {
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
  return (
    JSON.stringify({
      format: WORKSPACE,
      version: WORKSPACE_VERSION,
      atoms: state.model.atoms,
      bonds: state.model.bonds,
      arrows: state.arrows,
      pluses: state.pluses,
      ...(state.captions.length ? { captions: state.captions } : {}),
      molecules3d,
      ...(state.sets?.length || state.steps?.length ? { sets: state.sets ?? [], steps: state.steps ?? [], wires: state.wires ?? [] } : {}),
      ...(state.docStyle ? { style: state.docStyle } : {}),
      ...(state.aromaticEnabled ? { aromaticEnabled: true } : {}),
      ...(Object.keys(state.aromaticRings).length ? { aromaticRings: state.aromaticRings } : {}),
      ...(state.texts?.length
        ? { texts: state.texts.map((t, i) => ({ name: t.name, sha256: texts[i], ...(t.at ? { at: t.at } : {}), ...(t.reading === false ? { reading: false } : {}), ...(t.icon ? { icon: true } : {}), ...ofSaved(t.of) })) }
        : {}),
      ...(shown >= 0 ? { textShown: shown } : {}),
      ...(state.pdfs?.length ? { pdfs: state.pdfs.map(({ id: _id, ...p }) => p) } : {}),
      ...(pdfShown >= 0 ? { pdfShown } : {}),
      ...(state.pictures?.length ? { pictures: state.pictures } : {}),
    }) + "\n"
  );
}

/** The canvas as its workspace file: its JSON, every output its molecules were read from that is held this session, and its texts. */
export async function workspaceFile(state: Saved): Promise<Uint8Array> {
  const sources = state.molecules3d.flatMap((m): CalcSource[] => (m.calc?.source ? [m.calc.source] : []));
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
    aromaticEnabled?: unknown;
    aromaticRings?: unknown;
    texts?: unknown;
    textShown?: unknown;
    pdfs?: unknown;
    pdfShown?: unknown;
  };
  if (r?.format !== WORKSPACE || r.version !== WORKSPACE_VERSION) return null;
  const drawn = readDrawn(data);
  if (!drawn) return null;
  const rings: Record<string, boolean> = {};
  if (typeof r.aromaticRings === "object" && r.aromaticRings) {
    for (const [k, v] of Object.entries(r.aromaticRings)) if (typeof v === "boolean") rings[k] = v;
  }
  const workflow = readWorkflow(data);
  const texts: SavedText[] = [];
  for (const t of Array.isArray(r.texts) ? (r.texts as Partial<SavedText>[]) : []) {
    if (typeof t?.name !== "string" || typeof t.sha256 !== "string" || !SHA.test(t.sha256)) continue;
    const at = t.at && Number.isFinite(t.at.x) && Number.isFinite(t.at.y) ? { at: { x: t.at.x, y: t.at.y } } : {};
    texts.push({ name: t.name.slice(0, 260), sha256: t.sha256, ...at, ...(t.reading === false ? { reading: false as const } : {}), ...(t.icon === true && at.at ? { icon: true as const } : {}), ...textOfRead(t.of) });
  }
  const shown = typeof r.textShown === "number" && Number.isInteger(r.textShown) && r.textShown >= 0 && r.textShown < texts.length;
  const pdfs = readPdfs(r.pdfs);
  const pdfShown = typeof r.pdfShown === "number" && Number.isInteger(r.pdfShown) && !!pdfs[r.pdfShown]?.reading;
  return {
    drawn,
    ...(workflow ? { workflow } : {}),
    ...(r.style != null ? { style: acceptStyleChoice(r.style) } : {}),
    aromaticEnabled: r.aromaticEnabled === true,
    aromaticRings: rings,
    texts,
    ...(shown ? { textShown: r.textShown as number } : {}),
    pdfs,
    ...(pdfShown ? { pdfShown: r.pdfShown as number } : {}),
  };
}

/** The PDFs a workspace's JSON lists, each as far as it reads: its file by SHA-256, its pages' sizes, its place, the page on top, where it was read. */
function readPdfs(v: unknown): Omit<PdfItem, "id">[] {
  const out: Omit<PdfItem, "id">[] = [];
  for (const p of Array.isArray(v) ? (v as Partial<PdfItem>[]) : []) {
    const pages = Array.isArray(p?.pages)
      ? p.pages.filter((s): s is [number, number] => Array.isArray(s) && s.length === 2 && s.every((n) => typeof n === "number" && Number.isFinite(n) && n > 0)).slice(0, 100_000)
      : [];
    if (typeof p?.name !== "string" || typeof p.sha256 !== "string" || !SHA.test(p.sha256) || !pages.length) continue;
    if (typeof p.x !== "number" || typeof p.y !== "number" || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    const page = Number.isInteger(p.page) && (p.page as number) >= 0 && (p.page as number) < pages.length ? (p.page as number) : 0;
    const r = p.reading as { at?: unknown; zoom?: unknown } | undefined;
    const reading = r && typeof r.at === "number" && typeof r.zoom === "number" ? readingOf({ at: r.at, zoom: r.zoom }, pages.length) : null;
    const placed = placedOf(p.placed, pages.length);
    out.push({
      name: p.name.slice(0, 260),
      sha256: p.sha256,
      pages,
      x: p.x,
      y: p.y,
      page,
      ...(p.spread === true ? { spread: true } : {}),
      ...(placed.length ? { placed } : {}),
      ...(p.icon === true ? { icon: true } : {}),
      ...(reading ? { reading } : {}),
    });
  }
  return out;
}

/** A PDF's pages put in places of their own, as far as they read: each a page it has, once - its last place - in the order they were put there. */
function placedOf(v: unknown, pages: number): PagePlace[] {
  const out: PagePlace[] = [];
  for (const q of Array.isArray(v) ? (v as Partial<PagePlace>[]) : []) {
    if (!Number.isInteger(q?.page) || (q.page as number) < 0 || (q.page as number) >= pages) continue;
    if (typeof q.x !== "number" || typeof q.y !== "number" || !Number.isFinite(q.x) || !Number.isFinite(q.y)) continue;
    const page = q.page as number;
    const had = out.findIndex((o) => o.page === page);
    if (had >= 0) out.splice(had, 1);
    out.push({ page, x: q.x, y: q.y });
  }
  return out;
}

const SHA = /^[0-9a-f]{64}$/;

/** Whether a file's name says it is a workspace. */
export const isWorkspaceFile = (name: string) => /\.meno$/i.test(name);
