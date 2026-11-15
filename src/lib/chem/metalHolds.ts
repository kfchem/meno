/**
 * What a metal complex is held to while its conformers are made - Meno's
 * rules, worked out here and sent with the request as `holds` (the plugin
 * boundary, 2026-10-31: the plugin embeds and optimises as it is asked, and
 * holds what it is given): each metal's bonds at their covalent lengths;
 * its ligands kept a floor's angle apart; a ring or chain bound through all
 * its atoms (eta) held over its metal; which four-coordinate metals are
 * square planar, by their d electrons; a bridging halide's angle and a
 * square-planar metal's trans pairs held as embedded; a lighter metal of the
 * group standing in where the force field has none. And, after, which
 * conformers are set aside (`keptMade`): one whose ligands came out closer
 * at a metal than the floor allows, with two atoms run into one another, or
 * with a bond to a metal lost.
 */
import { readMolfile } from "./ctfile";
import { elementOf, vdwRadius } from "./elements";
import { transitionMetal } from "./perception/elements";
import { implicitHydrogens, valencesAt, type Radical } from "./molecule";

/** An atom as the holds read it: its element, charge and unpaired electrons - and the hydrogens a file gives it that are not drawn as atoms (`hydrogens`: a metal's VAL past its bonds, a hydride). */
export type HoldsAtom = { el: string; charge: number; radical?: Radical; hydrogens?: number };
/**
 * A bond as the holds read it, by atom index: its order (a coordination
 * bond 1, `dative`), and for a bond to a star at the centre of a ring or
 * chain bound through all its atoms, those atoms (`endpoints`).
 */
export type HoldsBond = { a: number; b: number; order: number; dative?: boolean; endpoints?: number[] };

/**
 * How far a metal's bond may be from its covalent length while embedding
 * (Å). Meno's own: embedding takes each bond as a range, not one length, and
 * this keeps that range about two per cent of a metal's bond (2 to 2.5 Å),
 * well inside the 15 per cent a bond may come out off before its conformer
 * is set aside (`METAL_BOND_OFF`).
 */
export const METAL_BOND_SLACK = 0.05;

/**
 * The narrowest angle two atoms bonded to one metal, of different ligands,
 * are let make while embedding and optimising (degrees), so that ligands do
 * not pile up - embedding knows no angle at a metal, and without one the
 * seven fluorides of [ZrF7]3- came out 33 degrees apart - by how many atoms
 * are bonded to the metal (at most this many, the angle):
 * - at most 6: 75, below the narrowest angle of the ideal polyhedra of four,
 *   five and six points, a trigonal prism with equal edges, 2 asin(sqrt(3/7))
 *   = 81.8 degrees (the octahedron, square plane, trigonal bipyramid and
 *   square pyramid: 90);
 * - at most 12: 60, below the narrowest angle of the ideal polyhedra of seven
 *   to twelve points that were worked out: the pentagonal bipyramid, 72
 *   degrees (360/5), and the icosahedron, 63.4 (arctan 2). No common
 *   polyhedron of ten or eleven points was: there the margin rests on the
 *   icosahedron alone, 3.4 degrees;
 * - more: none.
 * Only between point donors (`floorPairs`): none at a metal with a ligand
 * bound through atoms side by side (eta), whose atoms spread round where it
 * sits - Cp2TiCl2's Cp carbon and Cl come near 76 degrees, a Zeise-type
 * alkene's carbon and its cis Cl near 71; never within one ligand, whose own
 * bonds set its bite (en on a lanthanide bites about 65); nor for a hydride,
 * which may sit closer to another (cis H-M-H).
 */
export const FLOORS: readonly (readonly [number, number])[] = [
  [6, 75],
  [12, 60],
];

/**
 * How far under its floor a conformer may come out and be kept (degrees).
 * Meno's own, from what the holds were seen to give. The floor is held by
 * bounds while embedding and a restraint while optimising, neither of them
 * exact: measured at three seeds each, [ZrF7]3-,
 * [NbF7]2- and OsCl4Br4, pressed against the 60 degree floor, came out up to
 * 2.0 degrees under it; over 1230 embeddings of [OsCl6]2-, PdCl2(PPh3)2 and
 * OsCl4(PEt3)2 none came within 4 degrees of the 75 degree floor but the one
 * stuck in a well 13 under it. Five degrees keeps the first and drops the
 * last.
 */
export const FLOOR_SLACK = 5;

