import { labelBox, labelSetOf, markCircle, markExtent, placeLabel, type Layout, type LayoutOptions, type TextItem } from "../../../../lib/chem/layout2d";
import { pointAt, pushShape, type PushEndAt, type PushMeasures, type PushScene, type PushShape } from "../../../../lib/chem/pushArrow";
import type { Bond, PushArrow, PushEnd } from "../store/types";

/**
 * Electron-pushing arrows as the drawing has them (lib/chem/pushArrow):
 * each end found among the atoms where they are drawn - on the canvas, as
 * they glide; in a picture, as they are - and drawn clear of their labels,
 * so that the canvas and every picture draw the same arrows.
 */

type P = { x: number; y: number };
const unit = (a: P): P => {
  const l = Math.hypot(a.x, a.y);
  return l > 1e-12 ? { x: a.x / l, y: a.y / l } : { x: 1, y: 0 };
};
type AtomAt = { id: number; x: number; y: number; el: string; charge?: number; radical?: unknown };

/** The elements an arrow leaves from a lone pair of: those that have one to give in a neutral structure. */
const PAIRED = new Set(["N", "O", "S", "P", "Se", "F", "Cl", "Br", "I"]);

/** Whether an atom has a lone pair an arrow is drawn from: a lone pair's element, or one with a negative charge. */
export function hasLonePair(a: Pick<AtomAt, "el" | "charge">): boolean {
  return PAIRED.has(a.el) || (a.charge ?? 0) < 0;
}

/**
 * What an arrow leaves its atom from (the maintainer, 2026-10-11): a
 * fishhook from a radical's dot; else, from an atom with a negative charge,
 * its charge's mark - unless the arrow is set to leave from a lone pair; else
 * a lone pair.
 */
export function tailOf(a: Pick<AtomAt, "el" | "charge" | "radical">, push: Pick<PushArrow, "half" | "fromPair">): "radical" | "charge" | "pair" {
  if (push.half && a.radical) return "radical";
  if ((a.charge ?? 0) < 0 && !push.fromPair) return "charge";
  return "pair";
}

/** How far round a bare vertex an arrow keeps, in bonds. */
const BARE_CLEAR = 0.12;
/** How far past its label's ink, in ems of the labels. */
const LABEL_CLEAR = 0.15;

/** How far an arrow keeps from an atom, toward `u`: past its label's ink - the box round it - or round its bare vertex. */
function clearOf(label: TextItem | undefined, fontSize: number, opts: LayoutOptions, bondLength: number): (u: P) => number {
  if (!label) return () => BARE_CLEAR * bondLength;
  const box = labelBox(label, fontSize, labelSetOf(opts));
  return (u: P) => {
    const tx = u.x > 1e-9 ? box.right / u.x : u.x < -1e-9 ? box.left / -u.x : Infinity;
    const ty = u.y > 1e-9 ? box.top / u.y : u.y < -1e-9 ? box.bottom / -u.y : Infinity;
    return Math.min(tx, ty) + LABEL_CLEAR * fontSize;
  };
}

/**
 * What of a drawing the arrows are laid by (`pushShapes`), as one string:
 * its labels and where its lines run - so that a drawing laid out again
 * the same, as at each frame of a zoom where its lines are held at their
 * least width on the screen, lays the arrows out no more (found on Windows,
 * 2026-10-16: with arrows on the page, a zoom stuttered).
 */
export function laidKey(drawn: Pick<Layout, "texts" | "lines">): string {
  // (positions to a millionth of a bond, which is all an arrow could move by)
  const r = (v: number) => Math.round(v * 1e6);
  let lines = "";
  for (const l of drawn.lines) lines += `${r(l.x1)},${r(l.y1)},${r(l.x2)},${r(l.y2)};`;
  return JSON.stringify(drawn.texts) + "|" + lines;
}

/**
 * Each arrow's curve, by its id - from and to its ends among `atoms` (in
 * the order the layout's `labels` number them), bent as it says or laid as
 * Meno lays it, clear of the bonds and labels, coming onto an atom from
 * behind any bond another arrow takes from it - its head half or full:
 * those whose ends are drawn.
 */
