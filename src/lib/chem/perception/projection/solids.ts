/**
 * The solids of the projections (foundation part 9): the chair - and its ring flip - the boat, the half-chair, the envelope, the
 * Haworth ring and the Newman pair, each a few atoms in space at bond length 1, with the places a group can go: the free positions,
 * each a unit direction; and rings fused on a chair's bond. The drawing tools (part 10) draw from them, the reader (part 8) and
 * the fit (part 11) read against them: one definition for all.
 *
 * Pure geometry: no drawing model, no page units, imports nothing but this folder. Every number has its basis beside it:
 * derived (the line is shown), from a cited text (Moss 1996, basic terminology of stereochemistry, Pure Appl. Chem. 68, 2193;
 * McNaught 1996, nomenclature of carbohydrates, Pure Appl. Chem. 68, 1919; Brecher 2006, Pure Appl. Chem. 78, 1897), or "by
 * convention" where a look is chosen and no basis is claimed.
 *
 * Space: x to the right, y away from the viewer (into the page), z up - a ring lies in the xy plane and its axis is z; a
 * Newman pair lies on z, the sight line, its front atom the nearer. (`views` turns a solid to the page.)
 */

export type V3 = readonly [number, number, number];

/** A place a group can go on an atom: the atom, and the unit direction of its bond. */
export type FreePosition = {
  /** The atom, by its index in `Solid.atoms`. */
  at: number;
  /** A unit vector, from the atom. */
  direction: V3;
  /** What the place is called: a chair's axial or equatorial; a Haworth ring's up or down; one of a Newman atom's three. */
  kind: "axial" | "equatorial" | "pseudo-axial" | "pseudo-equatorial" | "bowsprit" | "flagpole" | "up" | "down" | "spoke" | "in-plane";
  /** Which side of the ring's mean plane it lies on (an `in-plane` position, which lies on none, says 1): 1 the side the axis points to - up - and -1 the other. A Newman's spoke, which has no ring: 1 on the front atom, -1 on the back. */
  face: 1 | -1;
};

export type SolidKind = "chair" | "boat" | "half-chair" | "envelope" | "haworth" | "newman";

export type Solid = {
  kind: SolidKind;
  /** Bond length 1. */
  atoms: V3[];
  bonds: [number, number][];
  /** Where a group can go. */
  free: FreePosition[];
  /** The ring's own "up" - a chair's threefold axis, a Haworth ring's normal - a Newman's line of sight, toward the viewer. */
  axis: V3;
  /** How far a ring closed on ideal angles misses bond length 1, where it is built on others (`fused`); absent where it closes exactly. */
  miss?: number;
};

export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const length = (a: V3): number => Math.hypot(a[0], a[1], a[2]);
export const unit = (a: V3): V3 => scale(a, 1 / length(a));
export const distance = (a: V3, b: V3): number => length(sub(a, b));

const DEG = Math.PI / 180;

/**
 * An ideal chair's atoms: the ideal chair, D3d (Moss 1996, *Chair, Boat, Twist*) - a ring of six, every angle tetrahedral and every
 * ring torsion 60 degrees; a textbook chair for drawing, not a computed geometry.
 * Derived: atom k at (R cos 60k, R sin 60k, +h or -h in turn). The ring's step in xy is R (a hexagon's side is its radius), so a bond
 * is sqrt(R^2 + (2h)^2) = 1; two atoms apart, in xy sqrt(3) R and in z 0, a distance sqrt(3) R = sqrt(8/3) = 1.63299, the
 * tetrahedral 1,3 distance (2 sin(109.4712/2) = 1.63299), which fixes R = 2 sqrt(2)/3 = 0.94281, and then h = 1/6 (R^2 = 8/9,
 * (2h)^2 = 1/9).
 */
export const CHAIR_R = (2 * Math.SQRT2) / 3;
export const CHAIR_H = 1 / 6;
/** The z component of an equatorial direction: 1/3, against the axial's 1 (derived: the four bonds at an atom are tetrahedral, each pair at cosine -1/3). */
const EQUATORIAL_Z = 1 / 3;

