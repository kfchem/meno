/**
 * A projection recognised where a drawing gives no depth (docs/EDITOR-2D.md, *Drawn in perspective*; foundation part 11): a six-ring drawn as a
 * chair is a ring in perspective, and its atoms have a depth the drawing does not state. This works it out - the chair's solid
 * (./solids) fitted to the drawn places - and answers one of: the ring is FLAT (an ordinary drawing: the usual reading), DEPTH for each atom,
 * or UNREAD with why. It changes nothing in a document; what reads a drawing with depth (lib/layout/drawn) reads the depth worked out as it
 * reads one a tool stored.
 *
 * Every rule here is on the side of "unread, and said": the danger is a configuration given where none was drawn, or the mirror one.
 *
 * The numbers below were set on the corpus of the tests (every chair view of the solid, turned and jittered; every flat drawing the engine
 * makes of a six-ring), so that each generated chair is read or refused and no flat one is read: no basis from a text is claimed for them.
 */
import { chair, cross, dot, flipped, fused, length, sub, type Solid, type V3 } from "./solids";
import { drawn, type Drawn } from "./views";

type Pt = { x: number; y: number };

const DEG = Math.PI / 180;

/** How far from parallel two opposite bonds of a ring drawn as a chair may be. */
const PARALLEL = Math.sin(12 * DEG);

/**
 * Whether a ring of six, its atoms in order round it, is drawn as a chair - in perspective, as a textbook draws one: each of
 * its three pairs of opposite bonds parallel, its outline not convex (a flat hexagon's opposite sides are parallel too).
 */
export function drawnAsChair(ring: readonly Pt[]): boolean {
  return oppositeParallel(ring) && notConvex(ring);
}

/** Whether a ring of six, its atoms in order round it, has each of its three pairs of opposite bonds parallel (as a chair's are, and a flat hexagon's). */
function oppositeParallel(ring: readonly Pt[]): boolean {
  if (ring.length !== 6) return false;
  const e = ring.map((p, i) => ({ x: ring[(i + 1) % 6].x - p.x, y: ring[(i + 1) % 6].y - p.y }));
  return [0, 1, 2].every((i) => Math.abs(cross2(e[i], e[i + 3])) <= PARALLEL * Math.hypot(e[i].x, e[i].y) * Math.hypot(e[i + 3].x, e[i + 3].y));
}

/** Whether a ring's outline as drawn turns both ways. */
function notConvex(ring: readonly Pt[]): boolean {
  const n = ring.length;
  const e = ring.map((p, i) => ({ x: ring[(i + 1) % n].x - p.x, y: ring[(i + 1) % n].y - p.y }));
  const turns = e.map((u, i) => Math.sign(cross2(u, e[(i + 1) % n])));
  return turns.some((t) => t > 0) && turns.some((t) => t < 0);
}

const cross2 = (u: Pt, v: Pt) => u.x * v.y - u.y * v.x;

/** How far the two rows of the fitted map may differ in length, as a ratio, and in angle from a right angle: a textbook chair is "drawn the way textbooks do, not exactly as it is seen", so generous. */
export const MOST_UNEQUAL = 0.25;
export const MOST_SKEW = 20 * DEG;
/** The most the fit may miss the drawn places, the mean square in bond lengths. */
export const MOST_MISS = 0.02;
/** How much better the best reading must fit than any other that reads the ring otherwise: the other's miss must be at least this times the best's, or the ring is unread. */
export const MARGIN = 3;
/** How near level a chair's long axis as drawn must lie for "the lower atoms are nearer" to apply (CHEM, 2026-11-13: by convention, no text gives an angle). */
export const LEVEL_ANGLE = 30 * DEG;



export type Recognised =
  | { kind: "flat" }
  | { kind: "depth"; /** Each ring atom's depth, in the drawing's units (nearer larger), in the order given. */ z: number[]; by: "mark" | "convention" }
  | { kind: "unread"; why: string };

