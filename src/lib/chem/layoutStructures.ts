import { isName, nameBox } from "../layout/names";
import { layoutMolecule, type Atom, type Bond, type Circle, type Layout, type LayoutOptions, type TextItem, type Vec2 } from "./layout2d";

/**
 * A drawing laid out a structure at a time: what `layoutMolecule` makes of
 * the whole, but each structure's share of it made again only when one of
 * its atoms or bonds is not the object it was. A drag, a stroke or a glide
 * over a drawing of a thousand structures lays out the one it moves, not
 * the thousand.
 *
 * The layout of a structure looks past it in a few places: a name (an
 * abbreviation's letters) is set the way it runs into fewer atoms, bonds
 * and H, and a note on a bond on the side farther from atoms and other
 * notes; a bond in perspective is broken where another passes in front of
 * it. So structures are laid out together where these can reach from one
 * to another - their boxes, each widened by what its names and notes reach,
 * meet - and alone elsewhere, where nothing of one can change the other.
 * A bracket (an S-group) may take in several structures, and is numbered
 * across the drawing: a drawing with one is laid out whole.
 *
 * While a gesture is under way (`moving`), a structure only carried - turned
 * by a selection's handle, dragged - each of its atoms where the same turn
 * and shift take it, nothing else of it changed, is not laid out again: its
 * last layout is carried with it, each label kept upright beside its atom
 * (`carriedLayout`). Once the gesture ends, it is laid out again, once.
 */
export function layoutByStructure(
  atoms: Atom[],
  bonds: Bond[],
  opts: LayoutOptions,
  zoom: number,
  kept: StructureLayouts,
  /** What else the layout reads, as it changes: the typefaces' letters, the abbreviations known. */
  given: readonly unknown[] = [],
  moving = false,
): Layout {
  const now = [opts, zoom, ...given];
  if (now.length !== kept.given.length || now.some((v, i) => v !== kept.given[i])) {
    kept.given = now;
    kept.laid = new Map();
  }
  if (atoms.some((a) => a.sgroups?.length)) {
    kept.laid = new Map();
    return layoutMolecule(atoms, bonds, opts, zoom);
  }
  const was = kept.laid;
  const laid = new Map<number, Laid>();
  const lines: Layout["lines"] = [];
  const polys: Layout["polys"] = [];
  const texts: TextItem[] = [];
  const circles: Layout["circles"] = [];
  const fills: Layout["fills"] = [];
  const under: NonNullable<Layout["under"]> = [];
  const crowded: NonNullable<Layout["crowded"]> = [];
  const reach: Layout["reach"] = new Array(bonds.length);
  const bounds = { min: { x: Infinity, y: Infinity }, max: { x: -Infinity, y: -Infinity } };
  // (each atom's place in the structure being laid out)
  const local = new Int32Array(atoms.length);
  for (const part of clustersOf(atoms, bonds).flatMap((whole) => byMagnification(whole, atoms, bonds))) {
    const key = atoms[part.atoms[0]].id;
    // (shown magnified: laid out in the style so many times over - a zoomed copy of it)
    const k = atoms[part.atoms[0]].magnified ?? 1;
    let it = was.get(key);
    // (carried while a gesture lasts, from the structure as it was last laid out)
    const motion = it && moving && it.atoms.length === part.atoms.length && sameBonds(it, part, bonds) ? rigidMotion(it.base?.atoms ?? it.atoms, part.atoms.map((i) => atoms[i])) : null;
    if (it && !moving && it.base) it = undefined;
    if (it && motion && !sameAs(it, part, atoms, bonds)) {
      const base = it.base ?? { atoms: it.atoms, layout: it.layout };
      const now = part.atoms.map((i) => atoms[i]);
      const layout = carriedLayout(base.layout, base.atoms, now, motion);
      it = { atoms: now, bonds: it.bonds, at: part.atoms, layout, texts: placed(layout.texts, part.atoms), base };
    } else if (!it || !sameAs(it, part, atoms, bonds)) {
      part.atoms.forEach((i, k) => (local[i] = k));
      const layout = layoutMolecule(
        part.atoms.map((i) => atoms[i]),
        part.bonds.map((k) => ({ ...bonds[k], a1: local[bonds[k].a1], a2: local[bonds[k].a2] })),
        magnifiedOptions(opts, k),
        zoom,
      );
      it = { atoms: part.atoms.map((i) => atoms[i]), bonds: part.bonds.map((k) => bonds[k]), at: part.atoms, layout, texts: placed(layout.texts, part.atoms) };
    } else if (!sameNumbers(it.at, part.atoms)) {
      // (the same structure, its atoms at other places in the drawing: its labels say which by place)
      it = { ...it, at: part.atoms, texts: placed(it.layout.texts, part.atoms) };
    }
    laid.set(key, it);
    const l = it.layout;
    for (const x of l.lines) lines.push(x);
    for (const x of l.polys) polys.push(x);
    for (const x of it.texts) texts.push(x);
    for (const x of l.circles) circles.push(x);
    for (const x of l.fills) fills.push(x);
    for (const x of l.under ?? []) under.push(x);
    for (const x of l.crowded ?? []) crowded.push(x);
    part.bonds.forEach((k, j) => (reach[k] = l.reach[j]));
    bounds.min.x = Math.min(bounds.min.x, l.bounds.min.x);
    bounds.min.y = Math.min(bounds.min.y, l.bounds.min.y);
    bounds.max.x = Math.max(bounds.max.x, l.bounds.max.x);
    bounds.max.y = Math.max(bounds.max.y, l.bounds.max.y);
  }
  kept.laid = laid;
  // (nothing drawn: the bounds of nothing, as layoutMolecule gives them)
  if (!atoms.length) return layoutMolecule(atoms, bonds, opts, zoom);
  return { ...(under.length ? { under } : {}), lines, polys, texts, circles, fills, bounds, zoom, reach, ...(crowded.length ? { crowded } : {}) };
}

