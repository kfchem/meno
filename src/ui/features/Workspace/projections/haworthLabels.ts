import { labelBox, labelSetOf, layoutMolecule, segmentMeetsBox, type LayoutOptions } from "../../../../lib/chem/layout2d";
import { HAWORTH_GROUP } from "../../../../lib/chem/perception/projection/views";
import { layoutBonds } from "../layoutOptions";
import type { Model } from "../store/types";
import { haworthOf } from "./haworth";
import { projectionsIn } from "./rings";

/** The length a group up from a Haworth ring's front atom had before the stems were set by their ink, as a share of the level bond: main's. */
export const HAWORTH_UP_BEFORE = 0.4;
/**
 * How far a labelled group down from a Haworth ring's back atom may shorten where its label meets the label of the front atom's up group
 * below it, on the same vertical: to 0.30 of the level bond, where an OH up from the front atom at its full stem and an H down from the
 * back atom stand visibly apart. It is the one that gives way: it is most often an H, which a Haworth drawing may leave out.
 */
export const HAWORTH_DOWN_LEAST = 0.3;
const STEP = 0.01;
/** How far a front atom's up label is tried higher at a time where it rises, as a share of the level bond. */
const RISE = 0.03;
/**
 * The least gap between two labels inside a Haworth ring's picture, as a share of the level bond: about a fourteenth of a label's height,
 * what is left between an OH up from a six-ring's front atom and an H or OH down from the back atom above it with both on the figures'
 * stems (lib/chem/layout2d `LABEL_MARGIN_CLOSE`).
 */
export const LABELS_APART = 0.02;

type Box = { minX: number; maxX: number; minY: number; maxY: number };
type Pt = { x: number; y: number };

/**
 * The ink of a Haworth ring's own bonds as the page draws them - each line with its width, each filled shape (a bold bar, a wedge of the
 * near edge) - laid out from the ring's atoms and bonds alone: what a label inside the ring is to keep off, every bond of it, the bonds
 * at the label's own ring atom too.
 */
export function ringInk(model: Pick<Model, "atoms" | "bonds">, ring: readonly number[], opts: LayoutOptions): { lines: { p: Pt; q: Pt; half: number }[]; polys: Pt[][] } {
  const inRing = new Set(ring);
  const atoms = ring.map((id) => model.atoms.find((a) => a.id === id)!);
  const index = new Map(ring.map((id, i) => [id, i]));
  const lay = layoutMolecule(atoms as never, layoutBonds(model.bonds.filter((b) => inRing.has(b.a) && inRing.has(b.b)), index) as never, opts, INK_ZOOM);
  // (a line's width is in pixels at the zoom it was laid out at, as the page draws it: components/Bonds2D)
  return {
    lines: lay.lines.map((l) => ({ p: { x: l.x1, y: l.y1 }, q: { x: l.x2, y: l.y2 }, half: l.widthPx / INK_ZOOM / 2 })),
    polys: lay.polys.map((p) => p.points),
  };
}
/** The zoom the ring's ink is laid out at, as the page's labels are (`layoutMolecule`'s zoom). */
const INK_ZOOM = 40;

/** Whether a label's box meets the ring's ink: a line's width, or a filled shape - an edge across the box, or one inside the other. */
export function meetsInk(box: Box, ink: ReturnType<typeof ringInk>): boolean {
  const grown = (h: number) => ({ minX: box.minX - h, maxX: box.maxX + h, minY: box.minY - h, maxY: box.maxY + h });
  if (ink.lines.some((l) => segmentMeetsBox(l.p, l.q, grown(l.half)))) return true;
  const inBox = (p: Pt) => p.x >= box.minX && p.x <= box.maxX && p.y >= box.minY && p.y <= box.maxY;
  const inPoly = (pts: Pt[], p: Pt) => {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      if (pts[i].y > p.y !== pts[j].y > p.y && p.x < ((pts[j].x - pts[i].x) * (p.y - pts[i].y)) / (pts[j].y - pts[i].y) + pts[i].x) inside = !inside;
    }
    return inside;
  };
  const corners = [{ x: box.minX, y: box.minY }, { x: box.maxX, y: box.minY }, { x: box.maxX, y: box.maxY }, { x: box.minX, y: box.maxY }];
  return ink.polys.some((pts) => pts.some(inBox) || corners.some((c) => inPoly(pts, c)) || pts.some((p, i) => segmentMeetsBox(p, pts[(i + 1) % pts.length], box)));
}

