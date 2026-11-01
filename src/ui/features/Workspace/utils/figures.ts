/**
 * Structures read from figures (docs/PDF.md, *Stage 5*): a figure in a box
 * of a PDF's page - its lines read by Meno; or, where it is a picture, the
 * picture read by the plugin that reads structures from pictures - or a
 * picture on the page, read as a structure drawn as the figure draws it:
 * where its atoms lie, as long as Meno draws a bond, each atom tied to the
 * place in the figure it was drawn at; what Meno or the plugin was unsure
 * of, marked while the part is as it was read; and where the structure goes
 * on the page: beside what it was read from, clear of what lies there.
 */
import { invoke, isTauri } from "@tauri-apps/api/core";
import { shapesOf, uprightOf, type Box, type FigureDrawn } from "../../../../lib/figure/drawn";
import { figureBond, type FigureRead } from "../../../../lib/figure/read";
import { readScheme, schemeBox, type SchemeRead } from "../../../../lib/figure/scheme";
import { cornerAt } from "../../../../lib/chem/reactionArrow";
import { arrowPoints } from "../../../../lib/chem/reactionScheme";
import type { ImportedScheme } from "../document";
import { pictureFigure, scaledFigure } from "../../../../lib/figure/picture";
import { fitToPicture } from "../../../../lib/figure/inkFit";
import { boxPicture } from "../../../../lib/pdf/reader";
import { setAtomLabel } from "../../../../lib/pdf/figures";
import { chemWorker, rolePlugin } from "../../../../lib/roles/worker";
import { ChemTimeout, type ChemClient } from "../../../../lib/roles/client";
import { toBase64 } from "../../../../lib/clipboard";
import { drawnBond, readDrawnLabel, structureOf, type LabelReader } from "../../../../lib/figure/structure";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { regularised } from "../../../../lib/layout/regularise";
import { sameStereo } from "../chem/engineLayout";
import { isElementSymbol } from "../../../../lib/roles/molblock";
import { implicitHydrogens } from "../../../../lib/chem/molecule";
import { overBonded } from "../../../../lib/chem/molWriter";
import { ELEMENTS } from "../../../../lib/chem/elements";
import { labelReading, readLabel } from "./labelTyping";
import { systemGlyphs } from "./glyphShapes";
import { shapeLetters, sureEnough, type GlyphShape } from "../../../../lib/figure/glyphs";
import type { Atom, Bond, FigureSpot, Model, PictureItem } from "../store/types";
import { picturePng, pngPixels } from "./pictures";
import { labelBoxes, labelledPart } from "./freePlace";
import { captionBox } from "./extent";
import { editorLayoutOptions } from "../layoutOptions";
import type { DrawingStyle } from "../../../../lib/chem/style";

/** A label as drawn read as one typed is: an element with its charge and its mass number (13C), or a group's name - or nothing. */
/**
 * Whether a label written alone is a whole molecule: a reagent or a complex
 * Meno reads it as (H2O, HCl, NaCl, MeOH), or an element whose hydrogens and
 * charge leave it nothing to bond (I-, Na+, OH-, NH3).
 */
export function wholeLabel(label: string): boolean {
  const r = labelReading(label);
  if (!r) return false;
  if (r.whole) return true;
  const m = /^(?:H(\d*))?([A-Z][a-z]?)(?:H(\d*))?([+-]*\d*[+-]*)$/.exec(label);
  if (!r.element || !m || m[2] !== r.element) return false;
  const read = readLabel(label, isElementSymbol);
  const hs = (s: string | undefined) => (s == null ? 0 : s === "" ? 1 : Number.parseInt(s));
  return read.kind === "element" && implicitHydrogens(read.el, 0, read.charge ?? 0) === hs(m[1]) + hs(m[3]);
}

