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
import type { Carried3D, Drawn, EditorState, LostText, Member, Molecule3D, PdfItem, PictureItem, TextOf, WorkspaceText } from "../store/types";
import { collectionHash, setMembers } from "../workflow/entries";
import { pdfBytes } from "../../../../lib/pdf/reader";
import { readPdfsAt } from "./pdfItems";
import { anyLeftOut, leftOut, noting, type LeftOut } from "./readNotes";
import { pictureBytes } from "../../../../lib/picture/held";
import { placesRead, readDrawn } from "./copyPaste";
import { calcShowing, heldOutput, outputsToKeep, sha256Of } from "../../../../lib/calc/asks";
import { writeMenoFile } from "../../../../lib/doc/menoFileWriter";
import { readMenoFile, type KeptData, type KeptName, type MenoFile } from "../../../../lib/doc/menoFile";
import { readFile } from "@tauri-apps/plugin-fs";
import { markNotHad } from "../../../../lib/doc/notHad";
import { sha256Hex } from "../../../../lib/binary/sha256";
import type { CalcSource } from "../../../../lib/calc/output";
import { readWorkflow, type SavedWorkflow } from "../workflow/saved";
import { withKeptJobs, type JobsKept } from "../workflow/keptJobs";

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
  /** The texts it holds, as its file keeps them: each by its SHA-256 - and its words, once read (`readKept`). */
  texts: SavedText[];
  /** Which of them its column showed, by its place among them; none, it was closed. */
  textShown?: number;
  /** The PDFs on its page, each by its file's SHA-256 (docs/PDF.md), and where each read in its column was. */
  pdfs: Omit<PdfItem, "id">[];
  /** Which of them its column showed, by its place among them - a text, or none, if it showed none of them. */
  pdfShown?: number;
  /** What its file held that could not be read, and was left out (utils/readNotes); none where it read whole. */
  leftOut?: LeftOut;
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
  Partial<Pick<EditorState, "sets" | "steps" | "wires" | "texts" | "textsLost" | "textShown" | "textsOpen" | "pdfs" | "pdfShown" | "pictures" | "slides" | "shapes" | "inks" | "cycles" | "stacksShown" | "fullModel" | "recordsShown">>;

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
 * order). Each step's run says what the file keeps of its jobs (`jobs`,
 * workflow/keptJobs) - nothing, where the file keeps none of them.
 */
