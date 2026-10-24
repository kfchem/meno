/**
 * The notes over structures read from a figure (docs/PDF.md, *Read from a
 * figure*): every structure taken from a PDF's figure, or a picture's, says
 * so - and to check it - until the chemist says it was checked, whatever is
 * edited of it meanwhile: putting one part right does not make the rest so.
 */
import { structuresOf } from "../../../../lib/chem/magnified2d";
import type { Model } from "../store/types";
import { readMarks } from "./figures";

/** A structure read from a figure and not yet said to be checked: its atoms, where it was read from, and how many of its parts are still marked unsure. */
export type FigureNote = { atoms: ReadonlySet<number>; sha256: string; page?: number; unsure: number };

/** Each structure of `model` some atom of which was read from a figure, none of them said to be checked. */
export function figureNotesOf(model: Model): FigureNote[] {
  const marks = readMarks(model);
  return structuresOf(model.atoms, model.bonds).flatMap((group): FigureNote[] => {
    const atoms = group.map((i) => model.atoms[i]);
    const read = atoms.find((a) => a.seen);
    if (!read?.seen || atoms.some((a) => a.seen?.checked)) return [];
    const ids = new Set(atoms.map((a) => a.id));
    const unsure = atoms.filter((a) => marks.atoms.has(a.id)).length + model.bonds.filter((b) => ids.has(b.a) && marks.bonds.has(b.id)).length;
    return [{ atoms: ids, sha256: read.seen.sha256, ...(read.seen.page != null ? { page: read.seen.page } : {}), unsure }];
  });
}

/** What a structure's note says: that it was read from a figure, to be checked - and how many of its parts are still unsure. */
export function figureNoteText(unsure: number): string {
  return `Read from a figure: check it${unsure ? ` · ${unsure} ${unsure === 1 ? "part" : "parts"} unsure` : ""}`;
}

/** What a structure's note says where the pointer is on it: where it was read from, and how to say it was checked. */
export function figureNoteTitle(from: string, page?: number): string {
  return `From ${from}${page != null ? `, p. ${page + 1}` : ""}, read as drawn there. Check it against the figure; right-click it to say it was checked.`;
}