export function pushShapes(
  pushes: readonly PushArrow[],
  atoms: readonly AtomAt[],
  bonds: readonly Pick<Bond, "id" | "a" | "b">[],
  /** The drawing they are laid on: its labels, and its lines - the bonds as drawn, a double bond's second line with them. */
  drawn: Pick<Layout, "texts" | "lines">,
  opts: LayoutOptions,
  fontSize: number,
  m: PushMeasures,
  /** An end of one being drawn out, where the pointer is: that end of the arrow `of` there. */
  pointer?: { of: number; end: "from" | "to"; at: P },
): { push: PushArrow; shape: PushShape; from: PushEndAt; to: PushEndAt }[] {
  if (!pushes.length) return [];
  const labels = drawn.texts;
  const index = new Map(atoms.map((a, i) => [a.id, i]));
  const labelOf = new Map(labels.filter((t) => t.atom != null).map((t) => [t.atom!, t]));
  const bondOf = new Map(bonds.map((b) => [b.id, b]));
  const atomAt = (id: number) => {
    const i = index.get(id);
    return i == null ? null : atoms[i];
  };
  // which way each atom's bonds leave it
  const ways = new Map<number, { to: number; u: P }[]>();
  for (const b of bonds) {
    const p = atomAt(b.a);
    const q = atomAt(b.b);
    if (!p || !q) continue;
    const u = unit({ x: q.x - p.x, y: q.y - p.y });
    ways.set(b.a, [...(ways.get(b.a) ?? []), { to: b.b, u }]);
    ways.set(b.b, [...(ways.get(b.b) ?? []), { to: b.a, u: { x: -u.x, y: -u.y } }]);
  }
  // what the arrows keep clear of: the bonds' lines, the labels' boxes, the atoms
  const set = labelSetOf(opts);
  const scene: PushScene = {
    segments: bonds.flatMap((b) => {
      const p = atomAt(b.a);
      const q = atomAt(b.b);
      return p && q ? [[p, q] as const] : [];
    }),
    boxes: labels.map((t) => {
      const box = labelBox(t, fontSize, set);
      const on = t.atom != null ? atoms[t.atom] : t.markOf != null ? atoms[t.markOf] : undefined;
      return { min: { x: t.x - box.left, y: t.y - box.bottom }, max: { x: t.x + box.right, y: t.y + box.top }, ...(on ? { at: on } : {}) };
    }),
    atoms,
  };
  // (the bonds the arrows take electrons from, and so break)
  const broken = pushes.flatMap((q) => ("bond" in q.from && bondOf.get(q.from.bond) ? [bondOf.get(q.from.bond)!] : []));
  // an atom's marks as the drawing has them: its negative charge's and its radical's, each a middle and how far it reaches
  const marksOf = (i: number) => {
    const out: { charge?: { c: P; r: number }; radical?: { c: P; r: number } } = {};
    for (const t of labels) {
      if (t.atom !== i && t.markOf !== i) continue;
      for (const run of placeLabel(t, fontSize, set)) {
        if (run.mark === "radical") out.radical = markCircle(run);
        else if (run.mark === "charge" && run.text !== "+") out.charge = markCircle(run);
        // (a charge of more than one, written small beside its symbol: 2\u2212)
        else if (!run.mark && !run.sub && run.size < fontSize && /^\d*[\u2212-]$/.test(run.text)) {
          const m = markExtent([run], set);
          out.charge = { c: { x: m.x, y: m.y }, r: Math.max(m.halfW, m.halfH) };
        }
      }
    }
    return out;
  };
  const endAt = (e: PushEnd, tail: boolean, push: Pick<PushArrow, "half" | "fromPair" | "noPair">): PushEndAt | null => {
    if ("atom" in e) {
      const a = atomAt(e.atom);
      if (!a) return null;
      const out = ways.get(e.atom) ?? [];
      // (the side its label's H's are written on is taken, as a bond's is: a lone pair goes beside the symbol)
      const label = labelOf.get(index.get(e.atom)!);
      const written: P[] = [];
      if (label) {
        const box = labelBox(label, fontSize, set);
        const more = 0.3 * fontSize;
        if (box.right > box.left + more) written.push({ x: 1, y: 0 });
        if (box.left > box.right + more) written.push({ x: -1, y: 0 });
        if (box.top > box.bottom + more) written.push({ x: 0, y: 1 });
        if (box.bottom > box.top + more) written.push({ x: 0, y: -1 });
      }
      // (at its head, the bonds another arrow breaks there: it comes in from behind them)
      const losing = tail ? [] : broken.flatMap((b) => (b.a === e.atom || b.b === e.atom ? out.filter((w) => w.to === (b.a === e.atom ? b.b : b.a)).map((w) => w.u) : []));
      // (its tail: a radical's dot, a negative charge's mark, or a lone pair)
      const leaves = tail ? tailOf(a, push) : "pair";
      const marks = leaves === "pair" ? {} : marksOf(index.get(e.atom)!);
      const mark = leaves === "radical" ? marks.radical : leaves === "charge" ? marks.charge : undefined;
      return {
        atom: a,
        clear: clearOf(labelOf.get(index.get(e.atom)!), fontSize, opts, m.bondLength),
        pair: tail && !mark && !push.noPair && hasLonePair(a),
        ...(mark ? { mark } : {}),
        bonds: [...out.map((w) => w.u), ...written],
        ...(losing.length ? { losing } : {}),
      };
    }
    const ends = "bond" in e ? bondOf.get(e.bond) && [bondOf.get(e.bond)!.a, bondOf.get(e.bond)!.b] : e.gap;
    const p = ends && atomAt(ends[0]);
    const q = ends && atomAt(ends[1]);
    if (!p || !q) return null;
    if (!("bond" in e)) return { gap: [p, q] };
    // the bond as drawn: its lines along it, near its axis - its middle, and how far they reach either side
    const axis = unit({ x: q.x - p.x, y: q.y - p.y });
    const normal = { x: -axis.y, y: axis.x };
    const length = Math.hypot(q.x - p.x, q.y - p.y);
    const along = (x: number, y: number) => (x - p.x) * axis.x + (y - p.y) * axis.y;
    const off = (x: number, y: number) => (x - p.x) * normal.x + (y - p.y) * normal.y;
    const lines = drawn.lines.filter((l) => {
      const dx = l.x2 - l.x1;
      const dy = l.y2 - l.y1;
      const dl = Math.hypot(dx, dy);
      if (dl < 1e-9 || Math.abs(dx * axis.y - dy * axis.x) / dl > 0.09) return false;
      const t = along((l.x1 + l.x2) / 2, (l.y1 + l.y2) / 2);
      return t > 0 && t < length && Math.abs(off((l.x1 + l.x2) / 2, (l.y1 + l.y2) / 2)) < 0.35 * m.bondLength;
    });
    let middle: P | undefined;
    const reach = { left: m.thickness / 2, right: m.thickness / 2 };
    if (lines.length) {
      // (the middle of the line nearest its axis - shortened where a label stands at an end)
      const main = lines.reduce((b, l) => (Math.abs(off((l.x1 + l.x2) / 2, (l.y1 + l.y2) / 2)) < Math.abs(off((b.x1 + b.x2) / 2, (b.y1 + b.y2) / 2)) ? l : b));
      const t = (along(main.x1, main.y1) + along(main.x2, main.y2)) / 2;
      middle = { x: p.x + axis.x * t, y: p.y + axis.y * t };
      for (const l of lines) {
        const o = off((l.x1 + l.x2) / 2, (l.y1 + l.y2) / 2);
        reach.left = Math.max(reach.left, o + m.thickness / 2);
        reach.right = Math.max(reach.right, -o + m.thickness / 2);
      }
    }
    // (the side of the bond away from the rest of its structure: where its other bonds do not go)
    const [ia, ib] = ends;
    const others = [...(ways.get(ia) ?? []).filter((w) => w.to !== ib), ...(ways.get(ib) ?? []).filter((w) => w.to !== ia)];
    const n = unit({ x: -(q.y - p.y), y: q.x - p.x });
    const lean = others.reduce((sum, w) => sum + w.u.x * n.x + w.u.y * n.y, 0);
    return { bond: [p, q], ...(middle ? { middle } : {}), reach, ...(Math.abs(lean) > 1e-6 ? { outside: lean > 0 ? { x: -n.x, y: -n.y } : n } : {}) };
  };
  const free = (at: P): PushEndAt => ({ gap: [at, at] });
  // (each arrow keeps clear of those laid before it, as of the bonds: a leaving group's curl on the far side from the attack)
  const laid: (readonly [P, P])[] = [];
  const marks: P[] = [];
  return pushes.flatMap((push) => {
    const from = pointer?.of === push.id && pointer.end === "from" ? free(pointer.at) : endAt(push.from, true, push);
    const to = pointer?.of === push.id && pointer.end === "to" ? free(pointer.at) : endAt(push.to, false, { noPair: true });
    if (!from || !to) return [];
    const shape = pushShape(from, to, push.bend, { ...scene, segments: [...scene.segments, ...laid], arrows: marks }, m);
    if (!shape) return [];
    const pts = Array.from({ length: 13 }, (_, i) => pointAt(shape, i / 12));
    for (let i = 1; i < pts.length; i++) laid.push([pts[i - 1], pts[i]]);
    marks.push(...pts);
    return [{ push, shape, from, to }];
  });
}

