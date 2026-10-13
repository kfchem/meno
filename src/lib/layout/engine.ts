/**
 * Meno's own 2D layout: coordinates for a molecule from its graph alone,
 * by the rules in docs/LAYOUT-2D.md.
 *
 * Each ring system is laid out on its own first. Then, for each way of
 * setting the frame square on the lattice, the structure is grown out from
 * it, the free choices tried the other way where that reads better, and the
 * whole measured by the same rules the benchmark uses (metrics.ts); the
 * best is kept. Bonds come out of length 1.
 */
import {
  flip,
  framesFor,
  flippable,
  grow,
  tridentEnds,
  sideAtoms,
  sidesOf,
  stretchSide,
  turnSide,
  type Frame,
  type Grown,
} from "./assemble";
import { angleOf, dist, mirror, segmentsCross, sub } from "./geometry";
import { hydrogenRunsInto, hydrogenSpot, layoutMetrics, type LayoutMetrics } from "./metrics";
import { atomDepth, boxesDepth, isName, namesLaid, segmentMeetsBox } from "./names";
import { isMetal, orderOf, perceive, type LayoutInput, type Molecule, type RingSystem } from "./perceive";
import { extendRingSystem, misshapen, narrowGap, placeRingSystem, regularize, ringSystemVariants } from "./ringSystem";
import { bridgeAcross } from "./bridge";
import { canonicalOrder, reordered, restored } from "./canonical";
import { affineFit, axialOut, cageCore, flatCost, isCage, keepsConfigurations, projectCage, shownBySolid, solidOf, templateOnBond, type CageView } from "./cage";
import { ringShape } from "./conformation";
import { readStereo, sameConfiguration, type DrawnAtom, type DrawnBond } from "./drawn";
import { axisWedge, placeStereo, type Stereo, type Tetrahedral } from "./stereo";
import { etaSpins, PAIR_DEPTH, placeEta, placeUnit, unitVariants } from "./hapto";
import type { Point } from "./geometry";

export type { LayoutInput } from "./perceive";

export type Layout2D = {
  x: number[];
  y: number[];
  /**
   * How near each atom of a cage drawn in perspective is to the viewer
   * (null elsewhere): a bond passing behind another is drawn broken there.
   */
  depth: (number | null)[];
  /**
   * The atoms of a cage drawn as the solid it is: its rings foreshortened,
   * its stereochemistry shown by the drawing itself rather than by wedges.
   */
  solid: boolean[];
  /**
   * The bonds drawn bold, by their atoms: the near edges of a ring seen in
   * perspective - one bound face-on to a metal, or turned on its bond
   * (section 7).
   */
  bold: [number, number][];
  /**
   * The bonds of a ring in perspective that run from its far half toward
   * the viewer, drawn as wedges: [its narrow, far end; its broad, near one].
   */
  toward: [number, number][];
  /** The bonds between a cluster's metals - contacts, as they are written - drawn dashed. */
  dashed: [number, number][];
} & Stereo;

export function layout2D(input: LayoutInput): Layout2D {
  // (laid out in the molecule's own order, and handed back in the order
  // given: the same molecule drawn with its atoms in any order comes out
  // the same - aconitine's ring A a chair or a boat by that order, once)
  const to = canonicalOrder(input);
  return restored(layoutInOrder(reordered(input, to)), to);
}

function layoutInOrder(input: LayoutInput): Layout2D {
  // Drawn, then read back as Meno reads a drawing (drawn.ts): a ring system
  // drawn as a solid whose stereocentres do not read as given - a bond out
  // of it drawn nearer the other of the two ways the solid leaves free than
  // the one it is - is drawn again, first without its view from the other
  // side, then flat. Clean-up never hands back a solid of another molecule.
  //
  // And a ring system drawn as a solid because it lies flat only with a
  // fault - not a cage, which is always drawn so - is kept a solid only
  // where the whole drawing, its substituents and their labels counted,
  // reads at least as well as with it flat: a solid seen from its best side
  // can still crowd what hangs from it (ginkgolide B's OHs).
  // And the other way: one drawn flat with a fault, where a solid would do,
  // is drawn as the solid too, and that kept where it reads better.
  const redo: Redo = { alone: new Set(), flat: new Set(), solid: new Set() };
  for (;;) {
    const { out, mol, solidToo } = laidOut(input, redo);
    const wrong = [...misread(input, mol, out)].filter((i) => !redo.flat.has(i));
    if (wrong.length) {
      for (const i of wrong) (redo.alone.has(i) ? redo.flat : redo.alone).add(i);
      continue;
    }
    let best = out;
    let bestScore = drawingScore(input, mol, out);
    const chosen = mol.systems.flatMap((sys, i) => (!redo.flat.has(i) && !isCage(mol, sys) && out.solid.some((s, a) => s && mol.systemOf[a] === i) ? [i] : []));
    if (chosen.length) {
      const flat = laidOut(input, { ...redo, flat: new Set([...redo.flat, ...chosen]) });
      const score = drawingScore(input, mol, flat.out);
      if (score < bestScore - 1e-9) [best, bestScore] = [flat.out, score];
    }
    // (only where the flat drawing has a fault a reader cannot miss - an
    // atom on another, bonds crossing: a solid reads better than that, but
    // not than a clean flat drawing, however the measure has them)
    const solids = solidToo.filter((i) => !redo.flat.has(i));
    if (solids.length && drawingFaults(input, mol, best) > 0) {
      const solid = laidOut(input, { ...redo, solid: new Set(solids) });
      const score = drawingScore(input, mol, solid.out);
      if (!misread(input, solid.mol, solid.out).size && score < bestScore - 1e-9) [best, bestScore] = [solid.out, score];
    }
    return best;
  }
}

/**
 * How a whole drawing measures (`layoutMetrics`), as it will be drawn: the
 * H's its wedges stand on drawn as atoms, its wedges, its labels and their
 * H's counted.
 */
function measureDrawing(input: LayoutInput, mol: Molecule, out: Layout2D): LayoutMetrics {
  const x = [...out.x];
  const y = [...out.y];
  const edges: [number, number][] = input.bonds.map(({ a, b }) => [a, b]);
  const orders = input.bonds.map((b) => b.order);
  const elements = input.atoms.map((a) => a.el);
  const hydrogens = mol.hs.slice(0, input.atoms.length);
  const labelled = input.atoms.map((a, i) => (a.el !== "C" && a.el !== "*") || mol.charge[i] !== 0);
  const drawnH = new Map<number, number>();
  for (const h of out.hydrogens) {
    x.push(h.at.x);
    y.push(h.at.y);
    elements.push("H");
    hydrogens.push(0);
    labelled.push(true);
    edges.push([h.on, x.length - 1]);
    orders.push(1);
    hydrogens[h.on] = Math.max(0, hydrogens[h.on] - 1);
    drawnH.set(h.on, x.length - 1);
  }
  const wedged = out.wedges.flatMap((w) => {
    const to = w.to === -1 ? drawnH.get(w.from) : w.to;
    const e = edges.findIndex(([a, b]) => (a === w.from && b === to) || (b === w.from && a === to));
    return e >= 0 ? [e] : [];
  });
  return layoutMetrics({
    x,
    y,
    edges,
    orders,
    wedged,
    labelled,
    elements,
    hydrogens,
    cisTrans: input.bonds.flatMap((b, i) => (b.stereo ? [{ bond: i, refs: b.stereo.refs, cis: b.stereo.cis }] : [])),
    perspective: [...out.solid, ...out.hydrogens.map(() => false)],
    depth: [...out.depth, ...out.hydrogens.map(() => null)],
    tetra: input.atoms.map((a) => a.tetra),
  });
}

/** How well a whole drawing reads (`measureDrawing`). */
function drawingScore(input: LayoutInput, mol: Molecule, out: Layout2D): number {
  return measureDrawing(input, mol, out).score;
}

/** How many faults a reader cannot miss a whole drawing has: atoms on atoms, bonds crossing. */
function drawingFaults(input: LayoutInput, mol: Molecule, out: Layout2D): number {
  const m = measureDrawing(input, mol, out);
  return m.overlaps + m.crossings;
}

/** How much better another view of a cage must read than its best textbook view to be taken instead. */
const CAGE_VIEW_MARGIN = 3;

/** The ring systems drawn again: without their view from the other side, flat, or as a solid where they would be flat. */
type Redo = { alone: Set<number>; flat: Set<number>; solid: Set<number> };