/** The layout options kept for each magnification, so that each is the same object each time. */
const MAGNIFIED_OPTIONS = new WeakMap<LayoutOptions, Map<number, LayoutOptions>>();

/**
 * Layout options for a structure shown `k` times as large as it is
 * (docs/WORKSPACE.md, *Magnified display*): every length so many times as
 * long - its lines, their gaps, its letters, the room round them, and
 * the least width a line is drawn at on the screen - as a zoomed copy of it
 * is drawn. The same options at 1.
 */
export function magnifiedOptions(opts: LayoutOptions, k: number): LayoutOptions {
  if (k === 1) return opts;
  let byK = MAGNIFIED_OPTIONS.get(opts);
  if (!byK) MAGNIFIED_OPTIONS.set(opts, (byK = new Map()));
  const kept = byK.get(k);
  if (kept) return kept;
  // (a change of magnification goes over in steps of a hundredth: kept to a few of them)
  if (byK.size > 64) byK.clear();
  const out: Record<string, unknown> = { ...opts };
  for (const [key, v] of Object.entries(opts)) if (key.endsWith("Px") && typeof v === "number") out[key] = v * k;
  // (the least a line is drawn at on the screen too: zoomed out, it is as much thicker as the rest of it)
  out.minLinePx = (opts.minLinePx ?? 1) * k;
  byK.set(k, out as LayoutOptions);
  return out as LayoutOptions;
}

/** A part to be laid out, split where its structures are shown at different magnifications: each laid out at its own. */
function byMagnification(part: Part, atoms: readonly Atom[], bonds: readonly Bond[]): Part[] {
  const k0 = atoms[part.atoms[0]].magnified ?? 1;
  if (part.atoms.every((i) => (atoms[i].magnified ?? 1) === k0)) return [part];
  const groups = new Map<number, number[]>();
  for (const i of part.atoms) {
    const k = atoms[i].magnified ?? 1;
    const g = groups.get(k);
    if (g) g.push(i);
    else groups.set(k, [i]);
  }
  return [...groups.values()].map((g) => {
    const in_ = new Set(g);
    return { atoms: g, bonds: part.bonds.filter((b) => in_.has(bonds[b].a1) && in_.has(bonds[b].a2)) };
  });
}

