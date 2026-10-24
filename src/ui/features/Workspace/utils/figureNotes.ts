/**
 * The notes over structures read from a figure (docs/PDF.md, *Read from a
 * figure*): every structure taken from a PDF's figure, or a picture's, says
 * so - and to check it - until the chemist says it was checked, whatever is
 * edited of it meanwhile: putting one part right does not make the rest so.
 */
import { structuresOf } from "../../../../lib/chem/magnified2d";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { drawnBox } from "../../../../utils/importers";
import type { Model } from "../store/types";
import { readMarks } from "./figures";

/** A structure read from a figure and not yet said to be checked: its atoms, where it was read from, and how many of its parts are still marked unsure. */
export type FigureNote = { atoms: ReadonlySet<number>; sha256: string; page?: number; unsure: number };

/**
 * Each structure of `model` with an atom read from a figure not yet said to
 * be checked - joined by a bond to one that was, still (its own "check it"
 * kept): where that atom was read from, and how many parts of what is
 * unchecked of it are still marked unsure.
 */
export function figureNotesOf(model: Model): FigureNote[] {
  if (!model.atoms.some((a) => a.seen && !a.seen.checked)) return [];
  const marks = readMarks(model);
  return structuresOf(model.atoms, model.bonds).flatMap((group): FigureNote[] => {
    const atoms = group.map((i) => model.atoms[i]);
    const open = atoms.filter((a) => a.seen && !a.seen.checked);
    const read = open[0];
    if (!read?.seen) return [];
    const ids = new Set(atoms.map((a) => a.id));
    const unchecked = new Set(open.map((a) => a.id));
    const unsure = open.filter((a) => marks.atoms.has(a.id)).length + model.bonds.filter((b) => ids.has(b.a) && (unchecked.has(b.a) || unchecked.has(b.b)) && marks.bonds.has(b.id)).length;
    return [{ atoms: ids, sha256: read.seen.sha256, ...(read.seen.page != null ? { page: read.seen.page } : {}), unsure }];
  });
}

/**
 * What `figureNotesOf` depends on, as a key: the drawing's size, and each
 * atom read from a figure - checked or not, marked unsure or not - with its
 * bonds. Unchanged, the notes are as they were: an atom dragged, a label
 * typed elsewhere, nothing of them changed, they are not worked out again.
 */
export function figureNotesKey(model: Model): string {
  const seen = new Set<number>();
  const parts: string[] = [`${model.atoms.length}:${model.bonds.length}`];
  for (const a of model.atoms) {
    if (!a.seen) continue;
    seen.add(a.id);
    parts.push(`${a.id}${a.seen.checked ? "c" : ""}${a.unsure ? `u${a.unsure.as}|${a.el}|${a.charge ?? 0}` : ""}`);
  }
  if (!seen.size) return parts[0];
  for (const b of model.bonds) if (seen.has(b.a) || seen.has(b.b)) parts.push(`${b.id}:${b.a}:${b.b}:${b.order}:${b.stereo ?? ""}${b.unsure ? `u${b.unsure.as}` : ""}`);
  return parts.join(",");
}

/** How far over a structure's ink its note stands, in world units: half a bond. */
const NOTE_OVER = NOMINAL_BOND_LENGTH / 2;

/** Where notes stood, each with what its place was worked out from: kept between calls of `figureNotePlaces`. */
export type NotePlaces = Map<number, { atoms: Model["atoms"]; bonds: Model["bonds"]; from: string; at: { x: number; y: number } }>;

/**
 * Where each note stands - over the middle of its structure's ink, its labels
 * and all, half a bond off (y up) - by the note's least atom id. Worked out
 * again only for a structure whose atoms have moved or changed since `held`
 * had it: a structure dragged, its note follows it, and only its own; the
 * others stay as they were, not worked out at each frame.
 */
export function figureNotePlaces(model: Model, notes: readonly FigureNote[], held: NotePlaces): Map<number, { x: number; y: number }> {
  const out = new Map<number, { x: number; y: number }>();
  if (!notes.length) {
    held.clear();
    return out;
  }
  const noteOf = new Map<number, number>();
  notes.forEach((n, i) => n.atoms.forEach((id) => noteOf.set(id, i)));
  const atoms = notes.map((): Model["atoms"] => []);
  const bonds = notes.map((): Model["bonds"] => []);
  for (const a of model.atoms) {
    const i = noteOf.get(a.id);
    if (i != null) atoms[i].push(a);
  }
  for (const b of model.bonds) {
    const i = noteOf.get(b.a);
    if (i != null && noteOf.get(b.b) === i) bonds[i].push(b);
  }
  notes.forEach((n, i) => {
    const key = Math.min(...n.atoms);
    const was = held.get(key);
    // (the very atoms and bonds it had - an edit elsewhere leaves them be - or, made anew, the same: all of them, as its ink's box is of them all)
    const same = (a: readonly object[], b: readonly object[]) => a.length === b.length && a.every((x, j) => x === b[j]);
    if (was && same(was.atoms, atoms[i]) && same(was.bonds, bonds[i])) return void out.set(key, was.at);
    const from = JSON.stringify([atoms[i], bonds[i]]);
    if (was?.from === from) {
      held.set(key, { ...was, atoms: atoms[i], bonds: bonds[i] });
      return void out.set(key, was.at);
    }
    const box = drawnBox({ atoms: atoms[i], bonds: bonds[i] });
    const at = { x: (box.minX + box.maxX) / 2, y: box.maxY + NOTE_OVER };
    held.set(key, { atoms: atoms[i], bonds: bonds[i], from, at });
    out.set(key, at);
  });
  for (const key of held.keys()) if (!out.has(key)) held.delete(key);
  return out;
}

/** What a structure's note says: that it was read from a figure, to be checked - and how many of its parts are still unsure. */
export function figureNoteText(unsure: number): string {
  return `Read from a figure: check it${unsure ? ` · ${unsure} ${unsure === 1 ? "part" : "parts"} unsure` : ""}`;
}

/** What a structure's note says where the pointer is on it: where it was read from, and how to say it was checked. */
export function figureNoteTitle(from: string, page?: number): string {
  return `From ${from}${page != null ? `, p. ${page + 1}` : ""}, read as drawn there. Check it against the figure; right-click it to say it was checked.`;
}
