import { describe, expect, it } from "vitest";
import { readCoordinates } from "../../../../lib/io/coordinates";
import { emptyWorkspaceDocument } from "../document";
import { setMembers } from "../workflow/entries";
import { placeAsSet } from "../workflow/run";
import { coordinateMolecules } from "./coordinates";

// (made up for the test: a water and a methane, each under its name)
const TEXT = [
  "Water",
  "E = -76.4 Hartree",
  "0 1",
  "O 0.000000 0.000000 0.117300",
  "H 0.000000 0.757200 -0.469200",
  "H 0.000000 -0.757200 -0.469200",
  "Methane",
  "C 0.000000 0.000000 0.000000",
  "H 0.629118 0.629118 0.629118",
  "H -0.629118 -0.629118 0.629118",
  "H -0.629118 0.629118 -0.629118",
  "H 0.629118 -0.629118 -0.629118",
].join("\n");

describe("structures read from coordinates, placed", () => {
  const chosen = readCoordinates(TEXT).map((structure) => ({ structure, name: structure.name }));

  it("are molecules in 3D bonded by distance, their orders unknown, each called by its name, with what was said of it", () => {
    const [water, methane] = coordinateMolecules(chosen, "Pasted text");
    expect(water.bonds).toHaveLength(2);
    expect(methane.bonds).toHaveLength(4);
    expect([water.bondOrders, water.bondsFrom, water.title, water.name]).toEqual(["unknown", "distance", "Water", "Pasted text"]);
    expect(water.made?.how).toEqual([
      { label: "Charge, multiplicity", text: "0 1" },
      { label: "Said", text: "E = -76.4 Hartree" },
    ]);
    expect(methane.made).toBeUndefined();
  });

  it("go on the page as a set of their own round them, its middle where they were asked for", () => {
    const ms = coordinateMolecules(chosen, "Pasted text");
    const doc = placeAsSet(emptyWorkspaceDocument(), ms, { x: 100, y: 50 }, { extentOf: () => ({ x0: -2, x1: 2, y0: -2, y1: 2 }) });
    expect(doc.molecules3d).toHaveLength(2);
    expect(doc.sets).toHaveLength(1);
    const set = doc.sets![0];
    expect((set.x0 + set.x1) / 2).toBeCloseTo(100);
    expect((set.y0 + set.y1) / 2).toBeCloseTo(50);
    expect(setMembers(doc, set).molecules.sort()).toEqual(doc.molecules3d!.map((m) => m.id).sort());
  });
});
