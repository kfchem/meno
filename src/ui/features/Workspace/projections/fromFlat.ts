/**
 * *Draw as chair* (docs/EDITOR-2D.md, *Projections*): a flat drawing's six-membered ring drawn as a chair of the tool's - its ring on the
 * solid's places (`chairDrawing`), each group moved onto the free position that states the configuration the flat drawing states, the rest
 * of each group carried with it as drawn. The configuration is the one the reader reads from the flat drawing (Brecher 2006, ST-0.3, ST-1.10);
 * nothing else is taken from it. Pure: the model in, the atoms and bonds to change out.
 *
 * Which of the two chairs is drawn is no rule of any text: it is this tool's convention, the one with fewer groups axial - a tie: the one
 * whose axial group is the smaller, by its non-hydrogen atoms, so cis-4-tert-butylcyclohexanol has its tert-butyl equatorial and its OH
 * axial; still tied, the group whose first atom ranks lowest in the canonical order equatorial - lying as near to the flat drawing as it
 * can, a tie to form 1 (ST-3.1: from above and from the right). A pyranose's ring - its ring O beside a carbon that carries an O outside
 * the ring, on a single bond - lies with that O at the back and that carbon at the right-hand end (McNaught 1996, 2-Carb-7, Chart III), in
 * either chair: so a pyranose in its 1C4 chair is the picture with its up end at the right, not form 1. The chart draws it so; it is not to
 * be mended to form 1. Where both carbons beside the ring O carry one (a 2,6-dialkoxyoxane), that rule does not choose, and the ring lies
 * as any other. *Flip chair* draws the other chair; 3D never takes the drawn conformation.
 *
 * Offered on a single saturated six-ring in this build: no ring fused, spiro or bridged on it, no double bond at its atoms, no depth yet.
 * Not offered where the ring has stereocentres and the drawing gives the configuration of none (ST-3.2: a perspective drawing states the
 * configuration of every centre with no wavy bond; one wholly unknown is drawn flat). A ring centre the drawing leaves open keeps it open:
 * its group equatorial, on a wavy bond.
 */
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { stereoUnitsOnly } from "../../../../lib/chem/identity";
import { canonicalRanks } from "../../../../lib/layout/canonical";
import type { Tetrahedral } from "../../../../lib/layout/stereo";
import { identityInputOf } from "../chem/identityOf";
import type { Atom, Bond, Model } from "../store/types";
import { chairDrawing, FIRST_FORM, ringAlone, seenPlaces, type ChairDrawing } from "./chair";

/** What *Draw as chair* changes: the atoms moved (with their depth and flags) and the bonds whose look changes, whole. */
export type FromFlat = { atoms: Atom[]; bonds: Bond[] };

/** Why *Draw as chair* is not offered on a ring that is otherwise one it would draw: its configuration is not drawn. */
export const NOT_DRAWN = "Its configuration is not drawn: a chair would state one.";

/** `model` with what *Draw as chair* changes put in, by id. */
export function withChair(model: Model, made: FromFlat): Model {
  const atoms = new Map(made.atoms.map((a) => [a.id, a]));
  const bonds = new Map(made.bonds.map((b) => [b.id, b]));
  return { ...model, atoms: model.atoms.map((a) => atoms.get(a.id) ?? a), bonds: model.bonds.map((b) => bonds.get(b.id) ?? b) };
}

/** What is said where drawing a ring as a chair would have changed the compound: Meno's fault, nothing changed. */
export const CHAIR_CHANGED = "Drawing it as a chair would have changed the compound, so nothing was changed. That is a fault in Meno, not in the drawing.";

/** The six-membered rings through atom `id` of a drawing, each as atom ids in order round it. */
function sixRingsThrough(model: Model, id: number): number[][] {
  const near = new Map<number, number[]>();
  for (const b of model.bonds) {
    near.set(b.a, [...(near.get(b.a) ?? []), b.b]);
    near.set(b.b, [...(near.get(b.b) ?? []), b.a]);
  }
  const found = new Map<string, number[]>();
  const walk = (path: number[]) => {
    const last = path[path.length - 1];
    for (const n of near.get(last) ?? []) {
      if (path.length === 6 && n === id) found.set([...path].sort((p, q) => p - q).join(","), [...path]);
      else if (path.length < 6 && !path.includes(n)) walk([...path, n]);
    }
  };
  walk([id]);
  return [...found.values()];
}