export const figureLabels: LabelReader = (label) => {
  if (!labelReading(label)) return null;
  const r = readLabel(label, isElementSymbol);
  if (r.kind === "element") return { el: r.el, charge: r.charge, ...(r.isotope ? { isotope: r.isotope } : {}) };
  if (r.kind === "charge") return { el: "C", charge: r.charge };
  return { el: label };
};

// (a page's figures take a one-bond structure by its label, read as these read one: lib/pdf/figures)
setAtomLabel((text) => !/^[+\-−]*$/.test(text) && readDrawnLabel(text, figureLabels).read);

/** What a part is now, as far as being right goes: an atom's element, charge and bonds; a bond's order and stereo. Its mark stays while this does. */
export function atomAs(a: Pick<Atom, "id" | "el" | "charge">, bonds: readonly Bond[]): string {
  const round = bonds
    .filter((b) => b.a === a.id || b.b === a.id)
    .map((b) => `${b.order}${b.stereo ?? ""}${b.stereo && b.stereo !== "none" ? (b.a === a.id ? "<" : ">") : ""}`)
    .sort()
    .join(",");
  return `${a.el}|${a.charge ?? 0}|${round}`;
}
export function bondAs(b: Pick<Bond, "order" | "stereo" | "stereoOrient" | "display">): string {
  return `${b.order}|${b.stereo ?? "none"}|${b.stereoOrient ?? ""}|${b.display ?? ""}`;
}

/** What Meno said is unsure of the parts read from figures that are still as they were read: by atom id and bond id, what to say. */
export function readMarks(model: Model): { atoms: Map<number, string>; bonds: Map<number, string> } {
  const atoms = new Map<number, string>();
  const bonds = new Map<number, string>();
  for (const a of model.atoms) if (a.unsure && a.unsure.as === atomAs(a, model.bonds)) atoms.set(a.id, a.unsure.said.join(" "));
  for (const b of model.bonds) if (b.unsure && b.unsure.as === bondAs(b)) bonds.set(b.id, b.unsure.said.join(" "));
  return { atoms, bonds };
}

/**
 * The quarter a figure is turned by, its words all outlines: a quarter
 * either way, as a page set sideways is, where its outlines read better
 * as letters so - surely, by how sure - than as they lie; naught where
 * neither does. (Never upside down: turned half round, an H, an O, an N
 * read as themselves still, and a C as a D.)
 */
function quarterOfOutlines(drawn: FigureDrawn, known: readonly GlyphShape[]): number {
  const read = [0, 1, 3].map((q) => {
    const turned = q ? uprightOf(drawn, q).drawn : drawn;
    const shapes = shapesOf(turned);
    return { q, sure: shapeLetters(shapes, figureBond(shapes, []), known).filter(sureEnough).reduce((t, l) => t + l.sure, 0) };
  });
  const best = read.reduce((p, r) => (r.sure > p.sure ? r : p));
  return best.q;
}

/**
 * Whether a figure may draw its letters as shapes, to be read against the
 * system's letters: a path filled in several parts, or curved, or with many
 * corners - an N, an H, drawn of straight lines alone.
 */
export function lettersAsShapes(drawn: FigureDrawn): boolean {
  return drawn.paths.some((p) => p.fill && (p.d.filter((s) => s[0] === "M").length > 1 || p.d.some((s) => s[0] === "C") || p.d.filter((s) => s[0] === "L").length >= 6));
}

/** Why a figure gave no structure: what to say. */
export type Unread = { none: string };

/** What a figure gives: its structure, and - a scheme - its arrows, "+" signs and words, in Meno's units, where they stand to it as the figure has them. */
export type FigureResult = { model: Model; scheme?: ImportedScheme };

/**
 * A figure within a box of a PDF's page, read as a structure: its atoms
 * where the figure has them - its middle at naught, a bond as long as Meno
 * draws one - each tied to where it was drawn; or why it gave none.
 */