export function workspaceText(given: Saved, kept: ReadonlySet<string> = new Set(), texts: readonly string[] = [], jobs: JobsKept["records"] = new Map()): string {
  // (a result set kept out of the file: its molecules and its structures drawn not written, only how many it held and their hash - *Don't keep in the file*)
  const page = { model: given.model, molecules3d: given.molecules3d, pictures: given.pictures };
  const unkept = (given.sets ?? []).filter((b) => b.keep === false && b.made).map((b) => setMembers(page, b));
  const notKept = new Set(unkept.flatMap((m) => m.molecules));
  // (each structure whole, its bonds with it: a structure is its atoms bonded together, so none of its bonds goes to an atom kept)
  const atomsNotKept = new Set(unkept.flatMap((m) => m.structures.flat()));
  const kept3d = notKept.size ? { ...given, molecules3d: given.molecules3d.filter((m) => !notKept.has(m.id)) } : given;
  const without = <M extends Pick<Drawn, "atoms" | "bonds">>(m: M): M => ({ ...m, atoms: m.atoms.filter((a) => !atomsNotKept.has(a.id)), bonds: m.bonds.filter((b) => !atomsNotKept.has(b.a)) });
  const state = atomsNotKept.size ? { ...kept3d, model: without(given.model), ...(given.fullModel ? { fullModel: without(given.fullModel) } : {}) } : kept3d;
  const moleculeAt = new Map(state.molecules3d.map((m, i) => [m.id, i]));
  const pictureAt = new Map((state.pictures ?? []).map((p, i) => [p.id, i]));
  // (each set's members by what a file can say them by: a structure by its atoms' ids, kept; a molecule or a picture by its place in its list)
  // (the atoms a step put on the page, of those written: one not written - a set kept out of the file - could be another's once the file is opened and numbering goes on)
  const written = new Set((state.fullModel ?? state.model).atoms.map((a) => a.id));
  const savedSets = (state.sets ?? []).map(({ members, collection, drawnCollection, put, ...set }) => {
    const putWritten = put?.filter((id) => written.has(id));
    const b = putWritten?.length ? { ...set, put: putWritten } : set;
    if (b.keep === false && b.made) return { ...b, notKept: { count: collection?.length ?? (members?.length ?? 0) + (drawnCollection?.length ?? 0), hash: collectionHash(page, { ...b, members, collection, drawnCollection }) } };
    // (a large result set's collection: written as its molecules are, in the step's order - or its structures drawn, each as it holds it)
    if (collection) return { ...b, members: [], collection: collection.map((m) => outputKept(m, kept)) };
    const saved = (members ?? []).flatMap((m): Member[] => {
      if ("structure" in m) return [m];
      if ("molecule" in m) return moleculeAt.has(m.molecule) ? [{ molecule: moleculeAt.get(m.molecule)! }] : [];
      return pictureAt.has(m.picture) ? [{ picture: pictureAt.get(m.picture)! }] : [];
    });
    // (structures drawn it holds off the page - those it does not show - each as it holds it, beside those on the page among its members)
    return { ...(members ? { ...b, members: saved } : b), ...(drawnCollection ? { drawnCollection } : {}) };
  });
  const molecules3d = carriedOf(state).map((m) => outputKept(m, kept));
  const pdfShown = state.textsOpen && state.pdfShown != null ? (state.pdfs?.findIndex((p) => p.id === state.pdfShown) ?? -1) : -1;
  // (a text that could not be read among them, after them: shown as it was, by its place in the column)
  const column = [...(state.texts ?? []), ...(state.textsLost ?? [])];
  const shown = state.textsOpen && pdfShown < 0 ? column.findIndex((t) => t.id === state.textShown) : -1;
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
      ...(state.sets?.length || state.steps?.length ? { sets: savedSets, steps: withKeptJobs(state.steps ?? [], jobs), wires: state.wires ?? [] } : {}),
      ...(state.docStyle ? { style: state.docStyle } : {}),
      // (its styles in 3D, each whole: it opens the same on any computer)
      ...(state.docStyle3d ? { style3d: state.docStyle3d } : {}),
      ...(state.aromaticEnabled ? { aromaticEnabled: true } : {}),
      ...(Object.keys(aromatic).length ? { aromaticRings: aromatic } : {}),
      // (and those that could not be read, after them, as the file named them: by what they are known by, which it does not hold - so that, opened again, they are named again)
      ...(column.length
        ? { texts: column.map((t, i) => ({ name: t.name, sha256: "sha256" in t ? t.sha256 : texts[i], ...(t.at ? { at: t.at } : {}), ...(t.point != null ? { point: t.point } : {}), ...(t.reading === false ? { reading: false } : {}), ...(t.icon ? { icon: true } : {}), ...ofSaved(t.of) })) }
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

/** A molecule as a file says it: the output it was read from, where the file keeps it, not said to be anywhere else. */
function outputKept<M extends Pick<Molecule3D, "calc">>(m: M, kept: ReadonlySet<string>): M {
  if (!m.calc?.source?.path || !kept.has(m.calc.source.sha256)) return m;
  const { path: _, ...source } = m.calc.source;
  return { ...m, calc: { ...m.calc, source } };
}

/**
 * A workspace's file as Save writes it: its bytes, and the files it has
 * that could not be had to keep - each by its name; and whether the file it
 * was last saved to may hold something of those still (`lastHolds`): it has
 * one of them in it, damaged, or it does not read as a workspace at all -
 * so that, saved over, it is kept beside the new one (fileActions).
 */
export type SavedFile = { bytes: Uint8Array; notKept: string[]; lastHolds: boolean };

/**
 * The canvas as its workspace file: its JSON, every output its molecules
 * were read from that can be had - held this session, or where it was -
 * its texts, its PDFs and its pictures. One not held - a PDF Meno could not
 * open, a picture or an output held nowhere - is taken from the file the
 * canvas was last saved to, or opened from (`savedPath`), where that holds
 * it whole: read before the new file takes its place, and only where
 * something would else be left out, so that a save never drops a file
 * still to be had. One to be had from nowhere - damaged, or in neither -
 * is not kept, and named (`notKept`): the workspace is saved without it,
 * so that nothing new is lost for it, and its JSON still has it where it
 * lay - by what it is known by, which its file does not hold - so that,
 * opened again, it is named again, never taken for one that is there.
 * Given what a save keeps of its steps' jobs (`jobs`, workflow/keptJobs):
 * those of them not on this computer, and a list of those that are, whose
 * bytes are added from the disk as it is written (src-tauri keptjobs.rs).
 */
export async function workspaceFile(state: Saved & { savedPath?: string | null }, jobs?: JobsKept): Promise<SavedFile> {
  // (the outputs they were read from, and the wavefunctions kept with them)
  // (a large result set's molecules too: they are on no page - WorkflowSet.collection)
  const molecules = [...state.molecules3d, ...(state.sets ?? []).flatMap((b) => (b.keep === false ? [] : (b.collection ?? [])))];
  const sources = molecules.flatMap((m): CalcSource[] => [m.calc?.source, m.calc?.wavefunction].filter((s): s is CalcSource => !!s));
  const outputs = await outputsToKeep(sources);
  const texts = await textsToKeep(state.texts ?? []);
  const pdfs = await pdfsToKeep(state.pdfs ?? []);
  const pictures = picturesToKeep(state.pictures ?? []);
  const lost = await lostToKeep(state.textsLost ?? [], new Set([...outputs.kept, ...texts].map((k) => k.sha256)));
  const wanting: KeptName[] = [
    ...outputs.notKept.map((s) => ({ sha256: s.sha256, name: s.name, ...(s.kind ? { kind: s.kind } : {}), media: "text/plain" })),
    ...lost.notKept,
    ...pdfs.notKept,
    ...pictures.notKept,
  ];
  const { carried, holds } = wanting.length ? await carriedFrom(state.savedPath ?? null, wanting) : { carried: [], holds: false };
  const had = new Set(carried.map((c) => c.sha256));
  // (an output kept, carried or held, is said to be nowhere else)
  const keptOutputs = new Set([...outputs.kept.map((k) => k.sha256), ...outputs.notKept.map((s) => s.sha256).filter((h) => had.has(h))]);
  const bytes = await writeMenoFile(
    workspaceText(state, keptOutputs, texts.map((t) => t.sha256), jobs?.records),
    [...outputs.kept, ...texts, ...lost.kept, ...pdfs.kept, ...pictures.kept, ...carried, ...(jobs?.carried ?? [])],
    jobs?.listed ?? [],
  );
  const notKept = wanting.filter((w) => !had.has(w.sha256));
  return { bytes, notKept: notKept.map((w) => w.name), lastHolds: notKept.length > 0 && holds };
}

/**
 * Of the files a workspace has that are held nowhere this session, each
 * that the workspace file at `path` - the one it was last saved to, or
 * opened from - holds whole, as that file has it (lib/doc/menoFile: what
 * its CRC-32 and its SHA-256 say), kept as it is known here; none where
 * there is no such file, or it is not one that reads. It is read as the
 * canvas reads and writes it - within the files Meno may reach, as Open or
 * Save gave them. And whether that file may still hold something of one
 * it does not hold whole (`holds`): it has it in it, damaged; or it is
 * there but does not read as a workspace.
 */
async function carriedFrom(path: string | null, wanting: readonly KeptName[]): Promise<{ carried: KeptData[]; holds: boolean }> {
  if (!path || !isWorkspaceFile(path)) return { carried: [], holds: false };
  let bytes: Uint8Array;
  try {
    bytes = await readFile(path);
  } catch {
    // (not there, or not to be read: nothing of it to keep)
    return { carried: [], holds: false };
  }
  let file: MenoFile;
  try {
    file = readMenoFile(bytes);
  } catch {
    return { carried: [], holds: true };
  }
  const carried: KeptData[] = [];
  let holds = false;
  for (const w of wanting) {
    const data = file.data(w.sha256);
    if (data) carried.push({ ...w, data });
    else if (file.holds(w.sha256)) holds = true;
  }
  return { carried, holds };
}

/**
 * What Save says of the files a workspace has that it could not keep, each
 * named (`workspaceFile`'s `notKept`) - none where it kept them all; and,
 * where the file saved over was kept beside the new one, as what (`kept`,
 * its name).
 */
export function notKeptSaid(names: readonly string[], kept?: string | null): string | null {
  if (!names.length) return null;
  const listed = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  const said = names.length === 1 ? `Saved, but ${listed} is not in the file: it could not be read.` : `Saved, but ${listed} are not in the file: they could not be read.`;
  return kept ? `${said} The file as it was is kept beside it as ${kept}.` : said;
}

/** The pictures as a workspace's file keeps them: each image as it is, once - those held this session (lib/picture/held); and those not. */
function picturesToKeep(pictures: readonly PictureItem[]): { kept: KeptData[]; notKept: KeptName[] } {
  const seen = new Map<string, PictureItem>();
  for (const p of pictures) if (!seen.has(p.sha256)) seen.set(p.sha256, p);
  const kept: KeptData[] = [];
  const notKept: KeptName[] = [];
  for (const p of seen.values()) {
    const data = pictureBytes(p.sha256);
    if (data) kept.push({ sha256: p.sha256, name: p.name, media: p.media, data });
    else notKept.push({ sha256: p.sha256, name: p.name, media: p.media });
  }
  return { kept, notKept };
}

/** The PDFs as a workspace's file keeps them: each as it was, once, read from where Meno holds it (lib/pdf/reader); and those it holds no more. */
async function pdfsToKeep(pdfs: readonly PdfItem[]): Promise<{ kept: KeptData[]; notKept: KeptName[] }> {
  const seen = new Map<string, string>();
  for (const p of pdfs) if (!seen.has(p.sha256)) seen.set(p.sha256, p.name);
  const read = await Promise.all(
    [...seen].map(async ([sha256, name]) => {
      const data = await pdfBytes(sha256).catch(() => null);
      // (held where Meno keeps its PDFs, on the disk: kept only if it is still what its SHA-256 says - never a damaged copy saved as fine)
      if (data && sha256Hex(data) === sha256) return { sha256, name, data };
      if (data) markNotHad(sha256);
      return { sha256, name, data: null };
    }),
  );
  return {
    kept: read.flatMap(({ sha256, name, data }) => (data ? [{ sha256, name, media: "application/pdf", data }] : [])),
    notKept: read.filter((r) => !r.data).map((r) => ({ sha256: r.sha256, name: r.name, media: "application/pdf" })),
  };
}

/**
 * The texts that could not be read as a workspace's file keeps them: each
 * whose words are held this session after all, by its SHA-256 (lib/calc/
 * asks), or kept already (`keptAlready`: an output's, a text's of the same
 * words); and those not. Their words are not taken into the workspace -
 * each opens again as a text, its words read, from the file saved.
 */
async function lostToKeep(lost: readonly LostText[], keptAlready: ReadonlySet<string>): Promise<{ kept: KeptData[]; notKept: KeptName[] }> {
  const kept: KeptData[] = [];
  const notKept: KeptName[] = [];
  const encoder = new TextEncoder();
  for (const t of new Map(lost.map((x) => [x.sha256, x])).values()) {
    if (keptAlready.has(t.sha256)) continue;
    const held = await heldOutput(t.sha256);
    if (held) kept.push({ sha256: t.sha256, name: t.name, media: "text/plain", data: encoder.encode(held.text) });
    else notKept.push({ sha256: t.sha256, name: t.name, media: "text/plain" });
  }
  return { kept, notKept };
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
 * asks) - each with its words - and its pictures looked at: what could not
 * be read named (`missing`). A text that cannot be stays, without words,
 * and opens as one that could not be read (store/types `LostText`); a
 * picture stays where it lay, marked as not had (lib/doc/notHad) until it
 * is had again.
 */
export async function readKept(ws: Workspace): Promise<{ ws: Workspace; missing: string[] }> {
  const read = await Promise.all(ws.texts.map(async (t) => ({ ...t, text: t.text ?? (await heldOutput(t.sha256))?.text })));
  return {
    ws: { ...ws, texts: read },
    missing: [...read.filter((t) => t.text == null).map((t) => t.name), ...picturesNotHad(ws.drawn.pictures ?? [])],
  };
}

/** Of a workspace's pictures, each image not to be had - each marked so, and named once. */
function picturesNotHad(pictures: readonly Pick<PictureItem, "sha256" | "name">[]): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const p of pictures) {
    if (seen.has(p.sha256)) continue;
    seen.add(p.sha256);
    // (read now, as it would be to be drawn: one its file holds damaged, or does not hold, is not had)
    if (pictureBytes(p.sha256)) continue;
    markNotHad(p.sha256);
    names.push(p.name);
  }
  return names;
}

