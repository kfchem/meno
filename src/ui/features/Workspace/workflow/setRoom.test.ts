import { describe, expect, it } from "vitest";
import { emptyWorkspaceDocument } from "../document";
import type { DrawnModel, Model } from "../store/types";
import { setMembers } from "./entries";
import { resultOf } from "./flow";
import { BETWEEN, SET_PAD, SET_TOP } from "./look";
import { addStep } from "./model";
import { placeResults, type RunResults, type RunWith } from "./run";
import { boxOf } from "../chem/make3d";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { drawnBox } from "../../../../utils/importers";

const W: RunWith = { extentOf: () => ({ x0: -1, x1: 1, y0: -1, y1: 1 }), byOf: () => "meno", now: 1000 };
const L = NOMINAL_BOND_LENGTH;

/** Ethanol drawn left to right, its O at the right end: OH, written to the right of the O. */
const ethanol = (): DrawnModel => ({
  atoms: [
    { id: 1, el: "C", x: 0, y: 0 },
    { id: 2, el: "C", x: 0.866 * L, y: 0.5 * L },
    { id: 3, el: "O", x: 1.732 * L, y: 0 },
  ] as never,
  bonds: [
    { id: 1, a: 1, b: 2, order: 1 },
    { id: 2, a: 2, b: 3, order: 1 },
  ] as never,
});

/** Butane's zigzag: carbons alone, no letters. */
const butane = (): Model => ({
  atoms: [0, 1, 2, 3].map((k) => ({ id: k + 1, el: "C", x: 0.866 * L * k, y: k % 2 ? 0.5 * L : 0 })) as never,
  bonds: [1, 2, 3].map((k) => ({ id: k, a: k, b: k + 1, order: 1 })) as never,
});

const drawn = (n: number): RunResults => ({ molecules: [], rest: [], holds: "structures", drawn: { made: Array.from({ length: n }, ethanol), rest: [] } });

describe("the room round a structure shown in a set (docs/LOOK.md, Room)", () => {
  it("takes a structure's box as its ink: its labels' letters, not only its atoms' centres", () => {
    // (butane: no letters - its ink is its bonds, from atom to atom; within a stroke of its atoms)
    const bare = boxOf(butane());
    expect(Math.abs(bare.x0 - 0)).toBeLessThan(0.05 * L);
    expect(Math.abs(bare.x1 - 3 * 0.866 * L)).toBeLessThan(0.05 * L);
    // (ethanol: OH reaches right of its O by more than the O's own half width - the H after it - and its O's letter below the O's centre)
    const b = boxOf(ethanol());
    expect(b.x1 - 1.732 * L).toBeGreaterThan(0.4 * L);
    expect(b.y0).toBeLessThan(0);
    // (no room added round it: what keeps clear of it adds its own)
    expect(b.x0).toBeGreaterThan(-0.05 * L);
  });

  it("keeps each structure's ink half a bond inside its set's frame, half a bond from the next one's, and under the name row", () => {
    // (half a bond is 24 px at 48 px a bond; the name row 36 px)
    for (const [v, want] of [[SET_PAD, L / 2], [BETWEEN, L / 2], [SET_TOP, (36 * L) / 48]]) expect(v).toBeCloseTo(want, 9);
    const doc0 = addStep(emptyWorkspaceDocument(), "descriptors", 0, 0);
    const doc = placeResults(doc0, doc0.steps![0], drawn(6), W);
    const set = resultOf(doc, doc.steps![0].id, "out")!;
    // (each structure's ink as the drawing lays it out, measured apart from how the set was laid out)
    const inks = setMembers(doc as never, set).structures.map((ids) => {
      const atoms = new Set(ids);
      const b = drawnBox({ atoms: doc.model.atoms.filter((a) => atoms.has(a.id)), bonds: doc.model.bonds.filter((x) => atoms.has(x.a) && atoms.has(x.b)) });
      return { x0: b.minX, x1: b.maxX, y0: b.minY, y1: b.maxY };
    });
    expect(inks).toHaveLength(6);
    const eps = 1e-6;
    for (const k of inks) {
      expect(k.x0 - set.x0).toBeGreaterThanOrEqual(SET_PAD - eps);
      expect(set.x1 - k.x1).toBeGreaterThanOrEqual(SET_PAD - eps);
      expect(k.y0 - set.y0).toBeGreaterThanOrEqual(SET_PAD - eps);
      expect(set.y1 - k.y1).toBeGreaterThanOrEqual(SET_TOP - eps);
    }
    // (each two side by side or one above the other: their ink at least half a bond apart, one way or the other)
    for (let i = 0; i < inks.length; i++)
      for (let j = i + 1; j < inks.length; j++) {
        const [a, b] = [inks[i], inks[j]];
        const apart = Math.max(b.x0 - a.x1, a.x0 - b.x1, b.y0 - a.y1, a.y0 - b.y1);
        expect(apart).toBeGreaterThanOrEqual(BETWEEN - eps);
      }
  });
});
