import { describe, expect, it } from "vitest";
import { FREQUENCY, geometryKey, type Entry } from "../entry";
import { speciesOf } from "../io/writers";
import { MODE_OUTSIDE, MODE_RANKS, MODE_WINDOW, modeOnAtoms, modeOnAtomsEntry, modeRanks } from "./modeOnAtoms";

/** Mode on atoms against answers worked by hand. */

describe("ranks by how far a mode moves each atom", () => {
  // lengths 1, 2, 0, sqrt(5), 2: atom 4 first, then 2 and 5 alike (by number), then 1, then 3
  const mode = [1, 0, 0, 0, 2, 0, 0, 0, 0, 2, 0, 1, 0, 0, 2];

  it("puts the atom moving most first, atoms moving alike in the order of their numbers", () => {
    expect(modeRanks(mode)).toEqual([4, 2, 5, 1, 3]);
  });

  it("does not depend on how the program scaled the mode", () => {
    expect(modeRanks(mode.map((v) => v * 0.013))).toEqual(modeRanks(mode));
  });

  it("gives the listed atoms' ranks, the window - their count and the reach more - and those outside it", () => {
    // atoms 1 and 3 (from 0: 0, 2) rank 4 and 5; window 2 + 1 = 3: both outside
    expect(modeOnAtoms(mode, [0, 2], 1)).toEqual({ window: 3, ranks: [{ atom: 0, rank: 4 }, { atom: 2, rank: 5 }], outside: [0, 2] });
    // atoms 4 and 2 (from 0: 3, 1) rank 1 and 2: none outside, reach 0
    expect(modeOnAtoms(mode, [3, 1, 3], 0)).toEqual({ window: 2, ranks: [{ atom: 1, rank: 2 }, { atom: 3, rank: 1 }], outside: [] });
    // reach widens the window: atom 1 (rank 4) inside with reach 2
    expect(modeOnAtoms(mode, [3, 0], 2)).toMatchObject({ window: 4, outside: [] });
  });

  it("refuses no atoms, an atom the mode has not, or a reach that is no whole number from 0", () => {
    expect(modeOnAtoms(mode, [], 1)).toEqual({ failed: "No atoms are listed." });
    expect(modeOnAtoms(mode, [5], 1)).toEqual({ failed: "The vibration has no atom 6: its atoms are 1 to 5." });
    expect(modeOnAtoms(mode, [0], -1)).toEqual({ failed: "The reach, -1, is no whole number from 0." });
    expect(modeOnAtoms(mode, [0], 0.5)).toEqual({ failed: "The reach, 0.5, is no whole number from 0." });
  });
});

describe("on an entry", () => {
  // O-H-O: the imaginary vibration moves the hydrogen most (0.9) against the oxygens (0.3 each); a bend, real
  const xyz = [-1.2, 0, 0, 0, 0, 0, 1.2, 0, 0];
  const ts = (frequencies: number[], modes: number[][]): Entry => ({
    id: "ts1",
    from: [],
    structure: { atoms: [{ el: "O" }, { el: "H" }, { el: "O" }], bonds: [] },
    geometry: { kind: "3d", xyz },
    species: speciesOf({ atoms: [], bonds: [] }),
    properties: {
      vibrations: { value: { table: { columns: [FREQUENCY], rows: frequencies.map((f) => [f]) } }, unit: "none", at: { geometry: geometryKey(xyz) }, status: "computed" },
      modes: { value: { modes }, unit: "none", at: { geometry: geometryKey(xyz) }, status: "computed" },
    },
    status: "done",
  });
  const transfer = [-0.3, 0, 0, 0.9, 0, 0, -0.3, 0, 0];
  const bend = [0, 0.1, 0, 0, -0.2, 0, 0, 0.1, 0];

  it("writes the window, each listed atom's rank by element and number, and the count outside - naming the vibration - and keeps the entry", () => {
    const r = modeOnAtomsEntry(ts([-1450, 300], [transfer, bend]), [0, 1], 0);
    const p = r.entry.properties;
    expect([p[MODE_WINDOW].value, p[MODE_RANKS].value, p[MODE_OUTSIDE].value]).toEqual([2, "O1 2, H2 1", 0]);
    expect(p[MODE_OUTSIDE].by).toEqual({ step: "Mode on atoms", method: "vibration 1, -1450 cm⁻¹" });
    expect(p[MODE_OUTSIDE].at).toEqual({ geometry: geometryKey(xyz) });
  });

  it("takes the lowest vibration, the most negative of several, saying so", () => {
    const r = modeOnAtomsEntry(ts([-80, -1450], [bend, transfer]), [1], 0);
    expect(r.entry.properties[MODE_RANKS].value).toBe("H2 1");
    expect(r.said).toBe("It has 2 imaginary vibrations; the most negative, -1450.0 cm⁻¹, is taken.");
  });

  it("writes each failed, with why, where it cannot be worked out - the entry kept all the same", () => {
    const none = modeOnAtomsEntry(ts([300, 400], [transfer, bend]), [1], 0);
    expect(none.entry.properties[MODE_OUTSIDE]).toEqual({ value: "", unit: "none", status: { failed: "It has no imaginary vibration." } });
    expect(none.entry.id).toBe("ts1");
    const bare = modeOnAtomsEntry({ ...ts([-1450], [transfer]), properties: {} }, [1], 0);
    expect(bare.entry.properties[MODE_WINDOW].status).toEqual({ failed: "The entry has no vibrations." });
    expect(modeOnAtomsEntry(ts([-1450, 300], [transfer, bend]), [7], 0).entry.properties[MODE_RANKS].status).toEqual({ failed: "The vibration has no atom 8: its atoms are 1 to 3." });
  });
});