function laidOut(input: LayoutInput, redo: Redo): { out: Layout2D; mol: Molecule; solidToo: number[] } {
  const mol = perceive(input);
  const local = new Map<number, Map<number, Point>>();
  const depth = new Array<number | null>(mol.n).fill(null);
  const hints = new Map<number, Map<number, Point>>();
  // the cages drawn in perspective: kept upright, as drawn
  const upright = new Set<number>();
  const solid = new Array<boolean>(mol.n).fill(false);
  // and each seen from its other side, for a frame set down mirrored
  const others = new Map<number, Omit<CageView, "other">>();
  // a ring bound face-on to a metal: laid out by its own rule, spun about
  // its axis as a macrocycle's shapes are tried; how far across its plane
  // each of its atoms is, for its near edges
  // (and a metal with its rings, as one)
  const unitOf = new Map(mol.units.map((u) => [u.system, u]));
  const etaOf = new Map(mol.eta.filter((e) => !unitOf.has(e.system)).map((e) => [e.system, e]));
  const lifts = new Map<number, number>();
  const hintsM = new Map<number, Map<number, Point>>();
  // a cage seen from each of its best few sides, chosen among as a
  // macrocycle's shapes are, by what hangs from it (quinine's quinuclidine)
  const cageViews = new Map<number, CageView[]>();
  // (the systems drawn flat that a solid would do for too)
  const solidToo: number[] = [];
  const variantsOf = (i: number) => {
    const e = etaOf.get(i);
    const u = unitOf.get(i);
    const views = cageViews.get(i);
    return views ? views.length : e ? etaSpins(mol, e) : u ? unitVariants(mol, u) : ringSystemVariants(mol, mol.systems[i]);
  };
  const setVariant = (i: number, v: number) => {
    const views = cageViews.get(i);
    if (views) {
      const view = views[v];
      local.set(i, view.pos);
      view.depth.forEach((d, a) => (depth[a] = d));
      view.hints.forEach((m, a) => (hints.set(a, m), hintsM.set(a, m)));
      if (view.other && !redo.alone.has(i)) {
        others.set(i, view.other);
        view.other.hints.forEach((m, a) => hintsM.set(a, m));
      } else others.delete(i);
      return;
    }
    const e = etaOf.get(i);
    const u = unitOf.get(i);
    if (!e && !u) return void local.set(i, placeRingSystem(mol, mol.systems[i], v));
    const laid = u ? placeUnit(mol, u, v) : placeEta(mol, e!, v);
    local.set(i, laid.pos);
    laid.hints.forEach((m, a) => (hints.set(a, m), hintsM.set(a, m)));
    laid.lift.forEach((l, a) => lifts.set(a, l));
  };
  mol.systems.forEach((sys, i) => {
    if (etaOf.has(i) || unitOf.has(i)) return setVariant(i, 0);
    const laid = redo.flat.has(i) ? layoutFlat(mol, sys) : layoutSystem(mol, i, redo.solid.has(i));
    if (laid.solidToo) solidToo.push(i);
    local.set(i, laid.pos);
    laid.depth?.forEach((d, a) => (depth[a] = d));
    laid.hints?.forEach((m, a) => hints.set(a, m));
    if (laid.solid || laid.solidAtoms) {
      upright.add(i);
      for (const a of laid.solidAtoms ?? sys.atoms) solid[a] = true;
      if (laid.other && !redo.alone.has(i)) others.set(i, laid.other);
      if (laid.views && laid.views.length > 1) cageViews.set(i, laid.views);
    }
  });
  // what is measured as drawn in perspective: a cage, and a ring bound
  // face-on (foreshortened, not misshapen)
  const faceOn = new Set([
    ...mol.eta.flatMap((e) => e.atoms),
    ...mol.dienes.flatMap((d) => d.atoms),
    // (and a cluster, a solid)
    ...mol.units.flatMap((u) => (u.cluster ? [...u.cluster.metals, ...u.cluster.bridges] : [])),
  ]);
  const measured = solid.map((s, a) => s || faceOn.has(a));
  // what a frame grows from: in a mirrored one, each cage seen from its
  // other side
  hints.forEach((m, a) => hintsM.has(a) || hintsM.set(a, m));
  for (const view of others.values()) view.hints.forEach((m, a) => hintsM.set(a, m));
  const setUp = (frame: Frame) => {
    if (!frame.mirrored || !others.size) return { L: local, H: hints };
    const L = new Map(local);
    for (const [i, view] of others) L.set(i, view.pos);
    return { L, H: hintsM };
  };
  // (nor is a ring bound face-on turned or mirrored on its own: it stays
  // square to its metal)
  const fixed = (atoms: readonly number[]) =>
    atoms.some((a) => upright.has(mol.systemOf[a]) || etaOf.has(mol.systemOf[a]) || unitOf.has(mol.systemOf[a]));
  const sides = sidesOf(mol);
  // (a flip mirrors a side across a bond's line, which would tip a cage over)
  const flips = flippable(mol, sides).filter(([a, b]) => {
    const beyondB = sides.get(`${a}>${b}`) ?? 0;
    const beyondA = sides.get(`${b}>${a}`) ?? 0;
    const [from, to] = beyondB <= beyondA ? [a, b] : [b, a];
    return !fixed(sideAtoms(mol, from, to));
  });
  // and the two groups on a ring atom (a gem pair) each the other's way
  const swaps: [number, number, number][] = [];
  for (let a = 0; a < mol.n; a++) {
    const s = mol.systemOf[a];
    if (s < 0 || upright.has(s)) continue;
    const out = mol.neighbours[a].filter((b) => mol.systemOf[b] !== s);
    if (out.length === 2) swaps.push([a, out[0], out[1]]);
  }
  // a macrocycle's shape chosen for what hangs from it: each shape offered
  // tried, grown in every frame, and the best kept
  mol.systems.forEach((sys, i) => {
    const count = variantsOf(i);
    if (count < 2) return;
    const piece = mol.pieces.find((p) => p.includes(sys.atoms[0]))!;
    let best = 0;
    let bestScore = Infinity;
    const here = new Set(piece);
    const flipsHere = flips.filter(([a]) => here.has(a));
    const swapsHere = swaps.filter(([a]) => here.has(a));
    for (let v = 0; v < count; v++) {
      setVariant(i, v);
      // (measured as this one is drawn: a cage's depth is its view's)
      const score = scorer(mol, piece, depth, measured, 0, false);
      // the frame it grows best in - the best few, for a piece of up to
      // sixty atoms - each tried the other way and untangled where it helps:
      // substituents inside a macrocycle are crowded until then, and the
      // frame that reads best may not be the one that grew best
      const grown = framesFor(mol, piece)
        .map((frame) => {
          const { L, H } = setUp(frame);
          const pos = grow(mol, piece, L, frame, sides, H, upright);
          return { pos, score: score(pos) };
        })
        .sort((p, q) => p.score - q.score);
      for (const top of grown.slice(0, piece.length <= 60 ? 3 : 1)) {
        const better = improve(mol, top.pos, top.score, flipsHere, sides, score, false, swapsHere);
        // (a cage's textbook view kept unless another reads clearly better:
        // camphor as it is always drawn, not the other way round)
        const s = untangle(mol, piece, better.pos, better.score, score, fixed).score + (cageViews.has(i) && v ? CAGE_VIEW_MARGIN : 0);
        if (s < bestScore) {
          bestScore = s;
          best = v;
        }
      }
    }
    setVariant(i, best);
  });

  // the drawing each system ended up as
  const used = new Map(local);
  // the rings turned as a propeller's blades, by their atoms
  const turned: number[][] = [];
  const x = new Array<number>(mol.n).fill(0);
  const y = new Array<number>(mol.n).fill(0);
  // where the ink of the pieces set down so far ends, on the right
  let right: number | null = null;
  // the largest piece first, the rest after it to the right
  const pieces = [...mol.pieces].sort((p, q) => q.length - p.length);
  for (const piece of pieces) {
    // (a macrolide's sugars turned to their face, and room made for the
    // H's of labels and the letters of names, last: by turning a sugar
    // over on its link, and by moving bonds a little - an H on a label
    // counting then as much as a label on a label)
    const score = scorer(mol, piece, depth, measured, 0, false);
    const scoreH = scorer(mol, piece, depth, measured, 1);
    const here = new Set(piece);
    const flipsHere = flips.filter(([a]) => here.has(a));
    const swapsHere = swaps.filter(([a]) => here.has(a));
    const tried = framesFor(mol, piece).map((frame) => {
      const { L, H } = setUp(frame);
      const pos = grow(mol, piece, L, frame, sides, H, upright);
      return { pos, score: score(pos), mirrored: frame.mirrored };
    }).sort((p, q) => p.score - q.score);
    let best = tried[0];
    // every frame tried the other way where it helps, for a small piece;
    // the most promising few for a large one
    const worth = piece.length <= 80 ? tried.length : 4;
    const improved = tried
      .slice(0, worth)
      .map((cand) => ({
        ...improve(mol, cand.pos, cand.score, flipsHere, sides, score, false, swapsHere),
        mirrored: cand.mirrored,
      }))
      .sort((p, q) => p.score - q.score);
    // and the best few set right within their small sides - every one, for
    // a small piece
    for (const cand of improved.slice(0, piece.length <= 40 ? improved.length : 3)) {
      const deeper = {
        ...improve(mol, cand.pos, cand.score, flipsHere, sides, score, true, swapsHere),
        mirrored: cand.mirrored,
      };
      if (deeper.score < best.score - 1e-9) best = deeper;
    }
    best = { ...rejoin(mol, piece, best.pos, best.score, score, fixed), mirrored: best.mirrored };
    best = { ...untangle(mol, piece, best.pos, best.score, score, fixed), mirrored: best.mirrored };
    best = { ...faceSugars(mol, piece, best.pos, scoreH(best.pos), scoreH, sides), mirrored: best.mirrored };
    best = { ...roomForHydrogens(mol, piece, best.pos, best.score, scoreH, fixed), mirrored: best.mirrored };
    // (a tert-butyl or a CF3 settled last, its bonds kept clear of an H's ink)
    const scoreFan = scorer(mol, piece, depth, measured, 1, undefined, true);
    const settled = settleFans(mol, piece, best.pos, scoreFan(best.pos), scoreFan, fixed).pos;
    best = { pos: settled, score: scoreH(settled), mirrored: best.mirrored };
    // a cage in a mirrored frame is the one seen from its other side
    if (best.mirrored) {
      for (const [i, view] of others) {
        if (!piece.includes(mol.systems[i].atoms[0])) continue;
        used.set(i, view.pos);
        view.depth.forEach((d, a) => (depth[a] = d));
      }
    }
    // rings crowded round an atom (PPh3 on a metal), turned as a propeller
    propellers(mol, piece, best.pos, depth, measured, turned);
    if (!fixed(piece) && !turned.some((side) => side.some((v) => here.has(v)))) squareUp(mol, piece, best.pos);
    else standUp(mol, piece, best.pos);
    const xs = piece.map((a) => best.pos.get(a)!.x);
    const ys = piece.map((a) => best.pos.get(a)!.y);
    // a bond and a half of paper between one piece's ink and the next's:
    // a label reaches out past its atom, an OH at an end the further
    // (ibuprofen's acid, and HO of an ethanol set beside it)
    const reach = piece.map((a) => inkReach(mol, a, best.pos));
    const shift =
      right == null
        ? -Math.min(...xs)
        : right + 1.5 - Math.min(...xs.map((v, i) => v - reach[i].left));
    const midY = (Math.min(...ys) + Math.max(...ys)) / 2;
    for (const a of piece) {
      x[a] = best.pos.get(a)!.x + shift;
      y[a] = best.pos.get(a)!.y - midY;
    }
    right = Math.max(...piece.map((a, i) => x[a] + reach[i].right));
  }
  // a flat system drawn with depth (a bridge across a ring), seen from its
  // other side (the frame mirrored), is nearer where it was further: the
  // drawing is the molecule turned round, not its mirror image. (A cage is
  // never mirrored: a mirrored frame has it seen from its other side.)
  mol.systems.forEach((sys, i) => {
    if (depth[sys.atoms[0]] == null) return;
    const L = used.get(i)!;
    // the way round the widest triangle of its atoms goes, before and after
    const [o, ...rest] = sys.atoms;
    const turn = (p: (a: number) => Point, a: number, b: number) => {
      const u = sub(p(a), p(o));
      const v = sub(p(b), p(o));
      return u.x * v.y - u.y * v.x;
    };
    let widest: [number, number] = [rest[0], rest[1]];
    for (const a of rest) {
      for (const b of rest) {
        if (Math.abs(turn((v) => L.get(v)!, a, b)) > Math.abs(turn((v) => L.get(v)!, ...widest))) widest = [a, b];
      }
    }
    const before = turn((v) => L.get(v)!, ...widest);
    const after = turn((v) => ({ x: x[v], y: y[v] }), ...widest);
    if (Math.sign(before) !== Math.sign(after)) for (const a of sys.atoms) depth[a] = -depth[a]!;
  });
  // a ring bound face-on, seen from a little above: the half of it lower on
  // the page nearer - each atom as near as it is across the ring's axis
  // (its lift), that way round on the page; its star and metal in its
  // plane. A ring with nothing hanging from it, seen with a corner
  // nearest, is spun half a step to have an edge there instead, as
  // Haworth drew rings.
  for (const e of mol.eta) {
    const own = new Set(e.atoms.filter((a) => a !== e.star));
    const s = { x: x[e.star], y: y[e.star] };
    // the page's way for a lift: how its atoms lie off its star against their lifts
    let vx = 0;
    let vy = 0;
    let ll = 0;
    for (const a of own) {
      const l = lifts.get(a) ?? 0;
      vx += l * (x[a] - s.x);
      vy += l * (y[a] - s.y);
      ll += l * l;
    }
    if (ll < 1e-12) continue;
    const v = { x: vx / ll, y: vy / ll };
    // (+y is up the page: a lift is nearer where it goes down it)
    const down = Math.abs(v.y) < 1e-6 * Math.hypot(v.x, v.y) ? 1 : -Math.sign(v.y);
    const bare = e.ring.length === own.size && e.ring.every((a) => mol.neighbours[a].every((b) => own.has(b) || b === e.star));
    if (bare) {
      const u = { x: -v.y / Math.hypot(v.x, v.y), y: v.x / Math.hypot(v.x, v.y) };
      // in its plane: along its axis's square, and across
      const flat = e.ring.map((a) => ({ a, w: (x[a] - s.x) * u.x + (y[a] - s.y) * u.y, l: lifts.get(a) ?? 0 }));
      const front = Math.atan2(down, 0);
      const corner = flat.some(({ w, l }) => Math.abs(Math.atan2(Math.sin(Math.atan2(l, w) - front), Math.cos(Math.atan2(l, w) - front))) < 1e-3);
      if (corner) {
        const t = Math.PI / e.ring.length;
        for (const { a, w, l } of flat) {
          const w2 = w * Math.cos(t) - l * Math.sin(t);
          const l2 = w * Math.sin(t) + l * Math.cos(t);
          x[a] = s.x + u.x * w2 + v.x * l2;
          y[a] = s.y + u.y * w2 + v.y * l2;
          lifts.set(a, l2);
        }
      }
    }
    for (const a of e.atoms) depth[a] = (lifts.get(a) ?? 0) * down;
    if (e.metal >= 0) depth[e.metal] ??= 0;
  }
  // a tub, as near as it was built to be (placeTub)
  for (const d of mol.dienes) {
    for (const a of d.atoms) depth[a] = lifts.get(a) ?? 0;
    depth[d.metal] ??= 0;
  }
  // a cluster, as near as it was seen (placeCluster)
  for (const u of mol.units) {
    if (!u.cluster) continue;
    for (const a of [...u.cluster.metals, ...u.cluster.bridges]) depth[a] = lifts.get(a) ?? 0;
  }
  // two metals' bridges: their ring seen a little from above, the lower
  // bridge the nearer (placePair)
  for (const u of mol.units) {
    if (!u.pair) continue;
    depth[u.metal] ??= 0;
    depth[u.pair.metal] ??= 0;
    const [p, q] = u.pair.bridges;
    const lower = y[p] < y[q] ? p : q;
    for (const b of [p, q]) depth[b] = b === lower ? PAIR_DEPTH : -PAIR_DEPTH;
  }
  // a ring in perspective - bound face-on, or turned on its bond - drawn as
  // Haworth drew rings: a bond with both its atoms near, bold; one running
  // from the far half to the near one, a wedge toward the viewer, narrow at
  // its far end; the rest plain
  const bold: [number, number][] = [];
  const toward: [number, number][] = [];
  const near = (a: number) => depth[a]! > 1e-6;
  const perspective = (a: number, b: number) => {
    if (near(a) && near(b)) bold.push([a, b]);
    else if (near(a) !== near(b)) toward.push(near(a) ? [b, a] : [a, b]);
  };
  for (const e of mol.eta) {
    const here = new Set(e.atoms);
    for (const [k] of mol.bondIndex) {
      const [a, b] = k.split(",").map(Number);
      if (here.has(a) && here.has(b) && a !== e.star && b !== e.star) perspective(a, b);
    }
  }
  for (const side of turned) {
    const here = new Set(side);
    for (const k of mol.ringBonds) {
      const [a, b] = k.split(",").map(Number);
      if (here.has(a) && here.has(b)) perspective(a, b);
    }
  }
  for (const d of mol.dienes) d.ring.forEach((a, i) => perspective(a, d.ring[(i + 1) % d.ring.length]));
  // a stereocentre in a cage drawn in perspective shows itself there - one
  // in a six-membered ring drawn as a chair or a boat, or in a ring bridged
  // across another (ibogaine's isoquinuclidine): the way its bonds go, as
  // drawn, says which way round it is. Any other centre of a solid shows
  // nothing by its shape, and carries a wedge.
  // (and only where it reads so for sure: its bonds out of the solid each
  // turned 15 degrees either way, it still reads as given - a bond drawn
  // between the two corners the solid leaves free says nothing)
  const tetra = new Map<number, Tetrahedral>();
  mol.systems.forEach((sys) => {
    const own = sys.atoms.filter((a) => solid[a]);
    if (!own.some((a) => input.atoms[a].tetra)) return;
    const shown = shownBySolid(mol, sys, own, (a) => ({ x: x[a], y: y[a] }));
    const unsure = byAHair(input, mol, x, y, depth, own.filter((a) => shown.has(a) && input.atoms[a].tetra));
    for (const a of own) if (input.atoms[a].tetra && (!shown.has(a) || unsure.has(a))) solid[a] = false;
  });
  input.atoms.forEach((a, i) => a.tetra && !solid[i] && tetra.set(i, a.tetra));
  const final = new Map(x.map((v, i) => [i, { x: v, y: y[i] }]));
  // and an axis of chirality, by a wedge at an end of it
  const stereo = placeStereo(mol, final, tetra);
  for (const axis of input.axes ?? []) {
    const w = axisWedge(mol, final, axis);
    if (w) stereo.wedges.push(w);
  }
  // a cluster's metals in contact, dashed
  const dashed: [number, number][] = [];
  for (const u of mol.units) {
    if (!u.cluster) continue;
    const ms = u.cluster.metals;
    for (const a of ms) for (const b of mol.neighbours[a]) if (a < b && ms.includes(b)) dashed.push([a, b]);
  }
  return { out: { x, y, depth, solid, bold, toward, dashed, ...stereo }, mol, solidToo };
}