/** The words for a ring in perspective whose near and far are not marked: what to draw. */
export const NOT_MARKED = "the ring is drawn in perspective, but its near and far are not marked: draw its near bonds bold";
/** The words for a ring in perspective that no one solid fits clearly. */
export const NOT_ONE_SHAPE = "the ring is drawn in perspective, but not clearly as one shape";
/** The words for a centre read from a ring in perspective that the drawing gives no depth (a chair, or chairs fused). */
export const READ_IN_PERSPECTIVE = "read from the ring as drawn in perspective";

type Fit = { z: number[]; miss: number };

/** The best linear map from a chair's atoms (three dimensions) to the drawn places (two), each way round and from each atom: its fit, with the depth it gives (sign not yet chosen). */
function fits(ring: readonly Pt[]): Fit[] {
  const solid = chair().atoms;
  const out: Fit[] = [];
  for (const dir of [1, -1]) {
    for (let o = 0; o < 6; o++) {
      const fit = viewOf(ring.map((_, i): V3 => solid[(((o + dir * i) % 6) + 6) % 6]), ring);
      if (fit) out.push(fit);
    }
  }
  return out;
}

/**
 * The best linear map from a solid's atoms (three dimensions, bond length 1) to their drawn places (two), least squares, closed form: its
 * fit, with the depth it gives each atom (about their middle, in the drawing's units; sign not yet chosen) - or null where the map is no
 * view of the solid, its two rows unequal by more than `MOST_UNEQUAL` or off a right angle by more than `MOST_SKEW`.
 */
function viewOf(p: readonly V3[], ring: readonly Pt[]): Fit | null {
  const n = p.length;
  const q = ring.map((v) => [v.x, v.y] as const);
  const mean2 = [0, 1].map((k) => q.reduce((s, v) => s + v[k], 0) / n);
  const mean3 = [0, 1, 2].map((k) => p.reduce((s, v) => s + v[k], 0) / n) as unknown as V3;
  const P = p.map((v) => sub(v, mean3));
  const Q = q.map((v) => [v[0] - mean2[0], v[1] - mean2[1]]);
  // A = Q^T P (P^T P)^-1: the rows of A, two vectors of three
  const PtP = [0, 1, 2].map((r) => [0, 1, 2].map((c) => P.reduce((s, v) => s + v[r] * v[c], 0)));
  const inv = invert3(PtP);
  if (!inv) return null;
  const QtP = [0, 1].map((r) => [0, 1, 2].map((c) => P.reduce((s, v, i) => s + Q[i][r] * v[c], 0)));
  const A = QtP.map((row) => [0, 1, 2].map((c) => row[0] * inv[0][c] + row[1] * inv[1][c] + row[2] * inv[2][c]) as unknown as V3);
  const [r1, r2] = A;
  const [l1, l2] = [length(r1), length(r2)];
  if (l1 < 1e-9 || l2 < 1e-9) return null;
  const scale = (l1 + l2) / 2;
  if (Math.abs(l1 - l2) / scale > MOST_UNEQUAL) return null;
  if (Math.abs(Math.acos(dot(r1, r2) / (l1 * l2)) - Math.PI / 2) > MOST_SKEW) return null;
  const miss = P.reduce((s, v, i) => s + (dot(r1, v) - Q[i][0]) ** 2 + (dot(r2, v) - Q[i][1]) ** 2, 0) / n / (scale * scale);
  const normal = cross(r1, r2);
  const nl = length(normal);
  return { z: P.map((v) => (dot(normal, v) / nl) * scale), miss };
}

