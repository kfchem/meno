/**
 * A structure laid out by Meno's own engine (lib/layout, docs/LAYOUT-2D.md):
 * what the engine is given - the graph, and the stereochemistry the drawing
 * shows, read out of it - and what its layout comes to as edits to the
 * drawing.
 *
 * The engine draws an H where a stereocentre needs one to carry its wedge,
 * and leaves it out elsewhere, so an H drawn on a stereocentre is taken as
 * that centre's H, not as an atom: laid out, it is kept if the engine draws
 * one there, and taken away if not. A cage comes out in perspective, its
 * atoms with a depth, its stereocentres shown by the drawing itself.
 *
 * The new drawing is read back before anything is changed: it has to say
 * the stereochemistry the old one said.
 */
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { labelTrims, layoutMolecule, showsLabel } from "../../../../lib/chem/layout2d";
import { chemistry } from "../../../../lib/chem/molecule";
import type { DrawingStyle } from "../../../../lib/chem/style";
import { readStereo, sameConfiguration } from "../../../../lib/layout/drawn";
import type { Layout2D, LayoutInput } from "../../../../lib/layout/engine";
import { etaBondedAtomByAtom, isMetal, type CisTrans } from "../../../../lib/layout/perceive";
import { allylCurve } from "../../../../lib/chem/allylArc";
import { allylChain } from "./eta";
import type { Tetrahedral } from "../../../../lib/layout/stereo";
import { relayout, emptyWorkspaceDocument, type Relayout } from "../document";
import type { Bond, Model } from "../store/types";
import { degrees, drawingOf, orientFor } from "./drawing";
import { editorLayoutOptions, layoutBonds } from "../layoutOptions";
import { greatest } from "../../../../lib/chem/lists";

export type LayoutJob = {
  input: LayoutInput;
  /** The model atom each of the input's atoms is - but the stars the engine is given for rings bound atom by atom, after them. */
  ids: number[];
  /** The bonds from a metal to each atom of a ring bound so, by their atoms' ids (`pairKey`): not the engine's, which has a star for them. */
  loose?: Set<string>;
  /** Each ring or chain bound so: its metal and its atoms, by id - made one bond to its centre as it is laid out. */
  bound?: { metal: number; atoms: number[] }[];
  /** The H atoms taken as their centre's own H, by the centre's input index. */
  folded: Map<number, number[]>;
};

/**
 * What the engine is given for `part`: its atoms (but for the H of its
 * stereocentres), their H, bonds and charges - none, as the editor has
 * none yet - and the stereochemistry the drawing shows.
 */