/** The directions a chair atom can take a group in. `up`: the atom lies above the mean plane (+h). */
function chairFree(k: number, up: boolean): { axial: V3; equatorial: V3 } {
  const a = (60 * k * Math.PI) / 180;
  // (the equatorial leans out of the ring, away from the axial's side: derived, 1/3 down at an atom above the plane; its xy length sqrt(1 - 1/9) = 2 sqrt(2)/3 = CHAIR_R)
  return up ? { axial: [0, 0, 1], equatorial: [CHAIR_R * Math.cos(a), CHAIR_R * Math.sin(a), -EQUATORIAL_Z] } : { axial: [0, 0, -1], equatorial: [CHAIR_R * Math.cos(a), CHAIR_R * Math.sin(a), EQUATORIAL_Z] };
}

/** An ideal chair with atom 0 above the mean plane (`sign` 1) or below it (-1): the ring flip is the other. */
function chairOf(sign: 1 | -1): Solid {
  const atoms: V3[] = [];
  const free: FreePosition[] = [];
  for (let k = 0; k < 6; k++) {
    const up = (k % 2 === 0) === (sign === 1);
    atoms.push([CHAIR_R * Math.cos(60 * k * DEG), CHAIR_R * Math.sin(60 * k * DEG), up ? CHAIR_H : -CHAIR_H]);
    const f = chairFree(k, up);
    // (an axial group at an atom above the plane stands on the upper face, its equatorial on the lower; at an atom below it, the other way)
    free.push({ at: k, direction: f.axial, kind: "axial", face: up ? 1 : -1 }, { at: k, direction: f.equatorial, kind: "equatorial", face: up ? -1 : 1 });
  }
  return { kind: "chair", atoms, bonds: Array.from({ length: 6 }, (_, k): [number, number] => [k, (k + 1) % 6]), free, axis: [0, 0, 1] };
}

/** The ideal chair, atom 0 above the mean plane. */
export function chair(): Solid {
  return chairOf(1);
}

/**
 * The ring flip: the same ring, every atom the other side of the mean plane (h to -h). Every axial group becomes equatorial and the
 * reverse; each group keeps its face - up stays up. Only a chair flips.
 */
export function flipped(c: Solid): Solid {
  if (c.kind !== "chair" || c.atoms.length !== 6) throw new Error("only a chair flips");
  const sign = c.atoms[0][2] > 0 ? -1 : 1;
  return chairOf(sign);
}

/**
 * A Haworth ring: a regular planar ring of six (a pyranose) or five (a furanose), bond length 1, in the xy plane, its normal z.
 * Each atom has two free positions, up (+z) and down (-z). The atoms run clockwise seen from above, the ring O first, then C1 to C5
 * (C4 of a furanose):
 *  - a pyranose: O at 60 degrees (back right), C1 at 0 (right), C2 at -60 (front right), C3 at -120, C4 at 180 (left), C5 at 120;
 *  - a furanose: O at 90 (the back), C1 at 18 (right), C2 at -54, C3 at -126, C4 at 162.
 * The corners of a regular n-gon of side 1 lie on a circle of radius 1/(2 sin(180/n)): 1 for six, 0.85065 for five.
 * McNaught 1996, 2-Carb-5.4 (checked by CHEM): "viewed from slightly above so that the edge closer to the viewer is drawn below the more
 * distant edge, with the oxygen behind and C-1 at the right-hand end", the numbering then running clockwise; "the ring O at the back right"
 * of a pyranose is not in the words, it follows from them. 2-Carb-5.5 allows other orientations, in all of which the lower edge is still the
 * nearer: this is the tool's standard one, and a reader must not need the O at the back.
 */
export function haworth(size: 5 | 6): Solid {
  const radius = 1 / (2 * Math.sin(Math.PI / size));
  const first = size === 6 ? 60 : 90;
  const atoms: V3[] = [];
  const free: FreePosition[] = [];
  for (let k = 0; k < size; k++) {
    const angle = (first - (360 / size) * k) * DEG;
    atoms.push([radius * Math.cos(angle), radius * Math.sin(angle), 0]);
    free.push({ at: k, direction: [0, 0, 1], kind: "up", face: 1 }, { at: k, direction: [0, 0, -1], kind: "down", face: -1 });
  }
  return { kind: "haworth", atoms, bonds: Array.from({ length: size }, (_, k): [number, number] => [k, (k + 1) % size]), free, axis: [0, 0, 1] };
}

