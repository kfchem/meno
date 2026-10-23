import { describe, expect, it } from "vitest";
import { readCarried3D, SAID_CUT } from "./copyPaste";
import { leftOutSaid, noting } from "./readNotes";

/** A water read from coordinates in a text, as a file carries it, saying `said`. */
const water = (said: unknown) => ({
  at: { x: 0, y: 0 },
  atoms: [
    { el: "O", x: 0, y: 0, z: 0.1173 },
    { el: "H", x: 0, y: 0.7572, z: -0.4692 },
    { el: "H", x: 0, y: -0.7572, z: -0.4692 },
  ],
  bonds: [
    { a1: 0, a2: 1, order: 1 },
    { a1: 0, a2: 2, order: 1 },
  ],
  said,
});

describe("what was said of a structure read from coordinates, as a file is read for it", () => {
  it("is read to its first hundred rows, those past it left out, and said", () => {
    const said = Array.from({ length: 103 }, (_, k) => ({ label: "Note", text: `E = -${k}.0 Hartree` }));
    const { value: m, left } = noting(() => readCarried3D(water(said)));
    expect(m?.said).toHaveLength(100);
    expect(m?.said?.[99]).toEqual({ label: "Note", text: "E = -99.0 Hartree" });
    expect(left).toEqual({ said: 3 });
  });

  it("cuts a text or a label at 500 characters, ending it by saying so - each row cut counted, and said as the file opens", () => {
    const said = [{ label: "Note", text: "x".repeat(600) }, { label: "L".repeat(700), text: "y".repeat(700) }, { label: "Note", text: "z".repeat(500) }];
    const { value: m, left } = noting(() => readCarried3D(water(said)));
    expect(m?.said).toEqual([
      { label: "Note", text: "x".repeat(500) + SAID_CUT },
      { label: "L".repeat(500) + SAID_CUT, text: "y".repeat(500) + SAID_CUT },
      { label: "Note", text: "z".repeat(500) },
    ]);
    expect(SAID_CUT).toBe("\u2026 [cut at 500]");
    expect(left).toEqual({ saidCut: 2 });
    expect(leftOutSaid(left)).toBe("2 ends past 500 characters of notes of what texts said of molecules in the file could not be read and were left out.");
  });

  it("reads a row cut as an earlier file was read, saved since with its mark, as it is: never cut again, nor counted again", () => {
    const { value: m, left } = noting(() => readCarried3D(water([{ label: "Note", text: "x".repeat(500) + SAID_CUT }])));
    expect(m?.said).toEqual([{ label: "Note", text: "x".repeat(500) + SAID_CUT }]);
    expect(left).toEqual({});
  });
});