/** Where an electron-pushing arrow drawn to `p` ends: the atom or the bond under the pointer, else the gap between two atoms not bonded whose middle `p` is near - where a bond forms - else nowhere. */
export function pushTargetAt(
  p: P,
  hovered: { atomId: number | null; bondId: number | null },
  atoms: readonly AtomAt[],
  bonds: readonly Pick<Bond, "id" | "a" | "b">[],
  bondLength: number,
): PushEnd | null {
  if (hovered.atomId != null) return { atom: hovered.atomId };
  if (hovered.bondId != null) return { bond: hovered.bondId };
  const L = bondLength;
  // (an atom or a bond at the pointer, where none is lit yet: the pointer came straight onto it)
  const part = partAt(p, atoms, bonds, L);
  if (part) return part;
  const near = atoms.filter((a) => Math.hypot(a.x - p.x, a.y - p.y) < 2.2 * L);
  if (near.some((a) => Math.hypot(a.x - p.x, a.y - p.y) < 0.45 * L)) return null;
  const bonded = new Set(bonds.map((b) => (b.a < b.b ? `${b.a}-${b.b}` : `${b.b}-${b.a}`)));
  let best: { gap: [number, number]; d: number } | null = null;
  for (let i = 0; i < near.length; i++)
    for (let j = i + 1; j < near.length; j++) {
      const a = near[i];
      const b = near[j];
      const apart = Math.hypot(a.x - b.x, a.y - b.y);
      if (apart < 0.6 * L || apart > 3.2 * L || bonded.has(a.id < b.id ? `${a.id}-${b.id}` : `${b.id}-${a.id}`)) continue;
      const d = Math.hypot((a.x + b.x) / 2 - p.x, (a.y + b.y) / 2 - p.y);
      if (d < 0.4 * L && (!best || d < best.d)) best = { gap: [a.id, b.id], d };
    }
  return best ? { gap: best.gap } : null;
}