export function layoutJob(part: Model): LayoutJob {
  const drawing = drawingOf(part);
  const { tetra, cisTrans, axes } = readStereo(drawing.atoms, drawing.bonds);
  const bondsOf = new Map<number, number[]>();
  drawing.bonds.forEach((b, k) => {
    bondsOf.set(b.a, [...(bondsOf.get(b.a) ?? []), k]);
    bondsOf.set(b.b, [...(bondsOf.get(b.b) ?? []), k]);
  });
  // A wedge at an atom that could be a stereocentre, but says nothing the
  // engine can take - wedge and hashes drawn opposite each other, or an
  // atom with a lone pair for its fourth group (a sulfoxide's S): laid out,
  // it would be lost, so it is not laid out.
  for (const b of drawing.bonds) {
    const c = b.wedge?.narrow;
    // (an axis of chirality's end: its wedge says how the axis turns)
    if (c == null || tetra.has(c) || axes.some((ax) => ax.atoms[0] === c)) continue;
    if ((bondsOf.get(c)?.length ?? 0) >= 3 && drawing.atoms[c].hs <= 1) {
      throw new Error(
        `the wedges at ${part.atoms[c].el} do not say its configuration in a way Clean-up can keep ` +
          "(drawn crossed, or on an atom with a lone pair), so nothing was moved",
      );
    }
  }
  // an H on a stereocentre, bonded to nothing else: the centre's own
  const foldedInto = new Map<number, number>();
  part.atoms.forEach((a, h) => {
    const mine = bondsOf.get(h) ?? [];
    if (a.el !== "H" || mine.length !== 1) return;
    const b = drawing.bonds[mine[0]];
    const c = b.a === h ? b.b : b.a;
    if (b.order === 1 && part.atoms[c].el !== "H" && tetra.has(c)) foldedInto.set(h, c);
  });
  const kept = part.atoms.map((_, i) => i).filter((i) => !foldedInto.has(i));
  const at = new Map(kept.map((i, k) => [i, k]));
  const folded = new Map<number, number[]>();
  for (const [h, c] of foldedInto) folded.set(at.get(c)!, [...(folded.get(at.get(c)!) ?? []), part.atoms[h].id]);

  const configuration = (c: number): Tetrahedral | undefined => {
    const t = tetra.get(c);
    if (!t) return undefined;
    const order = t.neighbours.map((n) => (n === -1 || foldedInto.has(n) ? -1 : at.get(n)!));
    // the H last, as the engine has it: each place it moves turns the sense
    const h = order.indexOf(-1);
    if (h < 0) return { neighbours: order, volume: t.volume };
    const moves = order.length - 1 - h;
    const neighbours = [...order.slice(0, h), ...order.slice(h + 1), -1];
    return { neighbours, volume: (moves % 2 ? -t.volume : t.volume) as 1 | -1 };
  };
  // a star at a haptic bond's end: the pi system it stands for, which the
  // engine draws round it (a ring face-on to its metal), as it does a
  // written-out label's
  const pi = new Map<number, number[]>();
  for (const b of part.bonds) {
    if (!b.endpoints?.length || b.attach === "any") continue;
    const star = [b.a, b.b].map((id) => drawing.index.get(id)!).find((i) => i != null && part.atoms[i].el === "*");
    const atoms = b.endpoints.map((id) => drawing.index.get(id)).filter((i): i is number => i != null && at.has(i));
    if (star != null && atoms.length === b.endpoints.length) pi.set(star, atoms.map((i) => at.get(i)!));
  }
  const input: LayoutInput = {
    atoms: kept.map((i) => {
      const t = configuration(i);
      return {
        el: part.atoms[i].el,
        ...(part.atoms[i].charge ? { charge: part.atoms[i].charge } : {}),
        hs: drawing.atoms[i].hs + (folded.get(at.get(i)!)?.length ?? 0),
        ...(t ? { tetra: t } : {}),
        ...(pi.has(i) ? { pi: pi.get(i)! } : {}),
      };
    }),
    bonds: drawing.bonds.flatMap((b, k) => {
      if (foldedInto.has(b.a) || foldedInto.has(b.b)) return [];
      const ct = cisTrans.get(k);
      const stereo: CisTrans | undefined =
        ct && at.has(ct.refs[0]) && at.has(ct.refs[1])
          ? { refs: [at.get(ct.refs[0])!, at.get(ct.refs[1])!], cis: ct.cis }
          : undefined;
      return [{ a: at.get(b.a)!, b: at.get(b.b)!, order: b.order, ...(stereo ? { stereo } : {}) }];
    }),
    ...(axes.length
      ? {
          axes: axes.map((ax) => ({
            atoms: [at.get(ax.atoms[0])!, at.get(ax.atoms[1])!] as const,
            refs: [at.get(ax.refs[0])!, at.get(ax.refs[1])!] as const,
            sense: ax.sense,
          })),
        }
      : {}),
  };
  const ids = kept.map((i) => part.atoms[i].id);
  // A ring bound to a metal atom by atom - ferrocene drawn by hand, a bond
  // from the iron to each carbon - or a chain of three or more (an allyl)
  // is given to the engine as a haptic bond's is, a star at its centre
  // bonded to the metal, and laid out face-on (the maintainer, 2026-10-13);
  // laid out, the bonds to its atoms become that one bond (chem/eta, the
  // maintainer, 2026-10-17).
  const bound = etaBondedAtomByAtom(input);
  if (!bound.length) return { input, ids, folded };
  const dropped = new Set(bound.flatMap((r) => r.bonds));
  const atoms = [...input.atoms];
  const bonds = input.bonds.filter((_, i) => !dropped.has(i));
  for (const r of bound) {
    atoms.push({ el: "*", hs: 0, pi: r.ring });
    bonds.push({ a: atoms.length - 1, b: r.metal, order: 1 });
  }
  const loose = new Set(bound.flatMap((r) => r.ring.map((a) => pairKey(ids[a], ids[r.metal]))));
  const systems = bound.map((r) => ({ metal: ids[r.metal], atoms: r.ring.map((a) => ids[a]) }));
  return { input: { ...input, atoms, bonds }, ids, folded, loose, bound: systems };
}