export async function readBox(sha256: string, page: number, box: Box, working?: (what: string) => void): Promise<FigureResult | Unread> {
  if (!isTauri()) return { none: "Figures are read in the app." };
  const drawn = await invoke<FigureDrawn>("pdf_figure", { sha: sha256, page, box });
  const read = figureFrom(drawn, sha256, page);
  // (a figure that is a picture: the picture read, by the plugin that reads them)
  if ("none" in read && drawn.pictures.length) {
    working?.("Reading the picture…");
    return readBoxPicture(sha256, page, box);
  }
  return read;
}

/** How finely a figure that is a picture is drawn to be read: enough for its letters, more than a picture's reader looks at. */
const READ_DPI = 200;
/** How long the first picture a worker reads may take: it loads the plugin's model first - a minute or more, the first time a computer loads it. */
export const FIRST_READ_MS = 300_000;
/**
 * How long a picture may take once the worker has read one, its model
 * loaded: a picture is read in seconds, the slowest in half a minute; one
 * taking longer is not going to end, and its worker is started afresh for
 * the next (lib/plugins/queue).
 */
export const READ_MS = 90_000;
/** The workers that have read a picture: their model loaded. One started afresh is another, and loads its model again. */
const loaded = new WeakSet<ChemClient>();

/** A picture read by the plugin that reads structures from pictures, laid on the picture: what it read, in the picture's pixels; or why nothing came of it. */
async function readByPlugin(bytes: Uint8Array): Promise<FigureRead | Unread> {
  const worker = await chemWorker("pictures");
  try {
    const answer = await worker.request("read_picture", { picture: toBase64(bytes) }, loaded.has(worker) ? READ_MS : FIRST_READ_MS);
    loaded.add(worker);
    const fitted = fitToPicture(answer, await pngPixels(bytes), rolePlugin("pictures")?.roleUnsure.pictures);
    return pictureFigure(fitted) ?? { none: "No structure was found in the picture." };
  } catch (e) {
    if (e instanceof ChemTimeout) return { none: "Reading the picture took too long, so nothing was read from it." };
    throw e;
  }
}

/** A box of a PDF's page drawn as a picture and read by the plugin that reads pictures, each atom tied to its place on the page. */
async function readBoxPicture(sha256: string, page: number, box: Box): Promise<FigureResult | Unread> {
  const shot = await boxPicture(sha256, page, box, READ_DPI);
  const read = await readByPlugin(shot.png);
  if ("none" in read) return read;
  // (its pixels made the page's points: a pixel is 72/dpi of a point, from the box's top left)
  const k = 72 / shot.dpi;
  const onPage = scaledFigure(read, k, box[0], box[1]);
  return { model: modelOf(onPage, (x, y) => ({ sha256, page, x, y, bond: onPage.bond })) };
}

/** A picture on the page read by the plugin that reads pictures, each atom tied to its place in the picture, in its pixels. */
export async function readPicture(picture: Pick<PictureItem, "sha256" | "media">): Promise<FigureResult | Unread> {
  if (!isTauri()) return { none: "Pictures are read in the app." };
  const png = await picturePng(picture);
  if (!png) return { none: "A film is not read as a structure." };
  const read = await readByPlugin(png);
  if ("none" in read) return read;
  return { model: modelOf(read, (x, y) => ({ sha256: picture.sha256, x, y, bond: read.bond })) };
}

/**
 * A figure as drawn, read as a scheme (lib/figure/scheme) - upright, where
 * it is set sideways, `back` taking a point of what was read back to where
 * it lies on the page - the one reading `figureFrom` and the structures a
 * page is picked by (./pageStructures) share.
 */
