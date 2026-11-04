/**
 * What a copy takes and puts on the clipboard, and what a paste makes of
 * what it finds there - pure, over the editor's model (the clipboard
 * itself is lib/clipboard).
 */
import { ATOM_NUMBER_KINDS, type AtomNumberKind } from "./atomNumbers";
import { readBiopolymer } from "../../../../lib/chem/biopolymer";
import { propertiesIn } from "../../../../lib/entry";
import type { ClipItem } from "../../../../lib/clipboard";
import { MARK_REACH, pushAtoms } from "../document";
import { fillsAmong } from "./rings";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { PICTURE_MEDIA, type PictureMedia } from "../../../../lib/picture/image";
import { writeMolfile, writeMolfile3d } from "../../../../lib/chem/molWriter";
import { arrowPoints } from "../../../../lib/chem/reactionScheme";
import { ARROW_KINDS, ARROW_SETTINGS, WEIGHT_SHARE, type ArrowLook } from "../../../../lib/chem/reactionArrow";
import { acceptValue, fieldOf, isTypefaceName } from "../../../../lib/chem/styleFields";
import { fragmentOf, partOf } from "../chem/cleanUp";
import { forFlatReaders } from "../chem/drawing";
import { notOneReaction, reactionFileText } from "../chem/reactionFile";
import { marksOf, stylesOf, WORDS_SIZE_RANGE, WORDS_SPACING_RANGE, type WordsMark } from "../../../../lib/chem/captions";
import { isBox, moved as shapeMoved, roundedBeforePt, SHAPE_KINDS, type ShapeKind } from "../../../../lib/chem/shapes";
import { strokeMoved, strokesBounds } from "../../../../lib/chem/ink";
import { readInkPiece } from "./inkRecord";
import type { Arrow, Atom, AtomStack, Bond, Caption, Carried3D, CarriedList, Drawn, FigureSpot, Measure3D, Molecule3D, PictureItem, Plus, PushArrow, PushEnd, Sel, Shape, Ink, Slide, Turn3D, Unsure, WordsFrom } from "../store/types";
import type { Cycle, CycleBranch } from "../../../../lib/chem/cycle";
import { restyled } from "../restyle";
import { asSeen, bondsAt } from "./molecule3d";
import { imaginaryOf, readCalc, UNMARKED, type Unmarked } from "../../../../lib/calc/output";
import { readWorkflow } from "../workflow/saved";
import { partsBounds } from "../workflow/parts";
import { readPdfs } from "./pdfItems";
import { pdfBounds, POINT, pointFor } from "../../../../lib/pdf/layout";
import { drawnSheetBox } from "./textSheets";
import { greatest, least } from "../../../../lib/chem/lists";
import { magnificationWithin } from "./magnified";
import { isSkeleton } from "./completeness";
import type { Style3D } from "../../../../lib/chem/style3d";
import { failureKindOf, WORDS_MOST, type Failure } from "../workflow/failures";
import { convergedIn, type Converged } from "../workflow/converged";
import { anyLeftOut, leftOut, noting, readEach } from "./readNotes";

type Pt = { x: number; y: number };

/**
 * What a copy takes: the selected atoms and every bond among them, with
 * the arrows and "+" signs drawn among them - within half a bond of the box
 * round them - or, with nothing selected, the whole structure `around` an
 * atom (the one under the pointer). Null when that is nothing.
 */
export function partToCopy(drawn: Drawn, sel: Sel, around: number | null): Drawn | null {
  const model = { atoms: drawn.atoms, bonds: drawn.bonds };
  // (the atoms drawn, by id: each selected looked up, not sought among them all)
  const drawnAtoms = new Set(model.atoms.map((a) => a.id));
  const atoms = sel.atoms.size
    ? new Set([...sel.atoms].filter((id) => drawnAtoms.has(id)))
    : around != null && drawnAtoms.has(around)
      ? fragmentOf(model, around)
      : new Set<number>();
  if (!atoms.size) return null;
  // (the electron-pushing arrows wholly on it, and the fills of the rings it holds whole, with it)
  const drawnBonds = drawn.pushes?.length ? new Set(model.bonds.map((b) => b.id)) : null;
  const pushes = (drawn.pushes ?? []).filter((p) => pushAtoms({ model }, p).every((id) => atoms.has(id)) && [p.from, p.to].every((e) => !("bond" in e) || !!drawnBonds?.has(e.bond)));
  const fills = fillsAmong(drawn.ringFills, atoms);
  const part = { ...partOf(model, atoms), ...(pushes.length ? { pushes } : {}), ...(Object.keys(fills).length ? { ringFills: fills } : {}) };
  if (!sel.atoms.size) return part;
  const { arrows, pluses, captions } = schemeAmong(drawn, atoms);
  return {
    ...part,
    ...(arrows.length ? { arrows } : {}),
    ...(pluses.length ? { pluses } : {}),
    ...(captions.length ? { captions } : {}),
  };
}

/** Where words taken out of a PDF came from, as far as it reads: its SHA-256, and two places in it. */
function wordsFromOf(v: unknown): WordsFrom | null {
  const f = v as Partial<WordsFrom> | undefined;
  const place = (p: unknown) => {
    const q = p as { page?: unknown; at?: unknown } | undefined;
    return q && Number.isInteger(q.page) && Number.isInteger(q.at) && (q.page as number) >= 0 && (q.at as number) >= 0 ? { page: q.page as number, at: q.at as number } : null;
  };
  const from = place(f?.from);
  const to = place(f?.to);
  return f && typeof f.sha256 === "string" && /^[0-9a-f]{64}$/.test(f.sha256) && from && to ? { sha256: f.sha256, from, to } : null;
}

/**
 * The arrows, "+" signs and words drawn among the atoms `ids`: within half
 * a bond of the box round them, an arrow from end to end, words by their
 * middle - or over an arrow that is. What goes with a selection that is
 * copied, cut, deleted or moved.
 */
export function schemeAmong(drawn: Drawn, ids: Set<number>): { arrows: Arrow[]; pluses: Plus[]; captions: Caption[] } {
  // (the box round them, found once - not again for each point tried)
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const a of drawn.atoms) {
    if (!ids.has(a.id)) continue;
    x0 = Math.min(x0, a.x);
    x1 = Math.max(x1, a.x);
    y0 = Math.min(y0, a.y);
    y1 = Math.max(y1, a.y);
  }
  if (x0 > x1) return { arrows: [], pluses: [], captions: [] };
  const reach = NOMINAL_BOND_LENGTH / 2;
  const within = (p: Pt) => p.x >= x0 - reach && p.x <= x1 + reach && p.y >= y0 - reach && p.y <= y1 + reach;
  // (its ends and the corners it turns at, all of them)
  const arrows = (drawn.arrows ?? []).filter((a) => arrowPoints(a).every(within));
  const taken = new Set(arrows.map((a) => a.id));
  return {
    arrows,
    pluses: (drawn.pluses ?? []).filter(within),
    captions: (drawn.captions ?? []).filter((c) => within(c) || (c.arrow != null && taken.has(c.arrow))),
  };
}


/**
 * Whether a copy holds what a picture draws - a structure, molecules in 3D,
 * or words, shapes, writing by hand, arrows, "+" signs and catalytic cycles alone (the
 * maintainer's docs/PRESENTING.md: a slide's content goes into pictures, so
 * that it pastes into slides software and word processors). Slides, PDFs,
 * texts' sheets and pictures on the page are not drawn in one.
 */
export function drawsPicture(p: Pick<Drawn, "atoms" | "molecules3d" | "captions" | "shapes" | "inks" | "arrows" | "pluses" | "pushes" | "cycles">): boolean {
  return !!(p.atoms.length || p.molecules3d?.length || p.captions?.length || p.shapes?.length || p.inks?.length || p.arrows?.length || p.pluses?.length || p.pushes?.length || p.cycles?.length);
}

/** Meno's own record of a structure on the clipboard, and its version. */
const RECORD = "meno-structure";
const VERSION = 1;

/**
 * What a copy puts on the clipboard: Meno's own record, which loses
 * nothing - labels, wedges' ends, a drawing in perspective, a reaction's
 * arrow and "+" signs - and a MOL file for other chemistry programs, as a
 * saved file has it; for a reaction, an RXN file too.
 */
