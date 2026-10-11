import { describe, expect, it } from "vitest";
import { STYLE_3D } from "../../../lib/chem/style3d";
import type { Grid, ListResult } from "../../../lib/calc/results";
import { copiedMolecules } from "./clipboardActions";
import { pictureSurface } from "./utils/surfaceMesh";

/** A p orbital along x on a grid of side 6 Å about the origin, as a result carries it. */
function orbital(n = 21): Grid {
  const step = 6 / (n - 1);
  const values = new Float32Array(n * n * n);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++)
      for (let k = 0; k < n; k++) {
        const [x, y, z] = [-3 + i * step, -3 + j * step, -3 + k * step];
        values[(i * n + j) * n + k] = x * Math.exp(-(x * x + y * y + z * z));
      }
  let text = "";
  for (const b of new Uint8Array(values.buffer)) text += String.fromCharCode(b);
  return { origin: [-3, -3, -3], axes: [[step, 0, 0], [0, step, 0], [0, 0, step]], counts: [n, n, n], values: btoa(text), signed: true };
}

describe("a copy of molecules in 3D", () => {
  it("takes each as it is shown - its open list's chosen surface too - so that its picture draws the surface", () => {
    const list: ListResult = { on: "list", id: "grids", group: "Orbitals", label: "Orbitals", columns: [], rows: [{ cells: [], surface: orbital() }] };
    const molecule = { id: 7, atoms: [{ el: "C", x: 0, y: 0, z: 0 }], bonds: [], at: { x: 0, y: 0 }, calc: { results: [list] } };
    const state = {
      molecules3d: [molecule, { ...molecule, id: 8, calc: undefined }],
      turns3d: { 7: [0, 0, 0, 1] },
      frames3d: {},
      lists3d: { 7: { list: "grids", row: 0, pointed: null, iso: 0.1 } },
    } as never;
    const [m] = copiedMolecules(state, [7]);
    expect(m.turn).toEqual([0, 0, 0, 1]);
    expect(m.list).toEqual({ id: "grids", row: 0, iso: 0.1 });
    // (what a copied picture draws: the surface, as an exported one does)
    const surface = pictureSurface(m, STYLE_3D);
    expect(surface?.plus.positions.length).toBeGreaterThan(0);
    expect(surface?.minus?.positions.length).toBeGreaterThan(0);
    // (only those asked for; one with no list open shows none)
    expect(copiedMolecules(state, [9])).toEqual([]);
    expect(pictureSurface(copiedMolecules(state, [8])[0], STYLE_3D)).toBeNull();
  });
});