/** Structures laid out before, for `layoutByStructure` to take again; see `structureLayouts`. */
export type StructureLayouts = { given: readonly unknown[]; laid: Map<number, Laid> };

/** A store of structures laid out, empty. */
export function structureLayouts(): StructureLayouts {
  return { given: [], laid: new Map() };
}

/**
 * A structure as it was laid out: its atoms and bonds (the drawing's own
 * objects), its atoms' places in the drawing, its layout, and the layout's
 * texts with their atoms by those places.
 */
type Laid = {
  atoms: Atom[];
  bonds: Bond[];
  at: number[];
  layout: Layout;
  texts: TextItem[];
  /** Carried while a gesture lasts: the structure as it was last laid out, and that layout (`carriedLayout`). */
  base?: { atoms: Atom[]; layout: Layout };
};

/** Atoms and bonds, by their places in the drawing, laid out together. */
type Part = { atoms: number[]; bonds: number[] };

function sameBonds(it: Laid, part: Part, bonds: Bond[]): boolean {
  if (it.bonds.length !== part.bonds.length) return false;
  for (let k = 0; k < part.bonds.length; k++) if (it.bonds[k] !== bonds[part.bonds[k]]) return false;
  return true;
}

/** A turn by an angle (its cosine and sine) about the origin, then a shift. */
type Motion = { cos: number; sin: number; dx: number; dy: number };

/**
 * How atoms stand to how they stood, where they were only carried: each the
 * same but for its place, and each place where one turn and one shift take
 * it - to a millionth of the structure's size. None otherwise.
 */
export function rigidMotion(was: readonly Atom[], now: readonly Atom[]): Motion | null {
  if (!was.length || was.length !== now.length) return null;
  for (let k = 0; k < was.length; k++) {
    const a = was[k] as Record<string, unknown>;
    const b = now[k] as Record<string, unknown>;
    if (a === b) continue;
    for (const key in a) if (key !== "x" && key !== "y" && a[key] !== b[key]) return null;
    for (const key in b) if (key !== "x" && key !== "y" && !(key in a)) return null;
  }
  // (the turn from the atom farthest from the first: the surest line through them)
  let far = 0;
  let reach = 0;
  for (let k = 1; k < was.length; k++) {
    const d = Math.hypot(was[k].x - was[0].x, was[k].y - was[0].y);
    if (d > reach) [far, reach] = [k, d];
  }
  const angle =
    reach > 0 ? Math.atan2(now[far].y - now[0].y, now[far].x - now[0].x) - Math.atan2(was[far].y - was[0].y, was[far].x - was[0].x) : 0;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = now[0].x - (was[0].x * cos - was[0].y * sin);
  const dy = now[0].y - (was[0].x * sin + was[0].y * cos);
  const tol = 1e-6 * Math.max(reach, 1);
  for (let k = 0; k < was.length; k++) {
    if (Math.abs(was[k].x * cos - was[k].y * sin + dx - now[k].x) > tol || Math.abs(was[k].x * sin + was[k].y * cos + dy - now[k].y) > tol) return null;
  }
  return { cos, sin, dx, dy };
}

/**
 * A structure's layout carried as its atoms were (`rigidMotion`): its
 * lines, shapes, rings and fills turned and shifted with it; each label,
 * and each charge set beside an atom, shifted with its atom and kept
 * upright, as the page's letters are. Laid out again, a label may stand
 * otherwise - on the other side of its atom - once the gesture ends.
 */