export function clipItems(part: Drawn): ClipItem[] {
  // molecules in 3D alone: a molfile in 3D, as they are seen
  if (!part.atoms.length) {
    const ms = part.molecules3d ?? [];
    // (a workflow's parts, pictures, PDFs, texts' sheets or slides, alone: Meno's record, which no other program reads)
    if (!ms.length) return hasFlow(part) || part.pictures?.length || part.captions?.length || part.pdfs?.length || part.sheets?.length || part.slides?.length || part.shapes?.length || part.inks?.length || part.cycles?.length ? [{ flavor: "meno", text: recordText(part) }] : [];
    const placed = ms.length > 1;
    // (a skeleton - its hydrogens not there - written as one: its atoms' valences set, so that no reader adds any)
    const seen = ms.map((m) => (isSkeleton(m) ? asSeen(m, m.turn, m.frame, placed).map((a) => ({ ...a, noImplicitH: true })) : asSeen(m, m.turn, m.frame, placed)));
    const offsets = seen.map((_, i) => seen.slice(0, i).reduce((n, a) => n + a.length, 0));
    return [
      { flavor: "meno", text: recordText(part) },
      {
        flavor: "mol",
        text: writeMolfile3d(
          seen.flat(),
          // (each with the bonds the frame it shows has)
          ms.flatMap((m, i) => bondsAt(m, m.frame).map((b) => ({ a1: b.a1 + offsets[i], a2: b.a2 + offsets[i], order: b.order }))),
          { title: ms.length === 1 ? ms[0].name?.replace(/\.[^.]*$/, "") : undefined },
        ),
      },
    ];
  }
  return [
    { flavor: "meno", text: recordText(part) },
    { flavor: "mol", text: writeMolfile(forFlatReaders(part)) },
    ...(notOneReaction(part) ? [] : [{ flavor: "rxn" as const, text: reactionFileText(part) }]),
  ];
}

/**
 * Meno's own record of a structure, as text: what a picture of it carries
 * too. A reaction's arrows and pluses go with it, where it has them; a
 * reader that knows nothing of them reads the structures.
 */
export function recordText(part: Drawn): string {
  return JSON.stringify({
    format: RECORD,
    version: VERSION,
    ...(part.bondPt ? { bondPt: part.bondPt } : {}),
    ...(part.labelPt ? { labelPt: part.labelPt } : {}),
    atoms: part.atoms,
    bonds: part.bonds,
    ...(part.pushes?.length ? { pushes: part.pushes } : {}),
    ...(part.ringFills && Object.keys(part.ringFills).length ? { ringFills: part.ringFills } : {}),
    ...(part.arrows?.length ? { arrows: part.arrows } : {}),
    ...(part.pluses?.length ? { pluses: part.pluses } : {}),
    ...(part.captions?.length ? { captions: part.captions } : {}),
    ...(part.molecules3d?.length ? { molecules3d: part.molecules3d } : {}),
    ...(hasFlow(part) ? { flow: part.flow } : {}),
    ...(part.pictures?.length ? { pictures: part.pictures } : {}),
    ...(part.slides?.length ? { slides: part.slides } : {}),
    ...(part.shapes?.length ? { shapes: part.shapes } : {}),
    ...(part.inks?.length ? { inks: part.inks } : {}),
    ...(part.cycles?.length ? { cycles: part.cycles } : {}),
    // (PDFs as they lie, by their SHA-256 - not where they were read; texts' sheets with their words)
    ...(part.pdfs?.length ? { pdfs: part.pdfs.map(({ id: _, reading: _r, ...p }) => p) } : {}),
    ...(part.sheets?.length ? { sheets: part.sheets.map((t) => ({ name: t.name, text: t.text, at: t.at, ...(t.icon ? { icon: true } : {}) })) } : {}),
  });
}

/** Whether a copy carries any of a workflow's parts. */
export const hasFlow = (part: Pick<Drawn, "flow">) => !!(part.flow?.sets.length || part.flow?.steps.length);

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
/** Whether an entry of a list a record holds is an object, as each must be to be read at all - not null, a list, a number, a string or true or false. */
const isEntry = (v: unknown): boolean => typeof v === "object" && v !== null && !Array.isArray(v);
/** A colour as Meno keeps one: #rrggbb. */
export const isColour = (v: unknown): v is string => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);

/** The most corners an arrow is read with. */
const CORNERS_MOST = 64;

/**
 * What an arrow sets for itself, as a file gives it: only the arrow's own
 * settings, each as Settings takes it - within the range Settings allows
 * (lib/chem/styleFields `acceptValue`); null where none reads. Taken as it
 * was, a setting of null, or a bare number, broke every picture of the
 * arrow and the canvas's, and a line far thinner than the least drew dashes
 * without end.
 */
function arrowLookOf(look: unknown): ArrowLook | null {
  if (typeof look !== "object" || look === null) return null;
  const out: Record<string, unknown> = {};
  for (const key of ARROW_SETTINGS) {
    const field = fieldOf(key);
    // (a length in bonds, within Settings' range for a bond of ACS 1996's 14.4 pt)
    const value = field ? acceptValue(field, (look as Record<string, unknown>)[key], 0) : undefined;
    if (value !== undefined) out[key] = value;
  }
  return Object.keys(out).length ? (out as ArrowLook) : null;
}

/** An arrow as it reads: its kind, heads, dashes, weight, corners, colour and what it sets for itself kept only where each is one Meno knows. */
function withArrowForm(a: Arrow): Arrow {
  const { kind, heads, full, dash, weight, corners, color, look, ...rest } = a;
  const own = arrowLookOf(look);
  const turns = Array.isArray(corners) ? corners.filter((c) => c && isNum(c.along) && isNum(c.across)).slice(0, CORNERS_MOST).map((c) => ({ along: c.along, across: c.across })) : [];
  return {
    ...rest,
    ...(ARROW_KINDS.includes(kind as never) ? { kind } : {}),
    ...(heads === 2 ? { heads: 2 as const } : {}),
    ...(full === true ? { full: true as const } : {}),
    ...(dash === true ? { dash: true as const } : {}),
    ...(weight && weight in WEIGHT_SHARE ? { weight } : {}),
    ...(turns.length ? { corners: turns } : {}),
    ...(isColour(color) ? { color } : {}),
    ...(own ? { look: own } : {}),
  };
}

/** The structure in Meno's own record, or null if `text` is not one this version reads. */
export function readRecord(text: string): Drawn | null {
  const { value, left } = noting(() => readRecordNoting(text));
  return value && anyLeftOut(left) ? { ...value, leftOut: left } : value;
}

function readRecordNoting(text: string): Drawn | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  const r = data as { format?: unknown; version?: unknown; pdfs?: unknown; sheets?: unknown; bondPt?: unknown; labelPt?: unknown };
  if (r?.format !== RECORD || r.version !== VERSION) return null;
  // (the bond's printed length in the style it was copied in, where it says: a record without one pastes as it is)
  const bondPt = isNum(r.bondPt) && r.bondPt > 0 ? r.bondPt : undefined;
  const drawn = readDrawn(data, bondPt ? pointFor(bondPt) : POINT);
  if (!drawn) return null;
  // (a copy's PDFs and texts' sheets: a workspace's file keeps its own, apart)
  const pdfs = readPdfs(r.pdfs).map((p, i) => ({ ...p, id: i + 1 }));
  const sheets = readEach(r.sheets, (v) => {
    const t = v as { name?: unknown; text?: unknown; at?: { x?: unknown; y?: unknown }; icon?: unknown } | null;
    return typeof t?.name === "string" && typeof t.text === "string" && isNum(t.at?.x) && isNum(t.at?.y)
      ? { name: t.name.slice(0, 260), text: t.text, at: { x: t.at.x, y: t.at.y }, ...(t.icon === true ? { icon: true as const } : {}) }
      : null;
  }, "text").map((t, i) => ({ id: i + 1, ...t }));
  const labelPt = isNum(r.labelPt) && r.labelPt > 0 ? r.labelPt : undefined;
  return { ...drawn, ...(bondPt ? { bondPt } : {}), ...(labelPt ? { labelPt } : {}), ...(pdfs.length ? { pdfs } : {}), ...(sheets.length ? { sheets } : {}) };
}

/**
 * Of a record's molecules in 3D and pictures, the places in its lists of
 * those that read, in order (as `readDrawn` reads them): what a workspace's
 * set members, saved by place, are matched by (utils/workspace).
 */
export function placesRead(data: unknown): { molecules3d: number[]; pictures: number[] } {
  const r = data as { molecules3d?: unknown; pictures?: unknown } | null;
  const places = (list: unknown, reads: (v: unknown) => unknown) => (Array.isArray(list) ? list.flatMap((v, i) => (reads(v) ? [i] : [])) : []);
  // (read again only to be placed: what they leave out is said where they are read for the page)
  return noting(() => ({ molecules3d: places(r?.molecules3d, readCarried3D), pictures: places(r?.pictures, readPicture) })).value;
}