/**
 * Of the `centres` of a solid, drawn at `x`, `y` and `depth` with no wedge,
 * those that read as given only by a hair, as Meno reads a drawing
 * (drawn.ts): one of their bonds out of the solid turned 15 degrees either
 * way, they read otherwise, or not at all.
 */
function byAHair(
  input: LayoutInput,
  mol: Molecule,
  x: readonly number[],
  y: readonly number[],
  depth: readonly (number | null)[],
  centres: readonly number[],
): Set<number> {
  const out = new Set<number>();
  if (!centres.length) return out;
  const atoms: DrawnAtom[] = input.atoms.map((a, i) => ({
    x: x[i],
    y: y[i],
    el: a.el,
    hs: a.tetra ? Number(a.tetra.neighbours.includes(-1)) : mol.hs[i],
    ...(depth[i] != null ? { z: depth[i]! } : {}),
    ...(a.tetra && centres.includes(i) ? { centre: true } : {}),
  }));
  const bonds: DrawnBond[] = input.bonds.map(({ a, b, order }) => ({ a, b, order }));
  for (const c of centres) {
    const t = input.atoms[c].tetra!;
    const reads = (as: DrawnAtom[]) => {
      const u = readStereo(as, bonds).tetra.get(c);
      return !!u && sameConfiguration(t, u);
    };
    if (!reads(atoms)) {
      out.add(c);
      continue;
    }
    for (const n of mol.neighbours[c]) {
      if (depth[n] != null || out.has(c)) continue;
      for (const deg of [-15, 15]) {
        const r = (deg * Math.PI) / 180;
        const v = { x: x[n] - x[c], y: y[n] - y[c] };
        const turned = atoms.map((a, i) =>
          i === n ? { ...a, x: x[c] + v.x * Math.cos(r) - v.y * Math.sin(r), y: y[c] + v.x * Math.sin(r) + v.y * Math.cos(r) } : a,
        );
        if (!reads(turned)) out.add(c);
      }
    }
  }
  return out;
}

/**
 * The ring systems drawn as a solid, by index, with a stereocentre the
 * drawing does not show as given, read as Meno reads a drawing (drawn.ts).
 */
function misread(input: LayoutInput, mol: Molecule, out: Layout2D): Set<number> {
  const wrong = new Set<number>();
  const centres = input.atoms.flatMap((a, i) => (a.tetra && out.solid[i] && mol.systemOf[i] >= 0 ? [i] : []));
  if (!centres.length) return wrong;
  const atoms: DrawnAtom[] = input.atoms.map((a, i) => ({
    x: out.x[i],
    y: out.y[i],
    el: a.el,
    // (a centre's H as its configuration has it, however many the input gives)
    hs: a.tetra ? Number(a.tetra.neighbours.includes(-1)) : mol.hs[i],
    ...(out.depth[i] != null ? { z: out.depth[i]! } : {}),
    ...(out.solid[i] && a.tetra ? { centre: true } : {}),
  }));
  const bonds: DrawnBond[] = input.bonds.map(({ a, b, order }) => ({ a, b, order }));
  const drawnH = new Map<number, number>();
  for (const h of out.hydrogens) {
    atoms.push({ ...h.at, el: "H", hs: 0 });
    atoms[h.on] = { ...atoms[h.on], hs: atoms[h.on].hs - 1 };
    bonds.push({ a: h.on, b: atoms.length - 1, order: 1 });
    drawnH.set(h.on, atoms.length - 1);
  }
  for (const w of out.wedges) {
    const to = w.to === -1 ? drawnH.get(w.from) : w.to;
    const bond = bonds.find((b) => (b.a === w.from && b.b === to) || (b.b === w.from && b.a === to));
    if (bond) bond.wedge = { narrow: w.from, stereo: w.stereo };
  }
  const read = readStereo(atoms, bonds);
  for (const c of centres) {
    const t = read.tetra.get(c);
    const h = drawnH.get(c);
    if (!t || !sameConfiguration(input.atoms[c].tetra!, t, (n) => (n === h ? -1 : n))) wrong.add(mol.systemOf[c]);
  }
  return wrong;
}

