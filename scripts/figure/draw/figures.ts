/**
 * Figures of structures drawn from a manifest, as SVG, by Meno's own drawing
 * code (README.md): each structure read from its file, laid out by Meno or
 * kept as the file has it, set in a row or a grid at one bond length with its
 * words under it, a reaction arrow with words over and under it between two of
 * a row - and the whole drawn as the app draws a copy of its drawing
 * (`drawingSvg`).
 *
 * Nothing here is part of the app, and its input may change.
 */
import { captionSet } from "../../../src/lib/chem/captions";
import { arrowsWithWords, ARROW_CLEAR } from "../../../src/lib/chem/captions";
import { labelSetOf } from "../../../src/lib/chem/layout2d";
import { gridOf } from "../../../src/lib/layout/many";
import { STYLE_PRESETS, styleOf } from "../../../src/lib/chem/style";
import type { DrawingStyle } from "../../../src/lib/chem/style";
import { laidOut } from "../../../src/ui/features/Workspace/chem/cleanUp";
import { emptyWorkspaceDocument } from "../../../src/ui/features/Workspace/document";
import { drawingLayout, drawingSvg } from "../../../src/ui/features/Workspace/fileActions";
import type { Arrow, Caption, Drawn, Model } from "../../../src/ui/features/Workspace/store/types";
import { drawnOf, processFileContent } from "../../../src/ui/features/Workspace/utils/io";

/** Words over and under the arrow after an item: each line of them is a line of the text. */
export type ArrowWords = { over?: string; under?: string };
/** What is highlighted in an item, by number from 1 in its file's order, and the colour (#rrggbb) it is highlighted in. */
export type Highlight = { atoms?: number[]; bonds?: number[]; color?: string };
export type ItemSpec = {
  /** The structure's file (.mol, .sdf or .rxn), by its path from the manifest's folder. */
  file: string;
  /** The caption's first line, centred under the structure. */
  id?: string;
  /** Its second line: a value, say. */
  value?: string;
  /** Which record of an .sdf file (from 1; the first unless said). */
  record?: number;
  /** The file's own coordinates, as they are (scaled to the bond length): not Meno's layout. An .rxn file is always drawn as it is. */
  keepLayout?: boolean;
  highlight?: Highlight;
  /** An arrow from this item to the next, with these words over it and under it. */
  arrowAfter?: ArrowWords;
};
export type FigureSpec = {
  /** The file it is written to is `<name>.svg`. */
  name: string;
  items: ItemSpec[];
  /** In a grid of this many to a row; unset, the items stand in one row. */
  columns?: number;
  /** This figure's style, by preset id, over the manifest's. */
  style?: string;
};
export type Manifest = {
  /** A style preset's id (`STYLE_PRESETS`); unset, the first. */
  style?: string;
  /** The folder the SVG files go to, from the manifest's folder (default: that folder). */
  out?: string;
  figures: FigureSpec[];
};
export type FigureDrawn = { name: string; svg: string; drawn: Drawn };

/** Something in the manifest that cannot be drawn: it says which figure, and which item. */
export class FigureError extends Error {}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const COLOR = /^#[0-9a-fA-F]{6}$/;
const DEFAULT_HIGHLIGHT = "#ffd400";
/** World units: between items, and between a structure and its caption. */
const GAP = 3.6;
const CAPTION_GAP = 0.8;
/** The length an arrow is given before its words make it longer, in bond lengths. */
const ARROW_BONDS = 3;
const ARROW_GAP = 1;

const where = (figure: string, item?: number, spec?: ItemSpec) =>
  item == null ? `figure "${figure}"` : `figure "${figure}", item ${item + 1}${spec?.id ? ` ("${spec.id}")` : spec?.file ? ` (${spec.file})` : ""}`;