/**
 * How deep a label must reach into a line or a filled shape of the drawing for the two to meet, in the drawing's units: a tenth of one,
 * about a tenth of a label's height - a label that only grazes a line, as many do on main, is not taken for one across it.
 */
export const INK_DEPTH = 0.1;

/**
 * The labelled groups inside a Haworth ring's picture - down from its back atoms, up from its front atoms - whose labels meet the
 * drawing's ink or another label, each moved along its vertical toward its ring atom by the smallest step that sets every label clear:
 * read against the whole drawing as the page lays it out (`layoutMolecule`, the bonds as drawn, the near edge's bold and wedge shapes
 * among them; every line but a label's own bond; a meeting deeper than `INK_DEPTH`) and against the other labels. A back atom's down
 * group gives way first, to as little as `HAWORTH_DOWN_LEAST`; then a front atom's up group, to as little as `HAWORTH_UP_BEFORE`, main's
 * length. Where no step within reach sets them all clear, every front atom's up group goes to `HAWORTH_UP_BEFORE` and every back atom's
 * down group back to where it was - as main draws them, so that nothing is drawn worse than there. A group that is no label - a carbon
 * drawn out - is never moved; what each moved group carries goes with it. First, each label of the ring on its upright bond that meets
 * something is read the other way - HO for OH, HOH2C for CH2OH, or back - where that takes a meeting away and adds none (`Atom.reads`);
 * where no step clears them, every label reads as it did. All this is tried first strictly - no touch at all, a line's width counted, no
 * graze let pass - with one front atom's up label rising instead of any giving way: along its vertical above its neighbour's row, below
 * the ring's back edge, read either way, by the least height that sets every label inside the ring clear (an NHAc up from C-2 beside
 * an OH up from C-3); only where that clears nothing, as above. The moves and the ways read, as atoms' new places and `reads` (null: as
 * its bonds decide).
 */
