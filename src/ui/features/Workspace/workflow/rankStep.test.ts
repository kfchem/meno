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

const W: RunWith = { extentOf: () => ({ x0: -1, x1: 1, y0: -1, y1: 1 }), byOf: () => "meno", now: 1000 };

/** A text a step wrote, as a frame's property: a Tag's *path*. */
const text = (value: string): Property => ({ value, unit: "none", status: "computed" });

/** A water of as many frames as `energies` - a conformer set where there are more than one - each frame's energy (Eh) and properties as given. */
function water(energies: number[], extra: Partial<Molecule3D> = {}, properties?: Record<string, Property>[]): Omit<Molecule3D, "id"> {
  return {
    at: { x: 0, y: 0 },
    atoms: [
      { el: "O", x: 0, y: 0, z: 0 },
      { el: "H", x: 0.96, y: 0, z: 0 },
      { el: "H", x: -0.24, y: 0.93, z: 0 },
    ],
    bonds: [
      { a1: 0, a2: 1, order: 1 },
      { a1: 0, a2: 2, order: 1 },
    ],
    ...(energies.length > 1 ? { conformerSet: true, frames: energies.slice(1).map((_, k) => [0, 0, 0, 0.96 + (k + 1) / 100, 0, 0, -0.24, 0.93, 0]) } : {}),
    energies,
    ...(properties ? { properties } : {}),
    ...extra,
  };
}

/** A page with `molecules` in a set (1) wired into a Rank (2) with `options`. */
function ranking(molecules: Omit<Molecule3D, "id">[], options: Record<string, string | number>): WorkspaceDocument {
  let doc = emptyWorkspaceDocument();
  for (const m of molecules) doc = addMolecule3d(doc, m);
  doc = addSet(doc, { x0: -3, y0: -3, x1: 3, y1: 3 });
  doc = addStep(doc, "rank", 10, 0, options);
  return connect(doc, { set: 1 }, 2);
}

const ran = (doc: WorkspaceDocument) => doc.steps!.find((s) => s.id === 2)!.ran;
const out = (doc: WorkspaceDocument, exit = "out") => setMolecules(doc, resultOf(doc, 2, exit)!);

describe("a Rank step", () => {
  it("keeps the lowest by energy in each group, by default the first one - the rest each saying its place", () => {
    // (two conformer sets: a's three, b's two)
    const doc = runStep(ranking([water([-76.40, -76.42, -76.41]), water([-76.30, -76.31], { at: { x: 2, y: 0 } })], {}), 2, W);
    expect(ran(doc)).toMatchObject({ ok: true, said: "the lowest 1 by energy in each group: 2 of 5 kept · rest 3 (3: below the first 1)" });
    expect(out(doc).map((m) => [m.numbers, m.energies])).toEqual([
      [[2], [-76.42]],
      [[2], [-76.31]],
    ]);
    const rest = out(doc, "rest");
    expect(rest.map((m) => m.numbers)).toEqual([[1, 3], [1]]);
    // (each one's place written on it, to read in its set's table)
    expect(rest[0].properties?.map((p) => p[SET_ASIDE]?.value)).toEqual([
      "ranked 3 of 3 in its group by energy, lowest first; the first 1 kept",
      "ranked 2 of 3 in its group by energy, lowest first; the first 1 kept",
    ]);
  });

  it("keeps the first N of all together, highest first where asked", () => {
    const doc = runStep(ranking([water([-76.40, -76.42, -76.41]), water([-76.30, -76.31], { at: { x: 2, y: 0 } })], { keep: 2, within: "all", order: "highest first" }), 2, W);
    expect(ran(doc)?.said).toBe("the highest 2 by energy of all: 2 of 5 kept · rest 3 (3: below the first 2)");
    // (both b's: one molecule of its two, in their ranked order)
    expect(out(doc).map((m) => m.energies)).toEqual([[-76.3, -76.31]]);
  });

  it("ranks in each value of a property - each path's first - an entry without it set aside saying so", () => {
    const paths = [text("a→b"), text("a→c"), text("a→b"), text("a→c")];
    const doc = runStep(ranking([water([-1.0, -1.2, -1.1, -1.3, -1.4], {}, [...paths.map((path) => ({ path })), {}])], { within: "each value", groupBy: "path" }), 2, W);
    expect(ran(doc)?.said).toBe("the lowest 1 by energy in each path: 2 of 5 kept · rest 3 (2: below the first 1; 1: it has no path to be ranked within)");
    expect(out(doc)[0].numbers).toEqual([3, 4]);
    expect(out(doc, "rest")[0].properties?.map((p) => p[SET_ASIDE]?.value)).toContain("it has no path to be ranked within");
  });

  it("never ranks an entry that is no result: failed or not converged, set aside saying so, its energy not counted", () => {
    // (#2 the lowest, but not converged: #3 the lowest of those finished)
    const set = water([-76.40, -76.50, -76.41], { failed: [null, { kind: "not-converged", why: "stopped at 200 cycles" }, null] });
    const doc = runStep(ranking([set], {}), 2, W);
    expect(ran(doc)?.said).toBe("the lowest 1 by energy in each group: 1 of 3 kept · rest 2 (1: below the first 1; 1: not ranked: not converged)");
    expect(out(doc)[0].numbers).toEqual([3]);
    expect(out(doc, "rest")[0].properties?.map((p) => p[SET_ASIDE]?.value)).toContain("not ranked: not converged");
  });

  it("says what it ranked by: the value's level, solvent and temperature, as its record says them", () => {
    const g = (value: number): Property => ({ value, unit: "kcal/mol", at: { geometry: "g", kelvin: 298.15, solvent: "SMD(chloroform)" }, by: { program: "Gaussian", method: "wB97X-D", basis: "6-311+G(d,p)" }, status: "computed" });
    const doc = runStep(ranking([water([-1, -1, -1], {}, [{ dg: g(2) }, { dg: g(0.5) }, { dg: g(1) }])], { property: "dg" }), 2, W);
    expect(ran(doc)?.said).toBe("the lowest 1 by dg (wB97X-D/6-311+G(d,p), Gaussian, in SMD(chloroform), at 298.15 K) in each group: 1 of 3 kept · rest 2 (2: below the first 1)");
    expect(out(doc)[0].numbers).toEqual([2]);
  });

  it("sets aside a group whose values were worked out differently, naming the entries, never ranking them as one", () => {
    const by = (method: string): Property => ({ value: 1, unit: "kcal/mol", by: { program: "P", method }, status: "computed" });
    const doc = runStep(ranking([water([-1, -1], {}, [{ dg: by("M") }, { dg: by("N") }])], { property: "dg" }), 2, W);
    expect(out(doc, "rest")[0].properties?.[0][SET_ASIDE]?.value).toBe("its group's dg values differ in method: M (a #1) and N (a #2), and are not ranked together");
  });

  it("says on its card what it does, and what it still needs before it can run", () => {
    const info = kindInfo("rank");
    expect(howOf(info.options!, {}, info.how)).toBe("the lowest 1 by energy in each group");
    expect(howOf(info.options!, { keep: 64, within: "each value", groupBy: "species" }, info.how)).toBe("the lowest 64 by energy in each species");
    expect(needsOf({ kind: "rank", options: { property: " " } })).toBe("Name the property to rank by");
    expect(needsOf({ kind: "rank", options: { within: "each value" } })).toBe("Name the property whose values are the groups");
    expect([info.name, info.made, info.others?.map((o) => o.name)]).toEqual(["Rank", "The first {keep}", ["The rest"]]);
  });
});
