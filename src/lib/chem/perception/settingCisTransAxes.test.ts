/**
 * Held beside settingCisTrans.test.ts: of two allenes in one molecule, the axis of the one with an end of two alike groups is taken off
 * and the other's kept - each axis tried against its own ends. (Found in review.)
 */
import { describe, expect, it } from "vitest";
import { settingCisTrans, type SymmetryInput } from "./symmetry";
import { fromSmiles } from "../../layout/testdata/fromSmiles";

describe("two allene axes in one molecule, each asked of its own ends", () => {
  // (C0 C1(C2) = C3 = C4 - C5 = C6 = C7 - C8: the first allene's end C1 of two methyls, the second's ends C5 and C7 each of a different pair)
  const g: SymmetryInput = fromSmiles("CC(C)=[C@]=CC=[C@@]=CC");
  const first: [number, number] = [1, 4];
  it("takes off the first allene's axis, which sets nothing, and keeps the second's", () => {
    expect(g.axes).toHaveLength(2);
    const kept = settingCisTrans(g);
    expect(kept.axes).toHaveLength(1);
    expect(kept.axes![0].atoms).not.toEqual(first);
    expect([...kept.axes![0].atoms].sort((a, b) => a - b)).toEqual([5, 7]);
  });
  it("keeps both where neither end is of two alike groups: hepta-2,3,5,6-tetraene-like CCC=[C@]=CC=[C@@]=CC", () => {
    expect(settingCisTrans(fromSmiles("CC=[C@]=CC=[C@@]=CC")).axes).toHaveLength(2);
  });
});