/**
 * A bridged ring system or a cage drawn with no depth (norbornane, camphor, adamantane), against the ways Meno itself draws it in perspective
 * (`views`: each its atoms' places and depths, in the order of `places` - the layout's textbook views of the engine's solid, lib/layout/cage):
 * recognised as one of them, or unread - or flat, where none fits. A cage is fitted to Meno's drawing of it, not to a view of its solid: the
 * engine draws a cage the way textbooks do, and its own drawings of the larger cages are further from any true view than a flat drawing of
 * some is, so "a view of the solid" tells neither from the other. Each view, and its mirror in the page, is laid on the drawn places by the best
 * turn, scale and shift (`MOST_MISS`; another that fits nearly as well and reads otherwise leaves it unread, `MARGIN`). Near and far by a
 * mark only: a bold ring bond (`bold`, pairs of indices) is the nearer edge (Brecher 2006, ST-3.1, ST-3.3). With no mark it is unread: the
 * convention of ST-3.1 is for ring systems in general, bridged ones among them, but Meno does not apply it to a bridged system or a cage yet,
 * since which of its rings is the mostly-horizontal one is not always clear - so the words ask for the near bonds drawn bold.
 */
export function recogniseByViews(
  places: readonly Pt[],
  views: readonly (readonly { x: number; y: number; z: number }[])[],
  bold: readonly (readonly [number, number])[] = [],
): Recognised {
  if (places.length < 4) return { kind: "flat" };
  const all: Fit[] = [];
  for (const view of views) {
    if (view.length !== places.length) continue;
    for (const mirror of [1, -1]) {
      const pts = view.map((p) => ({ x: mirror * p.x, y: p.y }));
      const fit = similarity(pts, places);
      if (fit) all.push({ z: view.map((p) => p.z * fit.scale), miss: fit.miss });
    }
  }
  all.sort((p, q) => p.miss - q.miss);
  const best = all[0];
  if (!best || best.miss > MOST_MISS) return { kind: "flat" };
  const mean = best.z.reduce((m, v) => m + v, 0) / best.z.length;
  const z = best.z.map((v) => v - mean);
  const tol = 0.05 * Math.max(1, ...z.map(Math.abs));
  const centred = (f: Fit) => {
    const m = f.z.reduce((s, v) => s + v, 0) / f.z.length;
    return f.z.map((v) => v - m);
  };
  const other = all.find((f) => f.miss <= MOST_MISS && !sameShape(centred(f), z, tol));
  if (other && other.miss < MARGIN * Math.max(best.miss, 1e-6)) return { kind: "unread", why: NOT_ONE_SHAPE };
  if (!bold.length) return { kind: "unread", why: NOT_MARKED };
  const unit = Math.max(1e-9, ...z.map(Math.abs));
  const says = bold.map(([i, j]) => {
    const sum = z[i] + z[j];
    return Math.abs(sum) < 0.2 * unit ? 0 : Math.sign(sum);
  });
  if (!says.every((v) => v !== 0 && v === says[0])) return { kind: "unread", why: NOT_MARKED };
  return { kind: "depth", z: z.map((v) => says[0] * v), by: "mark" };
}

/** The best turn, scale and shift of the chair as drawn (each way round, from each atom, in either textbook form) onto the drawn places: its fit, with the depth it gives (sign not yet chosen), in the drawing's units. */
function conventionFits(ring: readonly Pt[]): Fit[] {
  const out: Fit[] = [];
  // (both textbook chairs: F9's `drawn`, form 0 and form 1 - the chair seen from either side of its mirror plane)
  for (const form of [0, 1]) {
    const solid = drawn(chair(), form)!.atoms;
    for (const dir of [1, -1]) {
      for (let o = 0; o < 6; o++) {
        const p = ring.map((_, i) => solid[(((o + dir * i) % 6) + 6) % 6]);
        const [px, py] = [0, 1].map((c) => p.reduce((m, v) => m + (c ? v.y : v.x), 0) / 6);
        const [qx, qy] = [0, 1].map((c) => ring.reduce((m, v) => m + (c ? v.y : v.x), 0) / 6);
        // (the turn and the scale as one complex number a = sum conj(p) q / sum |p|^2: the least squares of q = a p)
        let [re, im, norm] = [0, 0, 0];
        p.forEach((v, i) => {
          const [ux, uy, wx, wy] = [v.x - px, v.y - py, ring[i].x - qx, ring[i].y - qy];
          re += ux * wx + uy * wy;
          im += ux * wy - uy * wx;
          norm += ux * ux + uy * uy;
        });
        const scale = Math.hypot(re, im) / norm;
        if (scale < 1e-9) continue;
        const [ar, ai] = [re / norm, im / norm];
        const miss =
          p.reduce((m, v, i) => {
            const [ux, uy] = [v.x - px, v.y - py];
            const [fx, fy] = [ar * ux - ai * uy, ai * ux + ar * uy];
            return m + (fx - (ring[i].x - qx)) ** 2 + (fy - (ring[i].y - qy)) ** 2;
          }, 0) /
          6 /
          (scale * scale);
        out.push({ z: p.map((v) => v.z * scale), miss });
      }
    }
  }
  return out;
}

