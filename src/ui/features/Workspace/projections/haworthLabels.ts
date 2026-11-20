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
/** The least gap between two labels inside a Haworth ring's picture, as a share of the level bond: about a seventh of a label's height. */
export const LABELS_APART = 0.04;

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
 * The labelled groups down from a Haworth ring's back atoms whose labels meet another inside the ring's picture - a back atom's H over a
 * front atom's OH, on one vertical - each moved up its vertical toward its ring atom by the smallest step that sets its label clear, all
 * its letters, of the ring's bonds as drawn (`ringInk`) and of the labels of the ring's other groups, to as little as
 * `HAWORTH_DOWN_LEAST`. A group whose label is clear where it stands stays there, and a group that is no label - a carbon drawn out - is
 * never moved. What each moved group carries goes with it. Where no step within reach sets them clear, they are left where they stand.
 * (A front atom's up group is not moved: its label is clear at its stem wherever it is clear at a shorter one - every pair of an O, an
 * H and a CH2OH up from the two front atoms, in either ring, MEASURED - so a shorter stem would clear nothing.) The moves, as atoms'
 * new places.
 */
export function haworthLabelsStepped(model: Pick<Model, "atoms" | "bonds">, opts: LayoutOptions): { id: number; x: number; y: number }[] {
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
    const movers = inside(edge(Math.max(...ys)), -1, HAWORTH_DOWN_LEAST);
    if (!movers.length) continue;
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
    // (what the labels are kept off: the ring's bonds as drawn - every one, its ink - and the labels of the ring's groups)
    const ink = ringInk(model, ring, opts);
    const groupsOfRing = new Set(model.bonds.flatMap((b) => (inRing.has(b.a) && !inRing.has(b.b) ? [b.b] : inRing.has(b.b) && !inRing.has(b.a) ? [b.a] : [])));
    const part = [...new Set([...ring, ...movers.flatMap((u) => [...carried(u.group.id, u.ring.id)]), ...groupsOfRing])];
    const index = new Map(part.map((id, i) => [id, i]));
    const set = labelSetOf(opts);
    const faults = () => {
      const atoms = part.map((id) => ({ ...byId.get(id)!, ...place.get(id)! }));
      const bonds = model.bonds.filter((b) => index.has(b.a) && index.has(b.b)).map((b) => ({ a1: index.get(b.a)!, a2: index.get(b.b)!, order: b.order }));
      const lay = layoutMolecule(atoms as never, bonds as never, opts, 40);
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
      const others = [...groupsOfRing].map((id) => ({ id, box: boxOf(id) })).filter((o): o is { id: number; box: Box } => o.box != null);
      return movers.filter((u) => {
        const box = boxOf(u.group.id);
        if (!box) return false;
        if (meetsInk(box, ink)) return true;
        // (two labels visibly apart: a gap of `LABELS_APART` between them at the least)
        const gap = LABELS_APART * h.scale;
        return others.some((o) => o.id !== u.group.id && o.box.minX < box.maxX + gap && box.minX < o.box.maxX + gap && o.box.minY < box.maxY + gap && box.minY < o.box.maxY + gap);
      });
    };
    const lengthOf = (u: (typeof movers)[number]) => u.way * (place.get(u.group.id)!.y - u.ring.y);
    // (where it began: a ring whose labels no step within reach sets clear is left as it was - a shorter stem that clears nothing is
    //  no gain)
    const began = new Map([...new Set(movers.flatMap((u) => [...carried(u.group.id, u.ring.id)]))].map((id) => [id, place.get(id)!]));
    const movedHere = new Set<number>();
    const longest = HAWORTH_GROUP[h.size].back.down * h.scale;
    for (let k = 0; k <= 2 * Math.ceil(longest / (STEP * h.scale)); k++) {
      const faulty = faults().filter((u) => lengthOf(u) > u.least + 1e-9);
      if (!faulty.length) break;
      for (const u of faulty) {
        const now = lengthOf(u);
        const dy = u.way * (Math.max(u.least, now - STEP * h.scale) - now);
        for (const id of carried(u.group.id, u.ring.id)) {
          const q = place.get(id)!;
          place.set(id, { x: q.x, y: q.y + dy });
          movedHere.add(id);
        }
      }
    }
    if (faults().length) for (const [id, q] of began) place.set(id, q);
    else for (const id of movedHere) moved.add(id);
  }
  return [...moved].map((id) => ({ id, ...place.get(id)! })).filter((m) => m.y !== byId.get(m.id)!.y);
}
