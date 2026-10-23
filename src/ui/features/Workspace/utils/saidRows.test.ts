import { describe, expect, it } from "vitest";
import { readCarried3D } from "./copyPaste";
import { noting } from "./readNotes";

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
  it("is read to its first hundred rows, each cut at 500 characters - those past it left out, and said", () => {
    const said = Array.from({ length: 103 }, (_, k) => ({ label: "Note", text: k ? `E = -${k}.0 Hartree` : "x".repeat(600) }));
    const { value: m, left } = noting(() => readCarried3D(water(said)));
    expect(m?.said).toHaveLength(100);
    expect(m?.said?.[0].text).toBe("x".repeat(500));
    expect(m?.said?.[99]).toEqual({ label: "Note", text: "E = -99.0 Hartree" });
    expect(left).toEqual({ said: 3 });
  });

  it("reads a long label cut the same, and a hundred rows whole", () => {
    const said = Array.from({ length: 100 }, () => ({ label: "L".repeat(700), text: "t" }));
    const { value: m, left } = noting(() => readCarried3D(water(said)));
    expect(m?.said).toHaveLength(100);
    expect(m?.said?.[0].label).toBe("L".repeat(500));
    expect(left).toEqual({});
  });
});