/**
 * How much longer than its covalent length a metal's bond to each atom of a
 * ring or chain bound through all its atoms (eta) is taken to be (Å): it
 * gives ferrocene's Fe-C as about 2.06, ruthenocene's Ru-C 2.15,
 * bis(benzene)chromium's Cr-C 2.12 and zirconocene dichloride's Zr-C 2.44,
 * against about 2.05, 2.19, 2.14 and 2.50 measured.
 */
export const ETA_EXTRA = 0.15;
/**
 * How near an atom of an eta system and another ligand's donor of the same
 * metal may come (Å). Meno's own: a floor, not a length - 0.72 of a carbon's
 * and a chlorine's van der Waals contact (1.77 + 1.82 = 3.59 Å, Alvarez's
 * radii, lib/chem/elements), so that a donor is kept off the ring's atoms
 * but never pushed out past where it sits beside the ring.
 */
export const ETA_CLEAR = 2.6;
/**
 * How near two atoms of two eta systems of one metal may come (Å). Meno's
 * own: a floor, 0.82 of two carbons' van der Waals contact (2 x 1.77 = 3.54
 * Å), so that two rings on one metal do not overlap, while a bent
 * metallocene's rings may still come as near as their tilt brings them.
 */
export const ETA_APART = 2.9;
/**
 * How near its metal an atom bonded to an eta system's atom may come (Å): a
 * ring's hydrogens and substituents lean towards it. Meno's own: about a
 * metal's own bond (2 to 2.5 Å), so that such an atom may lean in but never
 * takes a donor's place.
 */
export const ETA_NEAR = 2.5;

/**
 * A square-planar metal's angles while it is optimised (degrees): its two
 * trans pairs - those of its ligands furthest apart as each conformer was
 * embedded, so that cis and trans isomers both come out of a search - near
 * 180, the rest near 90, a square's own angles. The give, 8 and 5 degrees,
 * is Meno's own: enough that the force field's other terms (a chelate's
 * bite) are not fought, too little for the square to fold towards a
 * tetrahedron.
 */
export const TRANS_AT_METAL: readonly [number, number] = [172, 180];
export const CIS_AT_METAL: readonly [number, number] = [85, 95];

/**
 * A halogen bridging two metals (a mu-halide, as in [Pd(allyl)Cl]2): its
 * angle between them held as each conformer was embedded, this many degrees
 * either way (its bonds held at their lengths). Meno's own: the force field
 * is given the halide's linear form, which pulls the angle open; ten degrees
 * holds it near the shape embedded while its ring may still relax.
 */
export const BRIDGE_SLACK = 10;

/**
 * A metal the force field may have no type for, and the lighter one of its
 * group that stands in for it: its angle terms shape the metal, its bonds
 * held at the metal's own lengths, and its energies are the model's, never
 * the molecule's.
 */
export const STAND_IN: Readonly<Record<string, string>> = { Ru: "Fe", Os: "Fe", Rh: "Co", Ir: "Co", W: "Mo", Zr: "Ti", Hf: "Ti", Y: "Sc" };

/** The d count four ligands round a metal lie tetrahedral at, never held square planar: Pd(0), Pt(0), Ni(0) (d10). */
export const TETRAHEDRAL_D = 10;
/** The d count four ligands round a metal lie square planar at: Pd(II), Pt(II), Ni(II), Au(III) (d8). */
export const SQUARE_PLANAR_D = 8;

/** A d-block element's group (3-12), or null. */
export function groupOf(el: string): number | null {
  const z = elementOf(el)?.number ?? 0;
  return z >= 21 && z <= 30 ? z - 18 : z >= 39 && z <= 48 ? z - 36 : z >= 72 && z <= 80 ? z - 68 : null;
}

/** A bond's length from its atoms' covalent radii (Å), for its order where both have a radius for it, else as single; null where either has none. */
export function covalentLength(a: string, b: string, order: number): number | null {
  const ra = elementOf(a)?.radii;
  const rb = elementOf(b)?.radii;
  if (!ra || !rb || ra[0] == null || rb[0] == null) return null;
  const k = order === 2 ? 1 : order === 3 ? 2 : 0;
  const x = ra[k] != null && rb[k] != null ? k : 0;
  return (ra[x]! + rb[x]!) / 100;
}

/** An eta system: its metal, the star at its centre, and its atoms. */
export type EtaSystem = { metal: number; star: number; atoms: number[] };