const pairKey = (p: number, q: number) => (p < q ? `${p},${q}` : `${q},${p}`);

/**
 * The engine's layout of `job` as edits to `model`: the part where it was
 * - its middle kept - but laid out afresh, at the drawing's own bond length;
 * its wedges, and only those, the ones the engine draws; each H the engine
 * draws the centre's own, where it had one, and new where not; the rest of
 * its H taken away. Given the drawing's `style`, a bond from a label to one
 * at a terminal atom is drawn long enough for the two (roomForLabels).
 * Throws, changing nothing, if the new drawing would not say the
 * stereochemistry the old one said.
 */
export function relayoutFrom(model: Model, part: Model, job: LayoutJob, laid: Layout2D, style?: DrawingStyle): Relayout {
  const { input, ids } = job;
  // (the drawing's own atoms: the stars given for rings bound atom by atom are not)
  const n = ids.length;
  const byId = new Map(model.atoms.map((a) => [a.id, a]));
  // at the drawing's own bond length: each bond as drawn against as the
  // engine has it (a bond to a metal longer, a ring in perspective's
  // shorter, in both), the middle one of those
  const indexOf = new Map(ids.map((id, i) => [id, i]));
  const lengths = part.bonds
    .filter((b) => !job.loose?.has(pairKey(b.a, b.b)))
    .map((b) => {
      const p = byId.get(b.a);
      const q = byId.get(b.b);
      const u = indexOf.get(b.a);
      const v = indexOf.get(b.b);
      if (!p || !q || u == null || v == null) return 0;
      const engine = Math.hypot(laid.x[u] - laid.x[v], laid.y[u] - laid.y[v]);
      return engine > 0.3 ? Math.hypot(p.x - q.x, p.y - q.y) / engine : 0;
    })
    .filter((l) => l > 0)
    .sort((p, q) => p - q);
  const k = lengths[lengths.length >> 1] || NOMINAL_BOND_LENGTH;
  const was = ids.map((id) => byId.get(id)!);
  const mid = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / (xs.length || 1);
  const ox = mid(was.map((a) => a.x));
  const oy = mid(was.map((a) => a.y));
  const nx = mid(laid.x.slice(0, n));
  const ny = mid(laid.y.slice(0, n));
  const place = (x: number, y: number) => ({ x: ox + (x - nx) * k, y: oy + (y - ny) * k });

  const atoms: Relayout["atoms"] = ids.map((id, i) => ({
    id,
    ...place(laid.x[i], laid.y[i]),
    ...(laid.depth[i] != null ? { z: laid.depth[i]! * k } : {}),
    ...(laid.solid[i] && input.atoms[i].tetra ? { stereoCentre: true } : {}),
  }));
  // each star at its pi system's centre, as a written-out label's: cod's
  // C=C, as well as a ring
  input.atoms.forEach((a, i) => {
    if (i < n && a.pi?.length) atoms[i] = { ...atoms[i], x: mid(a.pi.map((j) => atoms[j].x)), y: mid(a.pi.map((j) => atoms[j].y)) };
  });
  // the H the engine draws: a centre's own where it had one
  const spare = new Map([...job.folded].map(([c, hs]) => [c, [...hs]]));
  const hydrogenOf = new Map<number, number | { added: number }>();
  const added: NonNullable<Relayout["added"]> = [];
  for (const h of laid.hydrogens) {
    const own = spare.get(h.on)?.shift();
    const p = place(h.at.x, h.at.y);
    if (own != null) {
      atoms.push({ id: own, ...p });
      hydrogenOf.set(h.on, own);
    } else {
      hydrogenOf.set(h.on, { added: added.length });
      added.push({ ...p, on: ids[h.on], stereo: "none", stereoOrient: "principle" });
    }
  }
  const removed = [...spare.values()].flat();

  // the wedges: those the engine draws, and no others in the part
  const gone = new Set(removed);
  const inPart = new Set(part.atoms.map((a) => a.id));
  const finalBonds: Pick<Bond, "a" | "b">[] = [
    ...model.bonds.filter((b) => !gone.has(b.a) && !gone.has(b.b)),
    ...added.map((h, i) => ({ a: h.on, b: -1 - i })),
  ];
  const degree = degrees(finalBonds);
  const wedgeOn = new Map<number, { stereo: "up" | "down"; narrow: number }>();
  for (const w of laid.wedges) {
    const from = ids[w.from];
    const to = w.to === -1 ? hydrogenOf.get(w.from)! : ids[w.to];
    if (typeof to === "object") {
      const h = added[to.added];
      h.stereo = w.stereo;
      h.stereoOrient = orientFor({ a: h.on, b: -1 - to.added, order: 1 }, from, degree);
      continue;
    }
    const bond = model.bonds.find((b) => (b.a === from && b.b === to) || (b.a === to && b.b === from));
    // (a wedge on a single bond only: one put on a double or triple bond - at an atom with too many bonds, say - is no wedge)
    if (bond && bond.order === 1) wedgeOn.set(bond.id, { stereo: w.stereo, narrow: from });
  }
  // a ring in perspective (face-on to a metal, or turned on its bond): its
  // near edges bold, a bond toward the viewer a wedge narrow at its far
  // end, the rest of it plain
  const boldOnes = new Set(laid.bold.map(([u, v]) => pairKey(ids[u], ids[v])));
  // (and a cluster's metals in contact, dashed)
  const dashedOnes = new Set(laid.dashed.map(([u, v]) => pairKey(ids[u], ids[v])));
  const farEnd = new Map(laid.toward.map(([u, v]) => [pairKey(ids[u], ids[v]), ids[u]]));
  const display = (b: Bond): Pick<Bond, "display" | "stereoOrient"> | null => {
    const u = indexOf.get(b.a);
    const v = indexOf.get(b.b);
    if (u == null || v == null || laid.depth[u] == null || laid.depth[v] == null || b.endpoints?.length) return null;
    const key = pairKey(b.a, b.b);
    const far = farEnd.get(key);
    if (far != null) {
      const stereoOrient = orientFor(b, far, degree);
      return b.display === "wedge" && b.stereoOrient === stereoOrient ? null : { display: "wedge", stereoOrient };
    }
    const want = boldOnes.has(key) ? "bold" : dashedOnes.has(key) ? "dashed" : undefined;
    return want === b.display || (!want && b.display !== "bold" && b.display !== "wedge") ? null : { display: want };
  };
  const bonds: Relayout["bonds"] = model.bonds.flatMap((b): Relayout["bonds"] => {
    if (!inPart.has(b.a) || !inPart.has(b.b) || gone.has(b.a) || gone.has(b.b)) return [];
    const w = wedgeOn.get(b.id);
    const d = display(b);
    if (w) return [{ id: b.id, stereo: w.stereo, stereoOrient: orientFor(b, w.narrow, degree), ...d }];
    if (b.stereo === "up" || b.stereo === "down") return [{ id: b.id, stereo: "none", stereoOrient: "principle", ...d }];
    if (d) return [{ id: b.id, stereo: b.stereo, stereoOrient: b.stereoOrient, ...d }];
    return [];
  });
  // each η3-allyl posed as the maintainer draws one (2026-10-18): its
  // middle carbon away from its metal, its arc towards it
  const systems = [
    ...(job.bound ?? []),
    ...part.bonds.flatMap((b) => {
      if (!b.endpoints?.length || b.attach === "any") return [];
      const star = byId.get(b.b)?.el === "*" ? b.b : b.a;
      return [{ metal: star === b.b ? b.a : b.b, atoms: b.endpoints, star }];
    }),
  ];
  poseAllyls(atoms, added, part, systems, style);
  // each ring or chain bound to its metal atom by atom: one bond to its
  // centre - an allyl's, its arc's middle - for the bonds to its atoms (chem/eta)
  const eta: NonNullable<Relayout["eta"]> = [];
  if (job.bound?.length) {
    const placedAt = new Map(atoms.map((a) => [a.id, a]));
    for (const sys of job.bound) {
      const inSys = new Set(sys.atoms);
      const drop = part.bonds.filter((b) => (b.a === sys.metal && inSys.has(b.b)) || (b.b === sys.metal && inSys.has(b.a))).map((b) => b.id);
      const at = sys.atoms.map((id) => placedAt.get(id)!);
      const chain = allylChain({ endpoints: sys.atoms }, part.bonds);
      const metal = placedAt.get(sys.metal);
      const centre = chain && metal ? allylCurve(placedAt.get(chain[0])!, placedAt.get(chain[1])!, placedAt.get(chain[2])!).middle : { x: mid(at.map((a) => a.x)), y: mid(at.map((a) => a.y)) };
      eta.push({ metal: sys.metal, atoms: sys.atoms, bonds: drop, ...centre });
    }
  }
  const dropped = new Set(eta.flatMap((e) => e.bonds));
  const change: Relayout = { atoms, bonds: dropped.size ? bonds.filter((b) => !dropped.has(b.id)) : bonds, added, removed, ...(eta.length ? { eta } : {}) };
  if (style) roomForLabels(part, change, style);
  if (!saysTheSame(part, change)) {
    throw new Error("the structure could not be laid out keeping its stereochemistry, so nothing was moved");
  }
  return change;
}