/** The best turn, scale and shift in the page of `p` onto `q` (least squares, closed form): the scale, and the miss - the mean square, in units of the scaled `p`. */
function similarity(p: readonly Pt[], q: readonly Pt[]): { scale: number; miss: number } | null {
  const n = p.length;
  const [px, py, qx, qy] = [p.reduce((m, v) => m + v.x, 0) / n, p.reduce((m, v) => m + v.y, 0) / n, q.reduce((m, v) => m + v.x, 0) / n, q.reduce((m, v) => m + v.y, 0) / n];
  // (the turn and the scale as one complex number a = sum conj(p) q / sum |p|^2)
  let [re, im, norm] = [0, 0, 0];
  p.forEach((v, i) => {
    const [ux, uy, wx, wy] = [v.x - px, v.y - py, q[i].x - qx, q[i].y - qy];
    re += ux * wx + uy * wy;
    im += ux * wy - uy * wx;
    norm += ux * ux + uy * uy;
  });
  if (norm < 1e-12) return null;
  const scale = Math.hypot(re, im) / norm;
  if (scale < 1e-9) return null;
  const [ar, ai] = [re / norm, im / norm];
  const miss = p.reduce((m, v, i) => {
    const [ux, uy] = [v.x - px, v.y - py];
    return m + (ar * ux - ai * uy - (q[i].x - qx)) ** 2 + (ai * ux + ar * uy - (q[i].y - qy)) ** 2;
  }, 0);
  return { scale, miss: miss / n / (scale * scale) };
}

const FUSIONS: ("trans" | { cis: 1 | -1 })[] = ["trans", { cis: 1 }, { cis: -1 }];

/** A solid of chairs fused, and its two textbook drawings (`drawn`, forms 0 and 1). */
type Built = { solid: Solid; drawn: (Drawn | null)[] };
/** The solids of chairs fused, kept: they depend only on how they are built - the first chair or its flip, then each bond fused on and how - never on a drawing. */
const builtSolids = new Map<string, Built | null>();
const withDrawings = (solid: Solid): Built => ({ solid, drawn: [drawn(solid, 0), drawn(solid, 1)] });
function baseSolid(base: number): Built {
  const key = `${base}`;
  if (!builtSolids.has(key)) builtSolids.set(key, withDrawings(base ? flipped(chair()) : chair()));
  return builtSolids.get(key)!;
}
function fusedOn(key: string, solid: Solid, bond: number, how: (typeof FUSIONS)[number]): Built | null {
  if (!builtSolids.has(key)) {
    let made: Built | null = null;
    try {
      made = withDrawings(fused(solid, bond, "chair", how));
    } catch {
      made = null;
    }
    builtSolids.set(key, made);
  }
  return builtSolids.get(key)!;
}

/**
 * Chairs fused on bonds, fitted as one: every way F9 fuses chairs on the drawing's bonds - each fusion trans, or cis on either face - drawn as
 * the textbook draws them (`drawn`, both forms), each laid on the drawn places from each atom of the first ring and both ways round, by the best
 * turn, scale and shift of the whole system. So a trans or a cis fusion is read from the drawing, never assumed. Null where the rings are not
 * fused one to the next on a bond each (a spiro join, a bridge, a ring apart).
 */