/**
 * What is drawn, as Meno's own record and workspace file hold it: atoms and
 * bonds, arrows, pluses and molecules in 3D. Null where the atoms or bonds
 * do not read; what else does not read is left out. `pointPx`, the page's
 * units to the point in the style it was drawn in: what a shape saved before
 * shapes had a corner radius of their own is read by.
 */
export function readDrawn(data: unknown, pointPx = POINT): Drawn | null {
  const r = data as {
    format?: unknown;
    version?: unknown;
    atoms?: unknown;
    bonds?: unknown;
    pushes?: unknown;
    ringFills?: unknown;
    arrows?: unknown;
    pluses?: unknown;
    captions?: unknown;
    molecules3d?: unknown;
    flow?: unknown;
    pictures?: unknown;
    slides?: unknown;
    shapes?: unknown;
    inks?: unknown;
    cycles?: unknown;
  };
  if (!r || !Array.isArray(r.atoms) || !Array.isArray(r.bonds)) return null;
  const atoms = r.atoms as Partial<Atom>[];
  const bonds = r.bonds as Partial<Bond>[];
  // (an atom or a bond that is no object - null, a number - reads no more than one whose fields do not)
  if (!atoms.every((a) => isEntry(a) && isNum(a.id) && isNum(a.x) && isNum(a.y) && typeof a.el === "string")) return null;
  const ids = new Set(atoms.map((a) => a.id));
  if (!bonds.every((b) => isEntry(b) && isNum(b.id) && ids.has(b.a) && ids.has(b.b) && [1, 2, 3].includes(b.order as number))) {
    return null;
  }
  // (arrows and pluses that do not read are left out, not the structure)
  const arrows = readEach(r.arrows, (v) => {
    const a = v as Partial<Arrow>;
    return isEntry(a) && isNum(a.id) && isNum(a.x) && isNum(a.y) && isNum(a.angle) && isNum(a.length) ? withArrowForm(a as Arrow) : null;
  }, "arrow");
  const pluses = readEach(r.pluses, (v) => {
    const p = v as Partial<Plus>;
    return isEntry(p) && isNum(p.id) && isNum(p.x) && isNum(p.y) ? (p as Plus) : null;
  }, "plus");
  // (words over an arrow that is not there are over none)
  const arrowIds = new Set(arrows.map((a) => a.id));
  const shapes = readEach(r.shapes, (x) => readShape(x, pointPx), "shape");
  // (words written in a shape before 2026-10-19 - a shape is a shape now - words on the page as they were: where, as wide and as large, beside it)
  const captions = readEach(r.captions, (v): Caption | null => {
    const c = v as Partial<Caption>;
    if (!isEntry(c) || !isNum(c.id) || !isNum(c.x) || !isNum(c.y) || typeof c.text !== "string" || !c.text.trim()) return null;
    const from = wordsFromOf(c.from);
    // (words over an arrow not there are over none - and so said)
    if (c.arrow != null && !(isNum(c.arrow) && arrowIds.has(c.arrow))) leftOut("captionArrow");
    return (
      {
        id: c.id,
        x: c.x,
        y: c.y,
        text: c.text,
        ...(isNum(c.arrow) && arrowIds.has(c.arrow) ? { arrow: c.arrow } : {}),
        ...(isNum(c.width) && c.width > 0 ? { width: c.width } : {}),
        ...(c.align === "left" || c.align === "right" || c.align === "justify" ? { align: c.align } : {}),
        ...(from ? { from } : {}),
        // (its own size, within reason; its letters' marks where they read, inside its text - colours only as colours)
        ...(isNum(c.size) && c.size >= WORDS_SIZE_RANGE[0] && c.size <= WORDS_SIZE_RANGE[1] ? { size: c.size } : {}),
        // (its own typeface, where it is a typeface's name; its own line spacing, within reason)
        ...(typeof c.font === "string" && isTypefaceName(c.font) ? { font: c.font } : {}),
        ...(isNum(c.lines) && c.lines !== 1 && c.lines >= WORDS_SPACING_RANGE[0] && c.lines <= WORDS_SPACING_RANGE[1] ? { lines: c.lines } : {}),
        ...(() => {
          const marks = marksRead(c.marks, c.text.length);
          return marks.length ? { marks } : {};
        })(),
      }
    );
  }, "caption");
  const molecules3d = readEach(r.molecules3d, readCarried3D, "molecule3d");
  // (a workflow's parts, read as a workspace's are - what they did is a step's own, not a copy's)
  const read = r.flow ? readWorkflow(r.flow) : undefined;
  const flow = read ? { ...read, steps: read.steps.map(({ ran: _r, runs: _k, running: _g, ...s }) => s) } : undefined;
  const pictures = readEach(r.pictures, readPicture, "picture");
  // (slides where their place and size read, in their order)
  const slides = readEach(r.slides, (v): Slide | null => {
    const s = v as Partial<Slide> | null;
    return isNum(s?.id) && isNum(s.x) && isNum(s.y) && isNum(s.w) && isNum(s.h) && s.w > 0 && s.h > 0
      ? { id: s.id, x: s.x, y: s.y, w: s.w, h: s.h, ...(s.around === true ? { around: true as const } : {}) }
      : null;
  }, "slide");
  // (a mark put by hand where it reads as a place, else where the drawing puts it)
  const markAt = (p: unknown) => {
    const q = p as { x?: unknown; y?: unknown } | undefined;
    return q && isNum(q.x) && isNum(q.y) && Math.hypot(q.x, q.y) < MARK_REACH ? { x: q.x, y: q.y } : undefined;
  };
  const withMarks = <T extends { chargeAt?: unknown; stereoAt?: unknown; stereoShown?: unknown }>(x: T, keys: readonly ("chargeAt" | "stereoAt")[]): T => {
    const out = { ...x };
    for (const k of keys) {
      const at = markAt(x[k]);
      if (at) out[k] = at;
      else delete out[k];
    }
    // (its R or S - E or Z - shown: only where it says so plainly)
    if (x.stereoShown !== true) delete out.stereoShown;
    return out;
  };
  // (electron-pushing arrows whose ends read, on atoms and bonds it has)
  const bondIds = new Set(bonds.map((b) => b.id));
  const endOf = (e: unknown): PushEnd | null => {
    const x = e as { atom?: unknown; bond?: unknown; gap?: unknown } | null;
    if (!x) return null;
    if (isNum(x.atom) && ids.has(x.atom)) return { atom: x.atom };
    if (isNum(x.bond) && bondIds.has(x.bond)) return { bond: x.bond };
    if (Array.isArray(x.gap) && x.gap.length === 2 && x.gap.every((g) => isNum(g) && ids.has(g)) && x.gap[0] !== x.gap[1]) return { gap: [x.gap[0], x.gap[1]] };
    return null;
  };
  const pushes = readEach(r.pushes, (v): PushArrow | null => {
    const p = v as Partial<PushArrow>;
    if (!isEntry(p)) return null;
    const from = endOf(p.from);
    const to = endOf(p.to);
    if (!isNum(p.id) || !from || !to) return null;
    const bend = p.bend && isNum(p.bend.along) && isNum(p.bend.out) && Math.abs(p.bend.along) < 10 && Math.abs(p.bend.out) < 10 ? { along: p.bend.along, out: p.bend.out } : undefined;
    return { id: p.id, from, to, ...(p.half ? { half: true as const } : {}), ...(bend ? { bend } : {}), ...(p.noPair ? { noPair: true as const } : {}), ...(p.fromPair ? { fromPair: true as const } : {}), ...(isColour(p.color) ? { color: p.color } : {}) };
  }, "push");
  // (colours only as colours: what is not one is left out - it would go into a picture's markup)
  const withColours = <T extends { color?: unknown; highlight?: unknown }>(x: T): T => {
    const out = { ...x };
    for (const k of ["color", "highlight"] as const) if (!isColour(x[k])) delete out[k];
    return out;
  };
  // (where it was read from a figure, and what was unsure of it then, only where they read as such)
  const withRead = <T extends { seen?: unknown; unsure?: unknown }>(x: T): T => {
    const out = { ...x };
    const s = x.seen as Partial<FigureSpot> | undefined;
    if (!s || typeof s.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(s.sha256) || (s.page !== undefined && (!Number.isInteger(s.page) || (s.page as number) < 0)) || !isNum(s.x) || !isNum(s.y) || !isNum(s.bond) || s.bond <= 0) delete out.seen;
    // (said to be checked only where it was: utils/figureNotes)
    else if ("checked" in s && s.checked !== true) {
      const { checked: _not, ...kept } = s;
      out.seen = kept;
    }
    const u = x.unsure as Partial<Unsure> | undefined;
    if (!u || !Array.isArray(u.said) || !u.said.length || u.said.length > 8 || !u.said.every((t) => typeof t === "string" && t.length <= 400) || typeof u.as !== "string" || u.as.length > 4000) delete out.unsure;
    return out;
  };
  // (of a stack of drawings, its stack and record where they read - and only what of them does: utils/stacks)
  const withStack = <T extends { stack?: unknown }>(x: T): T => {
    const out = { ...x };
    const t = x.stack as Partial<Record<keyof AtomStack, unknown>> | undefined;
    if (!t || !Number.isInteger(t.id) || (t.id as number) < 1 || !Number.isInteger(t.record) || (t.record as number) < 0) delete out.stack;
    else
      out.stack = {
        id: t.id,
        record: t.record,
        ...(typeof t.title === "string" && t.title.trim() ? { title: t.title.slice(0, TITLE_MOST) } : {}),
        ...(t.spread === true ? { spread: true } : {}),
        ...(t.shown === true ? { shown: true } : {}),
      };
    return out;
  };
  // (how large its structure is shown, where it reads as such: docs/WORKSPACE.md, *Magnified display*)
  const withMagnified = <T extends { magnified?: unknown }>(x: T): T => {
    const out = { ...x };
    if (!isNum(x.magnified) || magnificationWithin(x.magnified) === 1) delete out.magnified;
    else out.magnified = magnificationWithin(x.magnified);
    return out;
  };
  // (a ring's fill where its key and its colour read)
  const ringFills = Object.fromEntries(
    Object.entries(r.ringFills && typeof r.ringFills === "object" ? (r.ringFills as Record<string, unknown>) : {}).filter(
      ([key, color]) => /^\d+(-\d+){2,}$/.test(key) && key.split("-").every((id) => ids.has(Number(id))) && isColour(color),
    ),
  ) as Record<string, string>;
  return {
    atoms: atoms.map((a) => withMagnified(withStack(withRead(withColours(withMarks({ r: 0.9, ...a }, ["chargeAt", "stereoAt"]))))) as Atom),
    bonds: bonds.map((b) => withRead(withColours(withMarks(b, ["stereoAt"])))) as Bond[],
    ...(pushes.length ? { pushes } : {}),
    ...(Object.keys(ringFills).length ? { ringFills } : {}),
    ...(arrows.length ? { arrows } : {}),
    ...(pluses.length ? { pluses } : {}),
    ...(captions.length ? { captions } : {}),
    ...(molecules3d.length ? { molecules3d } : {}),
    ...(flow ? { flow } : {}),
    ...(pictures.length ? { pictures } : {}),
    ...(slides.length ? { slides } : {}),
    ...(shapes.length ? { shapes } : {}),
    ...(() => {
      const cycles = readEach(r.cycles, readCycle, "cycle");
      return cycles.length ? { cycles } : {};
    })(),
    ...(() => {
      const inks = readEach(r.inks, readInk, "ink");
      return inks.length ? { inks } : {};
    })(),
  };
}

