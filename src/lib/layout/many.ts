/**
 * Many structures laid out at once - a workflow's generated set, a grid of
 * a thousand for a summary - each by the engine as it lays out one, and each
 * read back and set against the molecule it was given (readBack.ts): one
 * that does not show the molecule given says so, and is never dropped or
 * passed over in silence. Where a series shares a core, each is turned (and
 * mirrored, its wedges turned with it) to lie on the core as the first one
 * draws it, so that the series lines up.
 */
import { layout2D, type Layout2D } from "./engine";
import type { LayoutInput } from "./perceive";
import { notAsGiven } from "./readBack";
import { bareGraph, coreMatches, graphText, matchedByRank, ringScaffold } from "./scaffold";

/** One structure laid out: its drawing (none where the engine could not lay it out) and what it does not show as given (none where it is the molecule given). */
export type LaidOut = { layout: Layout2D | null; notAsGiven: string[] };

/** `input` laid out by the engine and read back against itself (`notAsGiven`). */
export function laidOutChecked(input: LayoutInput): LaidOut {
  let layout: Layout2D;
  try {
    layout = layout2D(input);
  } catch (e) {
    return { layout: null, notAsGiven: [`could not be laid out: ${e instanceof Error ? e.message : String(e)}`] };
  }
  return { layout, notAsGiven: notAsGiven(input, layout) };
}

/** A drawing's extent: its atoms and the H's it draws. */
export type Extent = { minX: number; minY: number; maxX: number; maxY: number };