export function schemeDrawn(given: FigureDrawn, known?: readonly GlyphShape[]): { drawn: FigureDrawn; back: (p: { x: number; y: number }) => { x: number; y: number }; read: SchemeRead } {
  const glyphs = known ?? (lettersAsShapes(given) ? systemGlyphs() : []);
  // (a figure set sideways - its words reading down the page, or up it - read turned upright, each atom tied back to where it lies on the page;
  // one whose words are all outlines, no letter written to tell, turned the way most of them read as letters)
  const { drawn, back } = uprightOf(given, given.letters.length || !glyphs.length ? undefined : quarterOfOutlines(given, glyphs));
  return { drawn, back, read: readScheme(drawn, (l) => readDrawnLabel(l, figureLabels).read, glyphs, wholeLabel) };
}

/**
 * What a figure as drawn reads as, tied to its PDF's page (`readBox`): its
 * structures, and - a scheme - its arrows, "+" signs and words (lib/figure/
 * scheme), all in Meno's units, a bond as long as Meno draws one, the
 * middle of all of it at naught: each where it stands to the rest as the
 * figure has it (the maintainer, 2026-10-11: the scheme keeps the figure's
 * layout).
 */
export function figureFrom(given: FigureDrawn, sha256: string, page: number, known?: readonly GlyphShape[]): FigureResult | Unread {
  const { drawn, back, read } = schemeDrawn(given, known);
  if (read.tooMany) return { none: "This looks like a chart or a spectrum: too much is drawn there to read it as a structure." };
  const structure = read.figure.atoms.length > 0 && read.figure.bonds.length > 0;
  if (!structure && !read.arrows.length) {
    return { none: drawn.pictures.length ? "This figure is a picture, not a drawing: there are no lines to read." : "No structure is drawn there." };
  }
  // (one middle and one scale for all of it)
  const box = schemeBox(structure ? read : { ...read, figure: { ...read.figure, atoms: [] } })!;
  const about = { x: (box[0] + box[2]) / 2, y: (box[1] + box[3]) / 2 };
  const model = structure ? modelOf(read.figure, (x, y) => ({ sha256, page, ...back({ x, y }), bond: read.figure.bond }), about) : { atoms: [], bonds: [] };
  const scheme = schemeOf(read, about);
  return { model, ...(scheme ? { scheme } : {}) };
}

/**
 * A scheme's arrows, "+" signs and words in Meno's units - the page's
 * points made a bond as long as Meno draws one, `about` at naught, the
 * page's y turned up - each arrow as the kind it was read as, its words
 * over it; none, where it has none.
 */
export function schemeOf(read: SchemeRead, about: { x: number; y: number }): ImportedScheme | null {
  if (!read.arrows.length && !read.pluses.length && !read.words.length) return null;
  // (at the scale its structures are taken at: lib/figure/structure `drawnBond`)
  const bond = read.figure.atoms.length ? drawnBond(read.figure) : read.bond;
  const k = bond ? NOMINAL_BOND_LENGTH / bond : 1;
  const to = (p: { x: number; y: number }) => ({ x: (p.x - about.x) * k, y: -(p.y - about.y) * k });
  const arrows = read.arrows.map((a) => {
    const from = to(a.tail);
    const end = to(a.point);
    const corners = a.corners.map((c) => cornerAt(from, end, to(c)));
    return {
      x: (from.x + end.x) / 2,
      y: (from.y + end.y) / 2,
      angle: Math.atan2(end.y - from.y, end.x - from.x),
      length: Math.hypot(end.x - from.x, end.y - from.y),
      ...a.form,
      ...(corners.length ? { corners } : {}),
      ...(a.color ? { color: a.color } : {}),
    };
  });
  const captions = read.words.map((w) => ({
    ...to({ x: (w.box[0] + w.box[2]) / 2, y: (w.box[1] + w.box[3]) / 2 }),
    text: w.text,
    ...(w.marks.length ? { marks: w.marks } : {}),
    ...(w.align ? { align: w.align } : {}),
    ...(w.arrow != null ? { arrowAt: w.arrow } : {}),
  }));
  return { arrows, pluses: read.pluses.map(to), captions };
}