/**
 * The files a workspace's JSON says it keeps, as it names them - each
 * output its molecules were read from, its texts, its PDFs and its
 * pictures: what its file's own list says of them where that list is
 * damaged or gone (lib/doc/menoFile `readMenoFile`); none where it does
 * not read.
 */
export function keptNamedIn(text: string): KeptName[] {
  const ws = readWorkspace(text);
  if (!ws) return [];
  const sources = (ws.drawn.molecules3d ?? []).flatMap((m) => [m.calc?.source, m.calc?.wavefunction].filter((s): s is CalcSource => !!s));
  return [
    ...sources.map((s) => ({ sha256: s.sha256, name: s.name, ...(s.kind ? { kind: s.kind } : {}), media: "text/plain" })),
    ...ws.texts.map((t) => ({ sha256: t.sha256, name: t.name, media: "text/plain" })),
    ...ws.pdfs.map((p) => ({ sha256: p.sha256, name: p.name, media: "application/pdf" })),
    ...(ws.drawn.pictures ?? []).map((p) => ({ sha256: p.sha256, name: p.name, media: p.media })),
  ];
}

/** A workspace's JSON read, or null where `text` is not one this version reads. */
/** What a saved text is the text of, as a file says: a step's id, or a molecule's place - anything else, nothing. */
function textOfRead(v: unknown): { of?: TextOf } {
  const o = v as { step?: unknown; molecule?: unknown; jobs?: unknown; job?: unknown } | null | undefined;
  if (Number.isInteger(o?.step)) {
    // (a step's log of several jobs: their ids - as jobs are named - and the one shown, where they read)
    const jobs = Array.isArray(o!.jobs) && o!.jobs.length > 1 && o!.jobs.every((j) => typeof j === "string" && /^[A-Za-z0-9._-]{1,80}$/.test(j)) ? (o!.jobs as string[]) : null;
    const job = jobs && Number.isInteger(o!.job) && (o!.job as number) >= 0 && (o!.job as number) < jobs.length ? (o!.job as number) : 0;
    return { of: { step: o!.step as number, ...(jobs ? { jobs, job } : {}) } };
  }
  if (Number.isInteger(o?.molecule) && (o!.molecule as number) >= 0) return { of: { molecule: o!.molecule as number } };
  return {};
}