/**
 * A piece with a ring bound face-on to a metal, turned so that the first
 * such ring is above its metal: a half-sandwich's legs below; a sandwich -
 * bent or not - with its rings one above the other (section 7). One with a
 * tub (cod) turned so that its C=C stand upright, the metal beside them, as
 * the tub was seen. Two metals bridged by two atoms: the line through them
 * level, the first on the left.
 */
function standUp(mol: Molecule, piece: number[], pos: Grown): void {
  const here = new Set(piece);
  // a cluster upright, as it was seen
  const cluster = mol.units.find((u) => u.cluster && here.has(u.metal));
  if (cluster) {
    const mid = (ms: number[]) => {
      const ps = ms.map((m) => pos.get(m)!);
      return { x: ps.reduce((t, p) => t + p.x, 0) / ps.length, y: ps.reduce((t, p) => t + p.y, 0) / ps.length };
    };
    const c = mid(cluster.cluster!.metals);
    const up = cluster.cluster!.up;
    const from = up?.from.length ? mid(up.from) : c;
    const t = up?.to.length ? mid(up.to) : pos.get(cluster.metal)!;
    const turn = Math.PI / 2 - Math.atan2(t.y - from.y, t.x - from.x);
    const cs = Math.cos(turn);
    const sn = Math.sin(turn);
    for (const a of piece) {
      const p = sub(pos.get(a)!, c);
      pos.set(a, { x: c.x + p.x * cs - p.y * sn, y: c.y + p.x * sn + p.y * cs });
    }
    return;
  }
  const pair = mol.units.find((u) => u.pair && here.has(u.metal));
  if (pair) {
    const m = pos.get(pair.metal)!;
    const o = pos.get(pair.pair!.metal)!;
    const turn = -Math.atan2(o.y - m.y, o.x - m.x);
    const c = Math.cos(turn);
    const sn = Math.sin(turn);
    for (const a of piece) {
      const p = sub(pos.get(a)!, m);
      pos.set(a, { x: m.x + p.x * c - p.y * sn, y: m.y + p.x * sn + p.y * c });
    }
    return;
  }
  const e = mol.eta.find((r) => here.has(r.star) && r.metal >= 0);
  if (!e) {
    const d = mol.dienes.find((r) => here.has(r.metal));
    if (!d) return;
    const [u, v] = d.stars[0].pi.map((a) => pos.get(a)!);
    const m = pos.get(d.metal)!;
    // (either way up: the nearer to how it lies now)
    const now = Math.atan2(v.y - u.y, v.x - u.x);
    const up = Math.cos(now - Math.PI / 2) >= 0 ? Math.PI / 2 : -Math.PI / 2;
    const turn = up - now;
    const c = Math.cos(turn);
    const sn = Math.sin(turn);
    for (const a of piece) {
      const p = sub(pos.get(a)!, m);
      pos.set(a, { x: m.x + p.x * c - p.y * sn, y: m.y + p.x * sn + p.y * c });
    }
    return;
  }
  const m = pos.get(e.metal)!;
  const second = mol.eta.find((r) => r !== e && r.metal === e.metal);
  const s = pos.get(e.star)!;
  const under = second ? pos.get(second.star)! : m;
  // (+y is up the page)
  const turn = Math.PI / 2 - Math.atan2(s.y - under.y, s.x - under.x);
  const c = Math.cos(turn);
  const sn = Math.sin(turn);
  for (const a of piece) {
    const p = sub(pos.get(a)!, m);
    pos.set(a, { x: m.x + p.x * c - p.y * sn, y: m.y + p.x * sn + p.y * c });
  }
}

/**
 * A ring system in its own frame: flat, by its rings; or, where it will not
 * lie flat - a bridge crowding or crossing the ring it spans, the faces of
 * cubane - as the cage it is, in perspective: whichever reads better.
 */
type SystemLayout = {
  pos: Map<number, Point>;
  depth?: Map<number, number>;
  hints?: Map<number, Map<number, Point>>;
  solid?: boolean;
  /** Drawn in perspective, these alone: a cage's core, the rings fused to it flat. */
  solidAtoms?: number[];
  other?: Omit<CageView, "other">;
  /** A cage's views to choose among by what hangs from it, the best first. */
  views?: CageView[];
  /** Drawn flat with a fault, where a solid would do as well: to be tried as that. */
  solidToo?: boolean;
};

function layoutSystem(mol: Molecule, i: number, asSolid = false): SystemLayout {
  const sys = mol.systems[i];
  // a cage - norbornane, tropane, quinuclidine, adamantane - is drawn in
  // perspective, the way it always is; anything else flat
  if (isCage(mol, sys)) {
    const cage = projectCage(mol, sys);
    // (and the next best of its textbook views, to try with what hangs from it)
    const views = [cage, ...[1, 2].flatMap((rank) => projectCage(mol, sys, rank) ?? [])];
    return { ...cage, solid: true, views };
  }
  const flat = layoutFlat(mol, sys);
  // (the room the system's bonds out of it have counted: a flat drawing that leaves a substituent none is not one without a fault)
  const flatFaults = flatCost(mol, sys, flat.pos, flat.depth, true);
  // (and not where its bonds are only a little uneven and a bond or two
  // passes behind another where a bridge crosses a ring - no atom on
  // another or on a bond, no bond crossing one in front of it: how morphine
  // and strychnine are drawn, flat with their bridges across)
  if (flatFaults < 1 || (flatFaults < 3 && flatCost(mol, sys, flat.pos, flat.depth, true, true) < 1)) return flat;
  // Where it will not lie flat without a fault, it is drawn as the solid it
  // is, by the cage's own way - its atoms set in space by how far apart the
  // bonds put them, seen from the side that reads best (cage.ts) - however
  // its rings are joined: bridged across one another, or fused round a
  // middle they close off (ginkgolide B, gibberellic acid, paeoniflorin's
  // cage), up to twenty atoms. Or, it having a cage in it with rings fused
  // to the cage on a side - an indole joined to ibogaine's isoquinuclidine
  // by a seven-membered ring, tetrodotoxin's guanidine ring - the cage so,
  // and the rings fused to it flat onto it. Whichever has the fewest faults,
  // where that is clearly fewer than flat.
  const rings = sys.rings.map((r) => mol.rings[r]);
  const wholeFits = sys.atoms.length <= 20 && rings.every((r) => r.length <= 8) && !sys.atoms.some((a) => mol.el[a] === "*" || isMetal(mol.el[a]));
  // (and only a solid with every stereocentre in it as given)
  const projected = wholeFits ? projectCage(mol, sys) : null;
  const whole = projected && keepsConfigurations(mol, sys.atoms, projected.pos, projected.depth) ? projected : null;
  const wholeFaults = whole ? flatCost(mol, sys, whole.pos, whole.depth, true) : Infinity;
  const core = cageCore(mol, sys);
  if (!core) return whole && (asSolid || wholeFaults < flatFaults - 1) ? { ...whole, solid: true } : { ...flat, solidToo: !!whole };
  const view = projectCage(mol, core);
  const onto = (v: Omit<CageView, "other">) => {
    const pos = new Map(v.pos);
    extendRingSystem(mol, sys, pos);
    // (the rings fused flat at the depth of the cage's atoms they are fused to)
    const depth = new Map(v.depth);
    for (let pass = 0; pass < sys.atoms.length && depth.size < sys.atoms.length; pass++)
      for (const a of sys.atoms) {
        if (depth.has(a)) continue;
        const near = mol.neighbours[a].filter((b) => depth.has(b)).map((b) => depth.get(b)!);
        if (near.length) depth.set(a, near.reduce((s, d) => s + d, 0) / near.length);
      }
    return { pos, depth, hints: v.hints, cost: v.cost };
  };
  // (and a ring fused onto the cage on a bond that the solid has as a chair
  // or a boat, with no double bond in it, drawn as one by the template -
  // decalin's second chair beside its first, trans or cis as the solid has
  // it - not flat; the rest flat as before)
  const solid3 = solidOf(mol, sys);
  const ontoChairs = (v: Omit<CageView, "other">) => {
    const fit = affineFit(
      core.atoms.map((a) => solid3.get(a)!),
      core.atoms.map((a) => v.pos.get(a)!),
    );
    const proj = (a: number) => {
      const p = solid3.get(a)!;
      return { x: fit.x[0] * p[0] + fit.x[1] * p[1] + fit.x[2] * p[2] + fit.x[3], y: fit.y[0] * p[0] + fit.y[1] * p[1] + fit.y[2] * p[2] + fit.y[3] };
    };
    const pos = new Map(v.pos);
    const chairs: { ring: number[]; up: Point }[] = [];
    let any = false;
    for (let grew = true; grew; ) {
      grew = false;
      for (const r of rings) {
        if (r.length !== 6 || r.every((a) => pos.has(a)) || r.some((a, k) => orderOf(mol, a, r[(k + 1) % 6]) === 2)) continue;
        const shape = ringShape(mol, r, (a) => solid3.get(a)!);
        if (shape.kind !== "chair" && shape.kind !== "boat") continue;
        const placed = r.flatMap((a, k) => (pos.has(a) ? [k] : []));
        if (placed.length !== 2 || (placed[1] - placed[0] !== 1 && placed[1] - placed[0] !== 5)) continue;
        const [k0, k1] = placed[1] - placed[0] === 1 ? placed : [placed[1], placed[0]];
        const step = (k1 - k0 + 6) % 6 === 1 ? 1 : -1;
        const seq = [0, 1, 2, 3, 4, 5].map((k) => r[(k0 + step * k + 12) % 6]);
        const at = templateOnBond(shape.kind, pos.get(seq[0])!, pos.get(seq[1])!, seq.slice(2).map(proj), [...pos.values()]);
        if (!at) continue;
        at.at.forEach((p, j) => pos.set(seq[j + 2], p));
        chairs.push({ ring: r, up: at.up });
        any = grew = true;
      }
    }
    if (!any) return null;
    extendRingSystem(mol, sys, pos);
    const depth = new Map(v.depth);
    for (let pass = 0; pass < sys.atoms.length && depth.size < sys.atoms.length; pass++)
      for (const a of sys.atoms) {
        if (depth.has(a)) continue;
        const near = mol.neighbours[a].filter((b) => depth.has(b)).map((b) => depth.get(b)!);
        if (near.length) depth.set(a, near.reduce((s, d) => s + d, 0) / near.length);
      }
    // (a group axial to such a chair upright, up or down as the solid has it)
    const hints = new Map(v.hints);
    for (const { ring: r, up } of chairs)
      for (const { from, to, dir } of axialOut(mol, sys, r, solid3)) {
        const seen = { x: fit.x[0] * dir[0] + fit.x[1] * dir[1] + fit.x[2] * dir[2], y: fit.y[0] * dir[0] + fit.y[1] * dir[1] + fit.y[2] * dir[2] };
        const sign = seen.x * up.x + seen.y * up.y >= 0 ? 1 : -1;
        const here = pos.get(from)!;
        hints.set(from, new Map([...(hints.get(from) ?? new Map()), [to, { x: here.x + up.x * sign, y: here.y + up.y * sign }]]));
      }
    return { pos, depth, hints, cost: v.cost };
  };
  // (and only one that shows every stereocentre in the system as given, as
  // it is drawn: the cage's own, and those of the atoms where a ring fused
  // flat onto it joins it - laid beside the bond it shares with the cage, a
  // ring stands on one face of the cage there or the other, and only one is
  // the molecule: scopolamine's epoxide laid towards its three-carbon
  // bridge, not its N, was another)
  const inSys = new Set(sys.atoms);
  const coreAtoms = new Set(core.atoms);
  const solidAtoms = core.atoms.filter((a) => mol.neighbours[a].every((b) => !inSys.has(b) || coreAtoms.has(b)));
  const shows = (v: Omit<CageView, "other">) =>
    sys.atoms.every((a) => v.pos.has(a)) && keepsConfigurations(mol, sys.atoms, v.pos, v.depth);
  // (the cage seen from each of its best few sides, the rings fused flat
  // onto it: the one that reads best - a cage alike from several sides,
  // ibogaine's isoquinuclidine, leaves the rest room from one of them)
  let persp = onto(view);
  let perspFaults = Infinity;
  let perspChairs = false;
  let seen: CageView = view;
  let rankedBy = Infinity;
  for (let rank = 0; rank < 4; rank++) {
    const v = rank ? projectCage(mol, core, rank) : view;
    if (!v) break;
    let flatShows = false;
    for (const chairs of [false, true]) {
      const p = chairs ? ontoChairs(v) : onto(v);
      if (!p) continue;
      // (the chairs taken unless they read clearly worse: a fusion drawn as
      // it is - a preference among these, not against flat or the whole;
      // and only from a view the rings laid flat read as given from too)
      if (!chairs) flatShows = shows(p);
      if (chairs && !flatShows) continue;
      const f = shows(p) ? flatCost(mol, sys, p.pos, p.depth, true) : Infinity;
      const by = f - (chairs ? 1 : 0);
      if (by < rankedBy - 1e-9) [seen, persp, perspFaults, perspChairs, rankedBy] = [v, p, f, chairs, by];
    }
  }
  // (the cage alone in perspective before the whole, its fused rings flat
  // and wedged as a chemist draws them, unless the whole reads far better)
  // (a ring with a double bond in it is drawn flat: where the cage alone
  // can be drawn so, such rings flat onto it, the whole is no solid -
  // gelsemine's oxindole, its benzene ring otherwise foreshortened)
  const flatOutside = rings.some((r) => !r.every((a) => coreAtoms.has(a)) && r.some((a, k) => orderOf(mol, a, r[(k + 1) % r.length]) === 2));
  const wholeAllowed = !(flatOutside && perspFaults < Infinity);
  if (whole && wholeAllowed && (asSolid || wholeFaults < flatFaults - 1) && wholeFaults < perspFaults - 3) return { ...whole, solid: true };
  if (perspFaults >= flatFaults - 1 && !(asSolid && perspFaults < Infinity)) {
    if (asSolid && whole && wholeAllowed) return { ...whole, solid: true };
    return { ...flat, solidToo: !!whole || perspFaults < Infinity };
  }
  // (an atom of the cage bonded to a ring fused flat onto it shows its
  // configuration by a wedge, as a flat ring's atoms do: its bond into that
  // ring lies where the flat ring puts it, not where the solid would - and
  // seen from its other side, for a mirrored frame, only so too)
  // (seen from its other side the same way, its fused rings chairs where they were)
  const other = seen.other && ((perspChairs && ontoChairs(seen.other)) || onto(seen.other));
  return { pos: persp.pos, depth: persp.depth, hints: persp.hints, solidAtoms, ...(other && shows(other) ? { other } : {}) };
}