/** The rings and chains bound to a metal through all their atoms - a bond from the metal to a star, its endpoints the atoms. */
export function etaSystems(atoms: readonly HoldsAtom[], bonds: readonly HoldsBond[]): EtaSystem[] {
  const out: EtaSystem[] = [];
  for (const b of bonds) {
    if (!b.endpoints) continue;
    const [star, metal] = atoms[b.b]?.el === "*" ? [b.b, b.a] : [b.a, b.b];
    if (atoms[star]?.el !== "*" || !transitionMetal.has(atoms[metal]?.el ?? "")) continue;
    if (b.endpoints.length >= 2 && b.endpoints.every((i) => i >= 0 && i < atoms.length)) out.push({ metal, star, atoms: [...b.endpoints] });
  }
  return out;
}

/** Each atom's neighbours, by index, in the order of the bonds. */
function neighboursOf(n: number, bonds: readonly HoldsBond[]): number[][] {
  const around: number[][] = Array.from({ length: n }, () => []);
  for (const b of bonds) {
    around[b.a]?.push(b.b);
    around[b.b]?.push(b.a);
  }
  return around;
}

/**
 * The atoms a floor holds apart, as seen from their metal, and the angle:
 * at a metal with as many atoms bonded to it as a floor holds at and no eta
 * ligand on it (one through a star, or through atoms bonded to each other),
 * each two of different ligands - joined by no path but through a metal -
 * neither a hydride.
 */
export function floorPairs(atoms: readonly HoldsAtom[], bonds: readonly HoldsBond[]): { metal: number; j: number; k: number; angle: number }[] {
  const around = neighboursOf(atoms.length, bonds);
  const metals = atoms.flatMap((a, i) => (transitionMetal.has(a.el) && around[i].length ? [i] : []));
  if (!metals.length) return [];
  const metal = new Set(metals);
  // (the parts the molecule falls into with its metals' bonds left out)
  const part = atoms.map((_, i) => i);
  const root = (i: number): number => (part[i] === i ? i : (part[i] = root(part[i])));
  for (const b of bonds) if (!metal.has(b.a) && !metal.has(b.b)) part[root(b.a)] = root(b.b);
  const bonded = (x: number, y: number) => around[x].includes(y);
  const hydride = (i: number) => atoms[i].el === "H" && around[i].length === 1;
  const out: { metal: number; j: number; k: number; angle: number }[] = [];
  for (const m of metals) {
    const near = [...around[m]].sort((p, q) => p - q);
    // (as many atoms bonded to it as there are - its hydrogens not drawn as atoms among them, which are hydrides, held apart from none)
    const bound = near.length + (atoms[m].hydrogens ?? 0);
    const angle = FLOORS.find(([most]) => bound <= most)?.[1];
    if (near.length < 2 || angle == null || near.some((x) => atoms[x].el === "*")) continue;
    if (near.some((x, i) => near.slice(i + 1).some((y) => bonded(x, y)))) continue;
    for (let x = 0; x < near.length; x++)
      for (let y = x + 1; y < near.length; y++) {
        const [j, k] = [near[x], near[y]];
        if (root(j) === root(k) || hydride(j) || hydride(k)) continue;
        out.push({ metal: m, j, k, angle });
      }
  }
  return out;
}

/**
 * A ring of five or a chain of three carbons bound through all its atoms and
 * drawn neutral - one carbon not double-bonded within it, with two hydrogens
 * or an unpaired electron - taken as the cyclopentadienide or allyl anion it
 * is bound as, the metal one charge higher, as a complex's formula balances
 * it (lib/chem/ligands): that carbon, given a charge of -1 and these
 * hydrogens, and the metal. Not a ring with a CH2 in it, nor radical carbons.
 */
export function ligandAnions(atoms: readonly HoldsAtom[], bonds: readonly HoldsBond[], eta: readonly EtaSystem[]): { atom: number; hydrogens: number; metal: number }[] {
  const out: { atom: number; hydrogens: number; metal: number }[] = [];
  for (const { metal, atoms: system } of eta) {
    const inside = new Set(system);
    if (![3, 5].includes(system.length) || system.some((i) => atoms[i].el !== "C" || atoms[i].charge)) continue;
    const lone = system.filter((i) => !bonds.some((b) => b.order === 2 && !b.dative && ((b.a === i && inside.has(b.b)) || (b.b === i && inside.has(b.a)))));
    if (lone.length !== 1) continue;
    const c = lone[0];
    const held = bonds.reduce((s, b) => s + ((b.a === c || b.b === c) && !b.dative && !b.endpoints ? b.order : 0), 0);
    out.push({ atom: c, hydrogens: Math.max(0, 3 - Math.round(held)), metal });
  }
  return out;
}