export function haworthLabelsStepped(model: Pick<Model, "atoms" | "bonds">, opts: LayoutOptions): { id: number; x: number; y: number; reads: "left" | "right" | null }[] {
  const found = projectionsIn(model as Model).filter((p) => p.kind === "haworth");
  if (!found.length) return [];
  const byId = new Map(model.atoms.map((a) => [a.id, a]));
  const around = new Map<number, number[]>();
  for (const b of model.bonds) {
    around.set(b.a, [...(around.get(b.a) ?? []), b.b]);
    around.set(b.b, [...(around.get(b.b) ?? []), b.a]);
  }
  const place = new Map(model.atoms.map((a) => [a.id, { x: a.x, y: a.y }]));
  const moved = new Set<number>();
  // (which way each label reads where it is put to - leftward, HO, HOH2C; rightward, OH, CH2OH - as it was, until a turn takes a meeting away)
  const reads = new Map<number, "left" | "right" | undefined>(model.atoms.flatMap((a) => (a.reads ? [[a.id, a.reads] as const] : [])));
  for (const { ring } of found) {
    const h = haworthOf(model, ring);
    if (!h) continue;
    const inRing = new Set(ring);
    const ys = ring.map((id) => byId.get(id)!.y);
    const edge = (y: number) => ring.filter((id) => Math.abs(byId.get(id)!.y - y) < 1e-6 * h.scale);
    // (each labelled group down from a back atom, inside the ring's picture, straight along its vertical; `way` +1
    //  up, -1 down; how short it may become)
    const inside = (ids: number[], way: 1 | -1, least: number) =>
      ids.flatMap((id) => {
        const a = byId.get(id)!;
        const g = (around.get(id) ?? []).map((n) => byId.get(n)!).find((n) => !inRing.has(n.id) && Math.abs(n.x - a.x) < 1e-6 * h.scale && way * (n.y - a.y) > 0);
        return g && g.el !== "C" ? [{ ring: a, group: g, way, least: least * h.scale }] : [];
      });
    const movers = [...inside(edge(Math.max(...ys)), -1, HAWORTH_DOWN_LEAST), ...inside(edge(Math.min(...ys)), 1, HAWORTH_UP_BEFORE)];
    // (every labelled group of the ring straight up or down its vertical - each may be read either way - and what it is read against)
    const upright = ring.flatMap((id) => {
      const a = byId.get(id)!;
      return (around.get(id) ?? [])
        .map((n) => byId.get(n)!)
        .filter((n) => !inRing.has(n.id) && n.el !== "C" && Math.abs(n.x - a.x) < 1e-6 * h.scale && (around.get(n.id) ?? []).length === 1)
        .map((g) => ({ ring: a, group: g }));
    });
    if (!movers.length && !upright.length) continue;
    // (what each group carries: reached from it without passing its ring atom)
    const carried = (g: number, from: number) => {
      const seen = new Set([g]);
      for (const todo = [g]; todo.length; ) {
        for (const n of around.get(todo.pop()!) ?? []) {
          if (n === from || seen.has(n)) continue;
          seen.add(n);
          todo.push(n);
        }
      }
      return seen;
    };
    // (what the labels are kept off: the drawing's ink - the ring, its groups and theirs, as the page lays them out - and each other)
    const groupsOfRing = new Set(model.bonds.flatMap((b) => (inRing.has(b.a) && !inRing.has(b.b) ? [b.b] : inRing.has(b.b) && !inRing.has(b.a) ? [b.a] : [])));
    // (each group of the ring, with what it carries: its ring atom the one it is bonded to in the ring)
    const ringAtomOf = (g: number) => (around.get(g) ?? []).find((n) => inRing.has(n))!;
    const part = [...new Set([...ring, ...[...groupsOfRing].flatMap((g) => [...carried(g, ringAtomOf(g))])])];
    const index = new Map(part.map((id, i) => [id, i]));
    const set = labelSetOf(opts);
    // (every label read: the groups that may move and those that may turn, each once - and what met, by the places and readings
    //  that decide it, so that no layout is made twice)
    const checked = [...new Map([...movers, ...upright].map((u) => [u.group.id, u])).values()];
    const met = new Map<string, Set<number>>();
    // (read first strictly - no touch of a label's ink on any line, its width counted, any filled shape or any other label - and only
    //  where that clears nothing, as before, a graze let pass)
    let strict = true;
    const faults = <U extends { group: Model["atoms"][number] }>(among: readonly U[]): U[] => {
      const key = String(strict) + "|" + movers.map((u) => place.get(u.group.id)!.y).join() + "|" + upright.map((u) => reads.get(u.group.id) ?? "").join();
      let meeting = met.get(key);
      if (!meeting) {
        meeting = new Set(meetingNow().map((u) => u.group.id));
        met.set(key, meeting);
      }
      return among.filter((u) => meeting.has(u.group.id));
    };
    const meetingNow = () => {
      const atoms = part.map((id) => {
        const { reads: _r, ...a } = byId.get(id)!;
        const way = reads.get(id);
        return { ...a, ...place.get(id)!, ...(way ? { reads: way } : {}) };
      });
      const lay = layoutMolecule(atoms as never, layoutBonds(model.bonds.filter((b) => index.has(b.a) && index.has(b.b)), index) as never, opts, INK_ZOOM);
      const boxOf = (id: number): Box | null => {
        const i = index.get(id)!;
        const boxes = lay.texts
          .filter((t) => (t as { atom?: number }).atom === i)
          .map((t) => {
            const b = labelBox(t, t.fontPx, set);
            return { minX: t.x - b.left, maxX: t.x + b.right, minY: t.y - b.bottom, maxY: t.y + b.top };
          });
        return boxes.length ? boxes.reduce((u, b) => ({ minX: Math.min(u.minX, b.minX), maxX: Math.max(u.maxX, b.maxX), minY: Math.min(u.minY, b.minY), maxY: Math.max(u.maxY, b.maxY) })) : null;
      };
      // (the other labels: the ring's groups' and the ring's own - its O)
      const others = [...groupsOfRing, ...ring].map((id) => ({ id, box: boxOf(id) })).filter((o): o is { id: number; box: Box } => o.box != null);
      return checked.filter((u) => {
        const box = boxOf(u.group.id);
        if (!box) return false;
        // (every line but the label's own bond - the one along its vertical, between its ring atom and itself - and every filled shape)
        const g = place.get(u.group.id)!;
        const [lo, hi] = [Math.min(u.ring.y, g.y), Math.max(u.ring.y, g.y)];
        const own = (l: { x1: number; y1: number; x2: number; y2: number }) =>
          Math.abs(l.x1 - u.ring.x) < 1e-6 && Math.abs(l.x2 - u.ring.x) < 1e-6 && Math.min(l.y1, l.y2) >= lo - 1e-6 && Math.max(l.y1, l.y2) <= hi + 1e-6;
        const ink = { lines: lay.lines.filter((l) => !own(l)).map((l) => ({ p: { x: l.x1, y: l.y1 }, q: { x: l.x2, y: l.y2 }, half: strict ? l.widthPx / INK_ZOOM / 2 : 0 })), polys: lay.polys.map((q) => q.points) };
        const depth = strict ? 0 : INK_DEPTH;
        const deep = { minX: box.minX + depth, maxX: box.maxX - depth, minY: box.minY + depth, maxY: box.maxY - depth };
        if (deep.minX < deep.maxX && deep.minY < deep.maxY && meetsInk(deep, ink)) return true;
        // (two labels visibly apart: a gap of `LABELS_APART` between them at the least)
        const gap = LABELS_APART * h.scale;
        return others.some((o) => o.id !== u.group.id && o.box.minX < box.maxX + gap && box.minX < o.box.maxX + gap && o.box.minY < box.maxY + gap && box.minY < o.box.maxY + gap);
      });
    };
    // (each label that meets something read the other way where that takes a meeting away and adds none - the labels that meet after
    //  a turn are fewer, and among those before - one at a time; read at the stems as they stand; a label that meets nothing is left
    //  as it reads)
    const readBest = () => {
      for (let pass = 0; pass < upright.length; pass++) {
        let better = false;
        for (const u of faults(upright)) {
          const now = reads.get(u.group.id);
          const before = new Set(faults(upright).map((v) => v.group.id));
          let best = { way: now, count: before.size };
          for (const way of ["left", "right"] as const) {
            if (way === now) continue;
            reads.set(u.group.id, way);
            const after = faults(upright).map((v) => v.group.id);
            if (after.length < best.count && after.every((id) => before.has(id))) best = { way, count: after.length };
          }
          reads.set(u.group.id, best.way);
          if (best.way !== now) better = true;
        }
        if (!better) break;
      }
    };
    const lengthOf = (u: (typeof movers)[number]) => u.way * (place.get(u.group.id)!.y - u.ring.y);
    const moveTo = (u: (typeof movers)[number], length: number) => {
      const dy = u.way * (length - lengthOf(u));
      if (Math.abs(dy) < 1e-12) return;
      for (const id of carried(u.group.id, u.ring.id)) {
        const q = place.get(id)!;
        place.set(id, { x: q.x, y: q.y + dy });
        moved.add(id);
      }
    };
    const began = new Map(movers.map((u) => [u, lengthOf(u)]));
    const longest = Math.max(HAWORTH_GROUP[h.size].front.up, HAWORTH_GROUP[h.size].back.down) * h.scale;
    // (how each label read as it was put, before any turn; and how high a label inside the ring may stand - the ring's depth on the page)
    const readsAtFirst = new Map(upright.map((u) => [u.group.id, reads.get(u.group.id)]));
    const highest = Math.max(...ys) - Math.min(...ys);
    const settle = (): boolean => {
      readBest();
      if (!faults(movers).length) return true;
      if (!strict) {
        for (let k = 0; k <= 2 * Math.ceil(longest / (STEP * h.scale)) + 2; k++) {
          const faulty = faults(movers).filter((u) => lengthOf(u) > u.least + 1e-9);
          if (!faults(movers).length) return true;
          if (!faulty.length) break;
          // (a back atom's down group gives way first; a front atom's up group only where none is left to)
          const giving = faulty.some((u) => u.way === -1) ? faulty.filter((u) => u.way === -1) : faulty;
          for (const u of giving) moveTo(u, Math.max(u.least, lengthOf(u) - STEP * h.scale));
        }
        return false;
      }
      // (read strictly, a label that still touches something: one front atom's up label rises along its vertical, into the ring's middle
      //  above the row of its neighbour's, read either way, by the least that sets every label inside the ring clear and adds no touch to
      //  any other - the others where they were put, read as they were put or as just read; never as far as the ring's back edge)
      const touchedBefore = new Set(faults(upright).map((u) => u.group.id));
      const fronts = movers.filter((u) => u.way === 1);
      const now = new Map(upright.map((u) => [u.group.id, reads.get(u.group.id)]));
      const bases = [now, ...([...readsAtFirst].some(([id, way]) => now.get(id) !== way) ? [readsAtFirst] : [])];
      for (const base of bases) {
        for (let length = RISE * h.scale; fronts.length; length += RISE * h.scale) {
          let within = false;
          for (const u of fronts) {
            if (began.get(u)! + length >= highest) continue;
            within = true;
            for (const v of movers) moveTo(v, began.get(v)!);
            for (const [id, way] of base) reads.set(id, way);
            moveTo(u, began.get(u)! + length);
            const ways = upright.some((v) => v.group.id === u.group.id) ? (["left", "right"] as const) : [reads.get(u.group.id)];
            for (const way of ways) {
              reads.set(u.group.id, way);
              if (!faults(movers).length && faults(upright).every((v) => v.group.id === u.group.id || touchedBefore.has(v.group.id))) return true;
            }
          }
          if (!within) break;
        }
      }
      return false;
    };
    const [placeWas, readsWas, movedWas] = [new Map(place), new Map(reads), new Set(moved)];
    let clear = settle();
    if (!clear) {
      for (const [id, q] of placeWas) place.set(id, q);
      for (const id of reads.keys()) if (!readsWas.has(id)) reads.delete(id);
      for (const [id, w] of readsWas) reads.set(id, w);
      for (const id of [...moved]) if (!movedWas.has(id)) moved.delete(id);
      strict = false;
      clear = settle();
    }
    // (none within reach clears them: as main draws them - each label read as it was)
    if (!clear) {
      for (const u of movers) moveTo(u, u.way === 1 ? HAWORTH_UP_BEFORE * h.scale : began.get(u)!);
      for (const u of upright) reads.set(u.group.id, byId.get(u.group.id)!.reads);
    }
  }
  return [...new Set([...moved, ...reads.keys()])]
    .map((id) => ({ id, ...place.get(id)!, reads: reads.get(id) ?? null }))
    .filter((m) => m.y !== byId.get(m.id)!.y || (m.reads ?? undefined) !== byId.get(m.id)!.reads);
}

