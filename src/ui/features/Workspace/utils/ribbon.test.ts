import { describe, expect, it } from "vitest";
import type { Biopolymer, ChainRun } from "../../../../lib/chem/biopolymer";
import * as THREE from "three";
import { residueOnRay, RIBBON_SIZE, ribbonMesh, ribbonPoints, ribbonSpheres, STRUCTURE_COLOURS } from "./ribbon";

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

describe("a ribbon under the pointer", () => {
  const mesh = ribbonMesh(places, [run], bp, "structure", 1, 1);
  const spheres = ribbonSpheres(mesh);

  it("is found a residue at a time, by a sphere round each residue's own corners", () => {
    expect([...spheres.residues]).toEqual([0, 1, 2, 3, 4, 5]);
    for (let k = 0; k < spheres.residues.length; k++) {
      expect(spheres.radii[k]).toBeGreaterThan(0);
      // (and none of its corners outside it)
      mesh.residues.forEach((r, v) => {
        if (r !== spheres.residues[k]) return;
        const d = Math.hypot(mesh.positions[3 * v] - spheres.centres[3 * k], mesh.positions[3 * v + 1] - spheres.centres[3 * k + 1], mesh.positions[3 * v + 2] - spheres.centres[3 * k + 2]);
        expect(d).toBeLessThanOrEqual(spheres.radii[k] + 1e-5);
      });
    }
  });

  it("says the residue a ray meets first - from above the third residue, that one; from the end of the chain along it, the nearest; beside it, none", () => {
    const at = (x: number, y: number, z: number, dx: number, dy: number, dz: number) => new THREE.Ray(new THREE.Vector3(x, y, z), new THREE.Vector3(dx, dy, dz).normalize());
    // (the third residue's sphere is about its own corners: a ray down onto where they gather)
    const k = 2;
    const c = new THREE.Vector3().fromArray(spheres.centres, 3 * k);
    expect(residueOnRay(spheres, at(c.x, c.y, 50, 0, 0, -1))?.residue).toBe(2);
    expect(residueOnRay(spheres, at(-50, 0, 0, 1, 0, 0))?.residue).toBe(0);
    expect(residueOnRay(spheres, at(50, 0, 0, -1, 0, 0))?.residue).toBe(5);
    expect(residueOnRay(spheres, at(9.5, 0, 50, 0, 0, 1))).toBeNull();
    expect(residueOnRay(spheres, at(9.5, 40, 50, 0, 0, -1))).toBeNull();
  });
});
