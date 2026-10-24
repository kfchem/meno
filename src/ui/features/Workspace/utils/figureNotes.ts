/**
 * The notes over structures read from a figure (docs/PDF.md, *Read from a
 * figure*): a structure taken from a PDF's figure, or a picture's, with
 * parts still unsure says so - and to check it - until those are put right
 * or the chemist says it was checked; where it came from is kept with its
 * atoms and said quietly, the pointer on it, and in its menu.
 */
import { structuresOf } from "../../../../lib/chem/magnified2d";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { drawnBox } from "../../../../utils/importers";
import type { Model } from "../store/types";
import { atomAs, bondAs, readMarks } from "./figures";

/** A structure read from a figure: its atoms, where it was read from, how many parts of what is not said to be checked of it are still marked unsure, and whether all of it is said to be checked. */
export type FigureNote = { atoms: ReadonlySet<number>; sha256: string; page?: number; unsure: number; checked: boolean };

/**
 * Each structure of `model` with an atom read from a figure: where it was
 * read from (an atom not said to be checked first - joined by a bond to one
 * that was, its own kept), how many parts of what is unchecked of it are
 * still marked unsure, and whether all of it is said to be checked.
 */
export function figureNotesOf(model: Model): FigureNote[] {
  if (!model.atoms.some((a) => a.seen)) return [];
  const marks = readMarks(model);
  return structuresOf(model.atoms, model.bonds).flatMap((group): FigureNote[] => {
    const atoms = group.map((i) => model.atoms[i]);
    const open = atoms.filter((a) => a.seen && !a.seen.checked);
    const read = open[0] ?? atoms.find((a) => a.seen);
    if (!read?.seen) return [];
    const ids = new Set(atoms.map((a) => a.id));
    const unchecked = new Set(open.map((a) => a.id));
    const unsure = open.filter((a) => marks.atoms.has(a.id)).length + model.bonds.filter((b) => ids.has(b.a) && (unchecked.has(b.a) || unchecked.has(b.b)) && marks.bonds.has(b.id)).length;
    return [{ atoms: ids, sha256: read.seen.sha256, ...(read.seen.page != null ? { page: read.seen.page } : {}), unsure, checked: !open.length }];
  });
}

/**
 * What `figureNotesOf` depends on, as a key: every bond's ends (which atoms
 * make a structure), each atom read from a figure - checked or not - and,
 * of each atom and bond that has a mark, whether it is still as it was read
 * (just what `readMarks` compares). Unchanged, the notes are as they were:
 * an atom dragged, a label typed elsewhere, nothing of them changed, they
 * are not worked out again.
 */
export function figureNotesKey(model: Model): string {
  // (none read from a figure: no notes, whatever else is drawn)
  if (!model.atoms.some((a) => a.seen)) return "";
  const parts: string[] = [`${model.atoms.length}`];
  // (the bonds round each atom with a mark, only: what its mark is compared with)
  const round = new Map<number, Model["bonds"]>();
  for (const a of model.atoms) if (a.unsure) round.set(a.id, []);
  for (const b of model.bonds) {
    parts.push(`${b.id}:${b.a}:${b.b}${b.unsure ? (b.unsure.as === bondAs(b) ? "u" : "x") : ""}`);
    round.get(b.a)?.push(b);
    round.get(b.b)?.push(b);
  }
  for (const a of model.atoms) {
    if (!a.seen && !a.unsure) continue;
    parts.push(`a${a.id}${a.seen ? (a.seen.checked ? "c" : "s") : ""}${a.unsure ? (a.unsure.as === atomAs(a, round.get(a.id) ?? []) ? "u" : "x") : ""}`);
  }
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

/**
 * The marks of parts read from a figure (`readMarks`) as they are drawn: only
 * on what is not said to be checked - an atom not checked, a bond with an end
 * not checked - as they are counted in its note. Said checked, they go with
 * the note, eased; said not to be, they come back: they stay in the drawing
 * all the while, never drawn while checked.
 */
export function readMarksShown(model: Model, marks: ReturnType<typeof readMarks>): ReturnType<typeof readMarks> {
  const checked = new Set(model.atoms.flatMap((a) => (a.seen?.checked ? [a.id] : [])));
  if (!checked.size) return marks;
  const ends = new Map(model.bonds.map((b) => [b.id, b] as const));
  return {
    atoms: new Map([...marks.atoms].filter(([id]) => !checked.has(id))),
    bonds: new Map(
      [...marks.bonds].filter(([id]) => {
        const b = ends.get(id);
        return !b || !checked.has(b.a) || !checked.has(b.b);
      }),
    ),
  };
}

/** Whether a structure read from a figure has its note over it at all times: while parts of it not said to be checked are still unsure. Else where it came from is said only with the pointer on it, and in its menu. */
export function figureNoteShown(note: FigureNote): boolean {
  return !note.checked && note.unsure > 0;
}

/** What a structure's note says: that it was read from a figure, to be checked - and how many of its parts are still unsure. */
export function figureNoteText(unsure: number): string {
  return `Read from a figure: check it${unsure ? ` · ${unsure} ${unsure === 1 ? "part" : "parts"} unsure` : ""}`;
}

/** Where a structure read from a figure came from, as said quietly with the pointer on it and in its menu. */
export function figureNoteSource(from: string, page?: number): string {
  return `From ${from}${page != null ? `, p. ${page + 1}` : ""}`;
}

/** What a structure's note says where the pointer is on it: where it was read from, and how to say it was checked. */
export function figureNoteTitle(from: string, page?: number): string {
  return `${figureNoteSource(from, page)}, read as drawn there. Check it against the figure; right-click it to say it was checked.`;
}
