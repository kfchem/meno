/**
 * Structures read from PDFs' figures (docs/PDF.md, *Stage 5*): a figure in
 * a box of a page read as a structure drawn as the figure draws it - where
 * its atoms lie, as long as Meno draws a bond - each atom tied to the place
 * in the figure it was drawn at; what Meno was unsure of, marked while the
 * part is as it was read; and where the structure goes on the page: beside
 * what it was read from, clear of what lies there.
 */
import { invoke, isTauri } from "@tauri-apps/api/core";
import type { Box, FigureDrawn } from "../../../../lib/figure/drawn";
import { readFigure } from "../../../../lib/figure/read";
import { readDrawnLabel, structureOf, type LabelReader } from "../../../../lib/figure/structure";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { isElementSymbol } from "../../../../lib/roles/molblock";
import { labelReading, readLabel } from "./labelTyping";
import { systemGlyphs } from "./glyphShapes";
import type { GlyphShape } from "../../../../lib/figure/glyphs";
import type { Atom, Bond, FigureSpot, Model } from "../store/types";

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
export async function readBox(sha256: string, page: number, box: Box): Promise<Model | Unread> {
  if (!isTauri()) return { none: "Figures are read in the app." };
  const drawn = await invoke<FigureDrawn>("pdf_figure", { sha: sha256, page, box });
  return structureFrom(drawn, sha256, page);
}

/** What a figure as drawn reads as, tied to its PDF's page (`readBox`). */
export function structureFrom(drawn: FigureDrawn, sha256: string, page: number, known?: readonly GlyphShape[]): Model | Unread {
  // (letters drawn as shapes - filled paths of several parts, or curved - read against the system's letters)
  const shaped = drawn.paths.some((p) => p.fill && (p.d.filter((s) => s[0] === "M").length > 1 || p.d.some((s) => s[0] === "C")));
  const read = readFigure(drawn, (l) => readDrawnLabel(l, figureLabels).read, known ?? (shaped ? systemGlyphs() : []));
  if (!read.atoms.length || !read.bonds.length) {
    return { none: drawn.pictures.length ? "This figure is a picture, not a drawing: there are no lines to read." : "No structure is drawn there." };
  }
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
    seen: { sha256, page, x: read.atoms[i].x, y: read.atoms[i].y, bond: read.bond },
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

/** The atom read from a figure whose place there is nearest a point of a PDF's page - in points from its top left - near enough to be it: within a third of the figure's bond. */
export function atomAtSpot(model: Model, sha256: string, page: number, x: number, y: number): number | null {
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