/**
 * Each η3-allyl among `systems` (a metal and the atoms it binds as one -
 * three in a chain) posed as the maintainer draws one (2026-10-18): the
 * ligand it is part of - what is bonded to it, but for its metal - turned
 * whole about the middle of its end carbons so that its middle carbon
 * points away from its metal - its delocalisation curve (lib/chem/allylArc)
 * inside it, on the metal's side - and moved so that the metal's line is
 * seen `LINE_SEEN` of the drawing's bond long, from past the metal's label
 * (as the style draws it, whichever way it reaches) to short of the
 * curve. A
 * ligand bonded to another metal too, or to its own by another way, is left
 * as it is laid out. `atoms` and `added` (hydrogens new to the drawing) are
 * moved in place.
 */
/** How long the metal's line to an η3-allyl's curve is seen after Clean-up, as a share of the drawing's bond. */
const LINE_SEEN = 0.7;

function poseAllyls(
  atoms: Relayout["atoms"],
  added: NonNullable<Relayout["added"]>,
  part: Model,
  systems: readonly { metal: number; atoms: readonly number[]; star?: number }[],
  style?: DrawingStyle,
): void {
  if (!systems.length) return;
  // (where the metal's line starts, past its label, and where it stops, short of the curve: as the drawing will have them)
  const opts = style ? editorLayoutOptions(style, { minLinePx: 0 }) : null;
  const zoom = style ? (style.bondLengthPt * 96) / 72 / NOMINAL_BOND_LENGTH : 1;
  const past = (metalEl: string, u: { x: number; y: number }) =>
    opts
      ? labelTrims([{ id: 0, x: 0, y: 0, el: metalEl }, { id: 1, x: u.x, y: u.y, el: "*" }], { a1: 0, a2: 1, order: 1, endpoints: [1] }, opts, zoom).a
      : null;
  const margin = opts ? (opts.labelMarginPx ?? opts.fontPx * 0.16) : 0;
  const el = new Map(part.atoms.map((a) => [a.id, a.el]));
  const at = new Map(atoms.map((a, i) => [a.id, i]));
  // (the drawing's bond, as laid out: the middle length of its bonds between atoms that are no metal and no star)
  const plain = (id: number) => !isMetal(el.get(id) ?? "") && el.get(id) !== "*";
  const lengths = part.bonds
    .filter((b) => !b.endpoints?.length && plain(b.a) && plain(b.b) && at.has(b.a) && at.has(b.b))
    .map((b) => Math.hypot(atoms[at.get(b.a)!].x - atoms[at.get(b.b)!].x, atoms[at.get(b.a)!].y - atoms[at.get(b.b)!].y))
    .sort((p, q) => p - q);
  const bond = lengths[lengths.length >> 1] || NOMINAL_BOND_LENGTH;
  for (const sys of systems) {
    const chain = allylChain({ endpoints: [...sys.atoms] }, part.bonds);
    const mi = at.get(sys.metal);
    if (!chain || mi == null || chain.some((id) => !at.has(id))) continue;
    // the ligand: what is bonded to the chain, not through a metal or a haptic bond
    const ligand = new Set<number>(chain);
    const queue = [...chain];
    let alone = true;
    while (queue.length && alone) {
      const u = queue.shift()!;
      for (const b of part.bonds) {
        if (b.endpoints?.length || (b.a !== u && b.b !== u)) continue;
        const v = b.a === u ? b.b : b.a;
        if (v === sys.metal || ligand.has(v)) continue;
        if (isMetal(el.get(v) ?? "")) {
          alone = false;
          break;
        }
        ligand.add(v);
        queue.push(v);
      }
    }
    if (!alone) continue;
    const p = (id: number) => atoms[at.get(id)!];
    const [e1, m, e2] = chain.map(p);
    const metal = atoms[mi];
    const chord = Math.hypot(e2.x - e1.x, e2.y - e1.y);
    if (chord < 1e-9) continue;
    const c = { x: (e1.x + e2.x) / 2, y: (e1.y + e2.y) / 2 };
    // (towards the ligand from its metal, and the way its middle carbon points now)
    const cx = (e1.x + m.x + e2.x) / 3 - metal.x;
    const cy = (e1.y + m.y + e2.y) / 3 - metal.y;
    const d = Math.hypot(cx, cy);
    if (d < 1e-9) continue;
    const u = { x: cx / d, y: cy / d };
    const theta = Math.atan2(u.y, u.x) - Math.atan2(m.y - c.y, m.x - c.x);
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    // (turned about the end carbons' middle; then moved so that the metal's line is seen LINE_SEEN of a bond long between
    // its label and the curve - a label reaching further one side than the other, Pd's "d", taken as drawn; with no style,
    // the curve's middle a bond and a half from the metal)
    const turn = (q: { x: number; y: number }) => {
      const x = q.x - c.x;
      const y = q.y - c.y;
      return { x: c.x + x * cos - y * sin, y: c.y + x * sin + y * cos };
    };
    const [t1, tm, t2] = [e1, m, e2].map(turn);
    const middle = allylCurve(t1, tm, t2).middle;
    const start = past(el.get(sys.metal) ?? "", u);
    const far = start == null ? 1.5 * bond : start + LINE_SEEN * bond + margin;
    const shift = { x: metal.x + u.x * far - middle.x, y: metal.y + u.y * far - middle.y };
    const move = (q: { x: number; y: number }) => {
      const r = turn(q);
      return { x: r.x + shift.x, y: r.y + shift.y };
    };
    for (const id of ligand) {
      const i = at.get(id);
      if (i != null) atoms[i] = { ...atoms[i], ...move(atoms[i]) };
    }
    for (const h of added) if (ligand.has(h.on)) Object.assign(h, move(h));
    if (sys.star != null && at.has(sys.star)) {
      const [f1, fm, f2] = chain.map(p);
      atoms[at.get(sys.star)!] = { ...atoms[at.get(sys.star)!], ...allylCurve(f1, fm, f2).middle };
    }
  }
}