/** The manifest's own mistakes, found before any file is read. */
function checked(manifest: unknown): Manifest {
  if (!isObject(manifest) || !Array.isArray(manifest.figures)) throw new FigureError(`The manifest must be an object with a "figures" list.`);
  const presets = STYLE_PRESETS.map((p) => p.id);
  const preset = (id: unknown, at: string) => {
    if (id != null && (typeof id !== "string" || !presets.includes(id))) throw new FigureError(`${at}: unknown style ${JSON.stringify(id)} (presets: ${presets.join(", ")}).`);
  };
  preset(manifest.style, "The manifest");
  const names = new Set<string>();
  manifest.figures.forEach((f: unknown, i) => {
    if (!isObject(f)) throw new FigureError(`Figure ${i + 1} is not an object.`);
    const name = typeof f.name === "string" ? f.name : "";
    if (!/^[\w.-]+$/.test(name)) throw new FigureError(`Figure ${i + 1} needs a "name" of letters, digits, "_", "-" and "." (it is the file's name).`);
    if (names.has(name)) throw new FigureError(`${where(name)}: the name is used twice.`);
    names.add(name);
    preset(f.style, where(name));
    const listed = f.items;
    if (!Array.isArray(listed) || !listed.length) throw new FigureError(`${where(name)}: "items" must be a list with at least one item.`);
    if (f.columns != null && (!Number.isInteger(f.columns) || (f.columns as number) < 1)) throw new FigureError(`${where(name)}: "columns" must be a whole number of 1 or more.`);
    listed.forEach((it: unknown, j) => {
      const spec = it as ItemSpec;
      if (!isObject(it) || typeof it.file !== "string" || !it.file) throw new FigureError(`${where(name, j)}: an item needs a "file".`);
      if (!/\.(mol|sdf|rxn)$/i.test(it.file)) throw new FigureError(`${where(name, j, spec)}: "${it.file}" is not a .mol, .sdf or .rxn file.`);
      if (it.arrowAfter != null) {
        if (f.columns != null) throw new FigureError(`${where(name, j, spec)}: an arrow stands between items of a row; this figure is a grid ("columns").`);
        if (j === listed.length - 1) throw new FigureError(`${where(name, j, spec)}: "arrowAfter" on the last item has no item to point to.`);
      }
      const h = it.highlight;
      if (h != null && (!isObject(h) || (h.color != null && !(typeof h.color === "string" && COLOR.test(h.color))))) throw new FigureError(`${where(name, j, spec)}: "highlight" is {atoms, bonds, color}, the colour as #rrggbb.`);
    });
  });
  return manifest as unknown as Manifest;
}

/** A number of a file's atoms or bonds, from 1: it must be one the file has. */
function numbered(list: readonly number[] | undefined, count: number, what: string, at: string): number[] {
  return (list ?? []).map((n) => {
    if (!Number.isInteger(n) || n < 1 || n > count) throw new FigureError(`${at}: ${what} ${JSON.stringify(n)} is not in the file, which has ${count} (numbered from 1).`);
    return n;
  });
}