function fusedFits(places: readonly Pt[], rings: readonly (readonly number[])[]): Fit[] | null {
  const steps: { ring: number; s: number; t: number }[] = [];
  const reached = new Set(rings[0]);
  const done = new Set([0]);
  while (done.size < rings.length) {
    let found = false;
    for (let r = 0; r < rings.length && !found; r++) {
      if (done.has(r)) continue;
      const shared = rings[r].filter((i) => reached.has(i));
      if (!shared.length) continue;
      if (shared.length !== 2) return null;
      const [ks, kt] = shared.map((i) => rings[r].indexOf(i));
      if (Math.abs(ks - kt) !== 1 && Math.abs(ks - kt) !== 5) return null;
      steps.push({ ring: r, s: shared[0], t: shared[1] });
      rings[r].forEach((i) => reached.add(i));
      done.add(r);
      found = true;
    }
    if (!found) return null;
  }
  if (reached.size !== places.length) return null;
  const out: Fit[] = [];
  const kinds = (k: number): (typeof FUSIONS)[] => (k ? kinds(k - 1).flatMap((rest) => FUSIONS.map((f) => [...rest, f])) : [[]]);
  for (const base of [0, 1]) {
    for (const dir of [1, -1]) {
      for (let o = 0; o < 6; o++) {
        for (const how of kinds(steps.length)) {
          // (the drawing's atoms as the solid's, built ring by ring)
          const map = new Map<number, number>(rings[0].map((d, k) => [d, (((o + dir * k) % 6) + 6) % 6]));
          let built: Built | null = baseSolid(base);
          let key = `${base}`;
          for (let k = 0; k < steps.length && built; k++) {
            const { ring, s, t } = steps[k];
            const [ms, mt] = [map.get(s)!, map.get(t)!];
            const solid: Solid = built.solid;
            const bond = solid.bonds.findIndex(([a, b]) => (a === ms && b === mt) || (a === mt && b === ms));
            if (bond < 0) {
              built = null;
              break;
            }
            const [di, dj] = solid.bonds[bond][0] === ms ? [s, t] : [t, s];
            key += `|${bond}:${typeof how[k] === "string" ? "t" : (how[k] as { cis: number }).cis}`;
            built = fusedOn(key, solid, bond, how[k]);
            if (!built) break;
            // (the new ring's atoms: on from the bond's second atom j, round to its first i - j, x2, y, z, x1, i)
            const n = built.solid.atoms.length - 4;
            const rr = rings[ring];
            const at = rr.indexOf(dj);
            const step = rr[(at + 1) % 6] === di ? -1 : 1;
            [n + 1, n + 2, n + 3, n].forEach((m, q) => map.set(rr[(((at + step * (q + 1)) % 6) + 6) % 6], m));
          }
          if (!built) continue;
          for (const d of built.drawn) {
            if (!d) continue;
            const ofDrawing = places.map((_, i) => d.atoms[map.get(i)!]);
            const fit = similarity(ofDrawing, places);
            if (fit) out.push({ z: ofDrawing.map((p) => p.z * fit.scale), miss: fit.miss });
          }
        }
      }
    }
  }
  return out;
}

function invert3(m: number[][]): number[][] | null {
  const [[a, b, c], [d, e, f], [g, h, i]] = m;
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (Math.abs(det) < 1e-12) return null;
  return [
    [(e * i - f * h) / det, (c * h - b * i) / det, (b * f - c * e) / det],
    [(f * g - d * i) / det, (a * i - c * g) / det, (c * d - a * f) / det],
    [(d * h - e * g) / det, (b * g - a * h) / det, (a * e - b * d) / det],
  ];
}

/** Two depth patterns read the ring as the same shape: equal, or each the other's mirror (near and far, which the marks or the convention settle). */
const sameShape = (u: number[], v: number[], tol: number) => u.every((x, i) => Math.abs(x - v[i]) < tol) || u.every((x, i) => Math.abs(x + v[i]) < tol);