/**
 * How far the back atom's bonds are turned from the front's in an eclipsed Newman projection, in degrees, so that both show.
 * By eye: the look owner's choice, no basis claimed. Positive turns the back set counter-clockwise on the page.
 */
export const ECLIPSED_OFFSET_DEG = 12;

/**
 * A Newman pair: two atoms on the line of sight z, the front one nearer (z = +1/2) and the back one (z = -1/2), a bond 1 apart. Each has
 * three free positions, `spoke`s, which in space make the tetrahedral angle with the central bond: derived, a direction at angle
 * 109.4712 degrees to the bond has the cosine -1/3 with it, so its z is +1/3 of its length on the front atom (away from the back one)
 * and -1/3 on the back atom. On the page: the front atom's bonds meet at the circle's centre and the back atom's start at its rim
 * (Moss 1996, *Newman Projection*: the circle represents the nearer atom). Staggered, the front at 90, 210 and 330 degrees
 * (counter-clockwise from the right, y up) and the back at 30, 150 and 270; eclipsed, the back set at the front's plus
 * `ECLIPSED_OFFSET_DEG`. No text gives these angles: by convention, the look owner's choice.
 */
export function newman(form: "staggered" | "eclipsed"): Solid {
  const spoke = (page: number, front: boolean): V3 => [CHAIR_R * Math.cos(page * DEG), CHAIR_R * Math.sin(page * DEG), front ? EQUATORIAL_Z : -EQUATORIAL_Z];
  const frontAt = [90, 210, 330];
  const backAt = form === "staggered" ? [30, 150, 270] : frontAt.map((a) => a + ECLIPSED_OFFSET_DEG);
  // (a spoke's xy length is sqrt(1 - 1/9) = 2 sqrt(2)/3, the same number as a chair's R: CHAIR_R)
  return {
    kind: "newman",
    atoms: [
      [0, 0, 0.5],
      [0, 0, -0.5],
    ],
    bonds: [[0, 1]],
    free: [...frontAt.map((a): FreePosition => ({ at: 0, direction: spoke(a, true), kind: "spoke", face: 1 })), ...backAt.map((a): FreePosition => ({ at: 1, direction: spoke(a, false), kind: "spoke", face: -1 }))],
    axis: [0, 0, 1],
  };
}

/** The torsion of four points, in radians: the angle from a-b-c to b-c-d about the bond b-c, counter-clockwise looking from c to b positive... as IUPAC signs it (clockwise looking from b to c is positive). */
export function torsion(a: V3, b: V3, c: V3, d: V3): number {
  const b1 = sub(b, a);
  const b2 = sub(c, b);
  const b3 = sub(d, c);
  const n1 = cross(b1, b2);
  const n2 = cross(b2, b3);
  return Math.atan2(dot(cross(n1, n2), unit(b2)), dot(n1, n2));
}

/** A rotation and a translation: p to R p + t, R by rows. */
type Rigid = { rows: [V3, V3, V3]; shift: V3 };
const apply = (m: Rigid, p: V3): V3 => add([dot(m.rows[0], p), dot(m.rows[1], p), dot(m.rows[2], p)], m.shift);
const turn = (m: Rigid, d: V3): V3 => [dot(m.rows[0], d), dot(m.rows[1], d), dot(m.rows[2], d)];

/** The frame of four points in a chain a-b-c-d: its origin at b, e1 along b to c, e2 in the plane of a, b, c toward a. */
function frameOf(a: V3, b: V3, c: V3): { origin: V3; e: [V3, V3, V3] } {
  const e1 = unit(sub(c, b));
  const ba = sub(a, b);
  const e2 = unit(sub(ba, scale(e1, dot(ba, e1))));
  return { origin: b, e: [e1, e2, cross(e1, e2)] };
}

/** The motion that takes the chain `from` (a, b, c) onto `to`: a proper rotation, so a chain of the other handedness is not matched. */
function mapping(from: [V3, V3, V3], to: [V3, V3, V3]): Rigid {
  const f = frameOf(...from);
  const t = frameOf(...to);
  // R = sum over axes of (t.e_i)(f.e_i)^T, by rows: row r = sum_i t.e_i[r] * f.e_i
  const rows = [0, 1, 2].map((r) => add(add(scale(f.e[0], t.e[0][r]), scale(f.e[1], t.e[1][r])), scale(f.e[2], t.e[2][r]))) as [V3, V3, V3];
  const m: Rigid = { rows, shift: [0, 0, 0] };
  return { rows, shift: sub(t.origin, apply(m, f.origin)) };
}

