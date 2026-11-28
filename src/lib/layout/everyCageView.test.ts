/**
 * A cage's views from one search (cage.ts `everyCageView`): the same views, in the same order, as `projectCage` gives rank by rank and
 * `tiedViews` gives - each of which searches in full - and the reading's views of a drawing (./recognised) asked of it once, of them never.
 */
import { describe, expect, it, vi } from "vitest";
import { everyCageView, projectCage, tiedViews } from "./cage";
import { cageViews } from "./recognised";
import { layout2D } from "./engine";
import { perceive, type LayoutInput } from "./perceive";
import { fromSmiles } from "./testdata/fromSmiles";
import { prism, propellane } from "./testdata/polyhedra";

const calls = vi.hoisted(() => ({ every: 0, project: 0, tied: 0 }));
vi.mock("./cage", async (original) => {
  const actual = await original<typeof import("./cage")>();
  return {
    ...actual,
    everyCageView: ((...args: Parameters<typeof actual.everyCageView>) => (calls.every++, actual.everyCageView(...args))) as typeof actual.everyCageView,
    projectCage: ((...args: Parameters<typeof actual.projectCage>) => (calls.project++, (actual.projectCage as (...a: unknown[]) => unknown)(...args))) as typeof actual.projectCage,
    tiedViews: ((...args: Parameters<typeof actual.tiedViews>) => (calls.tied++, actual.tiedViews(...args))) as typeof actual.tiedViews,
  };
});

const CAGES: [string, () => LayoutInput][] = [
  ["cubane", () => fromSmiles("C12C3C4C1C5C2C3C45")],
  ["adamantane", () => fromSmiles("C1C2CC3CC1CC(C2)C3")],
  ["bicyclo[2.2.2]octane", () => fromSmiles("C1CC2CCC1CC2")],
  ["norbornan-2-ol", () => fromSmiles("OC1CC2CCC1C2")],
  ["bicyclo[3.3.1]nonane, drawn as 9-BBN is", () => fromSmiles("C1CC2CCCC(C1)C2")],
  ["a triangular prism", () => prism(3)],
  ["[1.1.1]propellane", () => propellane()],
];

describe("a cage's views from one search", () => {
  it.each(CAGES)("%s: the ranks and the ties, as each alone gives them", (_, make) => {
    const input = make();
    const mol = perceive(input);
    const sys = mol.systems.find((s) => s.rings.length >= 2)!;
    const one = everyCageView(mol, sys);
    expect(one.ranked).toEqual([projectCage(mol, sys), projectCage(mol, sys, 1), projectCage(mol, sys, 2), projectCage(mol, sys, 3)]);
    expect(one.tied).toEqual(tiedViews(mol, sys));
  }, 120_000);

  it("the reading's views of a drawing of a cage search once, rank by rank never", () => {
    const input = fromSmiles("C12C3C4C1C5C2C3C45");
    const out = layout2D(input);
    const atoms = input.atoms.map((a, i) => ({ x: out.x[i], y: out.y[i], hs: a.hs ?? 0, el: a.el }));
    const bonds = input.bonds.map(({ a, b, order }) => ({ a, b, order: order ?? 1 }));
    Object.assign(calls, { every: 0, project: 0, tied: 0 });
    // (another H count than any other test's: views not kept from before)
    const views = cageViews(atoms.map((a, i) => (i === 0 ? { ...a, hs: 0 } : a)), bonds)([0, 1, 2, 3, 4, 5, 6, 7]).views();
    expect(views.length).toBeGreaterThan(0);
    expect(calls).toEqual({ every: 1, project: 0, tied: 0 });
  }, 60_000);
});