/**
 * A six-ring drawn without depth, its atoms in order round it (y up the page): recognised as a chair in perspective, or flat, or unread.
 * `bold` the ring bonds drawn bold or as a near edge (bond k joins atoms k and k + 1): a mark of which edge is nearer, which comes before
 * the convention (Brecher 2006, ST-3.1: the drawn order "should take precedence"; ST-3.3: only bold and solid wedged bonds are used to
 * emphasise perspective).
 */
export function recogniseChair(ring: readonly Pt[], bold: readonly number[] = []): Recognised {
  if (ring.length !== 6) return { kind: "flat" };
  return recogniseChairs(
    ring,
    [[0, 1, 2, 3, 4, 5]],
    bold.map((k) => [k % 6, (k + 1) % 6]),
  );
}

/** One ring drawn as a chair: its depths (their sign not yet chosen, about the ring's middle), or why not. */
function chairShape(ring: readonly Pt[]): { z: number[] } | { kind: "flat" } | { kind: "unread"; why: string } {
  if (!drawnAsChair(ring)) return { kind: "flat" };
  const all = [...conventionFits(ring), ...fits(ring)].sort((p, q) => p.miss - q.miss);
  const best = all[0];
  if (!best || best.miss > MOST_MISS) return { kind: "unread", why: NOT_ONE_SHAPE };
  // (a reading that fits as well, of the ring as another shape - not the same depths, nor their mirror)
  const tol = 0.05 * Math.max(1, ...best.z.map(Math.abs));
  const other = all.find((f) => f.miss <= MOST_MISS && !sameShape(f.z, best.z, tol));
  if (other && other.miss < MARGIN * Math.max(best.miss, 1e-6)) return { kind: "unread", why: NOT_ONE_SHAPE };
  return { z: best.z };
}

/**
 * A ring system of six-rings drawn as chairs and fused on bonds (one ring, a decalin, a perhydrophenanthrene, a steroid's chairs), with no
 * depth: recognised as one solid in perspective, or flat, or unread. `places` the system's atoms (y up the page); `rings` each ring's atoms
 * in order round it, as indices into `places`; `bold` the ring bonds drawn bold or as a near edge, as pairs of indices.
 *
 * One ring is fitted alone (`chairShape`); chairs fused are fitted as one (`fusedFits`), by the same bounds. Rings that share one atom only,
 * or more than a bond, are not read here (unread). Then near and far, for the whole system at once: a mark first, then the convention (the lower atoms nearer, the system's long axis within `LEVEL_ANGLE` of level).
 * The depth answered is in the order of `places`.
 */