/** A figure read made a structure in Meno's units, each atom tied to its place in the figure (`spot`) - its middle at naught, or `about`. */
export function modelOf(read: FigureRead, spot: (x: number, y: number) => FigureSpot, about?: { x: number; y: number }): Model {
  const s = structureOf(read, figureLabels, about);
  const degree = new Map<number, number>();
  for (const b of s.bonds) for (const e of [b.a, b.b]) degree.set(e, (degree.get(e) ?? 0) + 1);
  const atoms: Atom[] = s.atoms.map((a, i) => ({
    id: i + 1,
    x: a.x,
    y: a.y,
    r: 0.9,
    el: a.el,
    ...(a.charge ? { charge: a.charge } : {}),
    ...(a.isotope ? { isotope: a.isotope } : {}),
    ...(a.radical ? { radical: a.radical } : {}),
    seen: spot(read.atoms[i].x, read.atoms[i].y),
  }));
  const bonds: Bond[] = s.bonds.map((b, i) => ({
    id: atoms.length + i + 1,
    a: b.a + 1,
    b: b.b + 1,
    order: b.order,
    ...(b.stereo ? { stereo: b.stereo } : {}),
    // (a wedge narrow where the figure has it: Meno draws it narrow at the end with more bonds, else told)
    ...(b.stereo === "up" || b.stereo === "down" ? ((degree.get(b.a) ?? 0) < (degree.get(b.b) ?? 0) ? { stereoOrient: "reverse" as const } : {}) : {}),
    ...(b.bold ? { display: "bold" as const } : {}),
  }));
  // (made regular, its arrangement kept - its rings and chains where and as they go, at the style's bond and angles: lib/layout/
  // regularise - where that shows the stereochemistry it is drawn with, and moves nothing far; else as drawn)
  const drawn = { atoms: atoms.map((a) => ({ ...a })), bonds };
  const regular = regularised(
    s.atoms.map((a) => ({ x: a.x, y: a.y, el: a.el, ...(a.charge ? { charge: a.charge } : {}), ...(a.unsure ? { unsure: true } : {}) })),
    s.bonds.map((b) => ({ a: b.a, b: b.b, order: b.order, ...(b.stereo === "up" || b.stereo === "down" ? { stereo: true } : {}) })),
    NOMINAL_BOND_LENGTH,
  );
  if (regular) {
    const made = { atoms: atoms.map((a, i) => ({ ...a, x: regular[i].x, y: regular[i].y })), bonds };
    if (sameStereo(drawn, made)) made.atoms.forEach((a, i) => (atoms[i] = a));
  }
  s.atoms.forEach((a, i) => {
    if (a.unsure) atoms[i].unsure = { said: a.unsure, as: atomAs(atoms[i], bonds) };
  });
  s.bonds.forEach((b, i) => {
    if (b.unsure) bonds[i].unsure = { said: b.unsure, as: bondAs(bonds[i]) };
  });
  // (and, written out as a file has it - its labels' atoms and all - an atom with more bonds than it takes, not yet said: said,
  // so that no structure whose valence is broken is ever put down looking sure)
  for (const id of overBonded({ atoms, bonds })) {
    const a = atoms[id - 1];
    if (a.unsure) continue;
    const name = a.el === "C" ? "a carbon" : (ELEMENT_NAMES.get(a.el) ?? null);
    a.unsure = { said: [name ? `More bonds meet here than ${name} has.` : `"${a.el}" written out has an atom with more bonds than it takes.`], as: atomAs(a, bonds) };
  }
  return { atoms, bonds };
}

const ELEMENT_NAMES = new Map(ELEMENTS.map((e) => [e.symbol, e.name]));

