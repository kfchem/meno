/**
 * Which of a metal's four or six donors are across from each other
 * (lib/layout/perceive `Arranged`), read from a drawing or from places in 3D:
 * one reading for Clean-up, which keeps a drawing's pairs across, and for
 * identity, which tells cisplatin from transplatin by them.
 *
 * In a drawing (Brecher 2006, ST-2.6 and ST-2.11) the pairing is the one
 * nearest straight lines through the metal, however far from straight the
 * drawing is - a transplatin put down with its N-Pt-N at 145 degrees is
 * trans still - and none where another pairing is about as near
 * (`DRAWN_TIE`): the drawing does not say it.
 *
 * In 3D two donors are across where the angle at the metal between them is
 * at least `ACROSS_FOUR` (four donors) or `ACROSS_SIX` (six) degrees and no
 * other donor is within `ACROSS_MARGIN` of that angle; a value only where
 * every donor has such a partner. A flattened tetrahedron, a trigonal prism
 * and a place half-way between two arrangements have none.
 */
import { identityKey, type IdentityAtom } from "./identity";
import { AROMATIC_BOND, kekuleOrders } from "./kekulize";
import { isMetal, type Arranged } from "../layout/perceive";
import { lonePairsIn3d } from "./lonePairsIn3d";
import { cisAt, senseAt } from "./perception/stereo/from3d";

/** The elements that are no metal and stand at the middle of six bonds as an octahedron (SF6, PF6-, TeCl6, IF6+): `arrangedCentre`. */
const SIX_BOND_ELEMENTS = new Set(["Si", "Ge", "P", "As", "Sb", "S", "Se", "Te", "Cl", "Br", "I", "Xe"]);

/**
 * Whether an atom of element `el` with `donors` bonds is a centre whose bonds' arrangement - which lie across from each other -
 * says which compound it is: a metal of four or six donors, or a main-group atom of six bonds (`SIX_BOND_ELEMENTS`: trans- and
 * cis-SF4Cl2 are two compounds). A carbon or a boron of six neighbours is a cage's, and none.
 */
export function arrangedCentre(el: string, donors: number): boolean {
  return isMetal(el) ? donors === 4 || donors === 6 : donors === 6 && SIX_BOND_ELEMENTS.has(el);
}

/** How near, in degrees, the next pairing's pairs may each come to the straightest's before a drawing says neither (`pairingDrawn`). */
export const DRAWN_TIE = 20;
/**
 * How near, in degrees, two donors must be drawn to a straight line through the metal to stand plainly across: a line of the
 * earlier picture (`earlierPicture`), as Clean-up's layout reads its own lines (ui chem/engineLayout `oppositesKept`).
 */
export const ACROSS_DRAWN = 30;
/** Whether two donors `off` radians off a straight line stand plainly across: less than ACROSS_DRAWN - one at it exactly, as the earlier picture's two side by side lie from the corners across from them, does not. */
const acrossDrawn = (off: number) => off < (ACROSS_DRAWN * Math.PI) / 180 - 1e-6;
/**
 * Whether a pair of a pairing drawn (`pairingDrawn`) says its two are across: less than a right angle off straight, as Clean-up
 * reads it (ui chem/engineLayout `oppositesKept`: a transplatin put down bent is trans still). Two of six drawn a right angle or
 * more off straight - side by side - say they are not (found in the chemistry check).
 */
export function pairsDrawnAcross(angle: readonly number[], partner: readonly number[]): boolean {
  const off = (i: number, j: number) => Math.abs(Math.PI - Math.abs(Math.atan2(Math.sin(angle[i] - angle[j]), Math.cos(angle[i] - angle[j]))));
  return partner.every((j, i) => off(i, j) < Math.PI / 2);
}
/** The least angle at the metal, in degrees, between two of four donors across in 3D: lower would take a flattened tetrahedron's (found in the chemistry check). */
export const ACROSS_FOUR = 150;
/** The least angle at the metal, in degrees, between two of six donors across in 3D: a terpyridine's outer donors are held short of 180 (found in the chemistry check). */
export const ACROSS_SIX = 135;
/** How far, in degrees, every other donor must stay from a donor's partner's angle in 3D: a trigonal prism's donors each have two at about 136 (found in the chemistry check). */
export const ACROSS_MARGIN = 15;