/**
 * What a donor takes from its metal, as the ionic count has it: 1 where it is
 * anionic (X - a halide, an aryl, a carboxylate's O, an amide's N), 0 where
 * it is neutral (L - a phosphine, an amine, a carbonyl's C drawn [C-]#[O+]),
 * by its valence without its bond to the metal (`order`): one short of a
 * valence its element takes at its charge, or one of them - its drawn bonds
 * first, then with the hydrogens Meno gives it (lib/chem/molecule). Null
 * where its valence says neither.
 */
function donorCharge(atoms: readonly HoldsAtom[], bonds: readonly HoldsBond[], x: number, order: number): number | null {
  const a = atoms[x];
  const allowed = valencesAt(a.el, a.charge, a.radical);
  if (!allowed.length) return null;
  const drawn = bonds.reduce((s, b) => s + (b.a === x || b.b === x ? (b.endpoints ? 0 : b.order) : 0), 0);
  for (const valence of [drawn, drawn + implicitHydrogens(a.el, drawn, a.charge, a.radical)]) {
    const other = valence - order;
    if (allowed.includes(other)) return 0;
    if (allowed.includes(other + 1)) return 1;
  }
  return null;
}

/**
 * How many d electrons a metal with point donors alone has, by the ionic
 * count: its group, less its oxidation state - its charge and one for each
 * anionic donor, a dative bond's donor neutral whatever its charge says.
 * Null where a donor says neither, it has an eta ligand, or it is no d-block
 * metal.
 */
export function dElectrons(atoms: readonly HoldsAtom[], bonds: readonly HoldsBond[], metal: number): number | null {
  const group = groupOf(atoms[metal].el);
  const around = neighboursOf(atoms.length, bonds);
  const near = around[metal];
  if (group == null || near.some((x) => atoms[x].el === "*") || near.some((x, i) => near.slice(i + 1).some((y) => around[x].includes(y)))) return null;
  let ox = atoms[metal].charge;
  for (const x of near) {
    const b = bonds.find((y) => (y.a === metal && y.b === x) || (y.b === metal && y.a === x))!;
    const c = b.dative ? 0 : donorCharge(atoms, bonds, x, b.order);
    if (c == null) return null;
    ox += c;
  }
  return group - ox;
}

/** The geometry a four-coordinate metal is held to: square planar where its count is d8, tetrahedral (never held square planar) where d10; none said otherwise. */
export type MetalGeometry = { metal: number; as: "square planar" | "tetrahedral"; d: number };

/** Each four-coordinate metal with point donors whose d count says its geometry (`MetalGeometry`). */
export function metalGeometries(atoms: readonly HoldsAtom[], bonds: readonly HoldsBond[]): MetalGeometry[] {
  const around = neighboursOf(atoms.length, bonds);
  return atoms.flatMap((a, m): MetalGeometry[] => {
    if (!transitionMetal.has(a.el) || around[m].length !== 4) return [];
    const d = dElectrons(atoms, bonds, m);
    return d === SQUARE_PLANAR_D ? [{ metal: m, as: "square planar" as const, d }] : d === TETRAHEDRAL_D ? [{ metal: m, as: "tetrahedral" as const, d }] : [];
  });
}

/**
 * Everything a structure with metals is held to while its conformers are
 * made, as the request carries it (`holds`): its metals' bonds and their
 * lengths, the floor pairs, its eta systems with their atoms' lengths, the
 * anions its eta rings are taken as, the geometries its d counts say, the
 * halides bridging two metals, the stand-ins, and the
 * rules' numbers. Null where it has no metal bonded to anything.
 */
export type MetalHolds = {
  slack: number;
  bonds: { i: number; j: number; length: number }[];
  floors: { metal: number; j: number; k: number; angle: number }[];
  /** The floors' rule itself (`FLOORS`), for the plugin to say why a metal has none. */
  floorRule: readonly (readonly [number, number])[];
  eta: (EtaSystem & { lengths: (number | null)[] })[];
  etaClear: number;
  etaApart: number;
  etaNear: number;
  anions: { atom: number; hydrogens: number; metal: number }[];
  geometry: MetalGeometry[];
  planar: { trans: readonly [number, number]; cis: readonly [number, number] };
  /** A metal's hydrogens not drawn as atoms (hydrides), each held at this length from it (Å). */
  hydrides: { metal: number; count: number; length: number }[];
  bridges: { halogen: number; metals: [number, number] }[];
  bridgeSlack: number;
  standIn: { el: string; as: string }[];
};

const HALOGENS = new Set(["F", "Cl", "Br", "I"]);

