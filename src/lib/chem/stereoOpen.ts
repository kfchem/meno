/**
 * Meno's rules on a structure's stereo, on what the toolkit perceives of it
 * (the plugin boundary, 2026-10-31): which double bonds have no
 * configuration of their own, and which open double bonds run on into one
 * another. The plugin enumerates and embeds as it is asked; what is open,
 * and what is never chosen, are Meno's.
 */
import { smallestRings } from "../layout/rings";
import { flatRingAtoms } from "./conformersSought";
import { readMolfile } from "./ctfile";
import { lonePairCentres, lonePairOfThree } from "./lonePairCentres";
import { implicitHydrogens } from "./molecule";

/** An atom as the rules read it: its element and charge, and its hydrogens where they are given (else by its valence). */
export type StereoAtom = { el: string; charge?: number; hs?: number };
/** A bond as the rules read it: its atoms and order (4 aromatic). */
export type StereoBond = { a: number; b: number; order: number };

/**
 * Why a C=N's E/Z is no configuration of its own (`movingCN`), as the InChI
 * Technical Manual (v1.04, 2011) takes such bonds.
 */
export const MOVING_CN = {
  shift: "its double bond moves with a hydrogen on an N, O or S beside it (an amidine, a guanidine, an imidic acid)",
  nh: "its N carries a hydrogen",
  cation: "an amidinium or guanidinium bond, shared with the N beside it",
} as const;
export type MovingWhy = keyof typeof MOVING_CN;

/** Each atom's hydrogens that are no atoms of their own: those given, or those its valence leaves (lib/chem/molecule). */
function implicitOf(atoms: readonly StereoAtom[], bonds: readonly StereoBond[]): number[] {
  const sum = atoms.map(() => 0);
  for (const b of bonds) {
    const o = b.order === 4 ? 1.5 : b.order <= 3 ? b.order : 0;
    sum[b.a] += o;
    sum[b.b] += o;
  }
  return atoms.map((a, i) => a.hs ?? implicitHydrogens(a.el, Math.round(sum[i]), a.charge ?? 0));
}

/**
 * The centres the toolkit perceives that are no centres under Meno's rule
 * on lone pairs (lib/chem/lonePairCentres): an atom of three neighbours and
 * a lone pair - an amine's N, a plain N-alkyl aziridine's - whose lone pair
 * keeps no configuration.
 */
function notCentres(atoms: readonly StereoAtom[], bonds: readonly StereoBond[]): (at: number) => boolean {
  const hs = implicitOf(atoms, bonds);
  const around = atoms.map(() => 0);
  const orders = atoms.map(() => 0);
  for (const b of bonds) {
    const o = b.order === 4 ? 1.5 : b.order <= 3 ? b.order : 0;
    if (!o) continue;
    around[b.a]++;
    around[b.b]++;
    orders[b.a] += o;
    orders[b.b] += o;
  }
  const keeps = lonePairCentres(
    atoms.map((a, i) => ({ ...a, hs: hs[i] })),
    bonds.filter((b) => b.order === 4 || (b.order >= 1 && b.order <= 3)),
  );
  return (at) => lonePairOfThree(atoms[at].el, atoms[at].charge ?? 0, around[at], orders[at], hs[at]) && !keeps(at);
}

/** Each atom's hydrogens: those given, or those its valence leaves (lib/chem/molecule), and the hydrogen atoms bonded to it. */
function hydrogensOf(atoms: readonly StereoAtom[], bonds: readonly StereoBond[]): number[] {
  const sum = atoms.map(() => 0);
  const explicit = atoms.map(() => 0);
  for (const b of bonds) {
    const o = b.order === 4 ? 1.5 : b.order <= 3 ? b.order : 0;
    sum[b.a] += o;
    sum[b.b] += o;
    if (atoms[b.a]?.el === "H") explicit[b.b]++;
    if (atoms[b.b]?.el === "H") explicit[b.a]++;
  }
  return atoms.map((a, i) => (a.hs ?? implicitHydrogens(a.el, Math.round(sum[i]), a.charge ?? 0)) + explicit[i]);
}