export function recogniseChairs(places: readonly Pt[], rings: readonly (readonly number[])[], bold: readonly (readonly [number, number])[] = []): Recognised {
  if (!rings.length || rings.some((r) => r.length !== 6)) return { kind: "flat" };
  const asChair = rings.map((r) => drawnAsChair(r.map((i) => places[i])));
  if (!asChair.some(Boolean)) return { kind: "flat" };
  // (some rings of the system drawn as chairs and some not: in perspective, but not as one shape read here - but for a ring fused to a chair
  // whose opposite bonds are parallel with its outline convex: a chair seen nearly edge on, as a cis fusion draws one, which the fit of the
  // whole system then reads or refuses)
  if (!rings.every((r, k) => asChair[k] || (rings.length > 1 && oppositeParallel(r.map((i) => places[i]))))) return { kind: "unread", why: NOT_ONE_SHAPE };
  let z: (number | undefined)[];
  if (rings.length === 1) {
    const one = chairShape(rings[0].map((i) => places[i]));
    if ("kind" in one) return one;
    z = places.map(() => undefined);
    rings[0].forEach((i, k) => (z[i] = one.z[k]));
  } else {
    const all = fusedFits(places, rings);
    if (!all) return { kind: "unread", why: NOT_ONE_SHAPE };
    all.sort((p, q) => p.miss - q.miss);
    const best = all[0];
    if (!best || best.miss > MOST_MISS) return { kind: "unread", why: NOT_ONE_SHAPE };
    const tol = 0.05 * Math.max(1, ...best.z.map(Math.abs));
    const other = all.find((f) => f.miss <= MOST_MISS && !sameShape(f.z, best.z, tol));
    if (other && other.miss < MARGIN * Math.max(best.miss, 1e-6)) return { kind: "unread", why: NOT_ONE_SHAPE };
    z = best.z;
  }
  const inSystem = places.map((_, i) => i).filter((i) => z[i] != null);
  const middle = inSystem.reduce((m, i) => m + z[i]!, 0) / inSystem.length;
  const depth = places.map((_, i) => (z[i] == null ? 0 : z[i]! - middle));
  // (near and far: a mark first, then the convention)
  if (bold.length) {
    // (each marked edge nearer than the system's middle: its atoms' depths, taken together, on one side - a mark that leaves an edge level with the middle says nothing)
    const unit = Math.max(1e-9, ...inSystem.map((i) => Math.abs(depth[i])));
    const says = bold.map(([i, j]) => {
      const sum = depth[i] + depth[j];
      return Math.abs(sum) < 0.2 * unit ? 0 : Math.sign(sum);
    });
    if (!says.every((v) => v !== 0 && v === says[0])) return { kind: "unread", why: NOT_MARKED };
    return { kind: "depth", z: depth.map((v) => says[0] * v), by: "mark" };
  }
  // (the lower atoms nearer, ring by ring (ST-3.1: of a mostly-horizontal ring): each ring whose long axis lies within LEVEL_ANGLE of level
  // says which way round the system is; a ring standing steeper says nothing - a cis-fused ring may rise up the page, its upper atoms the
  // nearer; and a ring fused on seen nearly edge on, its outline convex, says nothing either: it is read by the fit. Every ring that says must
  // say the same, and one at least must)
  const votes = rings.flatMap((ring, k) => {
    if (!asChair[k]) return [];
    const mid = [0, 1].map((k) => ring.reduce((s, i) => s + (k ? places[i].y : places[i].x), 0) / ring.length);
    const [sxx, syy, sxy] = ring.reduce(
      (s, i) => [s[0] + (places[i].x - mid[0]) ** 2, s[1] + (places[i].y - mid[1]) ** 2, s[2] + (places[i].x - mid[0]) * (places[i].y - mid[1])],
      [0, 0, 0],
    );
    if (Math.abs(0.5 * Math.atan2(2 * sxy, sxx - syy)) > LEVEL_ANGLE) return [];
    const ringMiddle = ring.reduce((m, i) => m + depth[i], 0) / ring.length;
    return [ring.reduce((s, i) => s + (depth[i] - ringMiddle) * (places[i].y - mid[1]), 0) < 0 ? 1 : -1];
  });
  if (!votes.length || votes.some((v) => v !== votes[0])) return { kind: "unread", why: NOT_MARKED };
  return { kind: "depth", z: depth.map((v) => votes[0] * v), by: "convention" };
}

/** How far from level a Haworth ring's front edge may be drawn, either way (by convention, as IN_LINE: no text gives an angle). */
export const LEVEL_EDGE = 10 * DEG;
/** How far above the front edge every other ring atom must stand, as a share of that edge's length: above it, not level with it. */
export const ABOVE = 0.1;
/**
 * How tall a ring may be drawn, against the regular ring of its level bond standing on that edge, to be read as a Haworth ring by its groups:
 * at most this share (ARCH, 11-13: the regular ring seen from 60 degrees up or lower; 1.5 level bonds for a six-ring, 1.34 for a five-ring;
 * Brecher 2006's ring is 1.155, McNaught 1996's pyranose about 1.4). A regular ring is a flat drawing that happens to lie so, and its groups
 * drawn vertical state no configuration (ST-1.9; nothing is guessed). A bold near edge reads at any height: a mark, not a guess (ST-3.3).
 */
export const HAWORTH_HEIGHT = 0.87;
/** How far from vertical a group's bond may be drawn for a group to be "drawn up or down" of a Haworth ring. */
export const VERTICAL = Math.sin(15 * DEG);
/**
 * The eye's height over a Haworth ring's plane, as its sine (rule (H), ARCH 11-13, from Brecher 2006's figure: a regular ring seen so is 1.155
 * level bonds tall): the depth a ring drawn by hand is given from its height on the page. F9's own constant when its view is changed to it.
 */
