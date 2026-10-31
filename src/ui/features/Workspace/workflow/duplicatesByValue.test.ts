import { describe, expect, it } from "vitest";
import type { Property } from "../../../../lib/entry";
import { addMolecule3d, emptyWorkspaceDocument, type WorkspaceDocument } from "../document";
import type { Molecule3D } from "../store/types";
import { setMolecules } from "./entries";
import { resultOf } from "./flow";
import { howOf, kindInfo, needsOf } from "./kinds";
import { addSet, addStep, connect } from "./model";
import { runStep, type RunWith } from "./run";
import { SET_ASIDE } from "./structureSteps";

// docs/WORKFLOWS.md, *Duplicates*: compared within each compound, or within
// each value of a property across compounds - the same transition state
// found by two paths, each its own compound, is one.

const W: RunWith = { extentOf: () => ({ x0: -1, x1: 1, y0: -1, y1: 1 }), byOf: () => "meno", now: 1000 };
const text = (value: string): Property => ({ value, unit: "none", status: "computed" });

/**
 * A water in 3D, its own compound in a conformer set (as a path's saddle
 * point is), its second hydrogen `shift` Å along, its energy `e` (Eh), and
 * its frequencies' verdict: a saddle point, a minimum, or none worked out.
 */
function water(shift: number, e: number, p: string | null, kind: "saddle" | "minimum" | "none" = "saddle", x = 0): Omit<Molecule3D, "id"> {
  return {
    at: { x, y: 0 },
    atoms: [
      { el: "O", x: 0, y: 0, z: 0 },
      { el: "H", x: 0.96, y: 0, z: 0 },
      { el: "H", x: -0.24 + shift, y: 0.93, z: 0 },
    ],
    bonds: [
      { a1: 0, a2: 1, order: 1 },
      { a1: 0, a2: 2, order: 1 },
    ],
    conformerSet: true,
    energies: [e],
    properties: [p == null ? {} : { product: text(p) }],
    ...(kind === "none" ? {} : { imaginary: [kind === "saddle" ? [-450] : []] }),
  };
}

/** A page with `molecules` in a set (1) wired into Duplicates (2) with `options`. */
function compared(molecules: Omit<Molecule3D, "id">[], options: Record<string, string | number>): WorkspaceDocument {
  let doc = emptyWorkspaceDocument();
  molecules.forEach((m, i) => (doc = addMolecule3d(doc, { ...m, at: { x: 2 * i, y: 0 } })));
  doc = addSet(doc, { x0: -3, y0: -3, x1: 3 + 2 * molecules.length, y1: 3 });
  doc = addStep(doc, "duplicates", 10, 0, options);
  return connect(doc, { set: 1 }, 2);
}

const ran = (doc: WorkspaceDocument) => doc.steps!.find((s) => s.id === 2)!.ran;
const out = (doc: WorkspaceDocument, exit = "out") => setMolecules(doc, resultOf(doc, 2, exit)!);
const asides = (doc: WorkspaceDocument) => out(doc, "rest").map((m) => m.properties?.[0]?.[SET_ASIDE]?.value);
const BY = { within: "each value", groupBy: "product" };