/**
 * A bond from a label to a label at a terminal atom - O-3H, Mg-Br - drawn
 * long enough for the two to keep their margins: where they would take
 * more of it than their room (lib/chem/layout2d `labelTrims`, as drawing it
 * goes by), the terminal atom set out along it until they fit. The engine
 * lays out bonds of one length, knowing nothing of a style's labels; this is
 * Clean-up's, never done to a bond as drawn. Its way out stays as it was,
 * and so does what any centre says.
 */
function roomForLabels(part: Model, change: Relayout, style: DrawingStyle): void {
  // (none drawn out unless a label at a terminal atom has a label beside it: most structures have none)
  const opts = editorLayoutOptions(style, { minLinePx: 0 });
  const labelled = new Set(part.atoms.filter((a) => showsLabel({ el: a.el, ...chemistry(a) }, opts)).map((a) => a.id));
  const ends = degrees(part.bonds);
  if (!part.bonds.some((b) => labelled.has(b.a) && labelled.has(b.b) && (ends.get(b.a) === 1 || ends.get(b.b) === 1))) return;
  const after = relayout({ ...emptyWorkspaceDocument(), model: part, nextId: nextFree(part) }, change).model;
  const crowded = drawnAs(after, style).crowded;
  if (!crowded?.length) return;
  const degree = degrees(after.bonds);
  const at = new Map(after.atoms.map((a) => [a.id, a]));
  const placed = new Map(change.atoms.map((a, i) => [a.id, i]));
  for (const { atoms: [p, q], need } of crowded) {
    const end = degree.get(q) === 1 ? q : degree.get(p) === 1 ? p : null;
    const k = end != null ? placed.get(end) : undefined;
    if (end == null || k == null) continue;
    const from = at.get(end === q ? p : q)!;
    const to = at.get(end)!;
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    if (length < 1e-9 || need <= length) continue;
    // (a hair over, so that the two are seen to fit, not to share what is left)
    const s = (need * (1 + 1e-6)) / length;
    change.atoms[k] = { ...change.atoms[k], x: from.x + (to.x - from.x) * s, y: from.y + (to.y - from.y) * s };
  }
}

