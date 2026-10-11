/**
 * A grid's surface at a value, asked of the surfaces' worker
 * (./surfaceWorker): the grid's values read once (lib/calc/results
 * `floatsOf`) and placed as its molecule is - about its centre, in the
 * page's units - then sent once, the worker keeping them while the value
 * changes.
 */
import { floatsOf, type Grid } from "../../../../lib/calc/results";
import { coloursOf, isosurface, type Mesh, type MeshGrid, type Vec3 } from "./isosurface";
import { WORLD_PER_ANGSTROM } from "./molecule3d";

let worker: Worker | null = null;
let next = 1;
const pending = new Map<number, { resolve: (v: { plus: Mesh; minus: Mesh | null }) => void; reject: (e: Error) => void }>();
/** Each grid's id with the worker, and whether the worker has it; by the grid and where its molecule's centre is. */
const ids = new WeakMap<Grid, Map<string, number>>();
const sent = new Set<number>();

function post(question: Record<string, unknown>, transfer: Transferable[] = []): Promise<{ plus: Mesh; minus: Mesh | null; lost?: boolean }> {
  if (!worker) {
    worker = new Worker(new URL("./surfaceWorker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      pending.delete(e.data.id);
      p.resolve(e.data);
    };
  }
  const id = next++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker!.postMessage({ id, ...question }, transfer);
  });
}

/** A grid as the mesher takes it: in the page's units, about `centre` (ångströms) - its molecule's, in the frame it belongs to. */
function placed(grid: Grid, centre: Vec3): MeshGrid {
  const k = WORLD_PER_ANGSTROM;
  return {
    values: floatsOf(grid.values),
    counts: grid.counts,
    origin: [(grid.origin[0] - centre[0]) * k, (grid.origin[1] - centre[1]) * k, (grid.origin[2] - centre[2]) * k],
    axes: grid.axes.map((a) => [a[0] * k, a[1] * k, a[2] * k]) as MeshGrid["axes"],
  };
}

/** A grid's id with the worker, placed about `centre`. */
function idOf(grid: Grid, centre: Vec3): number {
  const where = centre.map((v) => v.toFixed(4)).join(",");
  let byCentre = ids.get(grid);
  if (!byCentre) ids.set(grid, (byCentre = new Map()));
  let id = byCentre.get(where);
  if (id == null) byCentre.set(where, (id = next++));
  return id;
}

/**
 * A grid's surface at `iso` - and, a two-signed grid's, at its negative -
 * placed about `centre`; or, where `colour` says so, one surface coloured
 * by another grid's values where it passes, on the scale from `from` to
 * `to` (lib/calc/results `SurfaceColour`).
 */
export async function surfaceOf(grid: Grid, centre: Vec3, iso: number, colour?: { grid: Grid; from: number; to: number }): Promise<{ plus: Mesh; minus: Mesh | null }> {
  const id = idOf(grid, centre);
  const by = colour ? idOf(colour.grid, centre) : undefined;
  const signed = !!grid.signed;
  const scale = colour && by != null ? { from: colour.from, to: colour.to } : undefined;
  if (sent.has(id) && (by == null || sent.has(by))) {
    const answer = await post({ grid: id, iso, signed, ...(scale ? { colour: { grid: by, ...scale } } : {}) });
    if (!answer.lost) return answer;
  }
  const data = placed(grid, centre);
  const byData = colour && by != null ? placed(colour.grid, centre) : undefined;
  sent.add(id);
  if (by != null) sent.add(by);
  return post(
    { grid: id, data, iso, signed, ...(scale && byData ? { colour: { grid: by, data: byData, ...scale } } : {}) },
    [data.values.buffer, ...(byData ? [byData.values.buffer] : [])],
  );
}

// (worked out here, kept by the grid and where and at what it was)
const now = new WeakMap<Grid, Map<string, { plus: Mesh; minus: Mesh | null }>>();

/**
 * The same, worked out at once, here, and kept: for a picture, which is
 * made at once - and asked for twice, for the room it takes and to draw it.
 */
export function surfaceNow(grid: Grid, centre: Vec3, iso: number, colour?: { grid: Grid; from: number; to: number }): { plus: Mesh; minus: Mesh | null } {
  const key = `${centre.map((v) => v.toFixed(4)).join(",")} ${iso}${colour ? ` ${colour.from} ${colour.to}` : ""}`;
  let byKey = now.get(grid);
  if (!byKey) now.set(grid, (byKey = new Map()));
  const known = byKey.get(key);
  if (known && (!colour || known.plus.colours)) return known;
  const data = placed(grid, centre);
  const plus = isosurface(data, iso, 1);
  // (coloured by another grid: one surface, whatever the sign of its own, as the canvas draws it)
  if (colour) plus.colours = coloursOf(plus, placed(colour.grid, centre), colour.from, colour.to);
  const made = { plus, minus: grid.signed && !colour ? isosurface(data, iso, -1) : null };
  byKey.set(key, made);
  return made;
}
