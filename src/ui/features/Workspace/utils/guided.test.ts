import { describe, expect, it } from "vitest";
import { structureAtoms } from "./guided";
import type { Model } from "../store/types";

const atom = (id: number, x = id) => ({ id, el: "C", x, y: 0, r: 0 }) as Model["atoms"][number];
const bond = (id: number, a: number, b: number) => ({ id, a, b, order: 1 }) as Model["bonds"][number];

describe("the structure a guide points at", () => {
  const model: Model = { atoms: [atom(1), atom(2), atom(3), atom(7), atom(8)], bonds: [bond(1, 1, 2), bond(2, 2, 3), bond(3, 7, 8)] };

  it("is what is selected, where anything is", () => {
    expect(structureAtoms(model, new Set([2, 3])).map((a) => a.id)).toEqual([2, 3]);
  });

  it("is else the structure drawn last: the one holding the atom added last", () => {
    expect(structureAtoms(model, new Set()).map((a) => a.id)).toEqual([7, 8]);
    expect(structureAtoms({ atoms: [atom(1), atom(2), atom(3)], bonds: model.bonds.slice(0, 2) }, new Set()).map((a) => a.id)).toEqual([1, 2, 3]);
    expect(structureAtoms({ atoms: [], bonds: [] }, new Set())).toEqual([]);
  });
});