export function carriedLayout(layout: Layout, was: readonly Atom[], now: readonly Atom[], m: Motion): Layout {
  const pt = (p: Vec2): Vec2 => ({ x: p.x * m.cos - p.y * m.sin + m.dx, y: p.x * m.sin + p.y * m.cos + m.dy });
  const pts = (ps: Vec2[]) => ps.map(pt);
  const turn = Math.atan2(m.sin, m.cos);
  const circle = (c: Circle): Circle => ({ ...c, c: pt(c.c), ...(c.angle != null || turn !== 0 ? { angle: (c.angle ?? 0) + turn } : {}) });
  const texts = layout.texts.map((t) => {
    const i = t.beside ? t.markOf : t.atom;
    if (i == null || !was[i] || !now[i]) return { ...t, ...pt(t) };
    return { ...t, x: t.x + now[i].x - was[i].x, y: t.y + now[i].y - was[i].y };
  });
  const lines = layout.lines.map((l) => {
    const a = pt({ x: l.x1, y: l.y1 });
    const b = pt({ x: l.x2, y: l.y2 });
    return { ...l, x1: a.x, y1: a.y, x2: b.x, y2: b.y };
  });
  // (its bounds: those of its marks, carried, and of its labels, moved)
  const corners = [layout.bounds.min, layout.bounds.max, { x: layout.bounds.min.x, y: layout.bounds.max.y }, { x: layout.bounds.max.x, y: layout.bounds.min.y }].map(pt);
  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  return {
    ...layout,
    ...(layout.under ? { under: layout.under.map((u) => ({ ...u, points: pts(u.points) })) } : {}),
    ...(layout.curves ? { curves: layout.curves.map((c) => ({ ...c, points: pts(c.points) })) } : {}),
    lines,
    polys: layout.polys.map((p) => ({ ...p, points: pts(p.points) })),
    texts,
    circles: layout.circles.map(circle),
    fills: layout.fills.map(circle),
    bounds: { min: { x: Math.min(...xs), y: Math.min(...ys) }, max: { x: Math.max(...xs), y: Math.max(...ys) } },
  };
}

function sameAs(it: Laid, part: Part, atoms: Atom[], bonds: Bond[]): boolean {
  if (it.atoms.length !== part.atoms.length || it.bonds.length !== part.bonds.length) return false;
  for (let k = 0; k < part.atoms.length; k++) if (it.atoms[k] !== atoms[part.atoms[k]]) return false;
  for (let k = 0; k < part.bonds.length; k++) if (it.bonds[k] !== bonds[part.bonds[k]]) return false;
  return true;
}

function sameNumbers(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) return false;
  return true;
}

/** A structure's texts with the atoms they belong to by their places in the drawing. */
function placed(texts: TextItem[], at: readonly number[]): TextItem[] {
  return texts.map((t) =>
    t.atom == null && t.markOf == null
      ? t
      : { ...t, ...(t.atom != null ? { atom: at[t.atom] } : {}), ...(t.markOf != null ? { markOf: at[t.markOf] } : {}) },
  );
}

/**
 * The drawing's structures - atoms joined by bonds, a bond with more ends
 * than two (a ring bound face-on) joining them all - put together where what
 * one's layout looks at can reach the other (see `layoutByStructure`), each
 * by its atoms' and bonds' places in the drawing, in order, the parts in the
 * order of their first atoms.
 */