/**
 * The C=N double bonds whose E/Z is no configuration of their own, by bond
 * index, each with why (`MOVING_CN`): never enumerated, never chosen, nor
 * counted as left open (docs/WORKFLOWS.md, *C=N double bonds whose E/Z is
 * none of their own*). As the InChI Technical Manual (v1.04, 2011) takes
 * them: a hydrogen on an N, O or S bonded to the C=N's carbon moves to its
 * N, and the double bond with it - the 1,3-shift of its mobile H (IV.b,
 * Table 6), a bond it presumes rotatable (Appendix 5b) - an amidine's, a
 * guanidine's, an N-acyl amidine's, an imidic acid's. And a C=N whose N
 * bears a hydrogen, and an amidinium or guanidinium C=N+, its double bond
 * shared with an amino N beside it, one in no ring held flat. An imine
 * whose N bears a carbon, an oxime and a hydrazone keep theirs. A C=N in a
 * ring held flat (lib/chem/conformersSought `flatRingAtoms`: a pyridine's,
 * an imidazole's) is no double bond of its own.
 */
export function movingCN(atoms: readonly StereoAtom[], bonds: readonly StereoBond[]): Map<number, MovingWhy> {
  const hs = hydrogensOf(atoms, bonds);
  const around: number[][] = atoms.map(() => []);
  for (const b of bonds) {
    around[b.a]?.push(b.b);
    around[b.b]?.push(b.a);
  }
  const rings = smallestRings(atoms.length, bonds.map((b) => [b.a, b.b] as const));
  const flat = flatRingAtoms(atoms, bonds, rings);
  const inFlatRing = (x: number, y: number) => rings.some((r) => r.includes(x) && r.includes(y) && r.every((k) => flat.has(k)));
  const out = new Map<number, MovingWhy>();
  bonds.forEach((b, k) => {
    if (b.order !== 2) return;
    const [x, y] = [atoms[b.a], atoms[b.b]];
    if (!x || !y || [x.el, y.el].sort().join() !== "C,N" || inFlatRing(b.a, b.b)) return;
    const [c, n] = x.el === "C" ? [b.a, b.b] : [b.b, b.a];
    const others = around[c].filter((j) => j !== n);
    if (others.some((j) => ["N", "O", "S"].includes(atoms[j].el) && hs[j] > 0)) out.set(k, "shift");
    else if (hs[n] > 0) out.set(k, "nh");
    else if ((atoms[n].charge ?? 0) > 0 && others.some((j) => atoms[j].el === "N" && !(atoms[j].charge ?? 0) && !flat.has(j))) out.set(k, "cation");
  });
  return out;
}

/** What a structure's C=N bonds left open whose E/Z is none of their own are, in a line - each reason once - or null. */
export function movingSaid(whys: readonly MovingWhy[]): string | null {
  if (!whys.length) return null;
  return `E/Z of ${whys.length} C=N not enumerated: ${[...new Set(whys)].map((w) => MOVING_CN[w]).join("; ")} - no configuration of its own`;
}

/** The double bonds `open` (by index, all cumulated) as the runs they make, each run's bonds in order of index: two that share an atom are of one run. */
export function cumulatedRuns(bonds: readonly StereoBond[], open: readonly number[]): number[][] {
  const runs: number[][] = [];
  for (const i of [...open].sort((p, q) => p - q)) {
    const ends = new Set([bonds[i].a, bonds[i].b]);
    const joined = runs.filter((r) => r.some((j) => ends.has(bonds[j].a) || ends.has(bonds[j].b)));
    for (const r of joined) runs.splice(runs.indexOf(r), 1);
    runs.push([...new Set([i, ...joined.flat()])].sort((p, q) => p - q));
  }
  return runs.sort((p, q) => p[0] - q[0]);
}

/** Of the open double bonds (by index), those of cumulated double bonds - an allene's - whose stereoisomers are an axis's. */
export function openCumulenes(bonds: readonly StereoBond[], open: readonly number[]): number[] {
  const doubles = new Map<number, number>();
  for (const b of bonds) if (b.order === 2) for (const x of [b.a, b.b]) doubles.set(x, (doubles.get(x) ?? 0) + 1);
  return open.filter((i) => (doubles.get(bonds[i].a) ?? 0) > 1 || (doubles.get(bonds[i].b) ?? 0) > 1);
}

/** A place in 3D, in ångströms. */
export type Place = readonly [number, number, number];