/** The holds of a structure with metals (`MetalHolds`), or null. */
export function metalHolds(atoms: readonly HoldsAtom[], bonds: readonly HoldsBond[]): MetalHolds | null {
  const around = neighboursOf(atoms.length, bonds);
  if (!atoms.some((a, i) => transitionMetal.has(a.el) && (around[i].length || a.hydrogens))) return null;
  const eta = etaSystems(atoms, bonds);
  const metalBonds = bonds.flatMap((b) => {
    if (b.endpoints) return [];
    const [x, y] = [atoms[b.a].el, atoms[b.b].el];
    if (!transitionMetal.has(x) && !transitionMetal.has(y)) return [];
    const length = covalentLength(x, y, b.dative ? 1 : b.order);
    return length == null ? [] : [{ i: b.a, j: b.b, length }];
  });
  const bridges = atoms.flatMap((a, x) => {
    if (!HALOGENS.has(a.el)) return [];
    const ms = around[x].filter((m) => transitionMetal.has(atoms[m].el));
    return ms.flatMap((i, n) => ms.slice(n + 1).map((j) => ({ halogen: x, metals: [i, j] as [number, number] })));
  });
  const els = new Set(atoms.filter((a, i) => transitionMetal.has(a.el) && around[i].length).map((a) => a.el));
  return {
    slack: METAL_BOND_SLACK,
    bonds: metalBonds,
    floors: floorPairs(atoms, bonds),
    floorRule: FLOORS,
    eta: eta.map((s) => ({ ...s, lengths: s.atoms.map((c) => etaLength(atoms[s.metal].el, atoms[c].el)) })),
    etaClear: ETA_CLEAR,
    etaApart: ETA_APART,
    etaNear: ETA_NEAR,
    anions: ligandAnions(atoms, bonds, eta),
    geometry: metalGeometries(atoms, bonds),
    planar: { trans: TRANS_AT_METAL, cis: CIS_AT_METAL },
    hydrides: atoms.flatMap((a, m) => {
      const length = transitionMetal.has(a.el) && a.hydrogens ? covalentLength(a.el, "H", 1) : null;
      return length == null ? [] : [{ metal: m, count: a.hydrogens!, length }];
    }),
    bridges,
    bridgeSlack: BRIDGE_SLACK,
    standIn: Object.entries(STAND_IN).flatMap(([el, as]) => (els.has(el) ? [{ el, as }] : [])),
  };
}

/** A metal's distance to an atom of an eta system it binds (Å): their single-bond radii and ETA_EXTRA; null where either has none. */
export function etaLength(metal: string, atom: string): number | null {
  const d = covalentLength(metal, atom, 1);
  return d == null ? null : d + ETA_EXTRA;
}

/** A structure's atoms and bonds as the holds read them, from its MOL block; null where it cannot be read. */
export function holdsGraphOf(molblock: string): { atoms: HoldsAtom[]; bonds: HoldsBond[] } | null {
  const ct = readMolfile(molblock);
  if (!ct) return null;
  // (a valence the file sets past the atom's bonds: hydrogens not drawn as atoms)
  const sums = ct.atoms.map(() => 0);
  for (const b of ct.bonds) {
    if (b.endpoints?.length) continue;
    const o = b.type === 9 ? 1 : b.type >= 1 && b.type <= 3 ? b.type : 0;
    sums[b.a1] += o;
    sums[b.a2] += o;
  }
  return {
    atoms: ct.atoms.map((a, i) => {
      const hydrogens = a.valence != null && a.valence > sums[i] ? a.valence - sums[i] : 0;
      return { el: a.symbol, charge: a.charge ?? 0, ...(a.radical ? { radical: a.radical } : {}), ...(hydrogens ? { hydrogens } : {}) };
    }),
    bonds: ct.bonds.map((b) => ({
      a: b.a1,
      b: b.a2,
      order: b.type === 9 ? 1 : b.type,
      ...(b.type === 9 ? { dative: true } : {}),
      ...(b.endpoints?.length ? { endpoints: [...b.endpoints] } : {}),
    })),
  };
}

/** The holds of the structure a MOL block draws, or null (`metalHolds`). */
export function metalHoldsOf(molblock: string): MetalHolds | null {
  const g = holdsGraphOf(molblock);
  return g ? metalHolds(g.atoms, g.bonds) : null;
}