/** A ring system laid flat, by its rings - or, a bridge crowding or crossing the ring it spans, the bridge across that ring's face. */
function layoutFlat(mol: Molecule, sys: RingSystem): SystemLayout {
  let flat = placeRingSystem(mol, sys);
  const rings = sys.rings.map((r) => mol.rings[r]);
  const bridged = rings.some((r, j) =>
    rings.some((q, k) => k > j && q.filter((a) => r.includes(a)).length >= 3 && q.length < 9 && r.length < 9),
  );
  // how it reads, flat - its rings' shapes counted as well as its faults,
  // and each gap too narrow for the groups either side of it (narrowGap) -
  // and, with a fault in it (a crowded atom, a stretched bond, such a gap),
  // tried eased toward rings of their own shape, atoms kept clear, where
  // that is better
  const cost = (pos: Map<number, Point>) =>
    flatCost(mol, sys, pos) + 20 * misshapen(mol, sys, pos) + 3 * narrowGap(mol, sys, pos);
  const eased = (pos: Map<number, Point>) => {
    if (flatCost(mol, sys, pos) < 1 && !narrowGap(mol, sys, pos)) return pos;
    const trial = new Map(pos);
    regularize(mol, sys, trial);
    return cost(trial) < cost(pos) - 1e-9 ? trial : pos;
  };
  // a fused system too (two rings fused on neighbouring sides of a third,
  // meeting at their shared atom closer than their own angles allow -
  // saxitoxin's five-membered rings - the gap between them opened)
  if (!bridged && rings.every((r) => r.length < 9)) flat = eased(flat);
  // a bridged system laid flat from each of its rings in turn: which ring
  // stays regular and which arcs round it decides whether it reads
  if (bridged && !rings.some((r) => r.length >= 9)) {
    flat = eased(flat);
    // (which ring stays regular counting the room its bonds out of it leave, as well)
    const roomed = (pos: Map<number, Point>) => cost(pos) + flatCost(mol, sys, pos, undefined, true) - flatCost(mol, sys, pos);
    let least = roomed(flat);
    for (const r of sys.rings) {
      const trial = eased(placeRingSystem(mol, sys, 0, r));
      const c = roomed(trial);
      if (c < least - 1e-9) {
        least = c;
        flat = trial;
      }
    }
    // where that crowds or stretches it (morphine, artemisinin): the fused
    // rings flat and regular, the bridge across the face of one
    if (least >= 1) {
      const across = bridgeAcross(mol, sys);
      if (across && flatCost(mol, sys, across.pos, across.depth) < least) return across;
    }
  }
  return { pos: flat };
}

/**
 * How far an atom's ink reaches to its left and right, in bond lengths, as
 * the drawing sets it: a carbon's nowhere (its bonds end at it); a label's
 * first letter centred on it, about 0.45 across, and the rest of its symbol
 * after it; an H beside it - where the drawing puts it (`hydrogenSpot`),
 * half a bond off - 0.2 beyond that, and its count after it; a charge's
 * circle to the right. (An H under or over it reaches no further across.)
 */
export function inkReach(mol: Molecule, a: number, pos: ReadonlyMap<number, Point>): { left: number; right: number } {
  // (a star at a pi system's centre is drawn as nothing)
  const labelled = (mol.el[a] !== "C" && mol.el[a] !== "*") || mol.charge[a] !== 0;
  if (!labelled) return { left: 0, right: 0 };
  // (a charged carbon is a bare vertex, its charge beside it)
  const symbol = mol.el[a] === "C" ? 0 : mol.el[a].length;
  let left = symbol ? 0.25 : 0;
  let right = symbol ? 0.25 + 0.4 * (symbol - 1) : 0;
  if (symbol && mol.hs[a] > 0) {
    const at = pos.get(a)!;
    const h = mol.neighbours[a].length
      ? hydrogenSpot(
          mol.neighbours[a].map((b) => {
            const p = pos.get(b)!;
            const d = dist(p, at) || 1;
            return { x: (p.x - at.x) / d, y: (p.y - at.y) / d };
          }),
        )
      : { x: 0.5, y: 0 };
    const beyond = Math.abs(h.x) + 0.2 + (mol.hs[a] > 1 ? 0.3 : 0);
    if (h.x < 0) left = Math.max(left, beyond);
    else if (h.x > 0) right = Math.max(right, beyond);
    // (under or over it, its count follows it)
    else right = Math.max(right, 0.2 + (mol.hs[a] > 1 ? 0.3 : 0));
  }
  if (mol.charge[a] !== 0) right += 0.4;
  return { left, right };
}

/**
 * Tries each single bond the other way round, and the two groups on a ring
 * atom (`swaps`: the atom, then each group's first atom) each the other's
 * way, keeping what scores better, until nothing does - erythromycin's
 * tertiary OH turned up out of its sugar's way, its methyl across. Then,
 * `deep`, each small side turned over is tried
 * with each bond within it turned back as well: what hangs on it - a
 * carboxyl's C=O, up - set right again, where turning the side alone would
 * put it wrong; and if that helps, single bonds again.
 */
export function improve(
  mol: Molecule,
  start: Grown,
  startScore: number,
  flips: [number, number][],
  sides: Map<string, number>,
  score: (pos: Grown) => number,
  deep = false,
  swaps: [number, number, number][] = [],
): { pos: Grown; score: number } {
  let pos = start;
  let current = startScore;
  const singly = () => {
    for (let pass = 0; pass < 4; pass++) {
      let better = false;
      for (const [a, b] of flips) {
        const trial = new Map(pos);
        flip(mol, trial, a, b, sides);
        const s = score(trial);
        if (s < current - 1e-6) {
          pos = trial;
          current = s;
          better = true;
        }
      }
      for (const [a, b, c] of swaps) {
        const trial = new Map(pos);
        const at = trial.get(a)!;
        const tb = angleOf(sub(trial.get(b)!, at));
        const tc = angleOf(sub(trial.get(c)!, at));
        const sb = sideAtoms(mol, a, b);
        const sc = sideAtoms(mol, a, c);
        turnSide(trial, sb, at, tc - tb);
        turnSide(trial, sc, at, tb - tc);
        const s = score(trial);
        if (s < current - 1e-6) {
          pos = trial;
          current = s;
          better = true;
        }
      }
      if (!better) break;
    }
  };
  // a side turned over and a bond within it turned back: the best pair
  const doubly = () => {
    let found: Grown | null = null;
    for (const [a, b] of flips) {
      const beyondB = sides.get(`${a}>${b}`) ?? 0;
      const beyondA = sides.get(`${b}>${a}`) ?? 0;
      if (Math.min(beyondA, beyondB) > SMALL_SIDE) continue;
      const [from, to] = beyondB <= beyondA ? [a, b] : [b, a];
      const moved = new Set(sideAtoms(mol, from, to));
      const trial = new Map(pos);
      flip(mol, trial, a, b, sides);
      for (const [c, d] of flips) {
        if ((c === a && d === b) || !moved.has(c) || !moved.has(d)) continue;
        const again = new Map(trial);
        flip(mol, again, c, d, sides);
        const s = score(again);
        if (s < current - 1e-6) {
          current = s;
          found = again;
        }
      }
    }
    if (found) pos = found;
    return found != null;
  };
  singly();
  for (let round = 0; deep && round < 2 && doubly(); round++) singly();
  return { pos, score: current };
}