/**
 * The configurations open stereocentres and double bonds have in places
 * made before (a molecule in 3D made from the same drawing: the page's
 * `like`), to be made so again: a centre's by its neighbours in the order
 * of its bonds and the sign of the volume the first three span seen from it
 * (lib/layout/stereo's `Tetrahedral` reading, an implicit H the fourth); a
 * double bond's by an atom bonded to each end, the first other than the
 * other end, and whether the two are on the same side. Only where the atom,
 * or the bond's two, and every atom bonded to them have a place; none
 * where the places are flat (a volume, or a side, of nought).
 */
export function configuredFrom(
  bonds: readonly StereoBond[],
  places: Readonly<Record<number, Place>>,
  openAtoms: readonly number[],
  openBonds: readonly number[],
): { centres: { atom: number; neighbours: number[]; sense: 1 | -1 }[]; doubles: { bond: number; ends: [number, number]; cis: boolean }[] } {
  const around = new Map<number, number[]>();
  for (const b of bonds) {
    around.set(b.a, [...(around.get(b.a) ?? []), b.b]);
    around.set(b.b, [...(around.get(b.b) ?? []), b.a]);
  }
  const placed = (x: number) => x in places && (around.get(x) ?? []).every((n) => n in places);
  const minus = (p: Place, q: Place): Place => [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
  const cross = (p: Place, q: Place): Place => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];
  const dot = (p: Place, q: Place) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
  const centres = openAtoms.flatMap((c) => {
    const ns = around.get(c) ?? [];
    if (ns.length < 3 || !placed(c)) return [];
    const [u, v, w] = ns.slice(0, 3).map((n) => minus(places[n], places[c]));
    const volume = dot(u, cross(v, w));
    return Math.abs(volume) < 1e-6 ? [] : [{ atom: c, neighbours: ns, sense: (volume > 0 ? 1 : -1) as 1 | -1 }];
  });
  const doubles = openBonds.flatMap((i) => {
    const { a, b } = bonds[i];
    if (!placed(a) || !placed(b)) return [];
    const na = (around.get(a) ?? []).find((n) => n !== b);
    const nb = (around.get(b) ?? []).find((n) => n !== a);
    if (na == null || nb == null) return [];
    const axis = minus(places[b], places[a]);
    const side = dot(cross(axis, minus(places[na], places[a])), cross(axis, minus(places[nb], places[b])));
    return Math.abs(side) < 1e-6 ? [] : [{ bond: i, ends: [na, nb] as [number, number], cis: side > 0 }];
  });
  return { centres, doubles };
}

/**
 * The most stereoisomers one structure is made in, all at once: 32 = 2^5,
 * five open stereocentres or double bonds made whole - a set still to be
 * looked over one by one. *Stereoisomers* sets one with more aside whole,
 * never some of them; the page and a *Conformers* step make the first 32.
 */
export const MOST_ISOMERS = 32;

/**
 * How long one structure's stereoisomers may be looked for, each tried in
 * 3D, before it is set aside alone (ms): a camphor's take some 10 s - its
 * bridgeheads left open, each of its four tried and two refused - so 30 s
 * is three of those.
 */
export const EXAMINE_MS = 30_000;

/** An element that could be stereogenic, as the toolkit perceives it: its kind, the atom or bond it is on, and how its configuration is drawn - given, not given, or drawn as not known (a wavy bond, a double bond of either). */
export type StereoElement = { kind: "centre" | "double" | "axis" | "cumulene" | "other"; at: number; state: "specified" | "unspecified" | "unknown" };

/** A centre's configuration: its neighbours, in the order named, and the sign of the volume the first three span seen from it. */
export type ConfiguredCentre = { atom: number; neighbours: number[]; sense: 1 | -1 };
/** A double bond's: an atom bonded to each end, and whether the two are on the same side. */
export type ConfiguredDouble = { bond: number; ends: [number, number]; cis: boolean };
/** Some of a structure's elements given configurations, in Meno's terms: the plugin makes them its own toolkit's. */
export type Configuration = { centres: ConfiguredCentre[]; doubles: ConfiguredDouble[] };

/** What the plugin made of a structure's stereoisomers, as Meno asked for them (Workspace/chem/openStereo `stereoisomersOf`). */
export type IsomersMade =
  | { isomers: { configured: Configuration; smiles: string; molblock?: string; error?: string }[]; free: boolean }
  | { tooMany: { counted: number; bound: number } }
  | { tooLong: true };

