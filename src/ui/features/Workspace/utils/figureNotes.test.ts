import { describe, expect, it } from "vitest";
import type { Model } from "../store/types";
import { emptyWorkspaceDocument, setFigureChecked } from "../document";
import { figureNotesOf, figureNoteText, figureNoteTitle } from "./figureNotes";
import { atomAs } from "./figures";

const SHA = "a".repeat(64);
/** Two structures: an ethanol read from page 3 of a PDF, its O marked unsure, and a methane drawn by hand. */
function model(): Model {
  const seen = (x: number) => ({ sha256: SHA, page: 2, x, y: 0, bond: 14.4 });
  const atoms: Model["atoms"] = [
    { id: 1, x: 0, y: 0, r: 0.9, el: "C", seen: seen(0) },
    { id: 2, x: 1.5, y: 0, r: 0.9, el: "C", seen: seen(14) },
    { id: 3, x: 3, y: 0, r: 0.9, el: "O", seen: seen(28) },
    { id: 10, x: 10, y: 0, r: 0.9, el: "C" },
  ];
  const bonds: Model["bonds"] = [
    { id: 4, a: 1, b: 2, order: 1 },
    { id: 5, a: 2, b: 3, order: 1 },
  ];
  atoms[2] = { ...atoms[2], unsure: { said: ["Drawn as O"], as: atomAs(atoms[2], bonds) } };
  return { atoms, bonds };
}

describe("the note over a structure read from a figure", () => {
  it("is over each structure read from a figure - none over one drawn by hand - with where it was read from and how many parts are unsure", () => {
    const notes = figureNotesOf(model());
    expect(notes.map((n) => [[...n.atoms], n.sha256, n.page, n.unsure])).toEqual([[[1, 2, 3], SHA, 2, 1]]);
  });

  it("says to check it, and how many parts are unsure; where the pointer is on it, where it was read from and how to say it was checked", () => {
    expect([figureNoteText(0), figureNoteText(1), figureNoteText(2)]).toEqual(["Read from a figure: check it", "Read from a figure: check it · 1 part unsure", "Read from a figure: check it · 2 parts unsure"]);
    expect(figureNoteTitle("paper.pdf", 2)).toBe("From paper.pdf, p. 3, read as drawn there. Check it against the figure; right-click it to say it was checked.");
  });

  it("stays when a part is edited - its unsure count going down as that part's mark goes - and goes only once it is said to be checked, one step", () => {
    const m = model();
    // (the O changed by hand: its mark goes, the note stays)
    const edited: Model = { ...m, atoms: m.atoms.map((a) => (a.id === 3 ? { ...a, el: "N" } : a)) };
    expect(figureNotesOf(edited).map((n) => n.unsure)).toEqual([0]);
    const doc = { ...emptyWorkspaceDocument(), model: edited };
    const checked = setFigureChecked(doc, [1, 2, 3], true);
    expect(figureNotesOf(checked.model)).toEqual([]);
    expect(checked.model.atoms.find((a) => a.id === 1)?.seen).toEqual({ sha256: SHA, page: 2, x: 0, y: 0, bond: 14.4, checked: true });
    // (and said not to be, again: back)
    expect(figureNotesOf(setFigureChecked(checked, [1, 2, 3], false).model)).toHaveLength(1);
    // (nothing to say of a structure drawn by hand: the document as it was)
    expect(setFigureChecked(doc, [10], true)).toBe(doc);
  });
});