/**
 * The drawing's pairing of donors at the angles `angle` (radians, round
 * the metal, in the donors' order): each donor's partner by its index, in
 * the pairing whose straightest pair is straightest - then its next, and
 * with six its last - or null where the next pairing is, pair by pair,
 * within `DRAWN_TIE` degrees of it. Four or six donors.
 */
export function pairingDrawn(angle: readonly number[]): number[] | null {
  const off = (i: number, j: number) => Math.abs(Math.PI - Math.abs(Math.atan2(Math.sin(angle[i] - angle[j]), Math.cos(angle[i] - angle[j]))));
  const all: { partner: number[]; offs: number[] }[] = [];
  const pair = (left: number[], partner: number[], offs: number[]) => {
    if (!left.length) return void all.push({ partner: [...partner], offs: [...offs].sort((p, q) => p - q) });
    const [i, ...rest] = left;
    for (const j of rest) {
      partner[i] = j;
      partner[j] = i;
      pair(
        rest.filter((k) => k !== j),
        partner,
        [...offs, off(i, j)],
      );
    }
  };
  pair(
    angle.map((_, i) => i),
    angle.map(() => -1),
    [],
  );
  const before = (p: number[], q: number[]) => {
    for (let k = 0; k < p.length; k++) if (p[k] !== q[k]) return p[k] - q[k];
    return 0;
  };
  all.sort((p, q) => before(p.offs, q.offs));
  const told = all[0].offs.some((v, k) => all[1].offs[k] - v > (DRAWN_TIE * Math.PI) / 180);
  return told ? all[0].partner : null;
}

/**
 * Six donors at `angle` (radians, round the metal) drawn as Meno's layout drew a six-donor metal before its three lines: four as an
 * X - two lines across, each within ACROSS_DRAWN of straight - and two side by side, less than a right angle apart. Read as
 * drawn so: one of the two lines truly across, the other's two ends each across one of the two side by side. Each such way
 * (`partner`, as `pairingDrawn` gives one): which line is across, and which end goes with which. None for any other drawing.
 */
export function earlierPicture(angle: readonly number[]): number[][] | null {
  if (angle.length !== 6) return null;
  const off = (i: number, j: number) => Math.abs(Math.PI - Math.abs(Math.atan2(Math.sin(angle[i] - angle[j]), Math.cos(angle[i] - angle[j]))));
  const straight: [number, number][] = [];
  for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) if (acrossDrawn(off(i, j))) straight.push([i, j]);
  // (two lines, apart, and the two left side by side)
  if (straight.length !== 2 || straight[0].some((i) => straight[1].includes(i))) return null;
  const side = [0, 1, 2, 3, 4, 5].filter((i) => !straight.flat().includes(i));
  if (Math.PI - off(side[0], side[1]) >= Math.PI / 2) return null;
  const ways: number[][] = [];
  for (const [across, other] of [straight, [...straight].reverse()]) {
    for (const [s0, s1] of [side, [...side].reverse()]) {
      const partner = angle.map(() => -1);
      const join = (p: number, q: number) => ((partner[p] = q), (partner[q] = p));
      join(across[0], across[1]);
      join(other[0], s0);
      join(other[1], s1);
      ways.push(partner);
    }
  }
  return ways;
}

/**
 * The pairing of four or six donors at places `donors` ([x, y, z] each)
 * round a metal at `metal`, read in 3D: each donor's partner by its index,
 * or null where the places give none (above). A donor at the metal's own
 * place, or placed nowhere, gives none.
 */