/**
 * What a structure leaves open, as Meno decides it: its stereocentres and
 * double bonds drawn without a configuration, or with one drawn as not
 * known, by index - but an atom of three neighbours whose lone pair keeps
 * no configuration (lib/chem/lonePairCentres: an amine's N), which is no
 * centre, and a C=N whose E/Z is none of its own (`movingCN`),
 * which is never enumerated nor chosen (`notEnumerated`, and `said` in a
 * line); the open double bonds that are cumulated (`cumulenes`: an
 * allene's axis, whose stereoisomers are not given) and the runs they make
 * (`cumulated`: one element each - an allene's axis, of two or four; cis
 * or trans, of three).
 */
export type StereoLeft = { atoms: number[]; bonds: number[]; cumulenes: number[]; cumulated: number[][]; notEnumerated: number[]; said: string | null };

/** What a structure leaves open (`StereoLeft`), from the elements the toolkit perceives in it and its atoms and bonds. */
export function stereoLeft(elements: readonly StereoElement[], atoms: readonly StereoAtom[], bonds: readonly StereoBond[]): StereoLeft {
  const open = elements.filter((e) => e.state !== "specified");
  const moving = movingCN(atoms, bonds);
  const byIndex = (p: number, q: number) => p - q;
  const doubles = open.filter((e) => e.kind === "double").map((e) => e.at);
  const notEnumerated = doubles.filter((i) => moving.has(i)).sort(byIndex);
  const left = doubles.filter((i) => !moving.has(i)).sort(byIndex);
  const cumulenes = openCumulenes(bonds, left);
  const none = notCentres(atoms, bonds);
  return {
    atoms: open.filter((e) => e.kind === "centre" && !none(e.at)).map((e) => e.at).sort(byIndex),
    bonds: left,
    cumulenes,
    cumulated: cumulatedRuns(bonds, cumulenes),
    notEnumerated,
    said: movingSaid(notEnumerated.map((i) => moving.get(i)!)),
  };
}

/** What is still left open once `configured` gives some of it a configuration: the rest, its cumulated ones and their runs again. */
export function leftOver(left: StereoLeft, configured: Configuration, bonds: readonly StereoBond[]): StereoLeft {
  const centres = new Set(configured.centres.map((c) => c.atom));
  const doubles = new Set(configured.doubles.map((d) => d.bond));
  const rest = left.bonds.filter((i) => !doubles.has(i));
  const cumulenes = openCumulenes(bonds, rest);
  return { ...left, atoms: left.atoms.filter((i) => !centres.has(i)), bonds: rest, cumulenes, cumulated: cumulatedRuns(bonds, cumulenes) };
}

/**
 * A structure's atoms and bonds as the rules read them, from its parts'
 * MOL blocks, one after another, as the plugin reads them as one: every
 * bond, in its order - a multi-centre one of no order - and each atom's
 * radical electrons taking the place of hydrogens. Null where a block
 * cannot be read.
 */
export function stereoGraphOf(molblocks: readonly string[]): { atoms: StereoAtom[]; bonds: StereoBond[] } | null {
  const atoms: StereoAtom[] = [];
  const bonds: StereoBond[] = [];
  for (const block of molblocks) {
    const ct = readMolfile(block);
    if (!ct) return null;
    const at = atoms.length;
    const radicals = (r: unknown) => (r === "doublet" ? 1 : r === "singlet" || r === "triplet" ? 2 : 0);
    const sums = ct.atoms.map(() => 0);
    for (const b of ct.bonds) {
      const o = b.endpoints?.length ? 0 : b.type;
      bonds.push({ a: b.a1 + at, b: b.a2 + at, order: o });
      const v = o === 4 ? 1.5 : o >= 1 && o <= 3 ? o : 0;
      sums[b.a1] += v;
      sums[b.a2] += v;
    }
    ct.atoms.forEach((a, i) => {
      const r = radicals(a.radical);
      atoms.push({ el: a.symbol, charge: a.charge ?? 0, ...(r ? { hs: implicitHydrogens(a.symbol, Math.round(sums[i]) + r, a.charge ?? 0) } : {}) });
    });
  }
  return { atoms, bonds };
}