type Region = { x0: number; y0: number; x1: number; y1: number };
const overlaps = (a: Region, b: Region) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/** The points a figure read stands on: its atoms, its arrows' ends and corners, its "+" signs, and its words' middles - each word taken half a bond wider all round. */
function pointsOf(read: FigureResult): { x: number; y: number }[] {
  const pad = NOMINAL_BOND_LENGTH / 2;
  return [
    ...read.model.atoms,
    ...(read.scheme?.arrows ?? []).flatMap((a) => arrowPoints(a)),
    ...(read.scheme?.pluses ?? []),
    ...(read.scheme?.captions ?? []).flatMap((c) => [
      { x: c.x - pad, y: c.y - pad },
      { x: c.x + pad, y: c.y + pad },
    ]),
  ];
}

/**
 * A figure read moved to lie beside what it was read from - its left edge
 * two bonds past the region's right, its top level with the region's -
 * and on to the right until it is clear of what is `taken`: its structure
 * and its scheme together, as they stand to each other, measured as
 * `regionOf` measures it.
 */
export function placedBeside(read: FigureResult, region: Region, taken: readonly Region[], style?: DrawingStyle): FigureResult {
  const room = regionOf(read, style);
  if (!room) return read;
  const pad = 0.5 * NOMINAL_BOND_LENGTH;
  const w = room.x1 - room.x0;
  const h = room.y1 - room.y0;
  const gap = 2 * NOMINAL_BOND_LENGTH;
  let x0 = region.x1 + gap;
  const top = region.y1;
  for (let n = 0; n < 200; n++) {
    const here = { x0: x0 - pad, x1: x0 + w + pad, y0: top - h - pad, y1: top + pad };
    const hit = taken.filter((t) => overlaps(here, t));
    if (!hit.length) break;
    x0 = Math.max(...hit.map((t) => t.x1)) + gap;
  }
  const dx = x0 - room.x0;
  const dy = top - room.y1;
  const by = <T extends { x: number; y: number }>(p: T): T => ({ ...p, x: p.x + dx, y: p.y + dy });
  const scheme = read.scheme && {
    ...read.scheme,
    arrows: (read.scheme.arrows ?? []).map(by),
    pluses: (read.scheme.pluses ?? []).map(by),
    captions: (read.scheme.captions ?? []).map(by),
  };
  return { model: { ...read.model, atoms: read.model.atoms.map(by) }, ...(scheme ? { scheme } : {}) };
}

/**
 * Where on the page a figure read stands: the box round all of it, half a
 * bond wider all round - and, given the drawing's style, its labels as far
 * as the layout sets them and its words as far as they are set, as the page
 * measures what lies on it (./freePlace `labelBoxes`, ./extent `captionBox`).
 */
export function regionOf(read: FigureResult, style?: DrawingStyle): Region | null {
  const pts = pointsOf(read);
  if (!pts.length) return null;
  const boxes = style
    ? [...labelBoxes(labelledPart(read.model), style), ...(read.scheme?.captions ?? []).map((c) => captionBox(c, editorLayoutOptions(style)))]
    : [];
  const xs = [...pts.map((a) => a.x), ...boxes.flatMap((b) => [b.x0, b.x1])];
  const ys = [...pts.map((a) => a.y), ...boxes.flatMap((b) => [b.y0, b.y1])];
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}

/** Where an atom was drawn in a figure, if it was read from one. */
export function spotOf(model: Model, id: number | null): FigureSpot | null {
  if (id == null) return null;
  return model.atoms.find((a) => a.id === id)?.seen ?? null;
}

/** The atom read from a figure whose place there is nearest a point of a PDF's page - in points from its top left - or of a picture, in its pixels (`page` none), near enough to be it: within a third of the figure's bond. */
export function atomAtSpot(model: Model, sha256: string, page: number | undefined, x: number, y: number): number | null {
  let best: number | null = null;
  let bestD = Infinity;
  for (const a of model.atoms) {
    const s = a.seen;
    if (!s || s.sha256 !== sha256 || s.page !== page) continue;
    const d = Math.hypot(s.x - x, s.y - y);
    if (d < bestD && d < s.bond / 3) {
      best = a.id;
      bestD = d;
    }
  }
  return best;
}
