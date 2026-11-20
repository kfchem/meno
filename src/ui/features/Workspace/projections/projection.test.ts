import { describe, expect, it } from "vitest";
import type { DrawnAtom, DrawnBond } from "../../../../lib/layout/drawn";
import { chair, haworth } from "../../../../lib/layout/testdata/projections";
import type { Model } from "../store/types";
import { isProjection } from "./projection";

/** A drawing made a page's structure: its atoms (no depth - as drawn by hand) and bonds, ids from 1. */
const asModel = (d: { atoms: DrawnAtom[]; bonds: DrawnBond[] }): Model => ({
  atoms: d.atoms.map((a, i) => ({ id: i + 1, el: a.el ?? "C", r: 0.9, x: a.x, y: a.y })),
  bonds: d.bonds.map((b, k) => ({ id: 100 + k, a: b.a + 1, b: b.b + 1, order: b.order as 1 | 2 | 3 })),
});
const everything = (m: Model) => new Set(m.atoms.map((a) => a.id));

describe("a structure that holds a projection", () => {
  it("is a chair drawn by hand, read from the ring as drawn: Clean-up keeps it, Draw flat lays it out flat", () => {
    const m = asModel(chair({ 0: "equatorial", 1: "axial" }));
    expect(isProjection(m, everything(m))).toBe(true);
  });

  it("is a Haworth ring drawn by hand", () => {
    const m = asModel(haworth([true, false, true, false, true]));
    expect(isProjection(m, everything(m))).toBe(true);
  });

  it("is not a ring drawn flat, nor a chain, nor a structure of one atom", () => {
    const flat: Model = {
      atoms: [0, 1, 2, 3, 4, 5].map((k) => ({ id: k + 1, el: "C", r: 0.9, x: Math.cos((k * Math.PI) / 3), y: Math.sin((k * Math.PI) / 3) })),
      bonds: [0, 1, 2, 3, 4, 5].map((k) => ({ id: 100 + k, a: k + 1, b: ((k + 1) % 6) + 1, order: 1 as const })),
    };
    expect(isProjection(flat, everything(flat))).toBe(false);
    const chain: Model = { atoms: flat.atoms.slice(0, 4), bonds: flat.bonds.slice(0, 3) };
    expect(isProjection(chain, everything(chain))).toBe(false);
    const one: Model = { atoms: [flat.atoms[0]], bonds: [] };
    expect(isProjection(one, everything(one))).toBe(false);
  });

  it("is asked of the structure of the atoms given only: a chair beside a flat ring is not the flat ring's", () => {
    const c = asModel(chair({ 0: "equatorial" }));
    const ring = [0, 1, 2, 3, 4, 5].map((k) => ({ id: 500 + k, el: "C", r: 0.9, x: 20 + Math.cos((k * Math.PI) / 3), y: Math.sin((k * Math.PI) / 3) }));
    const both: Model = { atoms: [...c.atoms, ...ring], bonds: [...c.bonds, ...ring.map((a, k) => ({ id: 600 + k, a: a.id, b: ring[(k + 1) % 6].id, order: 1 as const }))] };
    expect(isProjection(both, new Set(ring.map((a) => a.id)))).toBe(false);
    expect(isProjection(both, everything(c))).toBe(true);
  });
});