/** The most atoms a side turned over may have and still be set right within. */
const SMALL_SIDE = 10;

/**
 * A piece with no ring that can lie square - its rings all five-membered,
 * say, or none - has nothing setting it on the lattice but its other bonds:
 * turn it the little way that brings them nearest.
 */
function squareUp(mol: Molecule, piece: number[], pos: Grown): void {
  const here = new Set(piece);
  const square = mol.rings.some(
    (r) =>
      here.has(r[0]) &&
      (r.length === 4 || r.length === 6) &&
      mol.rings.every((q) => q === r || q.filter((a) => r.includes(a)).length <= 2),
  );
  if (square) return;
  const dirs: number[] = [];
  for (const [k] of mol.bondIndex) {
    const [a, b] = k.split(",").map(Number);
    if (!here.has(a) || mol.ringBonds.has(k)) continue;
    const p = pos.get(a)!;
    const q = pos.get(b)!;
    dirs.push(Math.atan2(q.y - p.y, q.x - p.x));
  }
  if (!dirs.length) return;
  const step = Math.PI / 6;
  const off = (turn: number) =>
    dirs.reduce((sum, t) => {
      const u = t - turn;
      return sum + Math.abs(u - step * Math.round(u / step));
    }, 0);
  let turn = 0;
  let least = off(0);
  for (let i = -150; i < 150; i++) {
    const t = (i / 10) * (Math.PI / 180);
    const e = off(t);
    if (e < least - 1e-9) {
      least = e;
      turn = t;
    }
  }
  if (!turn) return;
  const c = Math.cos(-turn);
  const sn = Math.sin(-turn);
  for (const a of piece) {
    const p = pos.get(a)!;
    pos.set(a, { x: p.x * c - p.y * sn, y: p.x * sn + p.y * c });
  }
}

/**
 * Where a part with rings of its own hangs from the rest by a single bond
 * - a sugar on its glycosidic oxygen, taxol's side chain on its ester -
 * each part is drawn well on its own and then joined: the part may be
 * turned a little about the atom it hangs from, or about its own atom at
 * the join, where the whole reads better for it, though the angle there
 * then gives a little from 120 degrees.
 */
function rejoin(
  mol: Molecule,
  piece: number[],
  start: Grown,
  startScore: number,
  score: (pos: Grown) => number,
  fixed: (atoms: readonly number[]) => boolean = () => false,
): { pos: Grown; score: number } {
  let pos = start;
  let current = startScore;
  const here = new Set(piece);
  const joins = [...mol.bondIndex.entries()]
    .filter(([k, i]) => !mol.ringBonds.has(k) && mol.bonds[i].order === 1)
    .map(([k]) => k.split(",").map(Number) as [number, number])
    .filter(([a]) => here.has(a));
  for (let pass = 0; pass < 2; pass++) {
    let better = false;
    for (const [a, b] of joins) {
      for (const [from, to] of [
        [a, b],
        [b, a],
      ]) {
        const side = sideAtoms(mol, from, to);
        if (side.length < 4 || side.length > piece.length / 2) continue;
        // a part with rings of its own; or a long chain hung from a branch
        // (a lipid's acyl chain on its glycerol), drawn straight on its own
        const chain = side.length >= 8 && mol.neighbours[from].length >= 3;
        if (!chain && !side.some((v) => mol.systemOf[v] >= 0)) continue;
        const beyond = side.filter((v) => v !== to);
        // a little either way about either end of the join; and the part
        // turned right round about its own atom there, in steps of the
        // lattice, where it is a ring that has a way it should face (a
        // sugar: its oxygen up, its anomeric carbon right)
        const moves: [number, number[], number][] = [];
        for (const t of [20, -20, 30, -30]) {
          moves.push([t, side, from], [t, beyond, to]);
        }
        if (mol.systemOf[to] >= 0) {
          for (const t of [60, -60, 90, -90, 120, -120, 150, -150, 180]) moves.push([t, beyond, to]);
        }
        // and, for a ring, the same seen from its other face: mirrored across
        // the join first - a turn alone cannot change which way round it is
        const faces = mol.systemOf[to] >= 0 ? [false, true] : [false];
        for (const mirrored of faces) {
          for (const [t, group, pivot] of mirrored ? moves.filter(([, g]) => g === beyond) : moves) {
            // an upright cage is not turned
            if (fixed(group)) continue;
            const trial = new Map(pos);
            if (mirrored) {
              const p0 = trial.get(from)!;
              const p1 = trial.get(to)!;
              for (const v of beyond) trial.set(v, mirror(trial.get(v)!, p0, p1));
            }
            turnSide(trial, group, trial.get(pivot)!, (t * Math.PI) / 180);
            const s = score(trial);
            if (s < current - 1e-6) {
              pos = trial;
              current = s;
              better = true;
            }
          }
        }
      }
    }
    if (!better) break;
  }
  return { pos, score: current };
}

/** What a name's letters running into something count for while a layout sets its parts (metrics' `nameRoom`). */
const NAME_ROOM_FIRST = 0.3;

/** Atoms in the way of each other: on top of one another, on a bond, at the ends of crossing bonds, or under a name's letters. */
function clashing(mol: Molecule, piece: number[], pos: Grown): Set<number> {
  const out = new Set<number>();
  const bonds = [...mol.bondIndex.keys()]
    .map((k) => k.split(",").map(Number) as [number, number])
    .filter(([a]) => pos.has(a));
  // (a ring bound face-on and its star - and so its metal's bond to the
  // star - are meant to lie over each other)
  const together = (a: number, b: number) =>
    mol.linked[a].includes(b) ||
    mol.eta.some((e) => e.atoms.includes(a) && e.atoms.includes(b)) ||
    mol.dienes.some((d) => d.atoms.includes(a) && d.atoms.includes(b));
  for (let i = 0; i < piece.length; i++) {
    for (let j = i + 1; j < piece.length; j++) {
      const a = piece[i];
      const b = piece[j];
      if (mol.neighbours[a].includes(b) || together(a, b)) continue;
      const d = dist(pos.get(a)!, pos.get(b)!);
      // labels need more room than bare carbons
      const labelled = mol.el[a] !== "C" && mol.el[b] !== "C";
      if (d < 0.6 || (labelled && d < 0.8)) out.add(a).add(b);
    }
  }
  for (let i = 0; i < bonds.length; i++) {
    const [a, b] = bonds[i];
    for (let j = i + 1; j < bonds.length; j++) {
      const [c, d] = bonds[j];
      if (a === c || a === d || b === c || b === d) continue;
      if ([a, b].some((u) => [c, d].some((v) => together(u, v)))) continue;
      if (segmentsCross(pos.get(a)!, pos.get(b)!, pos.get(c)!, pos.get(d)!)) {
        out.add(a).add(b).add(c).add(d);
      }
    }
  }
  for (const [a, hits] of namesInTheWay(mol, piece, pos)) {
    out.add(a);
    hits.forEach((b) => out.add(b));
  }
  return out;
}

/** A benzene ring's: six atoms, its bonds three double and three single. */
function isAryl(mol: Molecule, ring: number[]): boolean {
  if (ring.length !== 6) return false;
  const orders = ring.map((a, i) => orderOf(mol, a, ring[(i + 1) % 6]));
  return orders.filter((o) => o === 2).length === 3 && orders.filter((o) => o === 1).length === 3;
}

/** The angles a crowded ring is tried turned on its bond out of the page: 45, 60 and 70 degrees. */
const PROPELLER = [Math.PI / 4, Math.PI / 3, (7 * Math.PI) / 18];

/**
 * Aryl rings crowded round one atom - PPh3's phenyls round a metal - each
 * turned on its bond out of the page, all the same way round
 * (a propeller), and so seen in perspective: foreshortened across its bond,
 * what hangs from it with it, its near half nearer (section 7). Done for
 * an atom with two rings or more hanging from it by single bonds, any of
 * them crowded; at the angle that reads best by the benchmark's measures
 * (the rings turned measured as a drawing in perspective is) - none, where
 * turning reads no better. The rings turned, by their atoms, go to
 * `turned`; their depth to `depth`.
 */