/** A piece of writing as a copy or a workspace carries it, where it reads: its pen, width and colour, and the strokes whose points read - three numbers to a point. */
function readInk(raw: unknown): Ink | null {
  const id = (raw as { id?: unknown } | null)?.id;
  const piece = isNum(id) ? readInkPiece(raw) : null;
  return piece && isNum(id) ? { id, ...piece } : null;
}

const COLOUR = /^#[0-9a-f]{6}$/i;
/** The longest a record's title is kept, in characters. */
const TITLE_MOST = 400;

/** A shape as a copy or a workspace carries it, where it reads: its kind and where it lies, its tail, and its look - what does not read left as a shape has it unsaid. */
/** A catalytic cycle read from a record: its middle, radius, way and arrows coming in and going out - those that do not read left out; none, where its place does not read. */
function readCycle(raw: unknown): Cycle | null {
  const c = raw as Partial<Record<keyof Cycle, unknown>> | null;
  if (!c || !isNum(c.id) || !isNum(c.x) || !isNum(c.y) || !isNum(c.r) || !(c.r > 0)) return null;
  const branches = (Array.isArray(c.branches) ? (c.branches as Partial<CycleBranch>[]) : []).filter((b): b is CycleBranch => isEntry(b) && isNum(b.at) && (b.way === "in" || b.way === "out"));
  return {
    id: c.id,
    x: c.x,
    y: c.y,
    r: c.r,
    ...(c.ccw === true ? { ccw: true as const } : {}),
    ...(branches.length ? { branches: branches.map((b) => ({ at: b.at, way: b.way })) } : {}),
    ...(typeof c.color === "string" && /^#[0-9a-f]{6}$/i.test(c.color) ? { color: c.color } : {}),
    ...(isNum(c.gap) && c.gap >= 0 ? { gap: c.gap } : {}),
    ...(isEntry(c.ends) && Object.values(c.ends as object).every(isNum) ? { ends: { ...(c.ends as Record<string, number>) } } : {}),
  };
}

/** The widest a shape's line reads as, in points. */
const WIDTH_MOST_PT = 72;

/**
 * A shape as saved - one saved before 2026-10-19 as a rounded rectangle, or
 * as a callout, a rectangle with its corners as they were drawn (`pointPx`,
 * the page's units to the point it was drawn at), a callout's tail let go.
 */
function readShape(raw: unknown, pointPx: number): Shape | null {
  const s = raw as Partial<Record<keyof Shape, unknown>> | null;
  const was = s?.kind === "rounded" || s?.kind === "callout";
  const kind = (was ? "rect" : s?.kind) as ShapeKind;
  if (!s || !isNum(s.id) || !SHAPE_KINDS.includes(kind) || !isNum(s.x0) || !isNum(s.y0) || !isNum(s.x1) || !isNum(s.y1)) return null;
  if (isBox(kind) ? !(s.x1 > s.x0 && s.y1 > s.y0) : s.x0 === s.x1 && s.y0 === s.y1) return null;
  const radius = was ? roundedBeforePt(s.x1 - s.x0, s.y1 - s.y0, pointPx) : kind === "rect" && isNum(s.radius) && s.radius > 0 ? s.radius : 0;
  return {
    id: s.id,
    kind,
    x0: s.x0,
    y0: s.y0,
    x1: s.x1,
    y1: s.y1,
    ...(radius > 0 ? { radius } : {}),
    ...(() => {
      // (its line's own width, in points - or, saved before 2026-10-19, its weight: thin 0.6, thick 2, regular as the bonds')
      const old = (s as { weight?: unknown }).weight;
      const width = isNum(s.width) && s.width > 0 && s.width <= WIDTH_MOST_PT ? s.width : old === "thin" ? 0.6 : old === "thick" ? 2 : null;
      return width ? { width } : {};
    })(),
    ...(s.dash === true ? { dash: true as const } : {}),
    ...(typeof s.stroke === "string" && (s.stroke === "none" || COLOUR.test(s.stroke)) ? { stroke: s.stroke.toLowerCase() } : {}),
    ...(typeof s.fill === "string" && COLOUR.test(s.fill) && isBox(kind) ? { fill: s.fill.toLowerCase() } : {}),
  };
}

/** Marks on a caption's letters as they read: within its `length` letters, each saying what it sets - bold, italics, a colour, raised or lowered - apart and in order. */
function marksRead(v: unknown, length: number): WordsMark[] {
  if (!Array.isArray(v)) return [];
  const read = (v as Partial<WordsMark>[]).flatMap((m): WordsMark[] => {
    if (!m || !Number.isInteger(m.from) || !Number.isInteger(m.to) || m.from! < 0 || m.to! > length || m.from! >= m.to!) return [];
    const style = {
      ...(m.bold === true ? { bold: true as const } : {}),
      ...(m.italic === true ? { italic: true as const } : {}),
      ...(isColour(m.color) ? { color: m.color } : {}),
      ...(m.script === "sup" || m.script === "sub" ? { script: m.script } : {}),
    };
    return Object.keys(style).length ? [{ from: m.from!, to: m.to!, ...style }] : [];
  });
  return marksOf(stylesOf(length, read));
}

/** A picture as a record or a workspace carries it, as far as it reads: what it is known by, what it is, its size in pixels, where it lies, how large and how turned. */
function readPicture(v: unknown): PictureItem | null {
  const p = v as Partial<PictureItem> | null;
  if (!p || !isNum(p.id) || typeof p.name !== "string" || typeof p.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(p.sha256)) return null;
  if (!p.media || !PICTURE_MEDIA.includes(p.media as PictureMedia)) return null;
  if (!Array.isArray(p.px) || p.px.length !== 2 || !p.px.every((n) => isNum(n) && n > 0)) return null;
  if (!isNum(p.x) || !isNum(p.y) || !isNum(p.w) || !isNum(p.h) || p.w <= 0 || p.h <= 0) return null;
  const from = pictureFromOf(p.from);
  return {
    id: p.id,
    name: p.name.slice(0, 260),
    sha256: p.sha256,
    media: p.media,
    px: [p.px[0], p.px[1]],
    x: p.x,
    y: p.y,
    w: p.w,
    h: p.h,
    ...(isNum(p.turn) && p.turn ? { turn: p.turn } : {}),
    ...(from ? { from } : {}),
  };
}

/** Where a picture was cut out of a PDF, as far as it reads: its SHA-256, a page, and a box on it. */
function pictureFromOf(v: unknown): PictureItem["from"] | null {
  const f = v as { sha256?: unknown; page?: unknown; box?: unknown } | null | undefined;
  if (!f || typeof f.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(f.sha256) || !Number.isInteger(f.page) || (f.page as number) < 0) return null;
  if (!Array.isArray(f.box) || f.box.length !== 4 || !f.box.every(isNum)) return null;
  const [x0, y0, x1, y1] = f.box as number[];
  return x1 > x0 && y1 > y0 ? { sha256: f.sha256, page: f.page as number, box: [x0, y0, x1, y1] } : null;
}

/** How a molecule was made, as a file carries it: rows of text, each read as data; otherwise none. */
function madeOf(v: unknown): Carried3D["made"] {
  const how = (v as { how?: unknown } | null | undefined)?.how;
  const method = (v as { method?: unknown } | null | undefined)?.method;
  const rows = (Array.isArray(how) ? how : [])
    .slice(0, 20)
    .filter((r): r is { label: string; text: string } => typeof r?.label === "string" && typeof r?.text === "string")
    .map((r) => ({ label: r.label.slice(0, 80), text: r.text.slice(0, 300) }));
  const energies = (v as { energies?: unknown } | null | undefined)?.energies;
  const said = {
    ...(typeof method === "string" && method ? { method: method.slice(0, 300) } : {}),
    ...(typeof energies === "string" && energies ? { energies: energies.slice(0, 80) } : {}),
  };
  return rows.length || Object.keys(said).length ? { ...said, how: rows } : undefined;
}

/** How many rows of what a text said of a molecule a file is read for, and how long each may be: as a calculation's notes of what was not read (lib/calc/output `readCalc`). */
const SAID_MOST = 100;
const SAID_TEXT_MOST = 500;

/** What ends a label or a text of what a text said of a molecule cut at `SAID_TEXT_MOST`. */
export const SAID_CUT = `\u2026 [cut at ${SAID_TEXT_MOST}]`;

/**
 * What the text a molecule was read from said of it, as a file carries it:
 * each row read as data - its label or text cut at `SAID_TEXT_MOST`, which
 * it ends by saying (`SAID_CUT`), and counted; one that does not read, or
 * past the first `SAID_MOST`, left out, and said.
 */
function saidOf(v: unknown): Carried3D["said"] {
  // (one cut as an earlier file was read, saved since with its mark: as it is - never cut again, nor counted again)
  const over = (t: string) => (t.endsWith(SAID_CUT) ? t.length - SAID_CUT.length : t.length) > SAID_TEXT_MOST;
  const cut = (t: string) => (over(t) ? t.slice(0, SAID_TEXT_MOST) + SAID_CUT : t);
  const rows = readEach(Array.isArray(v) ? v.slice(0, SAID_MOST) : v, (r) => {
    const row = r as { label?: unknown; text?: unknown } | null;
    if (typeof row?.label !== "string" || typeof row.text !== "string") return null;
    if (over(row.label) || over(row.text)) leftOut("saidCut");
    return { label: cut(row.label), text: cut(row.text) };
  }, "said");
  if (Array.isArray(v) && v.length > SAID_MOST) leftOut("said", v.length - SAID_MOST);
  return rows.length ? rows : undefined;
}

/** A molecule's open list as a file carries it; otherwise none. */
function listOf(v: unknown): CarriedList | undefined {
  const l = v as Partial<Record<keyof CarriedList, unknown>> | null | undefined;
  if (!l || typeof l.id !== "string" || !(l.row === null || (Number.isInteger(l.row) && (l.row as number) >= 0))) return undefined;
  return { id: l.id, row: l.row as number | null, ...(isNum(l.iso) && l.iso > 0 ? { iso: l.iso } : {}) };
}

/** A molecule's stack, where it reads as one: its id, and whether it is laid out as a grid (utils/stacks). */
function stackOf(given: unknown): Carried3D["stack"] | undefined {
  const s = given as { id?: unknown; spread?: unknown } | undefined;
  if (!s || !Number.isInteger(s.id) || (s.id as number) < 1) return undefined;
  return { id: s.id as number, ...(s.spread === true ? { spread: true as const } : {}) };
}

/**
 * A molecule's entries as its record gives them (`Molecule3D.entryFrames`,
 * `noEntryWhy`), of `frames` frames after its first: none said, every frame
 * one. Given, each one it has, in order, once - or none, with why where it
 * was said - each by its place among the geometries kept (`keep`). Given
 * but not readable so, none is one, "which are could not be read": what
 * counts as an entry is never widened.
 */
function entriesRead(entryFrames: unknown, why: unknown, keep: readonly boolean[]): Pick<Molecule3D, "entryFrames" | "noEntryWhy"> {
  if (entryFrames === undefined) return {};
  const reads = Array.isArray(entryFrames) && entryFrames.every((f, k, all) => Number.isInteger(f) && f >= 0 && f < keep.length && (k === 0 || f > all[k - 1]));
  if (!reads) return { entryFrames: [], noEntryWhy: "unread" };
  // (each by its place among the geometries kept - one left out, the entry with it: none, where none is left, is said)
  const at = new Map<number, number>();
  keep.forEach((k, i) => k && at.set(i, at.size));
  const kept = (entryFrames as number[]).flatMap((f) => (at.has(f) ? [at.get(f)!] : []));
  if (entryFrames.length && !kept.length) return { entryFrames: [], noEntryWhy: "unread" };
  const said = !kept.length && UNMARKED.includes(why as Unmarked) ? { noEntryWhy: why as Unmarked } : {};
  return { entryFrames: kept, ...said };
}

/**
 * A molecule's calculation as a file carries it, its results of frames
 * made those of the frames kept (`keep`, by geometry - the first, then each
 * frame): a value of each frame left out taken out with it, and a row of a
 * list on one no longer on any - never on the frame after it.
 */
function framesKeptIn(calc: unknown, keep: readonly boolean[]): unknown {
  const c = calc as { results?: unknown } | null | undefined;
  if (keep.every(Boolean) || !c || typeof c !== "object" || !Array.isArray(c.results)) return calc;
  const at = new Map<number, number>();
  keep.forEach((k, i) => k && at.set(i, at.size));
  const results = c.results.map((v) => {
    const r = v as { on?: unknown; values?: unknown; rows?: unknown } | null;
    if (r?.on === "frames" && Array.isArray(r.values) && r.values.length === keep.length) return { ...r, values: r.values.filter((_, i) => keep[i]) };
    if (r?.on === "list" && Array.isArray(r.rows))
      return {
        ...r,
        rows: r.rows.map((row) => {
          const w = row as { frame?: unknown } | null;
          if (!w || typeof w !== "object" || !Number.isInteger(w.frame)) return row;
          const { frame, ...rest } = w;
          return at.has(frame as number) ? { ...rest, frame: at.get(frame as number) } : rest;
        }),
      };
    return v;
  });
  return { ...c, results };
}

/** A molecule in 3D in Meno's own record, or null where it does not read as one. */
export function readCarried3D(given: unknown): Carried3D | null {
  const m = given as Partial<Record<keyof Carried3D, unknown>>;
  if (!m || !Array.isArray(m.atoms) || !Array.isArray(m.bonds) || !m.at) return null;
  const atoms = m.atoms as Partial<Carried3D["atoms"][number]>[];
  const n = atoms.length;
  if (!n || !atoms.every((a) => isEntry(a) && typeof a.el === "string" && isNum(a.x) && isNum(a.y) && isNum(a.z))) return null;
  const index = (v: unknown) => Number.isInteger(v) && (v as number) >= 0 && (v as number) < n;
  const bonds = m.bonds as Partial<Carried3D["bonds"][number]>[];
  if (!bonds.every((b) => isEntry(b) && index(b.a1) && index(b.a2) && Number.isInteger(b.order))) return null;
  const at = m.at as Partial<Pt & { z: number }>;
  if (!isNum(at.x) || !isNum(at.y)) return null;
  // (what does not read is left out, not the molecule - and the frame it
  // showed is still the one shown: where it was left out, the one before it)
  const listed = Array.isArray(m.frames) ? (m.frames as unknown[]) : [];
  const whole = (f: unknown): f is number[] => Array.isArray(f) && f.length === 3 * n && f.every(isNum);
  const frames = listed.filter(whole);
  const shownFrame = Number.isInteger(m.frame) ? Math.min(Math.max(0, m.frame as number), listed.length) : null;
  const frame = shownFrame == null ? null : listed.slice(0, shownFrame).filter(whole).length;
  // (a frame that does not read is left out alone: its energy, number, share and degeneracy with it, every other frame's kept - and counted with those its file left out)
  const keep = [true, ...listed.map(whole)];
  const framesDropped = listed.length - frames.length;
  leftOut("frame", framesDropped);
  const perFrame = <T,>(v: unknown, fine: (x: unknown) => boolean): T[] | undefined => {
    if (v === undefined) return undefined;
    if (!Array.isArray(v) || v.length !== keep.length || !v.every(fine)) {
      leftOut("frameValues");
      return undefined;
    }
    return v.filter((_, i) => keep[i]) as T[];
  };
  const energies = perFrame<number>(m.energies, isNum);
  const measures = readEach(m.measures, (v) => {
    const x = v as Partial<Measure3D>;
    return isEntry(x) && isNum(x.id) && Array.isArray(x.atoms) && x.atoms.length >= 2 && x.atoms.length <= 4 && x.atoms.every(index) ? (x as Measure3D) : null;
  }, "measure");
  const turn = Array.isArray(m.turn) && m.turn.length === 4 && m.turn.every(isNum) ? (m.turn as Turn3D) : undefined;
  // what ties it to the drawing it was made from: the drawing's atom each
  // of its atoms is (a paste ties it to the pasted drawing: pasteModel)
  const drawnFrom =
    Array.isArray(m.drawnFrom) && m.drawnFrom.length === n && m.drawnFrom.every((id) => id === null || Number.isInteger(id))
      ? (m.drawnFrom as (number | null)[])
      : undefined;
  const stereo = readStereo(m.stereo, n, bonds.length);
  const numbers = readAtomNumbers(m.atomNumbers, n);
  const biopolymer = readBiopolymer(m.biopolymer, n);
  if (m.biopolymer !== undefined && !biopolymer) leftOut("biopolymer");
  const calc = readCalc(framesKeptIn(m.calc, keep), n, 1 + frames.length);
  if (m.calc !== undefined && m.calc !== null && !calc) leftOut("calc");
  // (its results that do not read, or are of atoms or frames it does not have)
  const givenResults = Array.isArray((m.calc as { results?: unknown } | undefined)?.results) ? ((m.calc as { results: unknown[] }).results.length) : 0;
  if (m.calc !== undefined) leftOut("calcResult", calc ? givenResults - (calc.results?.length ?? 0) : givenResults);
  const givenUnread = Array.isArray((m.calc as { unread?: unknown } | undefined)?.unread) ? (m.calc as { unread: unknown[] }).unread.length : 0;
  if (calc) leftOut("calcUnread", givenUnread - (calc.unread?.length ?? 0));
  const bondOrders = m.bondOrders === "unknown" || m.bondOrders === "perceived" || m.bondOrders === "assigned" || m.bondOrders === "dictionary" || m.bondOrders === "estimated" ? m.bondOrders : undefined;
  if (m.bondOrders !== undefined && !bondOrders) leftOut("bondOrders");
  // (a ligand's atoms whose orders are unknown: each that is one of its own kept, any other said - never all dropped for one)
  const unknownOrders = Array.isArray(m.unknownOrders) ? m.unknownOrders.filter(index) : [];
  if (m.unknownOrders !== undefined && (!Array.isArray(m.unknownOrders) || unknownOrders.length < m.unknownOrders.length)) leftOut("bondOrders");
  // (which frames failed, and which are no minimum: marks that do not read are left out - said - and the molecule kept,
  // marked so, never its frames shown as fine, which a step after it would weigh as minima)
  const failedRead = failedOf(m.failed, keep);
  const imaginaryRead = imaginaryFrames(m.imaginary, keep);
  const marksUnread = failedRead === null || imaginaryRead === null || m.marksUnread === true;
  if (failedRead === null || imaginaryRead === null) leftOut("frameMarks");
  const failed = marksUnread ? undefined : failedRead;
  const imaginary = marksUnread ? undefined : imaginaryRead;
  return {
    atoms: atoms as Carried3D["atoms"],
    bonds: bonds as Carried3D["bonds"],
    at: { x: at.x, y: at.y, ...(isNum(at.z) ? { z: at.z } : {}) },
    ...(frames.length ? { frames } : {}),
    ...(energies ? { energies } : {}),
    ...(m.look === "secondary" ? { look: m.look } : {}),
    // (shown larger or smaller than it is: docs/WORKSPACE.md, *Magnified display*)
    ...(isNum(m.magnified) && magnificationWithin(m.magnified) !== 1 ? { magnified: magnificationWithin(m.magnified) } : {}),
    ...(measures.length ? { measures } : {}),
    ...(typeof m.name === "string" ? { name: m.name } : {}),
    ...(typeof m.title === "string" && m.title ? { title: m.title } : {}),
    ...(stackOf(m.stack) ? { stack: stackOf(m.stack) } : {}),
    ...(m.shown === true ? { shown: true as const } : {}),
    ...(turn ? { turn } : {}),
    ...(frame != null ? { frame } : {}),
    ...(listOf(m.list) ? { list: listOf(m.list) } : {}),
    ...(drawnFrom ? { drawnFrom } : {}),
    ...(drawnFrom && typeof m.drawnAs === "string" ? { drawnAs: m.drawnAs } : {}),
    ...(m.conformerSet === true ? { conformerSet: true } : {}),
    ...(m.partOf === true ? { partOf: true as const } : {}),
    ...(centresOf(m.centres, n) ? { centres: centresOf(m.centres, n) } : {}),
    ...(biopolymer ? { biopolymer } : {}),
    ...(bondOrders ? { bondOrders } : {}),
    ...(m.chainOrders === "dictionary" ? { chainOrders: "dictionary" as const } : {}),
    ...(m.wholeWithoutH === true ? { wholeWithoutH: true as const } : {}),
    ...(unknownOrders.length ? { unknownOrders } : {}),
    ...(hydrogensAddedOf(m.hydrogensAdded, n) ? { hydrogensAdded: hydrogensAddedOf(m.hydrogensAdded, n) } : {}),
    ...(ligandOrdersOf(m.ligandOrders, biopolymer?.residues.length ?? 0) ? { ligandOrders: ligandOrdersOf(m.ligandOrders, biopolymer?.residues.length ?? 0) } : {}),
    ...(typeof (m.edited as { from?: unknown } | undefined)?.from === "string" ? { edited: { from: (m.edited as { from: string }).from } } : {}),
    ...(m.path === true && frames.length ? { path: true as const } : {}),
    // (the geometries an opened optimisation or scan converged on: each one it has, in order, once - or none, where
    // none did. Where that does not read, none is an entry, and that is said: never every one)
    ...entriesRead(m.entryFrames, m.noEntryWhy, keep),
    ...(m.notConverged === true ? { notConverged: true as const } : {}),
    ...(m.bondsFrom === "distance" ? { bondsFrom: "distance" as const } : {}),
    ...(() => {
      const left = (Number.isInteger(m.framesLeftOut) && (m.framesLeftOut as number) > 0 ? (m.framesLeftOut as number) : 0) + framesDropped;
      return left ? { framesLeftOut: left } : {};
    })(),
    ...(Number.isInteger(m.together) && (m.together as number) > 0 ? { together: m.together as number } : {}),
    ...(Number.isInteger(m.atomsLeftOut) && (m.atomsLeftOut as number) > 0 ? { atomsLeftOut: m.atomsLeftOut as number } : {}),
    ...(madeOf(m.made) ? { made: madeOf(m.made) } : {}),
    ...(() => {
      const said = saidOf(m.said);
      return said ? { said } : {};
    })(),
    ...(() => {
      const numbers = perFrame<number>(m.numbers, (k) => Number.isInteger(k));
      const shares = perFrame<number>(m.shares, isNum);
      const degeneracies = perFrame<number>(m.degeneracies, (d) => Number.isInteger(d) && (d as number) >= 1);
      // (each frame's properties, one map each - a frame with none, an empty one; a property that does not read left out, and counted)
      const maps = perFrame<Record<string, unknown>>(m.properties, (p) => !!p && typeof p === "object" && !Array.isArray(p));
      const read = maps?.map((p) => propertiesIn(p) ?? {});
      if (maps && read) leftOut("property", maps.reduce((k, p, i) => k + Object.keys(p).length - Object.keys(read[i]).length, 0));
      const properties = read?.some((p) => Object.keys(p).length) ? read : undefined;
      return { ...(numbers ? { numbers } : {}), ...(shares ? { shares } : {}), ...(degeneracies ? { degeneracies } : {}), ...(properties ? { properties } : {}) };
    })(),
    ...(failed ? { failed } : {}),
    ...(imaginary ? { imaginary } : {}),
    ...(marksUnread ? { marksUnread: true as const } : {}),
    ...(() => {
      // (where a run ended converged, frame by frame: a record that does not read is none - said - never one assumed)
      const read = convergedFrames(m.converged, keep);
      if (read === null) leftOut("frameMarks");
      return read ? { converged: read } : {};
    })(),
    ...(() => {
      const mirrors = mirrorsOf(m.mirrors, keep, n);
      return mirrors ? { mirrors } : {};
    })(),
    ...(stereo ? { stereo } : {}),
    ...(numbers ? { atomNumbers: numbers } : {}),
    ...(calc ? { calc } : {}),
  };
}

/** Where a run ended converged, frame by frame (workflow/converged): of the frames kept, those left out with theirs; none where none is marked; null where the records do not read - not one for each frame, or one that is neither a record nor null. */
function convergedFrames(given: unknown, keep: boolean[]): (Converged | null)[] | null | undefined {
  if (given === undefined) return undefined;
  if (!Array.isArray(given) || given.length !== keep.length) return null;
  const read = given.map((c) => (c === null ? null : (convergedIn(c) ?? undefined)));
  if (read.some((c) => c === undefined)) return null;
  const out = (read as (Converged | null)[]).filter((_, i) => keep[i]);
  return out.some(Boolean) ? out : undefined;
}

/** A conformer set's mirror images counted in, frame by frame: each a permutation of its `atoms` atoms, or null; of the frames kept, those left out with theirs. */
function mirrorsOf(given: unknown, keep: boolean[], atoms: number): (number[] | null)[] | undefined {
  if (!Array.isArray(given) || given.length !== keep.length) return undefined;
  const isPermutation = (p: unknown): p is number[] =>
    Array.isArray(p) && p.length === atoms && p.every((i) => Number.isInteger(i) && i >= 0 && i < atoms) && new Set(p).size === atoms;
  const out = given.filter((_, i) => keep[i]).map((p) => (isPermutation(p) ? [...p] : null));
  return out.some(Boolean) ? out : undefined;
}

/**
 * Why each of a molecule's frames failed in the step that made it, where one
 * did - one for each, null where it did not - of core's kinds
 * (workflow/failures); of the frames kept, those left out with theirs. None
 * where none is marked; null where the marks do not read - not one for each
 * frame, or one that is neither a failure nor null.
 */
function failedOf(given: unknown, keep: boolean[]): (Failure | null)[] | null | undefined {
  if (given === undefined) return undefined;
  if (!Array.isArray(given) || given.length !== keep.length) return null;
  const read = given.map((f): Failure | null | undefined => {
    if (f === null) return null;
    const g = f as { kind?: unknown; why?: unknown };
    return typeof g?.why === "string" ? { kind: failureKindOf(g.kind), why: g.why.slice(0, WORDS_MOST) } : undefined;
  });
  if (read.some((f) => f === undefined)) return null;
  const out = (read as (Failure | null)[]).filter((_, i) => keep[i]);
  return out.some(Boolean) ? out : undefined;
}

/** A conformer set's imaginary frequencies, one list or null for each frame kept, as `CalcInfo.imaginary` takes them - a list of none where its calculation judged none, null where none judged it: none where none is marked; null where the marks do not read (`failedOf`). */
function imaginaryFrames(given: unknown, keep: boolean[]): (number[] | null)[] | null | undefined {
  if (given === undefined) return undefined;
  if (!Array.isArray(given) || given.length !== keep.length) return null;
  const read = given.map((f) => (f === null ? null : (imaginaryOf(f) ?? undefined)));
  if (read.some((f) => f === undefined)) return null;
  const out = (read as (number[] | null)[]).filter((_, i) => keep[i]);
  return out.some((f) => f !== null) ? out : undefined;
}

/** The hydrogens a molecule was given that its file left out (Molecule3D `hydrogensAdded`): each part's, chosen or the CCD's, by its atoms - of `atoms`. */
function hydrogensAddedOf(given: unknown, atoms: number): Carried3D["hydrogensAdded"] | undefined {
  if (!Array.isArray(given)) return undefined;
  const parts = given.filter(
    (p): p is { by: "chosen" | "dictionary"; atoms: number[] } =>
      !!p && (p.by === "chosen" || p.by === "dictionary") && Array.isArray(p.atoms) && p.atoms.length > 0 && p.atoms.every((i: unknown) => Number.isInteger(i) && (i as number) >= 0 && (i as number) < atoms),
  );
  return parts.length ? parts.map((p) => ({ by: p.by, atoms: [...p.atoms] })) : undefined;
}

/** Where a PDB entry's ligands' bond orders came from, by residue (Molecule3D `ligandOrders`) - of `residues`. */
function ligandOrdersOf(given: unknown, residues: number): Carried3D["ligandOrders"] | undefined {
  if (!given || typeof given !== "object") return undefined;
  const kept = Object.entries(given as Record<string, unknown>).filter(
    ([r, by]) => Number.isInteger(Number(r)) && Number(r) >= 0 && Number(r) < residues && (by === "assigned" || by === "dictionary" || by === "estimated"),
  );
  return kept.length ? (Object.fromEntries(kept.map(([r, by]) => [Number(r), by])) as Carried3D["ligandOrders"]) : undefined;
}

/** The atom numbers a molecule shows (utils/atomNumbers): of a kind known, on atoms each one of its own - all, given none. */
function readAtomNumbers(given: unknown, atoms: number): Carried3D["atomNumbers"] | undefined {
  const s = given as { kind?: unknown; atoms?: unknown } | null | undefined;
  if (!s || typeof s !== "object" || !ATOM_NUMBER_KINDS.some((k) => k.kind === s.kind)) return undefined;
  const kind = s.kind as AtomNumberKind;
  if (s.atoms === undefined) return { kind };
  if (!Array.isArray(s.atoms) || !s.atoms.length || !s.atoms.every((i) => Number.isInteger(i) && i >= 0 && i < atoms)) return undefined;
  return { kind, atoms: [...new Set(s.atoms as number[])].sort((a, b) => a - b) };
}

/** A molecule's bonds to ring centres (`Molecule3D.centres`), where they read: each a metal and two atoms or more of its own, the metal not among them. */
function centresOf(given: unknown, atoms: number): Carried3D["centres"] | undefined {
  if (!Array.isArray(given)) return undefined;
  const atom = (i: unknown): i is number => Number.isInteger(i) && (i as number) >= 0 && (i as number) < atoms;
  const out = given.flatMap((c) => {
    const x = c as { metal?: unknown; atoms?: unknown } | null;
    if (!x || !atom(x.metal) || !Array.isArray(x.atoms) || x.atoms.length < 2 || !x.atoms.every(atom) || x.atoms.includes(x.metal)) return [];
    return [{ metal: x.metal, atoms: [...(x.atoms as number[])] }];
  });
  return out.length ? out : undefined;
}

/**
 * A molecule's CIP labels, by atom and bond index, which of them its
 * drawing left open, and which are shown - where they read: every index one
 * of its own.
 */
function readStereo(given: unknown, atoms: number, bonds: number): Carried3D["stereo"] | undefined {
  const s = given as { atoms?: unknown; bonds?: unknown; chosen?: unknown } | null | undefined;
  if (!s || typeof s !== "object") return undefined;
  // (a label not of an atom or a bond of its own is left out alone, and said - every other kept)
  const labels = (r: unknown, n: number): Record<number, string> | null => {
    if (!r || typeof r !== "object" || Array.isArray(r)) return null;
    const out: Record<number, string> = {};
    for (const [k, v] of Object.entries(r)) {
      const i = Number(k);
      if (!Number.isInteger(i) || i < 0 || i >= n || typeof v !== "string") leftOut("stereo");
      else out[i] = v;
    }
    return out;
  };
  const a = labels(s.atoms, atoms);
  const b = labels(s.bonds, bonds);
  if (!a || !b) {
    // (no list of labels to read: those of the other list lost with it, and at least one)
    leftOut("stereo", Math.max(1, Object.keys(a ?? b ?? {}).length));
    return undefined;
  }
  const within = (v: unknown, n: number): number[] => (Array.isArray(v) ? v.filter((i) => Number.isInteger(i) && i >= 0 && i < n) : []);
  const pair = (v: unknown) => {
    const c = v as { atoms?: unknown; bonds?: unknown } | undefined;
    return c && Array.isArray(c.atoms) && Array.isArray(c.bonds) ? { atoms: within(c.atoms, atoms), bonds: within(c.bonds, bonds) } : undefined;
  };
  const chosen = pair(s.chosen);
  // (those shown, as asked for on it)
  const shown = pair((s as { shown?: unknown }).shown);
  return { atoms: a, bonds: b, ...(chosen ? { chosen } : {}), ...(shown ? { shown } : {}) };
}

/**
 * Whether plain text could be a SMILES: one word of the characters one is
 * written in. The plugin that reads SMILES has the last word on it.
 */
export function looksLikeSmiles(text: string): boolean {
  const t = text.trim();
  return t.length > 0 && t.length < 5000 && /^[A-Za-z0-9@+\-=#$%:.()[\]/\\*~>]+$/.test(t);
}

/** How far a paste asked for where the last one was goes on from it: down and to the right, by half a bond. */
export const PASTE_STEP = NOMINAL_BOND_LENGTH / 2;

/** The pastes asked for at one place, one after another: where, and how many. */
export type PastesAt = { at: Pt; count: number };

/**
 * Where a paste lands, asked for at `at`: there - or, asked for where the
 * last one was (the pointer not moved, the view as it was), a step down and
 * to the right of the last one there, so that a copy pasted again is seen
 * and not lost under the first (the maintainer, 2026-10-12). With the
 * pastes at that place now, for the next.
 */
export function pastePlace(last: PastesAt | null, at: Pt): { place: Pt; pastes: PastesAt } {
  const again = !!last && Math.abs(last.at.x - at.x) < 1e-9 && Math.abs(last.at.y - at.y) < 1e-9;
  const n = again ? last!.count : 0;
  return { place: { x: at.x + n * PASTE_STEP, y: at.y - n * PASTE_STEP }, pastes: { at, count: n + 1 } };
}

/** `drawn` moved so that the middle of the box round it - its arrows and pluses too, and a workflow's sets and steps - is at `p`. */
/** The points that bound what a copy carries - its atoms, arrows, words, pictures, frames - for its middle. */
function boundingPoints(drawn: Drawn): Pt[] {
  const flow = drawn.flow ? partsBounds(drawn.flow) : null;
  return [
    ...drawn.atoms,
    ...(drawn.arrows ?? []).flatMap((a) => arrowPoints(a)),
    ...(drawn.pluses ?? []),
    ...(drawn.captions ?? []),
    ...(drawn.molecules3d ?? []).map((m) => m.at),
    ...(flow ? [{ x: flow.x0, y: flow.y0 }, { x: flow.x1, y: flow.y1 }] : []),
    ...[...(drawn.pictures ?? []), ...(drawn.slides ?? [])].flatMap((p) => [
      { x: p.x - p.w / 2, y: p.y - p.h / 2 },
      { x: p.x + p.w / 2, y: p.y + p.h / 2 },
    ]),
    ...[...(drawn.pdfs ?? []).map(pdfBounds), ...(drawn.sheets ?? []).flatMap((t) => drawnSheetBox(t) ?? []), ...(drawn.shapes ?? []), ...(drawn.cycles ?? []).map((c) => ({ x0: c.x - c.r, y0: c.y - c.r, x1: c.x + c.r, y1: c.y + c.r })), ...(drawn.inks ?? []).flatMap((k) => strokesBounds(k.strokes, 0) ?? [])].flatMap((b) => [
      { x: b.x0, y: b.y0 },
      { x: b.x1, y: b.y1 },
    ]),
  ];
}

/** The middle of what a copy carries (of the box round it), or null where it carries nothing. */
function middleOf(drawn: Drawn): Pt | null {
  const points = boundingPoints(drawn);
  if (!points.length) return null;
  const xs = points.map((a) => a.x);
  const ys = points.map((a) => a.y);
  return { x: (least(xs) + greatest(xs)) / 2, y: (least(ys) + greatest(ys)) / 2 };
}

/**
 * What a copy carries, converted as a change of style converts a page
 * (../restyle `restyled`) by k = the bond's printed length where it was
 * copied over this workspace's, about its middle: its structures keep their
 * size in units, so they print at this workspace's bond, and its words,
 * shapes and pictures keep their size in pt (docs/WORKSPACE.md, *Drawing
 * style*). As it is, where k is one.
 */
export function restyledDrawn(drawn: Drawn, k: number, style3d?: Style3D): Drawn {
  const about = middleOf(drawn);
  if (k === 1 || !about) return drawn;
  const parts = restyled(
    {
      model: { atoms: drawn.atoms, bonds: drawn.bonds },
      ...(drawn.arrows ? { arrows: drawn.arrows } : {}),
      ...(drawn.pluses ? { pluses: drawn.pluses } : {}),
      ...(drawn.captions ? { captions: drawn.captions } : {}),
      ...(drawn.molecules3d ? { molecules3d: drawn.molecules3d as unknown as Molecule3D[] } : {}),
      ...(drawn.pictures ? { pictures: drawn.pictures } : {}),
      ...(drawn.pdfs ? { pdfs: drawn.pdfs } : {}),
      ...(drawn.sheets ? { texts: drawn.sheets } : {}),
      ...(drawn.slides ? { slides: drawn.slides } : {}),
      ...(drawn.shapes ? { shapes: drawn.shapes } : {}),
      ...(drawn.inks ? { inks: drawn.inks } : {}),
      ...(drawn.cycles ? { cycles: drawn.cycles } : {}),
      ...(drawn.flow ? { sets: drawn.flow.sets, steps: drawn.flow.steps } : {}),
    },
    k,
    about,
    style3d,
  );
  return {
    ...drawn,
    atoms: parts.model!.atoms,
    bonds: parts.model!.bonds,
    ...(parts.arrows ? { arrows: parts.arrows } : {}),
    ...(parts.pluses ? { pluses: parts.pluses } : {}),
    ...(parts.captions ? { captions: parts.captions } : {}),
    ...(parts.molecules3d ? { molecules3d: parts.molecules3d as unknown as Carried3D[] } : {}),
    ...(parts.pictures ? { pictures: parts.pictures } : {}),
    ...(parts.pdfs ? { pdfs: parts.pdfs } : {}),
    ...(parts.texts ? { sheets: parts.texts } : {}),
    ...(parts.slides ? { slides: parts.slides } : {}),
    ...(parts.shapes ? { shapes: parts.shapes } : {}),
    ...(parts.inks ? { inks: parts.inks } : {}),
    ...(parts.cycles ? { cycles: parts.cycles } : {}),
    ...(drawn.flow ? { flow: { ...drawn.flow, sets: parts.sets ?? drawn.flow.sets, steps: parts.steps ?? drawn.flow.steps } } : {}),
  };
}

export function centredAt<D extends Drawn>(drawn: D, p: Pt): D {
  const middle = middleOf(drawn);
  if (!middle) return drawn;
  const dx = p.x - middle.x;
  const dy = p.y - middle.y;
  const moved = <T extends Pt>(t: T): T => ({ ...t, x: t.x + dx, y: t.y + dy });
  return {
    ...drawn,
    atoms: drawn.atoms.map(moved),
    ...(drawn.arrows ? { arrows: drawn.arrows.map(moved) } : {}),
    ...(drawn.pluses ? { pluses: drawn.pluses.map(moved) } : {}),
    ...(drawn.captions ? { captions: drawn.captions.map(moved) } : {}),
    ...(drawn.molecules3d ? { molecules3d: drawn.molecules3d.map((m) => ({ ...m, at: moved(m.at) })) } : {}),
    ...(drawn.pictures ? { pictures: drawn.pictures.map(moved) } : {}),
    ...(drawn.slides ? { slides: drawn.slides.map(moved) } : {}),
    ...(drawn.shapes ? { shapes: drawn.shapes.map((x) => shapeMoved(x, { x: dx, y: dy })) } : {}),
    ...(drawn.inks ? { inks: drawn.inks.map((k) => ({ ...k, strokes: k.strokes.map((s) => strokeMoved(s, { x: dx, y: dy })) })) } : {}),
    ...(drawn.cycles ? { cycles: drawn.cycles.map(moved) } : {}),
    ...(drawn.pdfs ? { pdfs: drawn.pdfs.map(moved) } : {}),
    ...(drawn.sheets ? { sheets: drawn.sheets.map((t) => (t.at ? { ...t, at: moved(t.at) } : t)) } : {}),
    ...(drawn.flow
      ? {
          flow: {
            ...drawn.flow,
            sets: drawn.flow.sets.map((b) => ({ ...b, x0: b.x0 + dx, x1: b.x1 + dx, y0: b.y0 + dy, y1: b.y1 + dy })),
            steps: drawn.flow.steps.map(moved),
          },
        }
      : {}),
  };
}
