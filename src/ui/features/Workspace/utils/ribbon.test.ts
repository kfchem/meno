import { describe, expect, it } from "vitest";
import type { Biopolymer, ChainRun } from "../../../../lib/chem/biopolymer";
import { RIBBON_SIZE, ribbonMesh, ribbonPoints, STRUCTURE_COLOURS } from "./ribbon";

/** Six residues along x, 3.8 Å apart, their guides (carbonyl oxygens) to +y: a helix, then a strand of three, then one more. */
const places: number[] = [];
const trace: number[] = [];
const guide: number[] = [];
for (let i = 0; i < 6; i++) {
  trace.push(places.length / 3);
  places.push(3.8 * i, 0, 0);
  guide.push(places.length / 3);
  places.push(3.8 * i, 1.2, 0);
}
const run: ChainRun = { kind: "protein", residues: [0, 1, 2, 3, 4, 5], trace, guide };
const bp: Biopolymer = {
  names: [],
  residueOf: [],
  residues: [0, 1, 2, 3, 4, 5].map((k) => ({ name: "ALA", chain: k < 6 ? "A" : "B", seq: k + 1, iCode: "", standard: true })),
  structure: ["helix", "helix", "strand", "strand", "strand", null],
};

describe("a chain's ribbon", () => {
  const line = ribbonPoints(places, run, bp, "structure", 1, 1, 4);

  it("runs through its backbone atoms, a number of points to a residue", () => {
    expect(line).toHaveLength(5 * 4 + 1);
    expect(line[0].at.x).toBeCloseTo(0, 9);
    expect(line[4].at.x).toBeCloseTo(3.8, 9);
    expect(line[line.length - 1].at.x).toBeCloseTo(19, 9);
    // its width lying towards the carbonyl oxygens, square to the chain
    expect(Math.abs(line[2].across.y)).toBeCloseTo(1, 6);
    expect(line[2].along.x).toBeCloseTo(1, 6);
  });

  it("is a flat band through a helix, an arrow at a strand's end, a tube elsewhere - coloured by structure", () => {
    expect(line[0].w).toBeCloseTo(RIBBON_SIZE.helix.w, 9);
    expect(line[0].h).toBeCloseTo(RIBBON_SIZE.helix.h, 9);
    // (from the strand's last but one residue: its arrowhead, widest first)
    expect(line[12].w).toBeCloseTo(RIBBON_SIZE.arrow, 9);
    expect(line[16].w).toBeCloseTo(RIBBON_SIZE.coil.w, 9);
    expect(line[20].w).toBeCloseTo(RIBBON_SIZE.coil.w, 9);
    expect(`#${line[0].colour.getHexString()}`).toBe(STRUCTURE_COLOURS.helix);
    expect(`#${line[10].colour.getHexString()}`).toBe(STRUCTURE_COLOURS.strand);
  });

  it("shrinks to nothing as it goes, and is as large as `k` makes an ångström", () => {
    expect(ribbonPoints(places, run, bp, "structure", 0, 1, 4).every((p) => p.w === 0 && p.h === 0)).toBe(true);
    expect(ribbonPoints(places, run, bp, "structure", 1, 2, 4)[0].w).toBeCloseTo(2 * RIBBON_SIZE.helix.w, 9);
  });

  it("is made of triangles round its points, each end closed, each corner knowing its residue", () => {
    const mesh = ribbonMesh(places, [run], bp, "chain", 1, 1);
    const points = 5 * 8 + 1;
    expect(mesh.positions.length / 3).toBe(points * 10 + 2);
    expect(mesh.indices.length / 3).toBe((points - 1) * 10 * 2 + 2 * 10);
    expect(Math.max(...mesh.indices)).toBeLessThan(mesh.positions.length / 3);
    expect(new Set(mesh.residues)).toEqual(new Set([0, 1, 2, 3, 4, 5]));
  });
});