function propellers(
  mol: Molecule,
  piece: number[],
  pos: Grown,
  depth: (number | null)[],
  solid: readonly boolean[],
  turned: number[][],
): void {
  let crowded = clashing(mol, piece, pos);
  if (!crowded.size) return;
  const faceOn = new Set(mol.eta.flatMap((e) => e.atoms));
  const hubs = piece
    .map((x) => {
      // a ring hangs from x by a single bond where nothing else joins it to x's side
      // (an aryl ring - six atoms, three double bonds - hanging by a single bond, nothing else joining it to x)
      const rings = mol.neighbours[x].filter((c) => {
        const s = mol.systemOf[c];
        if (s < 0 || s === mol.systemOf[x] || faceOn.has(c) || orderOf(mol, x, c) !== 1) return false;
        if (!mol.ringsOf[c].some((r) => isAryl(mol, mol.rings[r]))) return false;
        // (a blade hangs from x, it is not what x hangs from: BINAP's
        // naphthalene, beyond its P, is the rest of the molecule)
        const side = sideAtoms(mol, x, c);
        if (side.length * 2 >= piece.length) return false;
        return !side.some((v) => v !== c && mol.neighbours[x].includes(v));
      });
      return { x, rings };
    })
    .filter((h) => h.rings.length >= 2 && !faceOn.has(h.x));
  for (const { x, rings } of hubs) {
    const sides = rings.map((c) => sideAtoms(mol, x, c));
    if (!sides.some((side) => side.some((v) => crowded.has(v)))) continue;
    const at = pos.get(x)!;
    const was = new Map(sides.flat().map((v) => [v, pos.get(v)!]));
    const turnTo = (phi: number) => {
      const trial = new Map(pos);
      const lift = new Map<number, number>();
      sides.forEach((side, k) => {
        const u = sub(pos.get(rings[k])!, at);
        const len = Math.hypot(u.x, u.y) || 1;
        const ux = u.x / len;
        const uy = u.y / len;
        for (const v of side) {
          const p = sub(was.get(v)!, at);
          const along = p.x * ux + p.y * uy;
          const across = -p.x * uy + p.y * ux;
          trial.set(v, { x: at.x + along * ux - across * Math.cos(phi) * uy, y: at.y + along * uy + across * Math.cos(phi) * ux });
          lift.set(v, across * Math.sin(phi));
        }
      });
      return { trial, lift };
    };
    const before = scorer(mol, piece, depth, solid)(pos);
    let best: { score: number; trial: Grown; lift: Map<number, number> } | null = null;
    for (const phi of PROPELLER) {
      const { trial, lift } = turnTo(phi);
      const seen = [...depth];
      const persp = [...solid];
      for (const [v, l] of lift) {
        seen[v] = l;
        persp[v] = true;
      }
      const score = scorer(mol, piece, seen, persp)(trial);
      if (!best || score < best.score) best = { score, trial, lift };
    }
    if (!best || best.score >= before - 1e-6) continue;
    for (const [v, p] of best.trial) pos.set(v, p);
    for (const [v, l] of best.lift) depth[v] = l;
    turned.push(...sides);
    crowded = clashing(mol, piece, pos);
    if (!crowded.size) return;
  }
}

/** How far a point is from the segment p-q. */
function toSegment(h: Point, p: Point, q: Point): number {
  const vx = q.x - p.x;
  const vy = q.y - p.y;
  const len2 = vx * vx + vy * vy;
  const t = len2 ? Math.max(0, Math.min(1, ((h.x - p.x) * vx + (h.y - p.y) * vy) / len2)) : 0;
  return Math.hypot(h.x - (p.x + t * vx), h.y - (p.y + t * vy));
}

/**
 * Where parts are still in each other's way: turn a branch off its ideal
 * angle, a little and then more, and at last stretch the bond it hangs
 * from - each kept only if the drawing scores better for it.
 */
export function untangle(
  mol: Molecule,
  piece: number[],
  start: Grown,
  startScore: number,
  score: (pos: Grown) => number,
  fixed: (atoms: readonly number[]) => boolean = () => false,
): { pos: Grown; score: number } {
  let pos = start;
  let current = startScore;
  const acyclic = [...mol.bondIndex.entries()]
    .filter(([k, i]) => !mol.ringBonds.has(k) && mol.bonds[i].order === 1)
    .map(([k]) => k.split(",").map(Number) as [number, number])
    .filter(([a]) => pos.has(a));
  // and a carbonyl's O, turned off its line where it lies on an atom and
  // nothing else will clear it (a macrocycle's amide against a ring of it)
  const carbonyls = [...mol.bondIndex.entries()]
    .filter(([k, i]) => !mol.ringBonds.has(k) && mol.bonds[i].order === 2)
    .map(([, i]) => mol.bonds[i])
    .flatMap(({ a, b }) =>
      mol.el[a] === "C" && mol.neighbours[b].length === 1
        ? [[a, b] as [number, number]]
        : mol.el[b] === "C" && mol.neighbours[a].length === 1
          ? [[b, a] as [number, number]]
          : [],
    )
    .filter(([a]) => pos.has(a));
  // (and it ends with no more bonds crossing than it began with, however
  // much else a crossing would clear - nothing is hidden first of all: a
  // crossing made on the way and not undone, the best drawing without it
  // is kept instead)
  const bonds = [...mol.bondIndex.keys()]
    .map((k) => k.split(",").map(Number) as [number, number])
    .filter(([a]) => pos.has(a));
  const crossingsIn = (p: Grown) => {
    let count = 0;
    for (let i = 0; i < bonds.length; i++) {
      const [a, b] = bonds[i];
      for (let j = i + 1; j < bonds.length; j++) {
        const [c, d] = bonds[j];
        if (a === c || a === d || b === c || b === d) continue;
        if (segmentsCross(p.get(a)!, p.get(b)!, p.get(c)!, p.get(d)!)) count++;
      }
    }
    return count;
  };
  const crossed = crossingsIn(pos);
  let safe = { pos, score: current };
  for (let round = 0; round < 6; round++) {
    const hit = clashing(mol, piece, pos);
    if (!hit.size) break;
    const onAtom = (o: number) =>
      piece.some((v) => v !== o && !mol.neighbours[o].includes(v) && dist(pos.get(v)!, pos.get(o)!) < 0.6);
    const turnable = [...acyclic, ...carbonyls.filter(([, o]) => onAtom(o))];
    let better = false;
    for (const [a, b] of turnable) {
      for (const [from, to] of [
        [a, b],
        [b, a],
      ]) {
        const side = sideAtoms(mol, from, to);
        if (side.length > piece.length / 2 || !side.some((v) => hit.has(v))) continue;
        const moves: ((p: Grown) => void)[] = [];
        // (an upright cage is moved, not turned)
        for (const t of fixed(side) ? [] : [15, -15, 30, -30, 45, -45, 60, -60, 90, -90]) {
          moves.push((p) => turnSide(p, side, p.get(from)!, (t * Math.PI) / 180));
        }
        for (const by of [0.3, 0.6]) {
          moves.push((p) => stretchSide(p, side, p.get(from)!, p.get(to)!, by));
        }
        for (const move of moves) {
          const trial = new Map(pos);
          move(trial);
          const s = score(trial);
          if (s < current - 1e-6) {
            pos = trial;
            current = s;
            better = true;
            if (crossingsIn(trial) <= crossed) safe = { pos, score: current };
          }
        }
      }
    }
    if (!better) break;
  }
  return crossingsIn(pos) > crossed ? safe : { pos, score: current };
}

/**
 * What each name's letters (OTBS, NHBz) run into, as the metrics count it:
 * an atom under them, or beside them with less than a space between, a
 * bond through them, another name's letters.
 */
function namesInTheWay(mol: Molecule, piece: number[], p: Grown): Map<number, number[]> {
  // (most drawings have none)
  if (!piece.some((a) => isName(mol.el[a]))) return new Map();
  const index = new Map(piece.map((a, i) => [a, i]));
  const edges = [...mol.bondIndex.keys()]
    .map((k) => k.split(",").map(Number) as [number, number])
    .filter(([a, b]) => index.has(a) && index.has(b));
  const named = namesLaid(
    {
      x: piece.map((a) => p.get(a)!.x),
      y: piece.map((a) => p.get(a)!.y),
      edges: edges.map(([a, b]) => [index.get(a)!, index.get(b)!] as const),
      elements: piece.map((a) => mol.el[a]),
      hydrogens: piece.map((a) => mol.hs[a]),
    },
    1,
  );
  const out = new Map<number, number[]>();
  for (const [i, { box }] of named) {
    const a = piece[i];
    const hits: number[] = [];
    for (const b of piece) {
      if (b === a || mol.neighbours[a].includes(b)) continue;
      const other = named.get(index.get(b)!);
      const deep = other ? boxesDepth(box, other.box, 1) : atomDepth(box, p.get(b)!, mol.el[b] !== "C" && mol.el[b] !== "*", 1);
      if (deep > 0) hits.push(b);
    }
    for (const [b, c] of edges) {
      if (b === a || c === a) continue;
      if (segmentMeetsBox(p.get(b)!, p.get(c)!, box)) hits.push(b, c);
    }
    if (hits.length) out.set(a, [...new Set(hits)]);
  }
  return out;
}

/**
 * A label's H that runs into another label, an atom or a bond: the bond to
 * its atom turned a little, or drawn a little longer or shorter (an OH, an
 * SH), or the same done to what it runs into - a C=O's O, a small branch -
 * until the H has room beside its symbol. The drawing writes OH or HO as the bond has
 * it; the H is never moved under the symbol to make room. A name's letters
 * (OTBS, NHBz) are given room the same way. A move that crosses bonds is
 * not taken.
 */
export function roomForHydrogens(
  mol: Molecule,
  piece: number[],
  start: Grown,
  startScore: number,
  score: (pos: Grown) => number,
  fixed: (atoms: readonly number[]) => boolean = () => false,
): { pos: Grown; score: number } {
  let pos = start;
  let current = startScore;
  const here = new Set(piece);
  const bonds = [...mol.bondIndex.keys()]
    .map((k) => k.split(",").map(Number) as [number, number])
    .filter(([a]) => here.has(a));
  const crossingsIn = (p: Grown) => {
    let count = 0;
    for (let i = 0; i < bonds.length; i++) {
      const [a, b] = bonds[i];
      for (let j = i + 1; j < bonds.length; j++) {
        const [c, d] = bonds[j];
        if (a === c || a === d || b === c || b === d) continue;
        if (segmentsCross(p.get(a)!, p.get(b)!, p.get(c)!, p.get(d)!)) count++;
      }
    }
    return count;
  };
  // what each label's H runs into, where the drawing sets it
  const blocked = (p: Grown): Map<number, number[]> => {
    const out = new Map<number, number[]>();
    for (const a of piece) {
      if (mol.el[a] === "C" || !(mol.hs[a] > 0) || !mol.neighbours[a].length) continue;
      const at = p.get(a)!;
      const off = hydrogenSpot(
        mol.neighbours[a].map((b) => {
          const v = sub(p.get(b)!, at);
          const d = Math.hypot(v.x, v.y) || 1;
          return { x: v.x / d, y: v.y / d };
        }),
      );
      const h = { x: at.x + off.x, y: at.y + off.y };
      const count = mol.hs[a] > 1 && off.x >= 0;
      const hits: number[] = [];
      for (const b of piece) {
        if (b === a) continue;
        if (hydrogenRunsInto(sub(p.get(b)!, h), mol.el[b] !== "C", count)) hits.push(b);
      }
      for (const [b, c] of bonds) {
        if (b === a || c === a) continue;
        if (toSegment(h, p.get(b)!, p.get(c)!) < 0.3) hits.push(b, c);
      }
      if (hits.length) out.set(a, [...new Set(hits)]);
    }
    // and each name's letters, likewise
    for (const [a, hits] of namesInTheWay(mol, piece, p)) out.set(a, [...new Set([...(out.get(a) ?? []), ...hits])]);
    return out;
  };
  // the small moves of an atom, or of a branch hung from a bond - larger
  // for a name, whose letters reach further
  const nudges = (side: number[], from: number, to: number, wide = false): ((p: Grown) => void)[] => {
    const out: ((p: Grown) => void)[] = [];
    if (fixed(side)) return out;
    for (const t of [0, 10, -10, 20, -20, 30, -30, ...(wide ? [45, -45, 60, -60] : [])]) {
      for (const by of [0, -0.15, 0.15, 0.3, 0.45]) {
        if (!t && !by) continue;
        out.push((p) => {
          if (t) turnSide(p, side, p.get(from)!, (t * Math.PI) / 180);
          if (by) stretchSide(p, side, p.get(from)!, p.get(to)!, by);
        });
      }
    }
    return out;
  };
  let crossings = crossingsIn(pos);
  for (let round = 0; round < 3; round++) {
    const now = blocked(pos);
    if (!now.size) break;
    let better = false;
    for (const [a, hits] of now) {
      const moves: ((p: Grown) => void)[] = [];
      // its own bond, where it ends there (an OH, an SH, an NH2, an OTBS)
      const named = isName(mol.el[a]);
      if (mol.neighbours[a].length === 1 && mol.systemOf[a] < 0) moves.push(...nudges([a], mol.neighbours[a][0], a, named));
      // or what it runs into: an end atom (a C=O's O), or a small branch
      // out of the rest at it
      for (const o of hits) {
        for (const p of mol.neighbours[o]) {
          if (mol.ringBonds.has(p < o ? `${p},${o}` : `${o},${p}`)) continue;
          const side = sideAtoms(mol, p, o);
          // (not one that carries the H's own atom along with it)
          if (side.length > 12 || side.includes(a)) continue;
          moves.push(...nudges(side, p, o, named && side.length === 1));
        }
      }
      let found: Grown | null = null;
      let foundScore = current;
      let foundCrossings = crossings;
      for (const move of moves) {
        const trial = new Map(pos);
        move(trial);
        const s = score(trial);
        if (s < foundScore - 1e-6) {
          const c = crossingsIn(trial);
          if (c > crossings) continue;
          found = trial;
          foundScore = s;
          foundCrossings = c;
        }
      }
      if (found) {
        pos = found;
        current = foundScore;
        crossings = foundCrossings;
        better = true;
      }
    }
    if (!better) break;
  }
  return { pos, score: current };
}