export function pairingIn3d(metal: readonly number[], donors: readonly (readonly number[])[]): number[] | null {
  const n = donors.length;
  if (n !== 4 && n !== 6) return null;
  const v = donors.map((d) => d.map((x, k) => x - metal[k]));
  if (v.some((p) => p.some((x) => !Number.isFinite(x)) || Math.hypot(...p) === 0)) return null;
  const angle = (i: number, j: number) => {
    const cos = (v[i][0] * v[j][0] + v[i][1] * v[j][1] + v[i][2] * v[j][2]) / (Math.hypot(...v[i]) * Math.hypot(...v[j]));
    return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
  };
  const least = n === 4 ? ACROSS_FOUR : ACROSS_SIX;
  const partner = v.map((_, i) => {
    const others = v.map((_, j) => j).filter((j) => j !== i);
    const widest = others.reduce((p, q) => (angle(i, q) > angle(i, p) ? q : p));
    const a = angle(i, widest);
    if (a < least || others.some((j) => j !== widest && angle(i, j) > a - ACROSS_MARGIN)) return -1;
    return widest;
  });
  return partner.every((j, i) => j >= 0 && partner[j] === i) ? partner : null;
}

/** A pairing (each donor's partner by its index) as the pairs of `donors`' atoms, each lower first. */
export function pairsOf(donors: readonly number[], partner: readonly number[]): [number, number][] {
  return partner.flatMap((j, i) => (i < j ? [[Math.min(donors[i], donors[j]), Math.max(donors[i], donors[j])] as [number, number]] : []));
}

/** An atom and a bond of a molecule in 3D, as lib/chem/lonePairsIn3d reads them. */
type AtomIn3d = { el: string; charge?: number; isotope?: number };
type BondIn3d = { a1: number; a2: number; order: number };

/**
 * Which of each metal's four or six donors are across from each other in a
 * molecule in 3D (`pairingIn3d`), by atom number from 0: the metals whose
 * places give a pairing. A metal whose places give none - a tetrahedral
 * one, a trigonal prism - is not among them.
 */
export function arrangementsIn3d(atoms: readonly AtomIn3d[], bonds: readonly BondIn3d[], xyz: readonly number[]): Arranged[] {
  const around = aroundOf(atoms.length, bonds);
  const at = (i: number) => [xyz[3 * i], xyz[3 * i + 1], xyz[3 * i + 2]];
  return atoms.flatMap((a, m): Arranged[] => {
    const donors = around[m];
    if (!isMetal(a.el) || (donors.length !== 4 && donors.length !== 6)) return [];
    const partner = pairingIn3d(at(m), donors.map(at));
    return partner ? [{ metal: m, pairs: pairsOf(donors, partner) }] : [];
  });
}

/**
 * The same for two molecules in 3D exactly when their constitution and
 * their metals' donors across (`arrangementsIn3d`) are, with the
 * configurations of their ligands where those are (`configurationsIn3d`),
 * whatever order their atoms are in: lib/chem/identity's key of the
 * molecule with those pairs and those configurations, a metal whose places give none filled
 * in where every pairing would write it the same (NiCl4 2- tetrahedral and
 * planar), and left open where they would not. None for a molecule with no
 * metal of four or six donors.
 */
export function arrangementKey(atoms: readonly AtomIn3d[], bonds: readonly BondIn3d[], xyz: readonly number[]): string | null {
  const around = aroundOf(atoms.length, bonds);
  if (!atoms.some((a, m) => isMetal(a.el) && (around[m].length === 4 || around[m].length === 6))) return null;
  const arrangements = arrangementsIn3d(atoms, bonds, xyz);
  // (bonds marked aromatic written out as a Kekulé structure first, as lib/chem/lonePairsIn3d does: identity takes the
  //  aromatic form of any one)
  const written = bonds.some((b) => b.order === AROMATIC_BOND) ? kekuleOrders(atoms.map((a) => ({ el: a.el, hs: 0, ...(a.charge ? { charge: a.charge } : {}) })), bonds) : bonds.map((b) => b.order);
  // (and the configurations of its ligands as the places give them, in the same key: which ligand is across which donor and
  //  the hand of each are one fact - PtCl(L)3 with two L of one hand and one of the other, the odd one across Cl or not, is two
  //  compounds, which a key of the pairs beside a key of the hands would make one)
  const { tetra, sides } = configurationsIn3d(atoms, bonds, xyz, around, written);
  return identityKey({
    atoms: atoms.map((a, i): IdentityAtom => ({ el: a.el, hs: 0, ...(a.charge ? { charge: a.charge } : {}), ...(a.isotope ? { isotope: a.isotope } : {}), ...(tetra.has(i) ? { tetra: tetra.get(i)! } : {}) })),
    bonds: bonds.map((b, k) => ({ a: b.a1, b: b.a2, order: written[k], ...(sides.has(k) ? { stereo: sides.get(k)! } : {}) })),
    ...(arrangements.length ? { arrangements } : {}),
  });
}