/** The ring of the drawing's flat six-ring through `id` that *Draw as chair* would draw: none where there is none it can (see the module). */
export function flatRingOf(model: Model, id: number): number[] | null {
  const at = new Map(model.atoms.map((a) => [a.id, a]));
  const rings = sixRingsThrough(model, id);
  if (rings.length !== 1) return null;
  const ring = rings[0];
  const inRing = new Set(ring);
  if (ring.some((r) => at.get(r)?.z != null)) return null;
  // (every bond at a ring atom single: a cyclohexanone's C=O or a cyclohexene's C=C is not in this build)
  if (model.bonds.some((b) => (inRing.has(b.a) || inRing.has(b.b)) && b.order !== 1)) return null;
  if (!ringAlone(model, ring)) return null;
  return ring;
}

/** The atoms and bonds of the structure holding `ring`, and the ring's centres: those the drawing gives, and those it leaves open. */
function centresOf(part: Model, ring: readonly number[]): { given: Map<number, Tetrahedral>; open: Set<number>; ranks: Map<number, number> } {
  const { input } = identityInputOf(part);
  const index = new Map(part.atoms.map((a, i) => [a.id, i]));
  const near = (i: number) => input.bonds.flatMap((b) => (b.a === i ? [b.b] : b.b === i ? [b.a] : []));
  // (each ring atom with two groups - an H among them, or not - and no configuration read: given one, to ask whether it is a centre)
  const trial = new Map<number, Tetrahedral>();
  for (const id of ring) {
    const i = index.get(id)!;
    if (input.atoms[i].tetra) continue;
    const n = near(i);
    const hs = input.atoms[i].hs ?? 0;
    if (n.length + hs !== 4 || n.length < 3) continue;
    trial.set(i, { neighbours: [...n, ...(hs ? [-1] : [])], volume: 1 });
  }
  const asked = { ...input, atoms: input.atoms.map((a, i) => (trial.has(i) ? { ...a, tetra: trial.get(i)! } : a)) };
  const kept = stereoUnitsOnly(asked).input;
  const given = new Map<number, Tetrahedral>();
  const open = new Set<number>();
  for (const id of ring) {
    const i = index.get(id)!;
    if (!kept.atoms[i].tetra) continue;
    if (trial.has(i)) open.add(id);
    else {
      // (its neighbours by atom id, an implicit H -1, as the drawing's ids go)
      const t = input.atoms[i].tetra!;
      given.set(id, { ...t, neighbours: t.neighbours.map((n) => (n < 0 ? n : part.atoms[n].id)) });
    }
  }
  const rank = canonicalRanks(input);
  return { given, open, ranks: new Map(part.atoms.map((a, i) => [a.id, rank[i]])) };
}

/** The sign of the volume three directions in space span: the drawing's own sense, x right, y up, z toward the viewer. */
const sense = (u: number[], v: number[], w: number[]) =>
  Math.sign(u[0] * (v[1] * w[2] - v[2] * w[1]) - u[1] * (v[0] * w[2] - v[2] * w[0]) + u[2] * (v[0] * w[1] - v[1] * w[0]));

/** A way of drawing the ring as a chair: which chair, which form, which ring atom stands at which of the solid's atoms, and how good it is. */
type Way = { d: ChairDrawing; at: Map<number, number>; places: Map<number, { x: number; y: number; z: number }>; wavy: number[]; key: number[] };

/**
 * *Draw as chair* on the flat six-ring through atom `id` of the structure `part`: the atoms and bonds that change, the compound the same; a
 * line saying why where the ring has centres and none is given (`NOT_DRAWN`); none where the tool does not draw this ring (see the module).
 */
