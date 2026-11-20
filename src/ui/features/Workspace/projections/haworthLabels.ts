import { labelBox, labelSetOf, layoutMolecule, segmentMeetsBox, type LayoutOptions } from "../../../../lib/chem/layout2d";
import { HAWORTH_GROUP } from "../../../../lib/chem/perception/projection/views";
import type { Model } from "../store/types";
import { haworthOf } from "./haworth";
import { projectionsIn } from "./rings";

/**
 * How far down its vertical a labelled group up from a Haworth ring's front atom may step where its label has no clear way at its
 * place: to 0.40 of the level bond, the length such a group had before the stems were set by their ink - where every pair of labels on
 * one row clears. The step is 0.01 of the level bond.
 */
export const HAWORTH_UP_LEAST = 0.4;
const STEP = 0.01;

type Box = { minX: number; maxX: number; minY: number; maxY: number };

/**
 * The labelled groups up from a Haworth ring's front atoms - inside the ring's picture, on one row - each moved down its vertical by
 * the smallest step that sets its label clear, all its letters, of the ring's bonds and of the labels of the ring's other groups:
 * a CH2OH and an OH side by side, where neither way of reading the CH2OH is clear at its stem. A group whose label is clear where it
 * stands stays there; none goes below `HAWORTH_UP_LEAST`. What each moved group carries goes with it. The moves, as atoms' new places.
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
    const front = ring.filter((id) => Math.abs(byId.get(id)!.y - Math.min(...ys)) < 1e-6 * h.scale);
    // (each front atom's up group, labelled: straight above it, out of the ring)
    const ups = front.flatMap((id) => {
      const a = byId.get(id)!;
      const g = (around.get(id) ?? []).map((n) => byId.get(n)!).find((n) => !inRing.has(n.id) && Math.abs(n.x - a.x) < 1e-6 * h.scale && n.y > a.y);
      return g && g.el !== "C" ? [{ ring: a, group: g }] : [];
    });
    if (!ups.length) continue;
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
    // (what the labels are kept off: the ring's bonds, and the labels of the ring's groups)
    const ringBonds = model.bonds.filter((b) => inRing.has(b.a) && inRing.has(b.b));
    const groupsOfRing = new Set(model.bonds.flatMap((b) => (inRing.has(b.a) && !inRing.has(b.b) ? [b.b] : inRing.has(b.b) && !inRing.has(b.a) ? [b.a] : [])));
    const part = [...new Set([...ring, ...ups.flatMap((u) => [...carried(u.group.id, u.ring.id)]), ...groupsOfRing])];
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
      return ups.filter((u) => {
        const box = boxOf(u.group.id);
        if (!box) return false;
        const p = (id: number) => place.get(id)!;
        if (ringBonds.some((b) => b.a !== u.ring.id && b.b !== u.ring.id && segmentMeetsBox(p(b.a), p(b.b), box))) return true;
        return others.some((o) => o.id !== u.group.id && o.box.minX < box.maxX && box.minX < o.box.maxX && o.box.minY < box.maxY && box.minY < o.box.maxY);
      });
    };
    const least = HAWORTH_UP_LEAST * h.scale;
    const longest = HAWORTH_GROUP[h.size].front.up * h.scale;
    for (let k = 0; k <= Math.ceil((longest - least) / (STEP * h.scale)); k++) {
      const bad = faults().filter((u) => place.get(u.group.id)!.y - u.ring.y > least + 1e-9);
      if (!bad.length) break;
      for (const u of bad) {
        const now = place.get(u.group.id)!.y - u.ring.y;
        const dy = Math.max(least, now - STEP * h.scale) - now;
        for (const id of carried(u.group.id, u.ring.id)) {
          const q = place.get(id)!;
          place.set(id, { x: q.x, y: q.y + dy });
          moved.add(id);
        }
      }
    }
  }
  return [...moved].map((id) => ({ id, ...place.get(id)! })).filter((m) => m.y !== byId.get(m.id)!.y);
}