/** One item read, and laid out by Meno unless its layout is kept: with its highlights, centred on the origin's x and y by its bounds later. */
async function drawnItem(spec: ItemSpec, at: string, read: (path: string) => string, style: DrawingStyle): Promise<Drawn> {
  let text: string;
  try {
    text = read(spec.file);
  } catch {
    throw new FigureError(`${at}: the file "${spec.file}" cannot be read (is it missing?).`);
  }
  let name = spec.file;
  if (/\.sdf$/i.test(spec.file)) {
    const records = text.split(/^\$\$\$\$.*(?:\r?\n|$)/m).filter((r) => r.trim() !== "");
    const n = spec.record ?? 1;
    if (!Number.isInteger(n) || n < 1 || n > records.length) throw new FigureError(`${at}: "${spec.file}" has ${records.length} record${records.length === 1 ? "" : "s"}; record ${JSON.stringify(n)} is not one of them.`);
    text = records[n - 1];
    name = "record.mol";
  } else if (spec.record != null) {
    throw new FigureError(`${at}: "record" is for an .sdf file.`);
  }
  let drawn: Drawn;
  try {
    drawn = drawnOf(await processFileContent(name, text));
  } catch (e) {
    throw new FigureError(`${at}: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!drawn.atoms.length) throw new FigureError(`${at}: "${spec.file}" holds no flat structure (a 3D structure is not drawn here).`);
  const atomIds = numbered(spec.highlight?.atoms, drawn.atoms.length, "atom", at).map((n) => drawn.atoms[n - 1].id);
  const bondIds = numbered(spec.highlight?.bonds, drawn.bonds.length, "bond", at).map((n) => drawn.bonds[n - 1].id);
  // (the reader has scaled the file's bonds to the drawing's bond length - 1.8 world units, whatever the file's own - so that what is kept is kept at the style's scale)
  if (!spec.keepLayout && !/\.rxn$/i.test(spec.file)) {
    let model: Model;
    try {
      model = await laidOut({ atoms: drawn.atoms, bonds: drawn.bonds }, style);
    } catch (e) {
      throw new FigureError(`${at}: Meno could not lay it out: ${e instanceof Error ? e.message : String(e)}`);
    }
    drawn = { ...drawn, atoms: model.atoms, bonds: model.bonds };
  }
  const color = spec.highlight?.color ?? DEFAULT_HIGHLIGHT;
  const aSet = new Set(atomIds);
  const bSet = new Set(bondIds);
  // (by id, which the layout keeps: a file's atom is the same atom after it)
  const atoms = drawn.atoms.map((a) => (aSet.has(a.id) ? { ...a, highlight: color } : a));
  const bonds = drawn.bonds.map((b) => (bSet.has(b.id) ? { ...b, highlight: color } : b));
  if (aSet.size !== atoms.filter((a) => a.highlight === color && aSet.has(a.id)).length || bSet.size !== bonds.filter((b) => bSet.has(b.id)).length)
    throw new FigureError(`${at}: Meno's layout did not keep the atoms or bonds to highlight.`);
  return { ...drawn, atoms, bonds };
}

type Placed = { drawn: Drawn; w: number; h: number; cx: number; cy: number; id?: string; caption?: { text: string; halfW: number; halfH: number } };

/** `d` moved by (dx, dy) and its ids raised by the first free ones: its atoms, bonds, arrows and pluses. */
function moved(d: Drawn, dx: number, dy: number, atomBase: number, bondBase: number, arrowBase: number, plusBase: number) {
  return {
    atoms: d.atoms.map((a) => ({ ...a, id: a.id + atomBase, x: a.x + dx, y: a.y + dy })),
    bonds: d.bonds.map((b) => ({ ...b, id: b.id + bondBase, a: b.a + atomBase, b: b.b + atomBase })),
    arrows: (d.arrows ?? []).map((a) => ({ ...a, id: a.id + arrowBase, x: a.x + dx, y: a.y + dy })),
    pluses: (d.pluses ?? []).map((p) => ({ ...p, id: p.id + plusBase, x: p.x + dx, y: p.y + dy })),
  };
}

/** One figure drawn. */
async function drawnFigure(fig: FigureSpec, style: DrawingStyle, read: (path: string) => string): Promise<Drawn> {
  const doc = emptyWorkspaceDocument();
  const aromatic = { aromaticEnabled: doc.aromaticEnabled, aromaticRings: doc.aromaticRings };
  const items: Placed[] = [];
  for (const [j, spec] of fig.items.entries()) {
    const at = where(fig.name, j, spec);
    const drawn = await drawnItem(spec, at, read, style);
    const { layout } = drawingLayout(drawn, aromatic, style);
    const { min, max } = layout.bounds;
    items.push({ drawn, w: max.x - min.x, h: max.y - min.y, cx: (min.x + max.x) / 2, cy: (min.y + max.y) / 2, ...(spec.id ? { id: spec.id } : {}) });
  }
  // (the size of the labels, as the drawing sets them)
  const opts = drawingLayout({ atoms: [], bonds: [] }, aromatic, style).opts;
  const set = labelSetOf(opts);
  const wordsOf = (text: string) => {
    const s = captionSet(text, 0, 0, opts.fontPx, set);
    return { text, halfW: s.halfW, halfH: s.halfH };
  };
  fig.items.forEach((spec, j) => {
    const text = [spec.id, spec.value].filter((l): l is string => !!l).join("\n");
    if (text) items[j].caption = wordsOf(text);
  });
  const structH = Math.max(...items.map((p) => p.h));
  const capH = Math.max(0, ...items.map((p) => (p.caption ? 2 * p.caption.halfH : 0)));
  const rowH = structH + (capH ? CAPTION_GAP + capH : 0);

  // where each item's middle goes (y up, the first row at the top: the page's rows run down it)
  const mid: { x: number; y: number }[] = [];
  const arrowLength = new Map<number, number>();
  const arrowWords = new Map<number, { over?: ReturnType<typeof wordsOf>; under?: ReturnType<typeof wordsOf> }>();
  if (fig.columns == null) {
    let x = 0;
    for (const [j, p] of items.entries()) {
      const w = Math.max(p.w, p.caption ? 2 * p.caption.halfW : 0);
      mid.push({ x: x + w / 2, y: 0 });
      x += w;
      const words = fig.items[j].arrowAfter;
      if (words) {
        const over = words.over ? wordsOf(words.over) : undefined;
        const under = words.under ? wordsOf(words.under) : undefined;
        arrowWords.set(j, { over, under });
        const start = ARROW_BONDS * 1.8;
        const arrow = { id: 1, x: 0, y: 0, angle: 0, length: start } as Arrow;
        // (the arrow as long as its words need, as on the canvas: with them put over and under it)
        const words2: Caption[] = [over, under].flatMap((w, k) => (w ? [{ id: k + 1, x: 0, y: (k ? -1 : 1) * (ARROW_CLEAR * opts.fontPx + w.halfH), text: w.text, arrow: 1 }] : []));
        const length = arrowsWithWords([arrow], words2, opts.fontPx, set, opts.pointPx)[0].length;
        arrowLength.set(j, length);
        x += length + 2 * ARROW_GAP * 1.8 - GAP;
      }
      x += GAP;
    }
    const total = x - GAP;
    mid.forEach((m) => (m.x -= total / 2));
  } else {
    const cells = gridOf(
      items.map((p) => ({ minX: 0, minY: 0, maxX: Math.max(p.w, p.caption ? 2 * p.caption.halfW : 0), maxY: rowH })),
      GAP,
      fig.columns,
    );
    // (the cells run down the page, its y runs up)
    const cellH = rowH + GAP;
    cells.forEach((c) => mid.push({ x: c.x, y: -c.y + cellH / 2 }));
  }
  // (the structures stand with their middles on the row's, each caption under all of them, its middle under its structure's)
  const rowTop = (m: { y: number }) => m.y + rowH / 2;
  const atoms: Drawn["atoms"] = [];
  const bonds: Drawn["bonds"] = [];
  const arrows: Arrow[] = [];
  const pluses: NonNullable<Drawn["pluses"]> = [];
  const captions: Caption[] = [];
  let atomBase = 0;
  let bondBase = 0;
  let arrowBase = 0;
  let plusBase = 0;
  let captionId = 0;
  const grid = fig.columns != null;
  items.forEach((p, j) => {
    const m = mid[j];
    // (a row's structures are centred on y = 0; a grid's stand at the top of their cells: all captions under the tallest)
    const centreY = grid ? rowTop(m) - structH / 2 : 0;
    const part = moved(p.drawn, m.x - p.cx, centreY - p.cy, atomBase, bondBase, arrowBase, plusBase);
    atoms.push(...part.atoms);
    bonds.push(...part.bonds);
    arrows.push(...part.arrows);
    pluses.push(...part.pluses);
    atomBase = Math.max(atomBase, ...part.atoms.map((a) => a.id));
    bondBase = Math.max(bondBase, 0, ...part.bonds.map((b) => b.id));
    arrowBase = Math.max(arrowBase, 0, ...part.arrows.map((a) => a.id));
    plusBase = Math.max(plusBase, 0, ...part.pluses.map((q) => q.id));
    if (p.caption) {
      const bottom = centreY - structH / 2 - CAPTION_GAP;
      captions.push({ id: ++captionId, x: m.x, y: bottom - p.caption.halfH, text: p.caption.text });
    }
    const words = arrowWords.get(j);
    if (words) {
      const length = arrowLength.get(j)!;
      const nextMid = mid[j + 1];
      const right = m.x + Math.max(p.w, p.caption ? 2 * p.caption.halfW : 0) / 2;
      const next = items[j + 1];
      const left = nextMid.x - Math.max(next.w, next.caption ? 2 * next.caption.halfW : 0) / 2;
      const x = (right + left) / 2;
      const id = ++arrowBase;
      arrows.push({ id, x, y: centreY, angle: 0, length } as Arrow);
      if (words.over) captions.push({ id: ++captionId, x, y: centreY + ARROW_CLEAR * opts.fontPx + words.over.halfH, text: words.over.text, arrow: id });
      if (words.under) captions.push({ id: ++captionId, x, y: centreY - ARROW_CLEAR * opts.fontPx - words.under.halfH, text: words.under.text, arrow: id });
    }
  });
  return { atoms, bonds, ...(arrows.length ? { arrows } : {}), ...(pluses.length ? { pluses } : {}), ...(captions.length ? { captions } : {}) };
}

/**
 * Every figure of `manifest`, drawn: its SVG and what it was drawn from.
 * `read` gives a file's text by its path from the manifest's folder, and
 * throws where it cannot. A mistake in the manifest or a file is a
 * `FigureError` naming the figure and the item.
 */
export async function drawFigures(manifest: unknown, read: (path: string) => string): Promise<FigureDrawn[]> {
  const given = checked(manifest);
  const doc = emptyWorkspaceDocument();
  const aromatic = { aromaticEnabled: doc.aromaticEnabled, aromaticRings: doc.aromaticRings };
  const out: FigureDrawn[] = [];
  for (const fig of given.figures) {
    const style = styleOf({ preset: fig.style ?? given.style ?? STYLE_PRESETS[0].id, changes: {} });
    const drawn = await drawnFigure(fig, style, read);
    out.push({ name: fig.name, svg: drawingSvg(drawn, aromatic, style), drawn });
  }
  return out;
}