/**
 * The two directions that complete the tetrahedron at an atom whose two ring bonds are `u1` and `u2` (unit vectors from it): the
 * bisector's opposite, 1/sqrt(3) long, and the normal of the two, sqrt(2/3) long, either way. Derived: with the angle between the ring
 * bonds tetrahedral (cosine -1/3), a result has cosine -(1 - 1/3)/(2/sqrt(3))/sqrt(3) = -1/3 with each; its length is sqrt(1/3 + 2/3) = 1.
 * Where the ring angle is other than tetrahedral it is still a unit vector, the nearest to tetrahedral the two bonds leave.
 */
function completing(u1: V3, u2: V3): [V3, V3] {
  const back = scale(unit(add(u1, u2)), -1 / Math.sqrt(3));
  const n = scale(unit(cross(u1, u2)), Math.sqrt(2 / 3));
  return [add(back, n), sub(back, n)];
}

/** The unit vectors from atom `k` of a ring to its two ring neighbours. */
function ringArms(atoms: readonly V3[], bonds: readonly [number, number][], k: number): [V3, V3] {
  const near = bonds.flatMap(([a, b]) => (a === k ? [b] : b === k ? [a] : []));
  return [unit(sub(atoms[near[0]], atoms[k])), unit(sub(atoms[near[1]], atoms[k]))];
}

const ringBonds = (n: number): [number, number][] => Array.from({ length: n }, (_, k): [number, number] => [k, (k + 1) % n]);

/**
 * The ideal boat, C2v (Moss 1996, *Chair, Boat, Twist*). Calculated by CHEM, 2026-11-13: with bond length 1 and w = sqrt(8/3), the
 * atoms (-1/3, w/2, sqrt(2)/3), (0, 0, 0), (1, 0, 0), (4/3, w/2, sqrt(2)/3), (1, w, 0), (0, w, 0) close exactly - every bond 1, every
 * angle 109.471 degrees, ring torsions 0, -60, 60, 0, -60, 60 - and the two out-of-plane atoms are 5/3 apart. Atoms 0 and 3 are the
 * out-of-plane ones. The axis is the plane's normal, toward the side they lie on. Each atom's two free positions complete its tetrahedron
 * (`completing`); at the out-of-plane atoms the one roughly parallel to the plane of the other four is the bowsprit and the other the
 * flagpole (Moss, *Bowsprit, Flagpole*); at the four atoms in the plane they are up or down by the side of that plane. It is not
 * norbornane's shape (a strained boat, its one-carbon bridge closing the angle far below tetrahedral): for drawing and as a candidate
 * for a fit, whose tolerance carries a real bridged ring.
 */
export function boat(): Solid {
  const w = Math.sqrt(8 / 3);
  const q = Math.SQRT2 / 3;
  const atoms: V3[] = [
    [-1 / 3, w / 2, q],
    [0, 0, 0],
    [1, 0, 0],
    [4 / 3, w / 2, q],
    [1, w, 0],
    [0, w, 0],
  ];
  const bonds = ringBonds(6);
  const free = atoms.flatMap((_, k): FreePosition[] => {
    const [d1, d2] = completing(...ringArms(atoms, bonds, k));
    if (k === 0 || k === 3) {
      // (the one nearer the plane of the other four - the less steep - is the bowsprit)
      const [low, high] = Math.abs(d1[2]) < Math.abs(d2[2]) ? [d1, d2] : [d2, d1];
      return [
        { at: k, direction: low, kind: "bowsprit", face: low[2] >= 0 ? 1 : -1 },
        { at: k, direction: high, kind: "flagpole", face: high[2] >= 0 ? 1 : -1 },
      ];
    }
    return [d1, d2].map((d): FreePosition => ({ at: k, direction: d, kind: d[2] >= 0 ? "up" : "down", face: d[2] >= 0 ? 1 : -1 }));
  });
  return { kind: "boat", atoms, bonds, free, axis: [0, 0, 1] };
}