/**
 * The bonds of the groups inside a Haworth ring's picture - up from its front atoms, down from its back atoms, straight along their
 * verticals - whose group is a label: each stops close to its label (`Bond.close`, lib/chem/layout2d `LABEL_MARGIN_CLOSE`), so that its stem
 * shows as long as the figures under Brecher 2006's ST-1.9 draw it - 0.29 of the level bond up from a front atom of a six-ring, 0.33 of a
 * five-ring, 0.25 down from a six-ring's back atom. Where a label is no longer there (a carbon drawn out, or the group gone from inside),
 * its bond stops as any does. As bond ids and whether each is close; only those that change.
 */
export function haworthStemsClose(model: Pick<Model, "atoms" | "bonds">): { id: number; close: boolean }[] {
  const found = projectionsIn(model as Model).filter((p) => p.kind === "haworth");
  if (!found.length) return [];
  const byId = new Map(model.atoms.map((a) => [a.id, a]));
  const out: { id: number; close: boolean }[] = [];
  for (const { ring } of found) {
    const h = haworthOf(model, ring);
    if (!h) continue;
    const inRing = new Set(ring);
    const ys = ring.map((id) => byId.get(id)!.y);
    const [lo, hi] = [Math.min(...ys), Math.max(...ys)];
    for (const b of model.bonds) {
      const [r, g] = inRing.has(b.a) && !inRing.has(b.b) ? [byId.get(b.a), byId.get(b.b)] : inRing.has(b.b) && !inRing.has(b.a) ? [byId.get(b.b), byId.get(b.a)] : [];
      if (!r || !g) continue;
      const near = (y: number) => Math.abs(r.y - y) < 1e-6 * h.scale;
      const upright = Math.abs(g.x - r.x) < 1e-6 * h.scale;
      // (inside: up from the front edge, down from the back; a label, carrying nothing)
      const inside = upright && ((near(lo) && g.y > r.y) || (near(hi) && g.y < r.y));
      const label = g.el !== "C" && !model.bonds.some((o) => o !== b && (o.a === g.id || o.b === g.id));
      const close = inside && label;
      if (close !== !!b.close) out.push({ id: b.id, close });
    }
  }
  return out;
}