/**
 * Each tert-butyl (or other trident, `tridentEnds`) turned about the bond into it, a few degrees at a time,
 * to where the drawing reads best: its fan of methyls is compact, and its
 * best place often lies between the coarser turns that cleared it of the
 * rest (untangle) - ginkgolide B's, turned off its ring until a methyl
 * touched the corner of the H of the OH beside it. No turn that crosses
 * bonds is taken.
 */
function settleFans(
  mol: Molecule,
  piece: number[],
  start: Grown,
  startScore: number,
  score: (pos: Grown) => number,
  fixed: (atoms: readonly number[]) => boolean,
): { pos: Grown; score: number } {
  let pos = start;
  let current = startScore;
  const bonds = [...mol.bondIndex.keys()].map((k) => k.split(",").map(Number) as [number, number]).filter(([a]) => pos.has(a));
  const crossingsIn = (p: Grown) => {
    let count = 0;
    for (let i = 0; i < bonds.length; i++)
      for (let j = i + 1; j < bonds.length; j++) {
        const [a, b] = bonds[i];
        const [c, d] = bonds[j];
        if (a !== c && a !== d && b !== c && b !== d && segmentsCross(p.get(a)!, p.get(b)!, p.get(c)!, p.get(d)!)) count++;
      }
    return count;
  };
  for (const a of piece) {
    const ends = tridentEnds(mol, a);
    if (!ends) continue;
    const end = mol.neighbours[a].find((v) => !ends.includes(v))!;
    const side = sideAtoms(mol, end, a);
    if (fixed(side)) continue;
    const crossings = crossingsIn(pos);
    let found: Grown | null = null;
    for (let t = -45; t <= 45; t += 5) {
      if (!t) continue;
      const trial = new Map(pos);
      turnSide(trial, side, trial.get(end)!, (t * Math.PI) / 180);
      const s = score(trial);
      if (s < current - 1e-6 && crossingsIn(trial) <= crossings) {
        found = trial;
        current = s;
      }
    }
    if (found) pos = found;
  }
  return { pos, score: current };
}

/**
 * A sugar hung on a macrolide seen from the face its carbons number
 * clockwise from, the aglycone staying as it is: turned over on one side or
 * the other of its glycosidic O, and swung round that link as far as it
 * must be to clear the rest. No move that crosses bonds is taken.
 */
function faceSugars(
  mol: Molecule,
  piece: number[],
  start: Grown,
  startScore: number,
  score: (pos: Grown) => number,
  sides: Map<string, number>,
): { pos: Grown; score: number } {
  let pos = start;
  let current = startScore;
  const here = new Set(piece);
  const links = sugarLinks(mol).filter(([a]) => here.has(a));
  if (!links.length) return { pos, score: current };
  const bonds = [...mol.bondIndex.keys()]
    .map((k) => k.split(",").map(Number) as [number, number])
    .filter(([a]) => here.has(a));
  const crossingsIn = (p: Grown) => {
    let count = 0;
    for (let i = 0; i < bonds.length; i++) {
      const [a, b] = bonds[i];
      for (let j = i + 1; j < bonds.length; j++) {
        const [c, d] = bonds[j];
        if (a === c || a === d || b === c || b === d) continue;
        if (segmentsCross(p.get(a)!, p.get(b)!, p.get(c)!, p.get(d)!)) count++;
      }
    }
    return count;
  };
  let crossings = crossingsIn(pos);
  for (let round = 0; round < 2; round++) {
    let better = false;
    for (const [a, b] of links) {
      const side = sideAtoms(mol, a, b);
      let found: Grown | null = null;
      let foundScore = current;
      let foundCrossings = crossings;
      // (turned over across the link's line, the sugar's ring lies askew:
      // the turns that set it square on the lattice again, and others)
      const flipped = new Map(pos);
      flip(mol, flipped, a, b, sides);
      const ringBond = bonds.find(
        ([u, v]) => side.includes(u) && side.includes(v) && mol.ringBonds.has(u < v ? `${u},${v}` : `${v},${u}`),
      );
      const turns = [0, 15, -15, 30, -30, 45, -45, 60, -60];
      if (ringBond) {
        const t = (angleOf(sub(flipped.get(ringBond[1])!, flipped.get(ringBond[0])!)) * 180) / Math.PI;
        const square = 30 + 60 * Math.round((t - 30) / 60) - t;
        turns.push(square, square + 60, square - 60);
      }
      for (const t of turns) {
        const trial = new Map(flipped);
        if (t) turnSide(trial, side, trial.get(a)!, (t * Math.PI) / 180);
        const s = score(trial);
        if (s < foundScore - 1e-6) {
          const c = crossingsIn(trial);
          if (c > crossings) continue;
          found = trial;
          foundScore = s;
          foundCrossings = c;
        }
      }
      if (found) {
        pos = found;
        current = foundScore;
        crossings = foundCrossings;
        better = true;
      }
    }
    if (!better) break;
  }
  return { pos, score: current };
}

/** Each side of the glycosidic O of a sugar hung on a macrolide: aglycone side first. */
function sugarLinks(mol: Molecule): [number, number][] {
  const out: [number, number][] = [];
  const macro = (a: number) => mol.ringsOf[a].some((r) => mol.rings[r].length >= 12);
  for (let o = 0; o < mol.n; o++) {
    if (mol.el[o] !== "O" || mol.systemOf[o] >= 0 || mol.neighbours[o].length !== 2) continue;
    const [p, q] = mol.neighbours[o];
    const sugar = (c: number) =>
      mol.ringsOf[c].some((r) => {
        const ring = mol.rings[r];
        return (ring.length === 5 || ring.length === 6) && ring.filter((a) => mol.el[a] === "O").length === 1;
      });
    if (macro(p) && sugar(q)) out.push([p, o], [o, q]);
    else if (macro(q) && sugar(p)) out.push([q, o], [o, p]);
  }
  return out;
}

/** The benchmark's score for a piece as laid out. */
export function scorer(
  mol: Molecule,
  piece: number[],
  depth: readonly (number | null)[] = [],
  solid: readonly boolean[] = [],
  hydrogenRoom?: number,
  sugarFaces?: boolean,
  hydrogenInk?: boolean,
): (pos: Grown) => number {
  const index = new Map(piece.map((a, i) => [a, i]));
  const edges: [number, number][] = [];
  const orders: number[] = [];
  const cisTrans: { bond: number; refs: [number, number]; cis: boolean }[] = [];
  for (const [k, i] of mol.bondIndex) {
    const [a, b] = k.split(",").map(Number);
    if (!index.has(a)) continue;
    const st = mol.bonds[i].stereo;
    if (st && mol.bonds[i].order === 2) {
      // (the bond's ends in the same order as the edge, the refs with them)
      cisTrans.push({ bond: edges.length, refs: [index.get(st.refs[0])!, index.get(st.refs[1])!], cis: st.cis });
    }
    edges.push([index.get(a)!, index.get(b)!]);
    orders.push(mol.bonds[i].order);
  }
  const rings = mol.rings
    .filter((r) => index.has(r[0]))
    .map((r) => r.map((a) => index.get(a)!));
  const elements = piece.map((a) => mol.el[a]);
  const hydrogens = piece.map((a) => mol.hs[a]);
  // (a star at a pi system's centre is drawn as nothing)
  const labelled = piece.map((a) => (mol.el[a] !== "C" && mol.el[a] !== "*") || mol.charge[a] !== 0);
  const perspective = piece.map((a) => solid[a] ?? false);
  const depths = piece.map((a) => depth[a] ?? null);
  const tetra = piece.map((a) => {
    const t = mol.tetra.get(a);
    return t && { neighbours: t.neighbours.map((b) => (b < 0 ? -1 : index.get(b)!)), volume: t.volume };
  });
  return (pos) =>
    layoutMetrics({
      x: piece.map((a) => pos.get(a)!.x),
      y: piece.map((a) => pos.get(a)!.y),
      edges,
      orders,
      elements,
      hydrogens,
      labelled,
      rings,
      cisTrans,
      perspective,
      depth: depths,
      tetra,
      hydrogenRoom,
      hydrogenInk,
      // (names' letters counted lightly while the parts are set - the way
      // a molecule is turned comes first - and made room for last, with
      // the H's)
      ...(hydrogenRoom === 0 ? { nameRoom: NAME_ROOM_FIRST } : {}),
      sugarFaces,
    }).score;
}
