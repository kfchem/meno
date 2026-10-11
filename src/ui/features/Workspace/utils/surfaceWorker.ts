/**
 * Surfaces worked out off the main thread (./isosurface): a grid sent once,
 * kept by its id - the last few - and its surface at a value asked for as
 * often as the value changes.
 */
import { coloursOf, isosurface, type MeshGrid } from "./isosurface";

const KEPT = 4;
const grids = new Map<number, MeshGrid>();

/** A surface at `iso`, of the grid kept as `grid` (sent with it, `data`, the first time) - coloured, where it says so, by the grid kept as `colour.grid`, on the scale from `from` to `to`. */
type Question = {
  id: number;
  grid: number;
  data?: MeshGrid;
  iso: number;
  signed: boolean;
  colour?: { grid: number; data?: MeshGrid; from: number; to: number };
};

self.onmessage = (e: MessageEvent<Question>) => {
  const q = e.data;
  if (q.data) {
    grids.set(q.grid, q.data);
    while (grids.size > KEPT) grids.delete(grids.keys().next().value!);
  }
  if (q.colour?.data) {
    grids.set(q.colour.grid, q.colour.data);
    while (grids.size > KEPT) grids.delete(grids.keys().next().value!);
  }
  const grid = grids.get(q.grid);
  const by = q.colour ? grids.get(q.colour.grid) : undefined;
  if (!grid || (q.colour && !by)) {
    self.postMessage({ id: q.id, lost: true });
    return;
  }
  const plus = isosurface(grid, q.iso, 1);
  if (by && q.colour) plus.colours = coloursOf(plus, by, q.colour.from, q.colour.to);
  // (a surface coloured by another grid is one surface, whatever the sign of its own)
  const minus = q.signed && !by ? isosurface(grid, q.iso, -1) : null;
  const buffers = [plus.positions.buffer, plus.normals.buffer, ...(plus.colours ? [plus.colours.buffer] : []), ...(minus ? [minus.positions.buffer, minus.normals.buffer] : [])];
  (self as unknown as Worker).postMessage({ id: q.id, plus, minus }, buffers as Transferable[]);
};