/** `m` laid out as the canvas draws it in `style`: its labels where they are drawn, and the bonds they crowd. */
function drawnAs(m: Model, style: DrawingStyle) {
  const atoms = m.atoms.map((a) => ({
    id: a.id,
    x: a.x,
    y: a.y,
    el: a.el,
    ...chemistry(a),
    ...(a.z != null ? { z: a.z } : {}),
    ...(a.chargeAt ? { chargeAt: a.chargeAt } : {}),
  }));
  const bonds = layoutBonds(m.bonds, new Map(m.atoms.map((a, i) => [a.id, i])));
  // (at the style's own size on the page, as a picture of it is made)
  return layoutMolecule(atoms, bonds, editorLayoutOptions(style, { minLinePx: 0 }), (style.bondLengthPt * 96) / 72 / NOMINAL_BOND_LENGTH);
}

/** Whether `part`, changed as `change` has it, shows the stereochemistry it shows now. */
function saysTheSame(part: Model, change: Relayout): boolean {
  const doc = { ...emptyWorkspaceDocument(), model: part, nextId: nextFree(part) };
  const before = stereoOf(part);
  const now = stereoOf(relayout(doc, change).model);
  for (const [c, t] of before.centres) {
    const u = now.centres.get(c);
    if (!u || !sameConfiguration(t, u)) return false;
  }
  for (const [key, d] of before.doubles) {
    const e = now.doubles.get(key);
    // (read against the other group on an end, the reading turns)
    if (!e || (e.cis !== d.cis) !== ((e.refs[0] !== d.refs[0]) !== (e.refs[1] !== d.refs[1]))) return false;
  }
  for (const [key, sense] of before.axes) if (now.axes.get(key) !== sense) return false;
  return true;
}

