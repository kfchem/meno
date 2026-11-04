import { describe, expect, it } from "vitest";
import type { Property } from "../../../../lib/entry";
import { factor } from "../../../../lib/units";
import { addMolecule3d, emptyWorkspaceDocument, type WorkspaceDocument } from "../document";
import type { Molecule3D } from "../store/types";
import { setMolecules } from "./entries";
import { resultOf } from "./flow";
import { howOf, kindInfo, needsOf } from "./kinds";
import { addSet, addStep, connect } from "./model";
import { runStep, type RunWith } from "./run";
import { SET_ASIDE } from "./structureSteps";

// docs/WORKFLOWS.md, *Energy window*: within a window of each compound's
// lowest, or of the lowest of those with one value of a property - each
// product's transition states, say.

const W: RunWith = { extentOf: () => ({ x0: -1, x1: 1, y0: -1, y1: 1 }), byOf: () => "meno", now: 1000 };
const KCAL = factor("Eh", "kcal/mol");
/** An energy `kcal` kcal/mol above -76 Eh. */
const above = (kcal: number) => -76 + kcal / KCAL;
const text = (value: string): Property => ({ value, unit: "none", status: "computed" });

/** A water in 3D, one geometry, its energy `kcal` above -76 Eh (none where null), placed `x` along, with `properties`. */
function water(kcal: number | null, x: number, properties: Record<string, Property> = {}, extra: Partial<Molecule3D> = {}): Omit<Molecule3D, "id"> {
  return {
    at: { x, y: 0 },
    atoms: [
      { el: "O", x: 0, y: 0, z: 0 },
      { el: "H", x: 0.96, y: 0, z: 0 },
      { el: "H", x: -0.24, y: 0.93, z: 0 },
    ],
    bonds: [
      { a1: 0, a2: 1, order: 1 },
      { a1: 0, a2: 2, order: 1 },
    ],
    ...(kcal == null ? {} : { energies: [above(kcal)] }),
    properties: [properties],
    ...extra,
  };
}

/** A page with `molecules` in a set (1) wired into an Energy window (2) with `options`. */
function windowed(molecules: Omit<Molecule3D, "id">[], options: Record<string, string | number>): WorkspaceDocument {
  let doc = emptyWorkspaceDocument();
  for (const m of molecules) doc = addMolecule3d(doc, m);
  doc = addSet(doc, { x0: -3, y0: -3, x1: 3 + 2 * molecules.length, y1: 3 });
  doc = addStep(doc, "energy-window", 10, 0, options);
  return connect(doc, { set: 1 }, 2);
}

const ran = (doc: WorkspaceDocument) => doc.steps!.find((s) => s.id === 2)!.ran;
const out = (doc: WorkspaceDocument, exit = "out") => setMolecules(doc, resultOf(doc, 2, exit)!);
const asides = (doc: WorkspaceDocument) => out(doc, "rest").map((m) => m.properties?.[0]?.[SET_ASIDE]?.value);
const product = (p: string) => ({ product: text(p) });

describe("Energy window, of the lowest in each value of a property", () => {
  it("keeps each product's transition states within the window of that product's lowest, the rest set aside saying how far above", () => {
    // (product b: 0 and 4 kept, 12 out; product c: its lowest 20 kept, though 20 above b's - each product its own lowest, never the whole set's - and 33 out)
    const ts = [water(0, 0, product("b")), water(4, 2, product("b")), water(12, 4, product("b")), water(20, 6, product("c")), water(33, 8, product("c"))];
    const doc = runStep(windowed(ts, { window: 10, within: "each value", groupBy: "product" }), 2, W);
    expect(ran(doc)?.said).toBe("3 of 5 entries kept, on electronic energies · rest 2 · whether minima or saddle points not known (no frequencies)");
    expect(out(doc).map((m) => Math.round((m.energies![0] + 76) * KCAL))).toEqual([0, 4, 20]);
    expect(asides(doc)).toEqual(["12.00 kcal/mol above the lowest of its product", "13.00 kcal/mol above the lowest of its product"]);
  });

  it("sets aside an entry without the property, or without an energy, saying which - never grouped with others, never left out unsaid", () => {
    const doc = runStep(windowed([water(0, 0, product("b")), water(1, 2), water(null, 4, product("b"))], { window: 10, within: "each value", groupBy: "product" }), 2, W);
    expect(ran(doc)?.said).toBe("1 of 3 entries kept, on electronic energies · rest 2 (1: it has no product; 1: it has no energy) · whether minima or saddle points not known (no frequencies)");
    expect(asides(doc)).toEqual(["it has no product", "it has no energy"]);
  });

  it("takes transition states as they are - a saddle point is not refused, which ones should be is the chemist's to say - but never an entry that is no result", () => {
    const saddle = (kcal: number, x: number) => water(kcal, x, product("b"), { imaginary: [[-450]] });
    expect(ran(runStep(windowed([saddle(0, 0), saddle(5, 2)], { window: 3, within: "each value", groupBy: "product" }), 2, W))?.said).toBe("1 of 2 entries kept, on electronic energies · rest 1");
    const failed = water(0, 2, product("b"), { failed: [{ kind: "not-converged", why: "stopped at 200 cycles" }] });
    expect(ran(runStep(windowed([water(1, 0, product("b")), failed], { window: 3, within: "each value", groupBy: "product" }), 2, W))?.ok).toBe(false);
  });

  it("never windows minima and saddle points against each other: a group of both is set aside, saying so - nor one whose kind is not known beside those whose is", () => {
    const minimum = (kcal: number, x: number, p: string) => water(kcal, x, product(p), { imaginary: [[]] });
    const saddle = (kcal: number, x: number, p: string) => water(kcal, x, product(p), { imaginary: [[-450]] });
    // (product b: a minimum and a saddle point - set aside whole; product c: two saddle points, windowed)
    const doc = runStep(windowed([minimum(0, 0, "b"), saddle(2, 2, "b"), saddle(5, 4, "c"), saddle(6, 6, "c")], { window: 3, within: "each value", groupBy: "product" }), 2, W);
    expect(ran(doc)?.said).toBe("2 of 4 entries kept, on electronic energies · rest 2 (2: its product b holds minima and saddle points together: not windowed against each other)");
    // (product b: a saddle point, and one without frequencies - which it is not known: set aside, never guessed)
    const open = runStep(windowed([saddle(0, 0, "P"), water(1, 2, product("P"))], { window: 3, within: "each value", groupBy: "product" }), 2, W);
    expect(asides(open)).toEqual(["in its product P, whether b #1 is a minimum or a saddle point is not known (no frequencies)", "in its product P, whether b #1 is a minimum or a saddle point is not known (no frequencies)"]);
  });

  it("takes molecules over compounds as Rank does, each its own group, so that it keeps them all - and says so", () => {
    const doc = runStep(windowed([water(0, 0), water(9, 2)], { window: 3 }), 2, W);
    expect(ran(doc)).toMatchObject({ ok: true, said: "2 of 2 entries kept: each molecule is its own group" });
  });

  it("says on its card the window and what it is of, and what it still needs", () => {
    const info = kindInfo("energy-window");
    expect(howOf(info.options!, {}, info.how)).toBe("within 3 kcal/mol of each compound's lowest");
    expect(howOf(info.options!, { window: 10, within: "each value", groupBy: "product" }, info.how)).toBe("within 10 kcal/mol of each product's lowest");
    expect(needsOf({ kind: "energy-window", options: { within: "each value" } })).toBe("Name the property whose values are the groups");
    expect(info.takes).toEqual(["conformers", "molecules"]);
  });
});
