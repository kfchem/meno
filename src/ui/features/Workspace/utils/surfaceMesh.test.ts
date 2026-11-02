import { describe, expect, it } from "vitest";
import { STYLE_3D } from "../../../../lib/chem/style3d";
import type { Grid, ListResult } from "../../../../lib/calc/results";
import type { Carried3D } from "../store/types";
import { colourSurface, frameCentre, pictureSurface, shownSurface, SURFACE_OPACITY, surfaceGeometry, surfaceOpacity } from "./surfaceMesh";
import { ISO_ORBITAL } from "../../../../lib/calc/grids";

/** A grid of f over a cube of side 6 Å about the origin, n points a side, as a result carries it. */
function gridOf(f: (x: number, y: number, z: number) => number, n: number, signed = false): Grid {
  const step = 6 / (n - 1);
  const values = new Float32Array(n * n * n);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) for (let k = 0; k < n; k++) values[(i * n + j) * n + k] = f(-3 + i * step, -3 + j * step, -3 + k * step);
  const bytes = new Uint8Array(values.buffer);
  let text = "";
  for (const b of bytes) text += String.fromCharCode(b);
  return { origin: [-3, -3, -3], axes: [[step, 0, 0], [0, step, 0], [0, 0, step]], counts: [n, n, n], values: btoa(text), ...(signed ? { signed } : {}) };
}

/** One atom at the origin showing `surface` in its list's first row (or not, `row` null). */
function carrying(surface: Grid | { ask: string }, row: number | null, iso?: number): Carried3D {
  const list: ListResult = { on: "list", id: "grids", group: "Orbitals", label: "Orbitals", columns: [], rows: [{ cells: [], surface }] };
  return {
    atoms: [{ el: "C", x: 0, y: 0, z: 0 }],
    bonds: [],
    at: { x: 10, y: 20 },
    calc: { results: [list] },
    list: { id: "grids", row, ...(iso != null ? { iso } : {}) },
  } as unknown as Carried3D;
}

describe("a surface as a picture draws it", () => {
  // (a p orbital along x: positive lobe on +x, negative on -x)
  const p = gridOf((x, y, z) => x * Math.exp(-(x * x + y * y + z * z)), 25, true);

  it("is the one its open list's chosen row shows, once given, at the list's value", () => {
    expect(shownSurface(carrying(p, 0, 0.1))).toEqual({ grid: expect.objectContaining({ counts: [25, 25, 25] }), iso: 0.1 });
    // (a two-signed grid that says no value of its own: drawn as an orbital is, at first)
    expect(shownSurface(carrying(p, 0))?.iso).toBe(ISO_ORBITAL);
    expect(shownSurface(carrying(p, null))).toBeNull();
    expect(shownSurface(carrying({ ask: "grid:0" }, 0))).toBeNull();
  });

  it("reaches as far as its lobes do, both phases, where the molecule stands on the page", () => {
    const m = carrying(p, 0, 0.1);
    const drawn = pictureSurface(m, STYLE_3D)!;
    expect(drawn.plus.positions.length).toBeGreaterThan(0);
    expect(drawn.minus!.positions.length).toBeGreaterThan(0);
    // (about x = 10: the positive lobe to the right, the negative to the left, as far as each other)
    const { min, max } = drawn.bounds;
    expect(min.x).toBeLessThan(10 - 1);
    expect(max.x).toBeGreaterThan(10 + 1);
    expect((min.x + max.x) / 2).toBeCloseTo(10, 0);
    expect((min.y + max.y) / 2).toBeCloseTo(20, 0);
    // (worked out once for the room and the drawing)
    expect(pictureSurface(m, STYLE_3D)!.plus).toBe(drawn.plus);
  });

  it("is placed about the centre of the frame shown", () => {
    const m = { atoms: [{ el: "C", x: 0, y: 0, z: 0 }, { el: "C", x: 2, y: 0, z: 0 }], frames: [[0, 0, 0, 0, 4, 0]] } as unknown as Carried3D;
    expect(frameCentre(m, 0)).toEqual([1, 0, 0]);
    expect(frameCentre(m, 1)).toEqual([0, 2, 0]);
  });
});

describe("a surface coloured by another grid, as the canvas and a picture draw it", () => {
  /** One atom at the origin showing a sphere's surface coloured by height. */
  function coloured(): Carried3D {
    const m = carrying(gridOf((x, y, z) => Math.hypot(x, y, z), 13), 0, 1.5);
    const list = m.calc!.results![0] as ListResult;
    list.rows[0].colour = { by: gridOf((_x, _y, z) => z, 13), from: -1.5, to: 1.5, label: "height" };
    return m;
  }

  it("is shown with what colours it, and the values its scale runs between", () => {
    const shown = shownSurface(coloured());
    expect(shown?.colour).toMatchObject({ from: -1.5, to: 1.5 });
    expect(shown?.colour?.grid.counts).toEqual([13, 13, 13]);
  });

  it("is one mesh whose points keep the other grid's colours, never painted over by the phases', and not seen through", () => {
    const surface = pictureSurface(coloured(), STYLE_3D)!;
    expect(surface.minus).toBeNull();
    expect(surface.plus.colours?.length).toBe(surface.plus.positions.length);
    const made = surfaceGeometry(surface.plus, surface.minus);
    expect(made.coloured).toBe(true);
    colourSurface(made.geometry, made.split, "#ff0000", "#0000ff");
    const colours = made.geometry.getAttribute("color").array as Float32Array;
    expect(Array.from(colours.slice(0, 30))).toEqual(Array.from(surface.plus.colours!.slice(0, 30)));
    expect(surfaceOpacity(made.coloured)).toBe(1);
    // (a surface of its own phases: painted, and seen through)
    const plain = surfaceGeometry({ positions: surface.plus.positions, normals: surface.plus.normals }, null);
    expect(plain.coloured).toBe(false);
    expect(surfaceOpacity(plain.coloured)).toBe(SURFACE_OPACITY);
  });
});