/**
 * How far the two out-of-plane atoms of the half-chair stand from the plane of the other four, in bond lengths. By convention, no ideal
 * numbers in the texts and none claimed: a stated amount, the look owner's.
 */
export const HALF_CHAIR_OUT = 0.25;

/**
 * The half-chair (cyclohexene's): by convention, no ideal numbers in the texts. Moss 1996, *Half-chair*: four contiguous atoms are in a
 * plane and the other two lie on opposite sides of it. Atoms 0, 1, 2, 3 are the four in the plane z = 0 - atoms 1 and 2 the double bond's,
 * 0 and 3 the allylic ones - and 4 and 5 the others, at z = +HALF_CHAIR_OUT and -HALF_CHAIR_OUT. The ring has C2 symmetry (the y axis, taking
 * x to -x and z to -z: atom 5 is atom 4's image). Derived, bond length 1: atoms 1 and 2 at (-1/2, 0, 0) and (1/2, 0, 0); the planar atoms
 * 0 and 3 at the next corners of the regular hexagon, (-1, -sqrt(3)/2, 0) and (1, -sqrt(3)/2, 0); atom 4 at (x, y, d), with |4 - 5| = 1
 * giving x = sqrt(1/4 - d^2), and |4 - 3| = 1 giving y = -sqrt(3)/2 - sqrt(1 - d^2 - (x - 1)^2). The free positions at the allylic atoms
 * are pseudo-axial (the one more nearly parallel to the plane's normal) and pseudo-equatorial (Moss, *Axial, Equatorial*); at the other
 * two, axial and equatorial; the double bond's atoms, 1 and 2, have one each, `in-plane`, pointing out of the ring (a group on an alkene carbon).
 * The axis is the plane's normal.
 */
export function halfChair(): Solid {
  const d = HALF_CHAIR_OUT;
  const x = Math.sqrt(1 / 4 - d * d);
  const y = -Math.sqrt(3) / 2 - Math.sqrt(1 - d * d - (x - 1) * (x - 1));
  const atoms: V3[] = [
    [-1, -Math.sqrt(3) / 2, 0],
    [-0.5, 0, 0],
    [0.5, 0, 0],
    [1, -Math.sqrt(3) / 2, 0],
    [x, y, d],
    [-x, y, -d],
  ];
  const bonds = ringBonds(6);
  // (the double bond's atoms, 1 and 2, have one each, in the plane, pointing out: opposite the bisector of their two ring bonds)
  const vinylic = [1, 2].map((k): FreePosition => {
    const [u1, u2] = ringArms(atoms, bonds, k);
    return { at: k, direction: unit(scale(add(u1, u2), -1)), kind: "in-plane", face: 1 };
  });
  const free = [0, 3, 4, 5].flatMap((k): FreePosition[] => {
    const [d1, d2] = completing(...ringArms(atoms, bonds, k));
    const [steep, flat] = Math.abs(d1[2]) > Math.abs(d2[2]) ? [d1, d2] : [d2, d1];
    const allylic = k === 0 || k === 3;
    return [
      { at: k, direction: steep, kind: allylic ? "pseudo-axial" : "axial", face: steep[2] >= 0 ? 1 : -1 },
      { at: k, direction: flat, kind: allylic ? "pseudo-equatorial" : "equatorial", face: flat[2] >= 0 ? 1 : -1 },
    ];
  });
  return { kind: "half-chair", atoms, bonds, free: [...vinylic, ...free].sort((p, q) => p.at - q.at), axis: [0, 0, 1] };
}

/**
 * How far the flap of the envelope stands from the plane of the other four, in bond lengths. By convention, a stated amount: the look
 * owner's.
 */
export const ENVELOPE_FLAP = 0.3;

/**
 * The envelope (a five-ring's): by convention, no ideal numbers in the texts. Moss 1996, *Envelope Conformation*: four atoms coplanar and
 * one, the flap, out of the plane; Cs. Atoms 1, 2, 3, 4 are in the plane z = 0, bonded in a row: 2 and 3 at (-1/2, 0, 0) and (1/2, 0, 0),
 * 1 and 4 at the regular pentagon's interior angle (108 degrees) from them, (-1/2 - cos 72, sin 72, 0) and (1/2 + cos 72, sin 72, 0);
 * the flap, atom 0, at (0, y, ENVELOPE_FLAP) with |0 - 1| = 1, which gives y = sin 72 + sqrt(1 - (1/2 + cos 72)^2 - ENVELOPE_FLAP^2). Every bond
 * is 1. Each atom's two free positions complete its tetrahedron and are named up or down by the side of the plane (the axis, its normal,
 * toward the flap's side).
 */