export function extentOf(layout: Layout2D): Extent {
  const xs = [...layout.x, ...layout.hydrogens.map((h) => h.at.x)];
  const ys = [...layout.y, ...layout.hydrogens.map((h) => h.at.y)];
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

/**
 * Where each of so many drawings goes in a grid: the middle of its cell,
 * cells as wide as the widest drawing and as tall as the tallest, `gap`
 * between them, row by row from the top left (y down, as the page's
 * coordinates are not: the caller turns them), `columns` to a row - as near
 * square as the cells allow where it is not given.
 */
export function gridOf(extents: readonly Extent[], gap: number, columns?: number): { x: number; y: number }[] {
  if (!extents.length) return [];
  const w = Math.max(...extents.map((e) => e.maxX - e.minX)) + gap;
  const h = Math.max(...extents.map((e) => e.maxY - e.minY)) + gap;
  const cols = Math.max(1, columns ?? Math.round(Math.sqrt((extents.length * h) / w)));
  return extents.map((_, i) => ({ x: (i % cols) * w + w / 2, y: Math.floor(i / cols) * h + h / 2 }));
}

/**
 * `layout` turned about its middle, and mirrored where that fits better, to
 * lie as nearly as it can on `onto`: each pair an atom of it and the point
 * it is to lie on (least squares; Kabsch's, in the plane). Mirrored, every
 * wedge is turned to hashes and every hash to a wedge, so that each
 * configuration reads as before; a drawing with depth (a cage in
 * perspective) is only turned, never mirrored. Moved, not reshaped: each
 * bond as long, each angle as wide.
 */
export function laidOnto(layout: Layout2D, pairs: readonly [number, { x: number; y: number }][]): Layout2D {
  if (pairs.length < 2) return layout;
  const mean = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;
  const ax = mean(pairs.map(([i]) => layout.x[i]));
  const ay = mean(pairs.map(([i]) => layout.y[i]));
  const bx = mean(pairs.map(([, p]) => p.x));
  const by = mean(pairs.map(([, p]) => p.y));
  // (the turn that fits best, unmirrored and mirrored, and how far off each leaves the pairs)
  const fit = (mirror: 1 | -1) => {
    let s = 0;
    let c = 0;
    for (const [i, p] of pairs) {
      const u = mirror * (layout.x[i] - ax);
      const v = layout.y[i] - ay;
      const X = p.x - bx;
      const Y = p.y - by;
      c += u * X + v * Y;
      s += u * Y - v * X;
    }
    const t = Math.atan2(s, c);
    const [cos, sin] = [Math.cos(t), Math.sin(t)];
    let off = 0;
    for (const [i, p] of pairs) {
      const u = mirror * (layout.x[i] - ax);
      const v = layout.y[i] - ay;
      off += (cos * u - sin * v - (p.x - bx)) ** 2 + (sin * u + cos * v - (p.y - by)) ** 2;
    }
    return { mirror, cos, sin, off };
  };
  const flat = layout.depth.every((d) => d == null);
  const plain = fit(1);
  const best = flat ? [plain, fit(-1)].reduce((p, q) => (q.off < p.off - 1e-9 ? q : p)) : plain;
  const { mirror, cos, sin } = best;
  const to = (x: number, y: number) => {
    const u = mirror * (x - ax);
    const v = y - ay;
    return { x: bx + cos * u - sin * v, y: by + sin * u + cos * v };
  };
  const at = layout.x.map((x, i) => to(x, layout.y[i]));
  return {
    ...layout,
    x: at.map((p) => p.x),
    y: at.map((p) => p.y),
    hydrogens: layout.hydrogens.map((h) => ({ ...h, at: to(h.at.x, h.at.y) })),
    wedges: mirror === 1 ? layout.wedges : layout.wedges.map((w) => ({ ...w, stereo: w.stereo === "up" ? "down" : "up" })),
  };
}

/** A series lined up on what its members share: a core given, found in each; their ring scaffold, where none is given; or one standing alone (no core found, no ring). */
export type Series = { members: number[]; by: "core" | "ring scaffold" | "alone" };

export type Arranged = {
  /** Each drawing where it goes (none where the engine could not lay it out), in the grid's coordinates (y down). */
  layouts: (Layout2D | null)[];
  /** Each one's cell: its middle. */
  at: { x: number; y: number }[];
  /** How large every cell is. */
  cell: { w: number; h: number };
  /** The series, in the order they stand, each beginning a row. */
  series: Series[];
  /** How far each drawing's core or scaffold lies off the first member's, on average, as a share of a bond (null where it was not lined up). */
  off: (number | null)[];
  /** What each does not show as given, read back after it was turned and placed (none where it is the molecule given). */
  notAsGiven: string[][];
  /** What is to be said of the whole: that the series were found by ring scaffold, a core not being given. */
  said: string[];
};

/**
 * Structures laid out (`laidOutChecked`, each), lined up and set out in a
 * grid: put in series - by `core` where it is given, found in each
 * (scaffold.ts `coreMatches`), else by their ring scaffolds, and said so -
 * each member turned (or mirrored, its wedges with it: `laidOnto`) to lie on
 * the first member's core; then read back again where it was moved; and
 * the series set out row by row, each beginning a row, every cell alike.
 */
export function arranged(
  inputs: readonly LayoutInput[],
  laid: readonly LaidOut[],
  opts: { core?: LayoutInput; gap: number; columns?: number },
): Arranged {
  const n = inputs.length;
  const layouts = laid.map((l) => l.layout);
  const shown = laid.map((l) => l.notAsGiven.slice());
  const off: (number | null)[] = new Array(n).fill(null);
  const said: string[] = [];
  // each one's series, and its atoms that line up, in the series' own order
  const groups = new Map<string, { by: Series["by"]; members: number[]; atoms: number[][] }>();
  const join = (key: string, by: Series["by"], i: number, atoms: number[]) => {
    const g = groups.get(key) ?? { by, members: [], atoms: [] };
    g.members.push(i);
    g.atoms.push(atoms);
    groups.set(key, g);
  };
  // (how many bonds each core atom has within the core: one with more in a structure carries a group)
  const coreDegree = opts.core ? opts.core.atoms.map((_, k) => opts.core!.bonds.filter((b) => b.a === k || b.b === k).length) : [];
  let carriedFirst: boolean[] | null = null;
  for (let i = 0; i < n; i++) {
    const input = inputs[i];
    if (opts.core) {
      const matches = coreMatches(opts.core, input);
      if (matches.length) {
        // (of the ways the core is found - a symmetric core's - the one whose
        // atoms carry groups where the first member's do: the series' groups
        // on the same side)
        const carries = (atoms: number[]) => atoms.map((a, k) => degreeOf(input, a) > coreDegree[k]);
        const ref = carriedFirst;
        const pick = ref ? matches.reduce((p, q) => (agree(carries(q), ref) > agree(carries(p), ref) ? q : p)) : matches[0];
        carriedFirst ??= carries(pick);
        join("core", "core", i, pick);
        continue;
      }
    }
    const atoms = ringScaffold(input);
    if (!atoms.length) {
      join(`alone ${i}`, "alone", i, []);
      continue;
    }
    const graph = bareGraph(input, atoms);
    const key = `ring ${graphText(graph)}`;
    const first = groups.get(key);
    if (!first) {
      join(key, "ring scaffold", i, atoms);
      continue;
    }
    // (in the first member's order: matched rank for rank)
    const refAtoms = first.atoms[0];
    const map = matchedByRank(bareGraph(inputs[first.members[0]], refAtoms), graph);
    join(key, "ring scaffold", i, map ? map.map((k) => atoms[k]) : []);
  }
  if (!opts.core && [...groups.values()].some((g) => g.by === "ring scaffold")) said.push("Lined up by ring scaffold: no core was given, so analogues whose groups carry rings stand in series of their own.");
  else if (opts.core && [...groups.values()].some((g) => g.by !== "core")) said.push("The core given was not found in every structure: those without it are lined up by ring scaffold, or stand alone.");
  // each member laid onto the first's core, and read back where it was moved
  for (const g of groups.values()) {
    const lead = g.members.findIndex((i) => layouts[i]);
    if (lead < 0 || g.by === "alone") continue;
    const ref = layouts[g.members[lead]]!;
    const refAtoms = g.atoms[lead];
    off[g.members[lead]] = 0;
    g.members.forEach((i, k) => {
      const l = layouts[i];
      const atoms = g.atoms[k];
      if (!l || k === lead || atoms.length !== refAtoms.length || atoms.length < 2) return;
      const pairs = atoms.map((a, j) => [a, { x: ref.x[refAtoms[j]], y: ref.y[refAtoms[j]] }] as [number, { x: number; y: number }]);
      const on = laidOnto(l, pairs);
      layouts[i] = on;
      const bond = bondOf(inputs[i], on);
      off[i] = bond > 0 ? Math.sqrt(pairs.reduce((s, [a, p]) => s + (on.x[a] - p.x) ** 2 + (on.y[a] - p.y) ** 2, 0) / pairs.length) / bond : null;
      // (moved, not reshaped: read back again all the same)
      shown[i] = notAsGiven(inputs[i], on);
    });
  }
  // the grid: every cell alike, each series beginning a row
  const series: Series[] = [...groups.values()].map((g) => ({ members: g.members, by: g.by }));
  const placed = layouts.flatMap((l) => (l ? [extentOf(l)] : []));
  const cell = placed.length
    ? { w: Math.max(...placed.map((e) => e.maxX - e.minX)) + opts.gap, h: Math.max(...placed.map((e) => e.maxY - e.minY)) + opts.gap }
    : { w: opts.gap, h: opts.gap };
  const cols = Math.max(1, opts.columns ?? Math.round(Math.sqrt((n * cell.h) / cell.w)));
  const at: { x: number; y: number }[] = new Array(n);
  let row = 0;
  for (const s of series) {
    s.members.forEach((i, k) => {
      at[i] = { x: (k % cols) * cell.w + cell.w / 2, y: (row + Math.floor(k / cols)) * cell.h + cell.h / 2 };
    });
    row += Math.ceil(s.members.length / cols);
  }
  // (each drawing's middle on its cell's)
  for (let i = 0; i < n; i++) {
    const l = layouts[i];
    if (!l) continue;
    const e = extentOf(l);
    const dx = at[i].x - (e.minX + e.maxX) / 2;
    const dy = at[i].y - (e.minY + e.maxY) / 2;
    layouts[i] = { ...l, x: l.x.map((x) => x + dx), y: l.y.map((y) => y + dy), hydrogens: l.hydrogens.map((h) => ({ ...h, at: { x: h.at.x + dx, y: h.at.y + dy } })) };
  }
  return { layouts, at, cell, series, off, notAsGiven: shown, said };
}

function degreeOf(input: LayoutInput, a: number): number {
  return input.bonds.reduce((d, b) => d + (b.a === a || b.b === a ? 1 : 0), 0);
}

function agree(p: readonly boolean[], q: readonly boolean[]): number {
  return p.reduce((s, v, k) => s + (v === q[k] ? 1 : 0), 0);
}

/** A drawing's bond length: its bonds' median. */
function bondOf(input: LayoutInput, l: Layout2D): number {
  const lengths = input.bonds.map((b) => Math.hypot(l.x[b.a] - l.x[b.b], l.y[b.a] - l.y[b.b])).sort((p, q) => p - q);
  return lengths.length ? lengths[lengths.length >> 1] : 0;
}
