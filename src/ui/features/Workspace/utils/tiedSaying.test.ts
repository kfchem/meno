import { describe, expect, it } from "vitest";
import { tiedAfter, tiedTo } from "./tiedSaying";

/** A drawing holding atoms of these ids. */
const drawn = (...ids: number[]) => ({ atoms: ids.map((id) => ({ id })) });

describe("a warning tied to the structure it is about", () => {
  it("goes out of sight as an undo takes the structure away, and is back as a redo brings it - nothing else said", () => {
    const said = tiedTo("Clean-up left C4H10 as drawn: because.", [1, 2, 3, 4], drawn(1, 2, 3, 4, 9));
    expect(said.hidden).toBe(false);
    const undone = tiedAfter(said, drawn(9), "travel")!;
    expect(undone.hidden).toBe(true);
    const redone = tiedAfter(undone, drawn(1, 2, 3, 4, 9), "travel")!;
    expect(redone.hidden).toBe(false);
    expect(redone.text).toBe(said.text);
  });

  it("stays through an edit that leaves the structure, and through an undo of a later step that leaves it", () => {
    const said = tiedTo("words", [1, 2], drawn(1, 2));
    expect(tiedAfter(said, drawn(1, 2, 5), "edit")).toBe(said);
    expect(tiedAfter(said, drawn(1, 2), "travel")).toBe(said);
    expect(tiedAfter(said, drawn(), "amend")).toBe(said);
  });

  it("is let go for good as the structure is deleted, or as anything is drawn while an undo has it gone - its ids may be given again", () => {
    const said = tiedTo("words", [1, 2], drawn(1, 2));
    expect(tiedAfter(said, drawn(7), "edit")).toBeNull();
    const undone = tiedAfter(said, drawn(), "travel")!;
    // (a new atom given id 1 again: not the structure it was about)
    expect(tiedAfter(undone, drawn(1), "edit")).toBeNull();
    expect(tiedAfter(undone, drawn(1, 2), "reset")).toBeNull();
  });

  it("said after an undo has already taken what it is about away, is out of sight from the first", () => {
    expect(tiedTo("words", [1, 2], drawn(3)).hidden).toBe(true);
  });
});
