/**
 * What one edit of a cage drawn flat asks of the engine's search for its views (lib/layout/cage `everyCageView`), from the readers that
 * run as the chemist works: the configuration watch's step (`readingOf`, `changesAgainstKept`), the 3D molecules' link to their drawing at
 * each move of a drag (`linkOf`), and identity's input with the words at its atoms (R and S shown). Its near edge not marked: none for its
 * reading, one for its words. Marked: one for each structure the edit makes, none again as it is dragged.
 */
import { describe, expect, it, vi } from "vitest";
import { NOMINAL_BOND_LENGTH as L } from "../../../../lib/chem/acs";
import { layout2D } from "../../../../lib/layout/engine";
import { fromSmiles } from "../../../../lib/layout/testdata/fromSmiles";
import type { Model } from "../store/types";
import { identityInputOf } from "../chem/identityOf";
import { linkOf, signatureOf } from "../utils/drawnLink";
import { changesAgainstKept, readingOf } from "./changes";

const searches = vi.hoisted(() => ({ n: 0 }));
vi.mock("../../../../lib/layout/cage", async (original) => {
  const actual = await original<typeof import("../../../../lib/layout/cage")>();
  return { ...actual, everyCageView: ((...args: Parameters<typeof actual.everyCageView>) => (searches.n++, actual.everyCageView(...args))) as typeof actual.everyCageView };
});

/** Methyl cubanecarboxylate as the engine places it, drawn flat (no depth); the cube's bond `bold` drawn bold, where given. */
function ester(bold?: number): Model {
  const input = fromSmiles("COC(=O)C12C3C4C1C5C2C3C45");
  const out = layout2D(input);
  const ring = input.bonds.map((b, k) => ({ b, k })).filter(({ b }) => b.a >= 4 && b.b >= 4);
  return {
    atoms: input.atoms.map((a, i) => ({ id: i + 1, x: out.x[i] * L, y: out.y[i] * L, r: 0.9, el: a.el ?? "C" })),
    bonds: input.bonds.map((b, k) => ({ id: 100 + k, a: b.a + 1, b: b.b + 1, order: b.order ?? 1, ...(bold != null && ring[bold].k === k ? { display: "bold" } : {}) })),
  } as unknown as Model;
}
const moved = (m: Model, dx: number): Model => ({ ...m, atoms: m.atoms.map((a) => (a.id === 6 ? { ...a, x: a.x + dx } : a)) });
/** A methyl drawn on the cube's atom of id `on` (the views are kept by structure: each test's its own). */
const withMethyl = (m: Model, on: number): Model => {
  const at = m.atoms.find((a) => a.id === on)!;
  return { ...m, atoms: [...m.atoms, { ...at, id: 99, x: at.x + L, y: at.y }], bonds: [...m.bonds, { id: 199, a: on, b: 99, order: 1 }] } as Model;
};
/** The configuration watch's work for one step (configuration/watch `keepNow`, then `changesAgainstKept`). */
const step = (before: Model, after: Model) => {
  readingOf(after);
  changesAgainstKept(before, after);
};
const counted = (f: () => void) => {
  searches.n = 0;
  f();
  return searches.n;
};

describe("one edit of a cage drawn flat", () => {
  it("its near edge not marked: the watch's step and every move of a drag ask no search; the words at its atoms, one for each structure", () => {
    const before = ester();
    const after = withMethyl(before, 6);
    expect(counted(() => step(before, after))).toBe(0);
    const ids = before.atoms.map((a) => a.id);
    const made = { drawnFrom: ids, drawnAs: signatureOf(before, ids) };
    expect(counted(() => [1, 2, 3, 4, 5].forEach((k) => linkOf(made, moved(before, k))))).toBe(0);
    expect(counted(() => identityInputOf(after).perspective)).toBe(1);
    expect(counted(() => [1, 2, 3].forEach((k) => identityInputOf(moved(after, k)).perspective))).toBe(0);
  }, 120_000);

  it("its near edge marked: one search for the structure the edit makes, none again as it is dragged or read by another reader", () => {
    const before = ester(0);
    readingOf(before);
    const after = withMethyl(before, 7);
    expect(counted(() => step(before, after))).toBe(1);
    const ids = after.atoms.map((a) => a.id);
    const made = { drawnFrom: ids, drawnAs: signatureOf(after, ids) };
    expect(counted(() => [1, 2, 3, 4, 5].forEach((k) => linkOf(made, moved(after, k))))).toBe(0);
    expect(counted(() => identityInputOf(after).perspective)).toBe(0);
  }, 120_000);
});