export const HAWORTH_SIN = 2 / 3;

/** The words for a ring taken for a Haworth ring (said where its centres' configuration is read: "read as a Haworth ring"). */
export const READ_AS_HAWORTH = "read as a Haworth ring";

/**
 * A ring of five or six, its atoms in order round it, drawn as a Haworth ring: found by what the texts' own figures share, not by fitting a
 * regular ring (McNaught 1996's furanose is 2.5 level bonds wide, no regular pentagon; its pyranose taller than Brecher 2006's - CHEM, 11-13):
 * - its lowest ring bond level (within `LEVEL_EDGE`): the front edge, and so the nearer (Brecher 2006, ST-3.1; McNaught 2-Carb-5.4);
 * - every other ring atom above that edge;
 * - every group out of the ring drawn straight up or straight down (within `VERTICAL`), at any length - or a bold ring bond, a near edge.
 * Never the ring alone (Brecher 2006, ST-1.9: such a drawing is ambiguous, since it is unclear whether the author meant a Haworth projection or
 * happened to draw the ring that way). No ring O at the back is needed (2-Carb-5.5's other orientations keep the lower edge the nearer). Its
 * depth: each atom's height on the page, as a ring seen from `HAWORTH_SIN` above gives it, the lower nearer - or, a ring bond marked
 * bold, that edge the nearer, which comes first. `groups` the page direction of each bond out of the ring at its atoms (an H drawn counts).
 */
export function recogniseHaworth(ring: readonly Pt[], groups: readonly Pt[], bold: readonly number[] = []): Recognised {
  const n = ring.length;
  if (n !== 5 && n !== 6) return { kind: "flat" };
  const vertical = groups.length > 0 && groups.every((g) => Math.abs(g.x) <= VERTICAL * Math.hypot(g.x, g.y));
  if (!vertical && !bold.length) return { kind: "flat" };
  // (the lowest ring bond, by its middle)
  const edge = [...Array(n).keys()].reduce((lo, k) => (ring[k].y + ring[(k + 1) % n].y < ring[lo].y + ring[(lo + 1) % n].y ? k : lo), 0);
  const [a, b] = [ring[edge], ring[(edge + 1) % n]];
  const along = Math.hypot(b.x - a.x, b.y - a.y);
  if (along < 1e-9 || Math.abs(b.y - a.y) > Math.sin(LEVEL_EDGE) * along) return { kind: "flat" };
  const top = Math.max(a.y, b.y);
  if (ring.some((p, k) => k !== edge && k !== (edge + 1) % n && p.y < top + ABOVE * along)) return { kind: "flat" };
  // (no taller than a regular ring seen from 60 degrees up, unless a near edge is marked: the regular ring's height on its edge, 1.732 or 1.539 of it)
  const regular = n === 6 ? Math.sqrt(3) : Math.sqrt(5 + 2 * Math.sqrt(5)) / 2;
  const height = Math.max(...ring.map((p) => p.y)) - (a.y + b.y) / 2;
  if (!bold.length && height > HAWORTH_HEIGHT * regular * along) return { kind: "flat" };
  // (the ring's height as seen from HAWORTH_SIN above: a point's depth is minus its height over the tangent of the elevation, nearer larger)
  const k = Math.sqrt(1 - HAWORTH_SIN * HAWORTH_SIN) / HAWORTH_SIN;
  const middle = ring.reduce((m, v) => m + v.y, 0) / n;
  const z = ring.map((v) => -(v.y - middle) * k);
  if (bold.length) {
    const says = bold.map((j) => Math.sign(z[j % n] + z[(j + 1) % n]));
    if (!says.every((v) => v !== 0 && v === says[0])) return { kind: "unread", why: NOT_MARKED };
    return { kind: "depth", z: z.map((v) => says[0] * v), by: "mark" };
  }
  return { kind: "depth", z, by: "convention" };
}