/**
 * The configurations a molecule's places in 3D give besides its metals' pairs, as identity takes them: each centre of four
 * bonds that is no metal and has no two bonds across (`ACROSS_FOUR`: a square-planar XeF2Cl2 has no hand), by the sign of the
 * volume its first three neighbours span; each centre of three bonds and a lone pair the rule keeps (lib/chem/lonePairsIn3d: a
 * sulfoxide's S); and each double bond's cis or trans, by its first neighbour at each end. One flat - a volume or a side of
 * none - is left out. Identity's own fill sets aside every one that sets nothing (a CH2, a ring's double bond).
 */
function configurationsIn3d(
  atoms: readonly AtomIn3d[],
  bonds: readonly BondIn3d[],
  xyz: readonly number[],
  around: readonly number[][],
  written: readonly number[],
): { tetra: Map<number, { neighbours: number[]; volume: 1 | -1 }>; sides: Map<number, { refs: [number, number]; cis: boolean }> } {
  const at = (i: number) => [xyz[3 * i], xyz[3 * i + 1], xyz[3 * i + 2]];
  const placed = (i: number) => at(i).every(Number.isFinite);
  const tetra = new Map<number, { neighbours: number[]; volume: 1 | -1 }>();
  atoms.forEach((a, c) => {
    const nb = around[c];
    if (isMetal(a.el) || nb.length !== 4 || !placed(c) || nb.some((d) => !placed(d))) return;
    const v = nb.map((d) => at(d).map((x, k) => x - at(c)[k]));
    const wide = v.some((p, i) => v.some((q, j) => j > i && angleOf(p, q) >= ACROSS_FOUR));
    const volume = wide ? 0 : senseAt([0, 0, 0], v);
    if (volume) tetra.set(c, { neighbours: [...nb], volume });
  });
  const three = atoms.flatMap((_, c) => (around[c].length === 3 ? [c] : []));
  for (const [c, t] of lonePairsIn3d(atoms, bonds, xyz, three).read) tetra.set(c, t);
  const sides = new Map<number, { refs: [number, number]; cis: boolean }>();
  bonds.forEach((b, k) => {
    if (written[k] !== 2) return;
    const p = around[b.a1].find((d) => d !== b.a2);
    const q = around[b.a2].find((d) => d !== b.a1);
    if (p == null || q == null || ![b.a1, b.a2, p, q].every(placed)) return;
    const cis = cisAt(at(b.a1), at(b.a2), at(p), at(q));
    if (cis != null) sides.set(k, { refs: [p, q], cis });
  });
  return { tetra, sides };
}

/** The angle between two bonds from one atom, in degrees. */
function angleOf(p: readonly number[], q: readonly number[]): number {
  const cos = (p[0] * q[0] + p[1] * q[1] + p[2] * q[2]) / (Math.hypot(...p) * Math.hypot(...q));
  return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
}

function aroundOf(n: number, bonds: readonly BondIn3d[]): number[][] {
  const around: number[][] = Array.from({ length: n }, () => []);
  for (const b of bonds) {
    if (b.a1 === b.a2 || !around[b.a1] || !around[b.a2]) continue;
    around[b.a1].push(b.a2);
    around[b.a2].push(b.a1);
  }
  return around;
}