/** The angle j-m-k in a frame of coordinates (degrees). */
function angleAt(frame: readonly number[], m: number, j: number, k: number): number {
  const at = (i: number) => [frame[3 * i], frame[3 * i + 1], frame[3 * i + 2]];
  const [o, p, q] = [at(m), at(j), at(k)];
  const u = p.map((v, d) => v - o[d]);
  const v = q.map((w, d) => w - o[d]);
  const cos = (u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / Math.sqrt((u[0] ** 2 + u[1] ** 2 + u[2] ** 2) * (v[0] ** 2 + v[1] ** 2 + v[2] ** 2));
  return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
}

/**
 * How far a conformer came out under its floor, where it did by more than
 * FLOOR_SLACK: the metal, its floor and the narrowest angle there - no shape
 * the method allows, a well of the force field the hold could not pull it
 * out of ([OsCl6]2- with Fe standing in, 87.7 kcal/mol above the
 * octahedron, two Cl 62 degrees apart). Null where it did not.
 */
export function underFloor(frame: readonly number[], floors: MetalHolds["floors"]): { metal: number; angle: number; narrowest: number } | null {
  let worst: { metal: number; angle: number; narrowest: number; under: number } | null = null;
  for (const { metal, j, k, angle } of floors) {
    const a = angleAt(frame, metal, j, k);
    if (!worst || a - angle < worst.under) worst = { metal, angle, narrowest: a, under: a - angle };
  }
  return worst && worst.under < -FLOOR_SLACK ? { metal: worst.metal, angle: worst.angle, narrowest: worst.narrowest } : null;
}

/** A molecule in 3D's atoms and bonds as the holds read them: every hydrogen an atom, a coordination bond (`dative`) of order 1. */
export function holdsGraphOf3d(atoms: readonly { el: string; charge?: number }[], bonds: readonly { a1: number; a2: number; order: number }[], coordination: number): { atoms: HoldsAtom[]; bonds: HoldsBond[] } {
  return {
    atoms: atoms.map((a) => ({ el: a.el, charge: a.charge ?? 0 })),
    bonds: bonds.map((b) => (b.order === coordination ? { a: b.a1, b: b.a2, order: 1, dative: true } : { a: b.a1, b: b.a2, order: b.order })),
  };
}

/**
 * How near two heavy atoms of a conformer may come, as a share of their van
 * der Waals contact (the sum of their radii, lib/chem/elements), where
 * nothing but the rest of the molecule sets how near: not bonded to each
 * other nor both to one same atom (whose bonds and angles, or a metal's
 * floor, set that) - a conformer with two nearer is no shape the method
 * allows, two parts of it run into one another, and is set aside and
 * counted, as one under a floor is. Of [Cp2ZrCl2] made 500 times, one came
 * out with a Cl 1.16 Å from a ring carbon (0.32 of their contact); of
 * PdCl2(PPh3)2, 41 with a P, Cl or Pd within 0.65 of a phenyl carbon of the
 * other phosphine (a P 1.99 Å from one, 0.54). Of normal molecules none came
 * under 0.69: 1.87 Å between a bicyclo[1.1.1]pentane's bridgeheads is no
 * such pair (both are bonded to one carbon), and the nearest seen, of
 * seventeen molecules made up to 500 times each - strained, crowded,
 * hydrogen-bonded, metal complexes - were a ruthenium benzylidene's Ru and
 * an ortho carbon (0.73), a bicyclo[2.2.2]octane's bridgeheads (0.735) and
 * cubane's opposite corners (0.75). Between heavy atoms alone: a hydrogen
 * bond brings its hydrogen nearer its acceptor than that. Meno's own: under
 * the nearest seen in a normal molecule (0.69) with room to spare, over the
 * 0.54 and 0.32 of those complexes run into one another.
 */
export const CONTACT_FLOOR = 0.65;

/**
 * How far a metal's bond to a point donor may come out from the covalent
 * length it is embedded at and held to, as a share of it: one further is a
 * bond the hold lost, and its conformer is set aside and counted. Of
 * Pd(PPh3)4 made 300 times, 47 came out with one 0.62 to 2.07 of its length
 * - a phosphine pulled off, or into the metal - and of PdCl2(PPh3)2, 36; of
 * [Cp2ZrCl2] made 300 times, a Zr-Cl at 1.21. The rest, and every conformer
 * of Ru, Os, Co, Zr and Pd complexes otherwise, kept theirs within 0.92 to
 * 1.07. Meno's own: twice the 0.07 every held bond kept within, so that none
 * of those is set aside.
 */
export const METAL_BOND_OFF = 0.15;

/**
 * What the conformers a search made are checked by, before any is kept:
 * each metal's floors (`underFloor`), the pairs of heavy atoms that may not
 * run into one another and how near each may come (`CONTACT_FLOOR`), and
 * each metal's bonds to its point donors and their lengths (`METAL_BOND_OFF`).
 */
export type MadeChecks = {
  floors: MetalHolds["floors"];
  contacts: { i: number; j: number; least: number }[];
  held: { metal: number; atom: number; length: number }[];
};

/**
 * A structure's checks (`MadeChecks`), from its atoms and bonds as the
 * holds read them and its holds (none without metals): the pairs of two
 * heavy atoms with a van der Waals radius, neither a star, of one part of
 * it, not bonded to each other nor both to one same atom, and not a metal
 * and an atom of an eta ring on it, which are held at their own lengths - a
 * part a fragment, an eta ring one with its metal: two atoms of separate
 * parts, a salt's ions, are placed by nothing but the embedding, and are no
 * pair here.
 */
export function madeChecks(atoms: readonly HoldsAtom[], bonds: readonly HoldsBond[], holds: Pick<MetalHolds, "floors" | "eta" | "bonds"> | null): MadeChecks {
  const around = neighboursOf(atoms.length, bonds);
  const part = atoms.map((_, i) => i);
  const root = (i: number): number => (part[i] === i ? i : (part[i] = root(part[i])));
  for (const b of bonds) part[root(b.a)] = root(b.b);
  const eta = holds?.eta ?? [];
  for (const e of eta) for (const c of e.atoms) part[root(c)] = root(e.metal);
  const onRing = new Set(eta.flatMap((e) => e.atoms.map((c) => `${Math.min(e.metal, c)},${Math.max(e.metal, c)}`)));
  const heavy = atoms.flatMap((a, i) => (a.el !== "H" && a.el !== "*" && elementOf(a.el)?.vdw != null ? [i] : []));
  const contacts: MadeChecks["contacts"] = [];
  for (let x = 0; x < heavy.length; x++)
    for (let y = x + 1; y < heavy.length; y++) {
      const [i, j] = [heavy[x], heavy[y]];
      if (root(i) !== root(j) || around[i].includes(j) || around[i].some((n) => around[j].includes(n)) || onRing.has(`${i},${j}`)) continue;
      contacts.push({ i, j, least: CONTACT_FLOOR * (vdwRadius(atoms[i].el) + vdwRadius(atoms[j].el)) });
    }
  // (a metal's point donors: those bonded to it alone of their ligands - none bound side on, nor a star)
  const held = (holds?.bonds ?? []).flatMap((b) => {
    const [metal, atom] = transitionMetal.has(atoms[b.i].el) ? [b.i, b.j] : [b.j, b.i];
    const near = around[metal];
    const sideOn = atoms[atom].el === "*" || near.some((y) => y !== atom && around[atom].includes(y));
    return sideOn ? [] : [{ metal, atom, length: b.length }];
  });
  return { floors: holds?.floors ?? [], contacts, held };
}

const distance = (f: readonly number[], i: number, j: number) => Math.hypot(f[3 * i] - f[3 * j], f[3 * i + 1] - f[3 * j + 1], f[3 * i + 2] - f[3 * j + 2]);

/** Where a conformer has two atoms run into one another - nearer than the least its contacts give them: the nearest such, by share of their contact; else null. */
export function runInto(frame: readonly number[], contacts: MadeChecks["contacts"]): { i: number; j: number; d: number; share: number } | null {
  let worst: { i: number; j: number; d: number; share: number } | null = null;
  for (const { i, j, least } of contacts) {
    const d = distance(frame, i, j);
    if (d < least) {
      const share = (d / least) * CONTACT_FLOOR;
      if (!worst || share < worst.share) worst = { i, j, d, share };
    }
  }
  return worst;
}

/** Where a conformer has a bond to a metal further than METAL_BOND_OFF from the length it is held to: the furthest such; else null. */
export function tornFrom(frame: readonly number[], held: MadeChecks["held"]): { metal: number; atom: number; d: number; length: number } | null {
  let worst: { metal: number; atom: number; d: number; length: number } | null = null;
  for (const { metal, atom, length } of held) {
    const d = distance(frame, metal, atom);
    if (Math.abs(d / length - 1) > METAL_BOND_OFF && (!worst || Math.abs(d / length - 1) > Math.abs(worst.d / worst.length - 1))) worst = { metal, atom, d, length };
  }
  return worst;
}

/** A metal's symbol, by atom, in what a search made. */
type MadeAtoms = readonly { el: string }[];

/** Of the frames a search made, what its checks find in each: under a floor, two atoms run into one another, a bond to a metal lost - the first that holds - and whether it is kept. */
function judged(frames: readonly number[][], checks: MadeChecks) {
  const under = frames.map((f) => (checks.floors.length ? underFloor(f, checks.floors) : null));
  const clashed = frames.map((f, k) => (under[k] ? null : runInto(f, checks.contacts)));
  const torn = frames.map((f, k) => (under[k] || clashed[k] ? null : tornFrom(f, checks.held)));
  return { under, clashed, torn, keep: frames.map((_, k) => !under[k] && !clashed[k] && !torn[k]) };
}

/** Which of the frames a search made its checks keep (`keptMade`), by index: all where there are no checks. */
export function keptFrames(frames: readonly number[][], checks: MadeChecks | null): number[] {
  const keep = checks ? judged(frames, checks).keep : frames.map(() => true);
  return keep.flatMap((k, i) => (k ? [i] : []));
}

/**
 * Of the conformers a search made, those its checks let stand (`MadeChecks`):
 * none under its floors (`underFloor`), none with two atoms run into one
 * another (`runInto`), none with a bond to a metal it lost (`tornFrom`) -
 * their energies with them; and, where any was set aside, a row of Meno's
 * own after the search's (*Set aside*) - how many of those that came, and
 * why, the worst of each. The search's own rows are left as it wrote them.
 * Refused, saying why, where none is left.
 */
export function keptMade<T extends { atoms: MadeAtoms; frames: number[][]; energies?: number[]; modelEnergies?: number[]; how?: { label: string; text: string }[] }>(c: T, checks: MadeChecks | null): T {
  if (!checks) return c;
  const { under, clashed, torn, keep } = judged(c.frames, checks);
  if (keep.every(Boolean)) return c;
  const el = (i: number) => c.atoms[i].el;
  if (!keep.some(Boolean)) {
    const first = under.find(Boolean);
    if (first) throw new Error(`every structure made of it came out with two ligands at ${el(first.metal)} closer than the ${first.angle}\u00b0 they were held apart`);
    throw new Error("every structure made of it came out with two atoms run into one another, or a bond to a metal far from its length");
  }
  const parts: [number, string][] = [];
  const floor = new Map<string, { metal: number; angle: number; narrowest: number; n: number }>();
  for (const u of under) if (u) {
    const key = `${u.metal},${u.angle}`;
    const was = floor.get(key);
    floor.set(key, { ...u, narrowest: Math.min(u.narrowest, was?.narrowest ?? Infinity), n: (was?.n ?? 0) + 1 });
  }
  for (const u of [...floor.values()].sort((p, q) => p.metal - q.metal || p.angle - q.angle))
    parts.push([u.n, `two ligands at ${el(u.metal)} closer than the ${u.angle}\u00b0 floor held (narrowest ${u.narrowest.toFixed(0)}\u00b0)`]);
  const hits = clashed.filter((x): x is NonNullable<typeof x> => x != null);
  if (hits.length) {
    const w = hits.reduce((p, q) => (q.share < p.share ? q : p));
    parts.push([hits.length, `two atoms run into one another (nearest: ${el(w.i)} and ${el(w.j)} at ${w.d.toFixed(2)} \u00c5)`]);
  }
  const offs = torn.filter((x): x is NonNullable<typeof x> => x != null);
  if (offs.length) {
    const w = offs.reduce((p, q) => (Math.abs(q.d / q.length - 1) > Math.abs(p.d / p.length - 1) ? q : p));
    parts.push([offs.length, `a bond to a metal far from its length (the worst: ${el(w.metal)}-${el(w.atom)} at ${w.d.toFixed(2)} \u00c5)`]);
  }
  const dropped = keep.filter((k) => !k).length;
  // (under floors alone, each metal's said as it is; with more than one kind of reason, how many each)
  const said = !hits.length && !offs.length ? parts.map(([, words]) => words).join("; ") : parts.length === 1 ? parts[0][1] : parts.map(([n, words]) => `${n} with ${words}`).join("; ");
  const pick = <V,>(xs: V[] | undefined) => xs && xs.filter((_, i) => keep[i]);
  return {
    ...c,
    frames: pick(c.frames)!,
    ...(c.energies ? { energies: pick(c.energies) } : {}),
    ...(c.modelEnergies ? { modelEnergies: pick(c.modelEnergies) } : {}),
    how: [...(c.how ?? []), { label: "Set aside", text: `${dropped} of ${c.frames.length}: ${said}` }],
  };
}

/** The checks of the structure a MOL block draws (`madeChecks`), with its holds where it has metals. */
export function madeChecksOf(molblock: string, holds: MetalHolds | null): MadeChecks | null {
  const g = holdsGraphOf(molblock);
  return g ? madeChecks(g.atoms, g.bonds, holds) : null;
}
