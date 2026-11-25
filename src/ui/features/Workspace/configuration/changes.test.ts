import { describe, expect, it } from "vitest";
import { NOMINAL_BOND_LENGTH as L } from "../../../../lib/chem/acs";
import type { Model } from "../store/types";
import { changeWords, configurationChanges, partsTouched, stereoTurned, touchedAtoms, turnedByHand, unitName } from "./changes";
import { notesOf, placeOf } from "./watch";

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
    // (a haptic bond's ring atoms, where it changed: touched too)
    const bound: Model = { ...was, bonds: [...was.bonds, { id: 20, a: 1, b: 4, order: 1, endpoints: [2, 3] }] };
    expect([...touchedAtoms(was, bound)].sort()).toEqual([1, 2, 3, 4]);
    // (an atom put down apart: its own structure only)
    expect(partsTouched(was, apart)!.now.atoms.map((a) => a.id)).toEqual([9]);
  });

  it("says a double bond turned by its descriptors: C2=C3: E, now Z", async () => {
    const changes = configurationChanges(butene(), butene(true));
    expect(changes).toEqual([{ unit: { kind: "double", at: [2, 3] }, how: "inverted" }]);
    expect(unitName(butene(), changes[0].unit)).toBe("C2=C3");
    const notes = await notesOf(butene(), butene(true), changes, undefined);
    expect(notes.map((n) => n.text)).toEqual(["C2=C3: E, now Z"]);
    // (the note by the middle of the bond, a bond out from it in the widest gap: clear of every atom bound to the bond's two)
    const middle = { x: L / 2 + L / 2, y: L * Math.sin(Math.PI / 3) };
    expect(Math.hypot(notes[0].at.x - middle.x, notes[0].at.y - middle.y)).toBeCloseTo(L, 9);
    for (const a of butene(true).atoms) expect(Math.hypot(notes[0].at.x - a.x, notes[0].at.y - a.y), `C${a.id}`).toBeGreaterThan(0.9 * L);
  });

  it("counts a double bond's own bond both ways: a wide drawing whose widest gap would else hold the bond's axis keeps its note off either end", () => {
    // (C1=C2 along the page; C1's two groups up and down to the left, C2's one up to the right: without the bond toward C2, the widest gap
    //  runs over C2's end)
    const at = (id: number, x: number, y: number) => ({ id, x, y, r: 0.9, el: "C" });
    const m: Model = {
      atoms: [at(1, 0, 0), at(2, L, 0), at(3, -0.6 * L, 0.8 * L), at(4, -0.6 * L, -0.8 * L), at(5, 1.3 * L, 0.95 * L)],
      bonds: [
        { id: 10, a: 1, b: 2, order: 2 },
        { id: 11, a: 1, b: 3, order: 1 },
        { id: 12, a: 1, b: 4, order: 1 },
        { id: 13, a: 2, b: 5, order: 1 },
      ],
    };
    const p = placeOf(m, { unit: { kind: "double", at: [1, 2] }, how: "inverted" })!;
    for (const a of m.atoms) expect(Math.hypot(p.x - a.x, p.y - a.y), `C${a.id}`).toBeGreaterThan(0.9 * L);
  });

  it("takes the widest gap round the circle, the one across the first direction too", () => {
    // (a centre's bonds at 10, 80 and 150 degrees: the widest gap runs from 150 round past the half turn to 10 - its middle at 260 degrees)
    const at = (id: number, deg: number) => ({ id, x: L * Math.cos((deg * Math.PI) / 180), y: L * Math.sin((deg * Math.PI) / 180), r: 0.9, el: "C" });
    const m: Model = {
      atoms: [{ id: 1, x: 0, y: 0, r: 0.9, el: "C" }, at(2, 10), at(3, 80), at(4, 150)],
      bonds: [2, 3, 4].map((b, k) => ({ id: 10 + k, a: 1, b, order: 1 as const })),
    };
    const p = placeOf(m, { unit: { kind: "centre", at: 1 }, how: "inverted" })!;
    expect((Math.atan2(p.y, p.x) * 180) / Math.PI).toBeCloseTo(-100, 6);
  });

  it("puts a centre's note in the widest gap between its bonds, a bond out - never on the label of a group drawn above it", () => {
    // (butan-2-ol's C2 with its OH straight up, its methyl and ethyl down left and right: the note below, between those two)
    const at = (id: number, x: number, y: number, el = "C") => ({ id, x, y, r: 0.9, el });
    const s = Math.sin(Math.PI / 3);
    const m: Model = {
      atoms: [at(1, 0, 0), at(2, -L * s, -L / 2), at(3, L * s, -L / 2), at(4, 0, L, "O")],
      bonds: [
        { id: 10, a: 1, b: 2, order: 1 },
        { id: 11, a: 1, b: 3, order: 1 },
        { id: 12, a: 1, b: 4, order: 1, stereo: "up" as const, narrow: 1 },
      ],
    };
    const p = placeOf(m, { unit: { kind: "centre", at: 1 }, how: "inverted" })!;
    expect(p.y).toBeLessThan(0);
    expect(Math.hypot(p.x, p.y)).toBeCloseTo(L, 9);
    for (const a of m.atoms.slice(1)) expect(Math.hypot(p.x - a.x, p.y - a.y), a.el).toBeGreaterThan(0.9 * L);
  });

  it("says a double bond drawn 'either' is now marked unknown, and says nothing of one whose group was deleted", () => {
    const either: Model = { ...butene(), bonds: butene().bonds.map((b) => (b.id === 11 ? { ...b, stereo: "either" as const } : b)) };
    expect(configurationChanges(butene(), either)).toEqual([{ unit: { kind: "double", at: [2, 3] }, how: "unknown" }]);
    const gone: Model = { atoms: butene().atoms.filter((a) => a.id !== 4), bonds: butene().bonds.filter((b) => b.id !== 12) };
    expect(configurationChanges(butene(), gone)).toEqual([]);
  });

  it("puts a change in words, a move of Meno's first where one made it", () => {
    const m = butene();
    const unit = { kind: "centre" as const, at: 2 };
    expect(changeWords(m, { unit, how: "inverted" }, { was: "R", now: "S" })).toBe("C2: R, now S");
    expect(changeWords(m, { unit, how: "inverted" })).toBe("C2: inverted");
    expect(changeWords(m, { unit, how: "opened" }, { was: "S" })).toBe("C2: S, now unspecified");
    expect(changeWords(m, { unit, how: "opened" })).toBe("C2: now unspecified");
    expect(changeWords(m, { unit, how: "unknown" }, { was: "R" })).toBe("C2: R, now marked unknown");
    expect(changeWords(m, { unit, how: "unknown" })).toBe("C2: now marked unknown");
    const why = "two of its bonds in line or on top of each other";
    expect(changeWords(m, { unit, how: "unread", why }, { was: "S" })).toBe(`C2: S, now unclear: ${why}`);
    expect(changeWords(m, { unit, how: "unread", why })).toBe(`C2: now unclear: ${why}`);
    expect(changeWords(m, { unit, how: "read" }, { now: "S" })).toBe("C2: now S");
    expect(changeWords(m, { unit, how: "read" })).toBe("C2: stated again");
    expect(changeWords(m, { unit: { kind: "double", at: [2, 3] }, how: "opened" }, { was: "E" })).toBe("C2=C3: E, now unspecified");
    expect(changeWords(m, { unit, how: "mirror" })).toBe("Every stereocentre inverted: the mirror image");
    expect(changeWords(m, { unit, how: "inverted" }, { was: "R", now: "S" }, "Clean-up")).toBe("changed by Clean-up: C2: R, now S");
    expect(unitName(m, { kind: "axis", at: [1, 2] })).toBe("the axis C1-C2");
  });
  it("tells the chemist's own turn of a stereo bond at a unit from any other edit there", () => {
    const w = { id: 12, a: 1, b: 4, order: 1 as const, stereo: "up" as const, narrow: 1 };
    // (kind or narrow end turned, a plain bond's look with it: a turn; its order, its ends or nothing changed: none)
    expect(stereoTurned(w, { ...w, stereo: "down" })).toBe(true);
    expect(stereoTurned(w, { ...w, narrow: 4 })).toBe(true);
    expect(stereoTurned({ ...w, stereo: undefined, display: "bold" }, { ...w, display: undefined })).toBe(true);
    expect(stereoTurned(w, { ...w, stereo: "none", order: 2 })).toBe(false);
    expect(stereoTurned(w, { ...w, b: 5, stereo: "down" })).toBe(false);
    expect(stereoTurned(w, { ...w, color: "#f00" })).toBe(false);
    // (the double bond of (E)-but-2-ene drawn "either": its own bond turned, nothing else - by hand; with C4 moved too - not only that)
    const either: Model = { ...butene(), bonds: butene().bonds.map((b) => (b.id === 11 ? { ...b, stereo: "either" as const } : b)) };
    const unit = { kind: "double" as const, at: [2, 3] as [number, number] };
    expect(turnedByHand(butene(), either, unit)).toBe(true);
    expect(configurationChanges(butene(), either, { byHand: true })).toEqual([]);
    const moved: Model = { ...either, atoms: either.atoms.map((a) => (a.id === 4 ? { ...a, y: 0 } : a)) };
    expect(turnedByHand(butene(), moved, unit)).toBe(false);
    // (what is kept on an atom, rewritten in the same step, is no other edit)
    const kept: Model = { ...either, atoms: either.atoms.map((a) => (a.id === 2 ? { ...a, config: "open" as const } : a)) };
    expect(turnedByHand(butene(), kept, unit)).toBe(true);
  });
});
