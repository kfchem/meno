/**
 * What is under the pointer among what WebGL draws on the page (docs/
 * WORKSPACE.md, *Drawn by WebGL*): a set's tab, a frame's edge, a port, a
 * chip - found by its shape on the page, as HTML's own hit-testing found
 * them before (`elementFromPoint`), the topmost first. Here, the regions
 * and the lookup; `PageHits` asks it on every press, move and drop.
 */
import { controlSize, type Control } from "./units";

/** A rectangle on the page, in its units (y up). */
export type Rect = { x0: number; y0: number; x1: number; y1: number };

/** Which side or corner of a rectangle an edge band runs along. */
export type Side = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

/**
 * A place that takes the pointer, named by `key` (what it belongs to: "set:12",
 * "port:take:5:mols") and `part` ("tab", "edge", ...): a rectangle; a circle,
 * `diameterPx` SCREEN pixels across - the size a hand takes it at, not the
 * size it is drawn (a control's, `size`, no larger than its own); or a band
 * `widthPx` SCREEN pixels either side of one of a rectangle's edges or
 * about one of its corners - a frame's edge, to size it by.
 */
export type Region =
  | { key: string; part: string; rect: Rect; z?: number; cursor?: string }
  | { key: string; part: string; circle: { x: number; y: number; diameterPx: number; size?: Control }; z?: number; cursor?: string }
  | { key: string; part: string; band: Rect & { widthPx: number; side: Side }; z?: number; cursor?: string };

/** What was found: the region's key and part, and the region itself. */
export type Hit = { key: string; part: string; region: Region };

/** How far `p` is inside `r`'s band, or -1 where it is not in it (`zoom`: screen pixels are 1 / zoom of the page's units). */
function inBand(b: Rect & { widthPx: number; side: Side }, x: number, y: number, zoom: number): boolean {
  const w = b.widthPx / Math.max(zoom, 1e-9);
  const xs = Math.min(b.x0, b.x1);
  const xe = Math.max(b.x0, b.x1);
  const ys = Math.min(b.y0, b.y1);
  const ye = Math.max(b.y0, b.y1);
  const near = (v: number, at: number) => Math.abs(v - at) <= w;
  const within = (v: number, lo: number, hi: number) => v >= lo - w && v <= hi + w;
  switch (b.side) {
    case "n":
      return near(y, ye) && within(x, xs, xe);
    case "s":
      return near(y, ys) && within(x, xs, xe);
    case "e":
      return near(x, xe) && within(y, ys, ye);
    case "w":
      return near(x, xs) && within(y, ys, ye);
    case "ne":
      return near(x, xe) && near(y, ye);
    case "nw":
      return near(x, xs) && near(y, ye);
    case "se":
      return near(x, xe) && near(y, ys);
    case "sw":
      return near(x, xs) && near(y, ys);
  }
}

/** How far the centre of a circle region is from `x`, `y`, as a share of its radius: within 1, it is hit. */
function circleReach(c: { x: number; y: number; diameterPx: number; size?: Control }, x: number, y: number, zoom: number): number {
  const z = Math.max(zoom, 1e-9);
  // (taken at its grab size, never smaller than it is drawn - a control drawn larger than its grab size is taken where it is drawn)
  const drawn = c.size ? controlSize(c.size, zoom) : 0;
  const r = Math.max(c.diameterPx / z, drawn) / 2;
  return Math.hypot(x - c.x, y - c.y) / r;
}

/**
 * The region under `x`, `y` (the page's units) at `zoom`, among `layers` -
 * each an array of regions in the order they are drawn, a later layer over
 * an earlier one - taken by `z` first, then by layer and order: the topmost.
 * Corners before sides, so a frame's corner sizes it both ways. Among
 * circles that both reach the point at the same `z`, the one whose centre is
 * nearest (ties: the one drawn last), so that ports close together each keep
 * their share. Only those `accept` takes, where it is given (a drop: only
 * ports a wire may join).
 */
export function hitAt(layers: readonly (readonly Region[])[], x: number, y: number, zoom: number, accept?: (key: string, part: string) => boolean): Hit | null {
  let best: { region: Region; z: number; seq: number; rank: number; reach: number } | null = null;
  let seq = 0;
  for (const layer of layers) {
    for (const region of layer) {
      seq++;
      if (accept && !accept(region.key, region.part)) continue;
      let reach = 0;
      let rank = 0;
      if ("rect" in region) {
        const r = region.rect;
        if (x < Math.min(r.x0, r.x1) || x > Math.max(r.x0, r.x1) || y < Math.min(r.y0, r.y1) || y > Math.max(r.y0, r.y1)) continue;
      } else if ("circle" in region) {
        reach = circleReach(region.circle, x, y, zoom);
        if (reach > 1) continue;
      } else {
        if (!inBand(region.band, x, y, zoom)) continue;
        // (a corner over the sides it joins)
        rank = region.band.side.length === 2 ? 1 : 0;
      }
      const z = region.z ?? 0;
      const better =
        !best ||
        z > best.z ||
        (z === best.z && "circle" in region && "circle" in best.region ? reach < best.reach || (reach === best.reach && seq > best.seq) : z === best.z && (rank > best.rank || (rank === best.rank && seq > best.seq)));
      if (better) best = { region, z, seq, rank, reach };
    }
  }
  return best ? { key: best.region.key, part: best.region.part, region: best.region } : null;
}