export function envelope(): Solid {
  const c = Math.cos(72 * DEG);
  const s72 = Math.sin(72 * DEG);
  const x1 = 0.5 + c;
  const flap: V3 = [0, s72 + Math.sqrt(1 - x1 * x1 - ENVELOPE_FLAP * ENVELOPE_FLAP), ENVELOPE_FLAP];
  const atoms: V3[] = [flap, [-x1, s72, 0], [-0.5, 0, 0], [0.5, 0, 0], [x1, s72, 0]];
  const bonds = ringBonds(5);
  const free = atoms.flatMap((_, k): FreePosition[] =>
    completing(...ringArms(atoms, bonds, k)).map((d): FreePosition => ({ at: k, direction: d, kind: d[2] >= 0 ? "up" : "down", face: d[2] >= 0 ? 1 : -1 })),
  );
  return { kind: "envelope", atoms, bonds, free, axis: [0, 0, 1] };
}

/**
 * A second ring built on a bond of a chair, from that bond's two atoms' free directions: the new ring's bonds to the bond's atoms run along
 * those directions. `trans` takes the two equatorial ones - trans-decalin, every bond 1 and every angle tetrahedral, as two ideal chairs fuse
 * exactly; `{ cis: face }` an axial one and an equatorial one, both on the face named (1 the upper, -1 the lower) - cis-decalin. The two cis
 * fusions are mirror conformers of one compound on a bare chair, and different compounds on a ring that already carries a group or another
 * fused ring (cis-syn-cis against cis-anti-cis). Fused again on a ring bond of the result between two atoms that are not fusion atoms, it
 * builds the three-ring systems: on the bond opposite the first fusion perhydroanthracene (two trans fusions come out trans-syn-trans, the one whose
 * middle ring is a chair), on a bond beside it perhydrophenanthrene (trans-anti-trans, the all-chair one: CHEM, 2026-11-13).
 * The new ring's free positions are its own; the fusion atoms keep the one place the new ring did not take (the ring-fusion hydrogen's), as the
 * first ring calls it.
 *
 * A five-ring (`envelope`) does not close with ideal angles: it is built on the four atoms in a row and its fifth atom placed tetrahedrally
 * from the bond's second atom, turned about the bond to come nearest the first; the solid's `miss` is how far from 1 that closing bond comes out
 * (1.50, and an angle of some 85 degrees). It is stated, not hidden, but it is NOT a usable five-ring shape: nothing is to be drawn or fitted from
 * it until a five-ring is built another way (a hydrindane's or a steroid's D ring needs strained angles, which the engine's cage solids or a
 * fit's tolerance carry).
 */