export function chairFromFlat(part: Model, id: number): FromFlat | { refused: string } | null {
  const ring = flatRingOf(part, id);
  if (!ring) return null;
  const { given, open, ranks } = centresOf(part, ring);
  if (!given.size && open.size) return { refused: NOT_DRAWN };
  const at = new Map(part.atoms.map((a) => [a.id, a]));
  const inRing = new Set(ring);
  const near = (x: number) => part.bonds.flatMap((b) => (b.a === x ? [b.b] : b.b === x ? [b.a] : []));
  const groups = new Map(ring.map((r) => [r, near(r).filter((n) => !inRing.has(n))]));
  // (what hangs from each group's first atom, the ring left out: carried with it as drawn)
  const hanging = (from: number, first: number): number[] => {
    const out = [first];
    const seen = new Set([from, first]);
    for (let h = 0; h < out.length; h++) {
      for (const n of near(out[h])) {
        if (seen.has(n) || inRing.has(n)) continue;
        seen.add(n);
        out.push(n);
      }
    }
    return out;
  };
  const size = (r: number, g: number) => hanging(r, g).length;
  const middle = { x: ring.reduce((s, r) => s + at.get(r)!.x, 0) / 6, y: ring.reduce((s, r) => s + at.get(r)!.y, 0) / 6 };
  const ringBonds = ring.map((r, i) => Math.hypot(at.get(r)!.x - at.get(ring[(i + 1) % 6])!.x, at.get(r)!.y - at.get(ring[(i + 1) % 6])!.y));
  const length = ringBonds.reduce((s, l) => s + l, 0) / 6 || NOMINAL_BOND_LENGTH;
  // (a pyranose's ring: the ring O, and the ring carbon beside it that carries an O off the ring, on a single bond, as every bond at the
  //  ring's atoms is here - C-1; none where both carbons beside the ring O carry one, a 2,6-dialkoxyoxane: laid as any other ring)
  const ringO = ring.filter((r) => at.get(r)!.el === "O");
  const carrying = ringO.length === 1 ? near(ringO[0]).filter((n) => inRing.has(n) && at.get(n)!.el === "C" && groups.get(n)!.some((g) => at.get(g)!.el === "O")) : [];
  const c1 = carrying.length === 1 ? carrying[0] : undefined;
  // (a group's non-hydrogen atoms, what hangs from it counted: of chairs with as many groups axial, the one whose axial groups are the
  //  smaller; still tied, the group whose first atom ranks lowest in the canonical order equatorial)
  const heavy = (r: number, g: number) => hanging(r, g).filter((h) => at.get(h)!.el !== "H").length;
  const allGroups = [...groups.values()].flat();
  const lowest = allGroups.length ? allGroups.reduce((m, g) => (ranks.get(g)! < ranks.get(m)! ? g : m)) : undefined;
  const ways: Way[] = [];
  for (const flip of [false, true]) {
    for (const form of [0, 1] as const) {
      const d = chairDrawing({ at: middle, form, flip, firstId: 1, firstBondId: 1, length });
      for (let turn = 0; turn < 6; turn++) {
        for (const dir of [1, -1]) {
          const k = new Map(ring.map((r, i) => [r, (turn + dir * i + 6) % 6]));
          const atom3 = (r: number) => {
            const p = d.atoms[k.get(r)!];
            return [p.x, p.y, p.z!];
          };
          const places = new Map<number, { x: number; y: number; z: number }>();
          const wavy: number[] = [];
          let axial = 0;
          const onAxial = new Set<number>();
          const axialSizes: number[] = [];
          let fits = true;
          for (const r of ring) {
            const free = seenPlaces(d, k.get(r)!);
            const ax = free.find((f) => f.free.kind === "axial")!;
            const eq = free.find((f) => f.free.kind === "equatorial")!;
            const c = atom3(r);
            const spot = (f: typeof ax) => ({ x: f.place.x, y: f.place.y, z: c[2] + f.direction.z * d.scale });
            const gs = groups.get(r)!;
            let onEq: number | undefined;
            let onAx: number | undefined;
            const t = given.get(r);
            if (t && gs.length >= 1) {
              // (the groups on the two places the way round that states the configuration read: the solid's own sense against the reader's)
              const tryWay = (e: number | undefined, x: number | undefined) => {
                const where = (n: number) => (n === e ? spot(eq) : n === x ? spot(ax) : n === -1 ? spot(e === undefined ? eq : ax) : (() => {
                  const p = d.atoms[k.get(n)!];
                  return { x: p.x, y: p.y, z: p.z! };
                })());
                const v = t.neighbours.slice(0, 3).map((n) => {
                  const p = where(n);
                  return [p.x - c[0], p.y - c[1], p.z - c[2]];
                });
                return sense(v[0], v[1], v[2]) === t.volume;
              };
              const [g1, g2] = gs;
              if (tryWay(g1, g2)) [onEq, onAx] = [g1, g2];
              else if (tryWay(g2, g1)) [onEq, onAx] = [g2, g1];
              else fits = false;
            } else if (open.has(r)) {
              // (a centre left open: its group equatorial, on a wavy bond; the other place its H)
              onEq = gs[0];
              onAx = gs[1];
              if (gs[0] != null) wavy.push(gs[0]);
            } else if (gs.length === 1) onEq = gs[0];
            else if (gs.length === 2) [onEq, onAx] = size(r, gs[0]) >= size(r, gs[1]) ? [gs[0], gs[1]] : [gs[1], gs[0]];
            if (onEq != null) places.set(onEq, spot(eq));
            if (onAx != null) {
              places.set(onAx, spot(ax));
              onAxial.add(onAx);
              if (at.get(onAx)!.el !== "H") {
                axial++;
                axialSizes.push(heavy(r, onAx));
              }
            }
          }
          if (!fits) continue;
          // (lying as near the flat drawing as it can: how far the ring atoms move)
          const moved = ring.reduce((s, r) => s + Math.hypot(d.atoms[k.get(r)!].x - at.get(r)!.x, d.atoms[k.get(r)!].y - at.get(r)!.y) ** 2, 0);
          // (a pyranose's: C-1 at the right-hand end and its ring O behind it, the far one of C-1's two ring neighbours)
          let pyranose = 0;
          if (c1 != null) {
            const p1 = d.atoms[k.get(c1)!];
            const right = ring.every((r) => d.atoms[k.get(r)!].x <= p1.x + 1e-9);
            const other = near(c1).find((n) => inRing.has(n) && n !== ringO[0])!;
            const behind = d.atoms[k.get(ringO[0])!].z! < d.atoms[k.get(other)!].z!;
            pyranose = right && behind ? 0 : 1;
          }
          // (the axial groups' sizes, largest first, padded to six: compared place by place, the smaller wins)
          const sizes = [...axialSizes.sort((p, q) => q - p), 0, 0, 0, 0, 0, 0].slice(0, 6);
          const tie = lowest != null && onAxial.has(lowest) ? 1 : 0;
          ways.push({ d, at: k, places, wavy, key: [axial, ...sizes, tie, pyranose, Math.round(moved * 1e6) / 1e6, form === FIRST_FORM ? 0 : 1] });
        }
      }
    }
  }
  if (!ways.length) return null;
  ways.sort((p, q) => {
    for (let i = 0; i < p.key.length; i++) if (p.key[i] !== q.key[i]) return p.key[i] - q.key[i];
    return 0;
  });
  const best = ways[0];
  // (the ring atoms on the chair's places with its depth; each group's first atom on its place, what hangs from it carried as drawn)
  const atoms = new Map<number, Atom>();
  for (const r of ring) {
    const p = best.d.atoms[best.at.get(r)!];
    atoms.set(r, { ...at.get(r)!, x: p.x, y: p.y, z: p.z, stereoCentre: true, stereoShown: true });
  }
  for (const r of ring) {
    for (const g of groups.get(r)!) {
      const p = best.places.get(g);
      if (!p) continue;
      const a = at.get(g)!;
      const [dx, dy] = [p.x - a.x, p.y - a.y];
      for (const h of hanging(r, g)) {
        const b = at.get(h)!;
        atoms.set(h, { ...(atoms.get(h) ?? b), x: b.x + dx, y: b.y + dy });
      }
    }
  }
  // (the ring's wedges gone - the configuration is in the depth now - and an open centre's group on a wavy bond)
  const bonds: Bond[] = [];
  for (const b of part.bonds) {
    const atRing = inRing.has(b.a) || inRing.has(b.b);
    if (!atRing) continue;
    const other = inRing.has(b.a) ? b.b : b.a;
    const wavy = !(inRing.has(b.a) && inRing.has(b.b)) && best.wavy.includes(other);
    const { stereo: _s, narrow: _n, ...rest } = b;
    const next: Bond = wavy ? { ...rest, stereo: "wavy" } : rest;
    if (next.stereo !== b.stereo || b.narrow != null) bonds.push(next);
  }
  return { atoms: [...atoms.values()], bonds };
}
