// Held beside projection.test.ts: isProjection is worked out once for a drawing and a set of its atoms - asked again, of the same drawing object and the same atoms, it is not worked out again; of other atoms, or of a copy of the drawing, it is.
import { describe, expect, it, vi } from "vitest";

vi.mock("../../../../lib/calc/workers", () => ({ readerClient: () => Promise.reject(new Error("no workers in tests")) }));
vi.mock("../chem/drawing", async (original) => {
  const real = await original<typeof import("../chem/drawing")>();
  return { ...real, drawingOf: vi.fn(real.drawingOf) };
});
import { drawingOf } from "../chem/drawing";
import type { Model } from "../store/types";
import { chair } from "../../../../lib/layout/testdata/projections";
import { isProjection } from "./projection";

/** A chair drawn by hand, no depth, a methyl at ring atom 0, as a page's structure: ring atom k has id k + 1. */
const hand = (): Model => {
  const d = chair({ 0: "equatorial", 1: "axial" });
  return { atoms: d.atoms.map((a, i) => ({ id: i + 1, el: "C", r: 0.9, x: a.x, y: a.y })), bonds: d.bonds.map((b, k) => ({ id: 100 + k, a: b.a + 1, b: b.b + 1, order: 1 as const })) };
};
const calls = () => vi.mocked(drawingOf).mock.calls.length;

describe("a drawing's projection is asked of once", () => {
  it("the same drawing and the same atoms are answered again from the first answer", () => {
    const m = hand();
    const ids = new Set(m.atoms.map((a) => a.id));
    const before = calls();
    expect(isProjection(m, ids)).toBe(true);
    expect(calls()).toBe(before + 1);
    expect(isProjection(m, new Set(ids))).toBe(true);
    expect(calls()).toBe(before + 1);
  });

  it("other atoms of it, or a copy of it, are asked afresh", () => {
    const m = hand();
    const ids = new Set(m.atoms.map((a) => a.id));
    expect(isProjection(m, ids)).toBe(true);
    const before = calls();
    const ring = new Set([1, 2, 3, 4, 5, 6]);
    expect(isProjection(m, ring)).toBe(true);
    expect(calls()).toBe(before + 1);
    expect(isProjection(JSON.parse(JSON.stringify(m)) as Model, ids)).toBe(true);
    expect(calls()).toBe(before + 2);
  });
});