export function readWorkspace(text: string): Workspace | null {
  const { value, left } = noting(() => readWorkspaceNoting(text));
  return value && anyLeftOut(left) ? { ...value, leftOut: left } : value;
}

function readWorkspaceNoting(text: string): Workspace | null {
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
    // (one of a molecule or a picture not read is left out with it, and said)
    if ("molecule" in m) {
      const k = places.molecules3d.indexOf(m.molecule);
      return k < 0 ? (leftOut("member"), []) : [{ molecule: k + 1 }];
    }
    const k = places.pictures.indexOf(m.picture);
    return k < 0 ? (leftOut("member"), []) : [{ picture: k + 1 }];
  };
  const workflow = read && r.version === 2 ? { ...read, sets: read.sets.map((b) => (b.members ? { ...b, members: b.members.flatMap(asOpened) } : b)) } : read;
  const texts: SavedText[] = [];
  // (each text by its place in the file's list: the one shown is said by it - never another's, where one before it does not read)
  const textAt = new Map<number, number>();
  for (const [i, t] of (Array.isArray(r.texts) ? (r.texts as Partial<SavedText>[]) : []).entries()) {
    if (typeof t?.name !== "string" || typeof t.sha256 !== "string" || !SHA.test(t.sha256)) {
      leftOut("text");
      continue;
    }
    const at = t.at && Number.isFinite(t.at.x) && Number.isFinite(t.at.y) ? { at: { x: t.at.x, y: t.at.y } } : {};
    // (a molecule it is of, by its place in the file's list - as the molecules that read are placed; one that did not, of none, and said)
    const of = textOfRead(t.of).of;
    const ofMolecule = of && "molecule" in of ? places.molecules3d.indexOf(of.molecule) : null;
    if (t.of != null && (!of || ofMolecule === -1)) leftOut("textOf");
    const ofRead = of && ofMolecule == null ? { of } : ofMolecule != null && ofMolecule >= 0 ? { of: { molecule: ofMolecule } } : {};
    textAt.set(i, texts.length);
    texts.push({ name: t.name.slice(0, 260), sha256: t.sha256, ...at, ...(typeof t.point === "number" && t.point > 0 && Number.isFinite(t.point) ? { point: t.point } : {}), ...(t.reading === false ? { reading: false as const } : {}), ...(t.icon === true && at.at ? { icon: true as const } : {}), ...ofRead });
  }
  const textShown = Number.isInteger(r.textShown) ? textAt.get(r.textShown as number) : undefined;
  const pdfsAt = readPdfsAt(r.pdfs);
  const pdfs = pdfsAt.map(({ pdf }) => pdf);
  const pdfShownAt = Number.isInteger(r.pdfShown) ? pdfsAt.findIndex(({ at }) => at === r.pdfShown) : -1;
  const pdfShown = pdfShownAt >= 0 && !!pdfs[pdfShownAt].reading;
  return {
    drawn,
    ...(workflow ? { workflow } : {}),
    ...(style !== undefined ? { style } : {}),
    ...(acceptWorkspace3d(r.style3d) ? { style3d: acceptWorkspace3d(r.style3d)! } : {}),
    aromaticEnabled: r.aromaticEnabled === true,
    aromaticRings: rings,
    texts,
    ...(textShown != null ? { textShown } : {}),
    pdfs,
    ...(pdfShown ? { pdfShown: pdfShownAt } : {}),
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