/**
 * The stereochemistry `m` shows, by atom id: an H drawn on its own on a
 * centre counted as the centre's H (-1), each double bond's groups given
 * from its lower id's end first, and each axis's sense taken against the
 * lowest-id neighbour at each end.
 */
function stereoOf(m: Model) {
  const d = drawingOf(m);
  const ids = m.atoms.map((a) => a.id);
  const { tetra, cisTrans, axes: drawnAxes } = readStereo(d.atoms, d.bonds);
  const degree = degrees(m.bonds);
  const asId = (n: number) => (n === -1 || (m.atoms[n].el === "H" && degree.get(ids[n]) === 1) ? -1 : ids[n]);
  const centres = new Map<number, Tetrahedral>(
    [...tetra].map(([c, t]) => [ids[c], { neighbours: t.neighbours.map(asId), volume: t.volume }]),
  );
  const doubles = new Map<string, { refs: [number, number]; cis: boolean }>();
  for (const [k, ct] of cisTrans) {
    const b = d.bonds[k];
    const [a, z] = [ids[b.a], ids[b.b]];
    const refs: [number, number] = a < z ? [ids[ct.refs[0]], ids[ct.refs[1]]] : [ids[ct.refs[1]], ids[ct.refs[0]]];
    doubles.set(a < z ? `${a},${z}` : `${z},${a}`, { refs, cis: ct.cis });
  }
  const others = (x: number, not: number) => d.bonds.flatMap((b) => (b.a === x && b.b !== not ? [b.b] : b.b === x && b.a !== not ? [b.a] : []));
  const lowest = (x: number, not: number) => others(x, not).reduce((p, q) => (ids[p] < ids[q] ? p : q));
  const axes = new Map<string, number>();
  for (const ax of drawnAxes) {
    const [i, j] = ax.atoms;
    // (against the other neighbour at an end, the sense turns)
    const sense = ax.sense * (ax.refs[0] === lowest(i, j) ? 1 : -1) * (ax.refs[1] === lowest(j, i) ? 1 : -1);
    axes.set(ids[i] < ids[j] ? `${ids[i]},${ids[j]}` : `${ids[j]},${ids[i]}`, sense);
  }
  return { centres, doubles, axes };
}

/** The first id no atom or bond of `model` has. */
export function nextFree(model: Model): number {
  return Math.max(0, greatest(model.atoms.map((a) => a.id)), greatest(model.bonds.map((b) => b.id))) + 1;
}