export function fused(a: Solid, bond: number, ring: SolidKind, how: "trans" | { cis: 1 | -1 }): Solid {
  if (ring !== "chair" && ring !== "envelope") throw new Error(`a ${ring} ring is not fused here`);
  const [i, j] = a.bonds[bond];
  const take = (atom: number, kind: "axial" | "equatorial") => a.free.find((f) => f.at === atom && f.kind === kind);
  const byFace = (atom: number, face: 1 | -1) => a.free.find((f) => f.at === atom && f.face === face && (f.kind === "axial" || f.kind === "equatorial"));
  const [di, dj] = how === "trans" ? [take(i, "equatorial"), take(j, "equatorial")] : [byFace(i, how.cis), byFace(j, how.cis)];
  if (!di || !dj) throw new Error("that bond's atoms have no axial and equatorial free positions: it is not a bond of a chair's ring");
  const x1 = add(a.atoms[i], di.direction);
  const x2 = add(a.atoms[j], dj.direction);
  const n = a.atoms.length;
  const kept = a.free.filter((f) => f !== di && f !== dj);
  if (ring === "envelope") return fiveRing(a, i, j, x1, x2, kept);
  const target = torsion(x1, a.atoms[i], a.atoms[j], x2);
  // (the new ring is an ideal chair; four atoms in a row of it with this torsion, in either direction round, match the four we have)
  const template = chairOf(1);
  const six = template.atoms;
  let found: { m: Rigid; order: number[] } | null = null;
  for (const dir of [1, -1]) {
    for (let s = 0; s < 6 && !found; s++) {
      const order = Array.from({ length: 6 }, (_, k) => (s + dir * k + 12) % 6);
      const t = torsion(six[order[0]], six[order[1]], six[order[2]], six[order[3]]);
      if (Math.abs(t - target) > 1e-6) continue;
      found = { m: mapping([six[order[0]], six[order[1]], six[order[2]]], [x1, a.atoms[i], a.atoms[j]]), order };
    }
  }
  if (!found) throw new Error("no chair of the new ring matches");
  const { m, order } = found;
  // (the new ring's faces are signed as the first ring signs them: the ring-fusion hydrogen at the bond's first atom keeps its face. The template's
  // faces are its own sides - of the axis m z - which may be the first ring's down: then all of them are turned over)
  const h = kept.find((f) => f.at === i)!;
  const flip = Math.sign(dot(h.direction, turn(m, [0, 0, 1]))) * h.face;
  // (the new ring's atoms in order: x1, i, j, x2, then y, z - the two the first ring does not have)
  const atoms = [...a.atoms, x1, apply(m, six[order[3]]), apply(m, six[order[4]]), apply(m, six[order[5]])];
  const [ix1, ix2, iy, iz] = [n, n + 1, n + 2, n + 3];
  const bonds: [number, number][] = [...a.bonds, [j, ix2], [ix2, iy], [iy, iz], [iz, ix1], [ix1, i]];
  // (the new ring's free positions, at its four new atoms: as the template gives them, turned)
  const own = [ix1, ix2, iy, iz];
  const newFree = [order[0], order[3], order[4], order[5]].flatMap((t, k) =>
    template.free.filter((f) => f.at === t).map((f): FreePosition => ({ at: own[k], direction: turn(m, f.direction), kind: f.kind, face: (f.face * flip) as 1 | -1 })),
  );
  return { kind: "chair", atoms, bonds, free: [...kept, ...newFree], axis: a.axis };
}

/** A five-ring on the bond i-j, its atoms x1 (by i) and x2 (by j) placed: see `fused`. */
function fiveRing(a: Solid, i: number, j: number, x1: V3, x2: V3, kept: FreePosition[]): Solid {
  const to = unit(sub(a.atoms[j], x2));
  // (a basis of the plane across the bond from x2)
  const p = unit(cross(to, Math.abs(to[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]));
  const q = cross(to, p);
  let best = { y: x2, gap: Infinity };
  for (let k = 0; k < 36000; k++) {
    const t = (k / 36000) * 2 * Math.PI;
    const dir = add(scale(to, -1 / 3), scale(add(scale(p, Math.cos(t)), scale(q, Math.sin(t))), (2 * Math.SQRT2) / 3));
    const y = add(x2, dir);
    const gap = distance(y, x1);
    if (gap < best.gap) best = { y, gap };
  }
  const n = a.atoms.length;
  const atoms = [...a.atoms, x1, x2, best.y];
  const bonds: [number, number][] = [...a.bonds, [j, n + 1], [n + 1, n + 2], [n + 2, n], [n, i]];
  // (the new ring's own up: the normal of the plane through its four atoms in a row, to the side its fifth atom lies on)
  const normal = unit(cross(sub(a.atoms[j], a.atoms[i]), sub(x1, a.atoms[i])));
  // (up is the side the ring-fusion hydrogen at the bond's first atom keeps its face on: as the first ring signs it)
  const h = kept.find((f) => f.at === i)!;
  const up = Math.sign(dot(normal, h.direction)) * h.face >= 0 ? normal : scale(normal, -1);
  const own = [n, n + 1, n + 2];
  const free = own.flatMap((k): FreePosition[] =>
    completing(...ringArms(atoms, bonds, k)).map((d): FreePosition => ({ at: k, direction: d, kind: dot(d, up) >= 0 ? "up" : "down", face: dot(d, up) >= 0 ? 1 : -1 })),
  );
  return { kind: "chair", atoms, bonds, free: [...kept, ...free], axis: a.axis, miss: Math.abs(best.gap - 1) };
}