export function clustersOf(atoms: readonly Atom[], bonds: readonly Bond[]): Part[] {
  const n = atoms.length;
  // (in typed arrays by atom: this runs at every frame of a drag over a drawing of tens of thousands)
  const up = new Int32Array(n);
  for (let i = 0; i < n; i++) up[i] = i;
  // (without recursion: a long chain would overflow the stack)
  const top = (i: number): number => {
    let r = i;
    while (up[r] !== r) r = up[r];
    while (up[i] !== r) {
      const next = up[i];
      up[i] = r;
      i = next;
    }
    return r;
  };
  const join = (i: number, j: number) => {
    const a = top(i);
    const b = top(j);
    if (a !== b) up[Math.max(a, b)] = Math.min(a, b);
  };
  let byId: Map<number, number> | null = null;
  for (const b of bonds) {
    join(b.a1, b.a2);
    if (!b.endpoints?.length) continue;
    byId ??= new Map(atoms.map((a, i) => [a.id, i]));
    for (const id of b.endpoints) {
      const e = byId.get(id);
      if (e != null) join(b.a1, e);
    }
  }
  // each structure, by its first atom: its box, and how far past it its names and notes reach
  const root = new Int32Array(n);
  const x0 = new Float64Array(n);
  const y0 = new Float64Array(n);
  const x1 = new Float64Array(n);
  const y1 = new Float64Array(n);
  const longest = new Float64Array(n);
  const names = new Float64Array(n);
  const notes = new Uint8Array(n);
  const roots: number[] = [];
  for (let i = 0; i < n; i++) {
    const r = top(i);
    root[i] = r;
    const a = atoms[i];
    if (r === i) {
      roots.push(i);
      x0[i] = x1[i] = a.x;
      y0[i] = y1[i] = a.y;
    } else {
      if (a.x < x0[r]) x0[r] = a.x;
      if (a.x > x1[r]) x1[r] = a.x;
      if (a.y < y0[r]) y0[r] = a.y;
      if (a.y > y1[r]) y1[r] = a.y;
    }
    // (in bond lengths, a name's letters and the room kept round them: lib/layout/names)
    if (a.el !== "C" && isName(a.el)) names[r] = Math.max(names[r], Math.max(-nameBox(a.el, true).x0, nameBox(a.el, false).x1) + 0.45);
  }
  let longestOfAll = 0;
  for (const b of bonds) {
    const r = root[b.a1];
    const len = Math.hypot(atoms[b.a1].x - atoms[b.a2].x, atoms[b.a1].y - atoms[b.a2].y);
    if (len > longest[r]) longest[r] = len;
    if (len > longestOfAll) longestOfAll = len;
    if (b.query || b.reactingCentre != null || b.stereoGroup) notes[r] = 1;
  }
  // (how far past its atoms each looks at others: a name's letters, then
  // others' H set beside their labels a bond out; a note, three bonds)
  const reach = new Float64Array(n);
  for (const r of roots) {
    const L = longest[r] || longestOfAll || 1;
    reach[r] = Math.max(names[r] ? (names[r] + 1) * L : 0, notes[r] ? 3 * L : 0);
  }
  // structures whose boxes meet, swept from the left, put together
  const group = new Int32Array(n);
  for (const r of roots) group[r] = r;
  const groupTop = (r: number): number => {
    let g = r;
    while (group[g] !== g) g = group[g];
    group[r] = g;
    return g;
  };
  const order = [...roots].sort((p, q) => x0[p] - reach[p] - (x0[q] - reach[q]));
  let open: number[] = [];
  for (const r of order) {
    const left = x0[r] - reach[r];
    open = open.filter((o) => x1[o] + reach[o] >= left);
    for (const o of open) {
      // (structures shown at different magnifications are laid out apart, whatever they near: byMagnification)
      if ((atoms[o].magnified ?? 1) !== (atoms[r].magnified ?? 1)) continue;
      if (y0[o] - reach[o] <= y1[r] + reach[r] && y0[r] - reach[r] <= y1[o] + reach[o]) {
        const a = groupTop(o);
        const b = groupTop(r);
        if (a !== b) group[Math.max(a, b)] = Math.min(a, b);
      }
    }
    open.push(r);
  }
  const parts: Part[] = [];
  const partOf = new Int32Array(n).fill(-1);
  const at = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const g = groupTop(root[i]);
    if (partOf[g] < 0) {
      partOf[g] = parts.length;
      parts.push({ atoms: [], bonds: [] });
    }
    at[i] = partOf[g];
    parts[at[i]].atoms.push(i);
  }
  for (let k = 0; k < bonds.length; k++) parts[at[bonds[k].a1]].bonds.push(k);
  return parts;
}
