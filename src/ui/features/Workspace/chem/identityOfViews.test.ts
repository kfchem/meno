/**
 * A cage drawn flat, its near edge not marked: the reading of its identity asks no search of the engine's views of it, which cannot
 * change what it reads; the words said of its atoms (`perspective`) ask them only when read, and say what they always did.
 */
import { describe, expect, it, vi } from "vitest";
import { NOMINAL_BOND_LENGTH as L } from "../../../../lib/chem/acs";
import { NOT_MARKED } from "../../../../lib/chem/perception/projection/recognise";
import { layout2D } from "../../../../lib/layout/engine";
import { fromSmiles } from "../../../../lib/layout/testdata/fromSmiles";
import type { Model } from "../store/types";
import { identityInputOf } from "./identityOf";

const asked = vi.hoisted(() => ({ views: 0 }));
vi.mock("../../../../lib/layout/recognised", async (original) => {
  const actual = await original<typeof import("../../../../lib/layout/recognised")>();
  return {
    ...actual,
    cageViews: ((atoms, bonds) => {
      const of = actual.cageViews(atoms, bonds);
      return (system) => {
        const got = of(system);
        return { cage: got.cage, views: () => (asked.views++, got.views()) };
      };
    }) as typeof actual.cageViews,
  };
});

/** Cubane as the engine places it, drawn flat: no depth on any atom, no bond bold. */
function flatCubane(): Model {
  const input = fromSmiles("C12C3C4C1C5C2C3C45");
  const out = layout2D(input);
  return {
    atoms: input.atoms.map((_, i) => ({ id: i + 1, x: out.x[i] * L, y: out.y[i] * L, r: 0.9, el: "C" })),
    bonds: input.bonds.map((b, k) => ({ id: 100 + k, a: b.a + 1, b: b.b + 1, order: b.order })),
  } as unknown as Model;
}

describe("identity's input of a cage drawn flat", () => {
  it("asks no search of the cage's views; its words, read, ask one and say that its near and far are not marked", () => {
    const part = flatCubane();
    asked.views = 0;
    const got = identityInputOf(part);
    expect(got.input.atoms.some((a) => a.tetra)).toBe(false);
    expect(asked.views).toBe(0);
    expect([...new Set(got.perspective.values())]).toEqual([NOT_MARKED]);
    expect(got.perspective.size).toBe(8);
    expect(asked.views).toBe(1);
  }, 60_000);
});
