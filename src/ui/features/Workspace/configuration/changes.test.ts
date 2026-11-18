import { describe, expect, it } from "vitest";
import { NOMINAL_BOND_LENGTH as L } from "../../../../lib/chem/acs";
import type { Model } from "../store/types";
import { changeWords, configurationChanges, partsTouched, touchedAtoms, unitName } from "./changes";
import { notesOf } from "./watch";

/** (E)-but-2-ene drawn as a zigzag: C1 (id 1), C2 (2) = C3 (3), C4 (4); its C4 put on C1's side with `cis`. */
function butene(cis = false): Model {
  const h = L * Math.sin(Math.PI / 3);
  const w = L / 2;
  const at = (id: number, x: number, y: number) => ({ id, x, y, r: 0.9, el: "C" });
  return {
    // (C1 below the double bond; C4 above it, trans - or below, cis)
    atoms: [at(1, 0, 0), at(2, w, h), at(3, w + L, h), at(4, 2 * w + L, cis ? 0 : 2 * h)],
    bonds: [
      { id: 10, a: 1, b: 2, order: 1 },
      { id: 11, a: 2, b: 3, order: 2 },
      { id: 12, a: 3, b: 4, order: 1 },
    ],
  };
}

describe("what an edit did to a drawing's configurations (part 15, phase 2)", () => {
  it("finds the atoms an edit touched - moved, changed, gone, new, or at a bond that changed - and the structures holding them", () => {
    const was = butene();
    const now: Model = { ...was, bonds: was.bonds.map((b) => (b.id === 12 ? { ...b, order: 2 } : b)) };
    expect([...touchedAtoms(was, now)].sort()).toEqual([3, 4]);
    expect(touchedAtoms(was, was).size).toBe(0);
    const apart: Model = { atoms: [...was.atoms, { id: 9, x: 20, y: 0, r: 0.9, el: "O" }], bonds: was.bonds };
    // (an atom put down apart: its own structure only)
    expect(partsTouched(was, apart)!.now.atoms.map((a) => a.id)).toEqual([9]);
  });

  it("says a double bond turned by its descriptors: C2=C3: E, now Z", async () => {
    const changes = configurationChanges(butene(), butene(true));
    expect(changes).toEqual([{ unit: { kind: "double", at: [2, 3] }, how: "inverted" }]);
    expect(unitName(butene(), changes[0].unit)).toBe("C2=C3");
    const notes = await notesOf(butene(), butene(true), changes, undefined);
    expect(notes.map((n) => n.text)).toEqual(["C2=C3: E, now Z"]);
    // (the note by the middle of the bond)
    expect(notes[0].at.x).toBeCloseTo(L, 9);
  });

  it("says a double bond drawn 'either' is now open, and says nothing of one whose group was deleted", () => {
    const either: Model = { ...butene(), bonds: butene().bonds.map((b) => (b.id === 11 ? { ...b, stereo: "either" as const } : b)) };
    expect(configurationChanges(butene(), either)).toEqual([{ unit: { kind: "double", at: [2, 3] }, how: "opened" }]);
    const gone: Model = { atoms: butene().atoms.filter((a) => a.id !== 4), bonds: butene().bonds.filter((b) => b.id !== 12) };
    expect(configurationChanges(butene(), gone)).toEqual([]);
  });

  it("puts a change in words, a move of Meno's first where one made it", () => {
    const m = butene();
    const unit = { kind: "centre" as const, at: 2 };
    expect(changeWords(m, { unit, how: "inverted" }, { was: "R", now: "S" })).toBe("C2: R, now S");
    expect(changeWords(m, { unit, how: "inverted" })).toBe("C2: turned");
    expect(changeWords(m, { unit, how: "opened" })).toBe("C2: now open");
    expect(changeWords(m, { unit, how: "unread", why: "two of its bonds in line or on top of each other" })).toBe("C2: no longer read: two of its bonds in line or on top of each other");
    expect(changeWords(m, { unit, how: "read" }, { now: "S" })).toBe("C2: now read: S");
    expect(changeWords(m, { unit, how: "mirror" })).toBe("every centre turned: the mirror image");
    expect(changeWords(m, { unit, how: "inverted" }, { was: "R", now: "S" }, "Clean-up")).toBe("changed by Clean-up: C2: R, now S");
    expect(unitName(m, { kind: "axis", at: [1, 2] })).toBe("the axis C1-C2");
  });
});