describe("Duplicates, within each value of a property", () => {
  it("finds the same transition state found twice - each its own compound - within one product, the lower kept, the other naming it", () => {
    // (a and b: one saddle point, 0.001 Å apart, product P; c: another shape, product P; d: b's shape, but product Q - not compared with it)
    const doc = runStep(compared([water(0.001, -76.0, "P"), water(0, -76.01, "P"), water(0.4, -76.02, "P"), water(0, -76.0, "Q")], BY), 2, W);
    expect(ran(doc)?.said).toBe("3 of 4 entries kept · rest 1");
    expect(asides(doc)).toEqual(["the same as b #1, which was kept"]);
    // (over compounds, as before: saddle points with energies are refused - which is what this mode is for)
    expect(ran(runStep(compared([water(0.001, -76.0, "P"), water(0, -76.01, "P")], {}), 2, W))?.ok).toBe(false);
  });

  it("sets aside one without the property, saying so - never compared with others", () => {
    const doc = runStep(compared([water(0, -76.0, "P"), water(0, -76.01, null)], BY), 2, W);
    expect(ran(doc)?.said).toBe("1 of 2 entries kept · rest 1 (1: it has no product)");
    expect(asides(doc)).toEqual(["it has no product"]);
  });

  it("never takes minima and saddle points of one value as the same - set aside together, saying so - nor one whose kind is not known beside one whose is", () => {
    const mixed = runStep(compared([water(0, -76.0, "P", "minimum"), water(0.001, -76.01, "P", "saddle")], BY), 2, W);
    expect(asides(mixed)).toEqual(["its product P holds minima and saddle points together: not compared with each other", "its product P holds minima and saddle points together: not compared with each other"]);
    const open = runStep(compared([water(0, -76.0, "P", "saddle"), water(0.001, -76.01, "P", "none")], BY), 2, W);
    expect(asides(open)[0]).toBe("in its product P, whether b #1 is a minimum or a saddle point is not known (no frequencies)");
    // (none known: compared, and said)
    const none = runStep(compared([water(0, -76.0, "P", "none"), water(0.001, -76.01, "P", "none")], BY), 2, W);
    expect(ran(none)?.said).toBe("1 of 2 entries kept · rest 1 · whether minima or saddle points not known (no frequencies)");
  });

  it("keeps the lower only where both energies were worked out alike - free energies where each has one - else sets the two aside, saying how they differ", () => {
    const at = (m: Omit<Molecule3D, "id">, method: string, g?: number): Omit<Molecule3D, "id"> => ({
      ...m,
      calc: { readers: ["meno"], program: "X", method },
      ...(g == null ? {} : { properties: [{ ...m.properties![0], "thermo.free-energy": { value: g, unit: "Eh", status: "computed", by: { program: "X", method } } }] }),
    });
    // (the same saddle point found by two paths, at two levels: the electronic energy of one never decides against the other's)
    const two = runStep(compared([at(water(0.001, -76.0, "P"), "M1"), at(water(0, -80.0, "P"), "M2")], BY), 2, W);
    expect(asides(two)).toEqual(Array(2).fill("in its product P, alike, but which is lower is not known: energies differ in level, X \u00b7 M1 (a #1) and X \u00b7 M2 (b #1)"));
    expect(ran(two)?.said).toBe("0 of 2 entries kept · rest 2 (2: alike, energies at different levels)");
    // (nor free energies by two methods)
    const free = runStep(compared([at(water(0.001, -76.0, "P"), "M1", -75.9), at(water(0, -80.0, "P"), "M2", -79.9)], BY), 2, W);
    expect(asides(free)[0]).toBe("in its product P, alike, but which is lower is not known: free energies differ in method, M1 (a #1) and M2 (b #1)");
    // (free energies alike: the lower free energy kept, whatever the electronic energies say)
    const alike = runStep(compared([at(water(0.001, -80.0, "P"), "M1", -76.0), at(water(0, -76.0, "P"), "M1", -76.01)], BY), 2, W);
    expect(asides(alike)).toEqual(["the same as b #1, which was kept"]);
    // (levels decide only between those alike: two saddle points unlike each other, at two levels, both kept)
    const unlike = runStep(compared([at(water(0.4, -76.0, "P"), "M1"), at(water(0, -80.0, "P"), "M2")], BY), 2, W);
    expect(ran(unlike)?.said).toBe("2 of 2 entries kept");
  });

  it("keeps the first of those alike where one has no energy, saying so", () => {
    const doc = runStep(compared([{ ...water(0.001, -76.0, "P"), energies: undefined }, water(0, -76.01, "P"), water(0.4, -76.02, "P")], BY), 2, W);
    expect(asides(doc)).toEqual(["the same as a #1, which was kept"]);
    expect(ran(doc)?.said).toBe("2 of 3 entries kept · rest 1 · where one of those alike has no energy, the first kept");
  });

  it("says on its card what it compares within, and what it still needs", () => {
    const info = kindInfo("duplicates");
    // (only what is not its default: at all its defaults, nothing - the card says "Duplicates")
    expect(howOf(info.options!, {}, info.how)).toBe("");
    expect(howOf(info.options!, BY, info.how)).toBe("compared within each product");
    expect(howOf(info.options!, { ...BY, mirrors: "counted" }, info.how)).toBe("mirror images counted as one · compared within each product");
    expect(needsOf({ kind: "duplicates", options: { within: "each value" } })).toBe("Name the property whose values are the groups");
  });
});