/** The atom at `p` - within 0.35 of a bond of it - or else the bond, within a quarter of one of its line; none, else. */
export function partAt(p: P, atoms: readonly AtomAt[], bonds: readonly Pick<Bond, "id" | "a" | "b">[], bondLength: number): PushEnd | null {
  const L = bondLength;
  let atom: { id: number; d: number } | null = null;
  for (const a of atoms) {
    const d = Math.hypot(a.x - p.x, a.y - p.y);
    if (d < 0.35 * L && (!atom || d < atom.d)) atom = { id: a.id, d };
  }
  if (atom) return { atom: atom.id };
  const at = new Map(atoms.map((a) => [a.id, a]));
  let bond: { id: number; d: number } | null = null;
  for (const b of bonds) {
    const u = at.get(b.a);
    const v = at.get(b.b);
    if (!u || !v) continue;
    const dx = v.x - u.x;
    const dy = v.y - u.y;
    const t = Math.max(0, Math.min(1, ((p.x - u.x) * dx + (p.y - u.y) * dy) / Math.max(dx * dx + dy * dy, 1e-12)));
    const d = Math.hypot(u.x + t * dx - p.x, u.y + t * dy - p.y);
    if (d < 0.25 * L && (!bond || d < bond.d)) bond = { id: b.id, d };
  }
  return bond ? { bond: bond.id } : null;
}
