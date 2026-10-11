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
import type { Box, FigureDrawn } from "../../../../lib/figure/drawn";
import { readFigure, type FigureRead } from "../../../../lib/figure/read";
import { pictureFigure, scaledFigure } from "../../../../lib/figure/picture";
import { boxPicture } from "../../../../lib/pdf/reader";
import { chemWorker } from "../../../../lib/roles/worker";
import { toBase64 } from "../../../../lib/clipboard";
import { readDrawnLabel, structureOf, type LabelReader } from "../../../../lib/figure/structure";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { isElementSymbol } from "../../../../lib/roles/molblock";
import { labelReading, readLabel } from "./labelTyping";
import type { Atom, Bond, FigureSpot, Model, PictureItem } from "../store/types";
import { picturePng } from "./pictures";

/** A label as drawn read as one typed is: an element with its charge, or a group's name - or nothing. */
export const figureLabels: LabelReader = (label) => {
  if (!labelReading(label)) return null;
  const r = readLabel(label, isElementSymbol);
  if (r.kind === "element") return { el: r.el, charge: r.charge };
  if (r.kind === "charge") return { el: "C", charge: r.charge };
  return { el: label };
};

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

/** Why a figure gave no structure: what to say. */
export type Unread = { none: string };

/**
 * A figure within a box of a PDF's page, read as a structure: its atoms
 * where the figure has them - its middle at naught, a bond as long as Meno
 * draws one - each tied to where it was drawn; or why it gave none.
 */
export async function readBox(sha256: string, page: number, box: Box, working?: (what: string) => void): Promise<Model | Unread> {
  if (!isTauri()) return { none: "Figures are read in the app." };
  const drawn = await invoke<FigureDrawn>("pdf_figure", { sha: sha256, page, box });
  const read = structureFrom(drawn, sha256, page);
  // (a figure that is a picture: the picture read, by the plugin that reads them)
  if ("none" in read && drawn.pictures.length) {
    working?.("Reading the picture…");
    return readBoxPicture(sha256, page, box);
  }
  return read;
}

/** How finely a figure that is a picture is drawn to be read: enough for its letters, more than a picture's reader looks at. */
const READ_DPI = 200;
/** How long a picture's reading may take: the first loads the plugin's model. */
const READ_MS = 120_000;

/** A picture read by the plugin that reads structures from pictures: what it read, in the picture's pixels; or why nothing came of it. */
async function readByPlugin(bytes: Uint8Array): Promise<FigureRead | Unread> {
  const worker = await chemWorker("pictures");
  const answer = await worker.request("read_picture", { picture: toBase64(bytes) }, READ_MS);
  return pictureFigure(answer) ?? { none: "No structure was found in the picture." };
}

/** A box of a PDF's page drawn as a picture and read by the plugin that reads pictures, each atom tied to its place on the page. */
async function readBoxPicture(sha256: string, page: number, box: Box): Promise<Model | Unread> {
  const shot = await boxPicture(sha256, page, box, READ_DPI);
  const read = await readByPlugin(shot.png);
  if ("none" in read) return read;
  // (its pixels made the page's points: a pixel is 72/dpi of a point, from the box's top left)
  const k = 72 / shot.dpi;
  const onPage = scaledFigure(read, k, box[0], box[1]);
  return modelOf(onPage, (x, y) => ({ sha256, page, x, y, bond: onPage.bond }));
}

/** A picture on the page read by the plugin that reads pictures, each atom tied to its place in the picture, in its pixels. */
export async function readPicture(picture: Pick<PictureItem, "sha256" | "media">): Promise<Model | Unread> {
  if (!isTauri()) return { none: "Pictures are read in the app." };
  const png = await picturePng(picture);
  if (!png) return { none: "A film is not read as a structure." };
  const read = await readByPlugin(png);
  if ("none" in read) return read;
  return modelOf(read, (x, y) => ({ sha256: picture.sha256, x, y, bond: read.bond }));
}

/** What a figure as drawn reads as, tied to its PDF's page (`readBox`). */
export function structureFrom(drawn: FigureDrawn, sha256: string, page: number): Model | Unread {
  const read = readFigure(drawn, (l) => readDrawnLabel(l, figureLabels).read);
  if (!read.atoms.length || !read.bonds.length) {
    return { none: drawn.pictures.length ? "This figure is a picture, not a drawing: there are no lines to read." : "No structure is drawn there." };
  }
  return modelOf(read, (x, y) => ({ sha256, page, x, y, bond: read.bond }));
}

/** A figure read made a structure in Meno's units, each atom tied to its place in the figure (`spot`). */
function modelOf(read: FigureRead, spot: (x: number, y: number) => FigureSpot): Model {
  const s = structureOf(read, figureLabels);
  const degree = new Map<number, number>();
  for (const b of s.bonds) for (const e of [b.a, b.b]) degree.set(e, (degree.get(e) ?? 0) + 1);
  const atoms: Atom[] = s.atoms.map((a, i) => ({
    id: i + 1,
    x: a.x,
    y: a.y,
    r: 0.9,
    el: a.el,
    ...(a.charge ? { charge: a.charge } : {}),
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
  s.atoms.forEach((a, i) => {
    if (a.unsure) atoms[i].unsure = { said: a.unsure, as: atomAs(atoms[i], bonds) };
  });
  s.bonds.forEach((b, i) => {
    if (b.unsure) bonds[i].unsure = { said: b.unsure, as: bondAs(bonds[i]) };
  });
  return { atoms, bonds };
}

type Region = { x0: number; y0: number; x1: number; y1: number };
const overlaps = (a: Region, b: Region) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/**
 * A structure moved to lie beside what it was read from - its left edge
 * two bonds past the region's right, its top level with the region's -
 * and on to the right until it is clear of what is `taken`.
 */
export function placedBeside(model: Model, region: Region, taken: readonly Region[]): Model {
  if (!model.atoms.length) return model;
  const xs = model.atoms.map((a) => a.x);
  const ys = model.atoms.map((a) => a.y);
  const pad = 0.5 * NOMINAL_BOND_LENGTH;
  const w = Math.max(...xs) - Math.min(...xs);
  const h = Math.max(...ys) - Math.min(...ys);
  const gap = 2 * NOMINAL_BOND_LENGTH;
  let x0 = region.x1 + gap;
  const top = region.y1;
  for (let n = 0; n < 200; n++) {
    const here = { x0: x0 - pad, x1: x0 + w + pad, y0: top - h - pad, y1: top + pad };
    const hit = taken.filter((t) => overlaps(here, t));
    if (!hit.length) break;
    x0 = Math.max(...hit.map((t) => t.x1)) + gap;
  }
  const dx = x0 - Math.min(...xs);
  const dy = top - Math.max(...ys);
  return { ...model, atoms: model.atoms.map((a) => ({ ...a, x: a.x + dx, y: a.y + dy })) };
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
