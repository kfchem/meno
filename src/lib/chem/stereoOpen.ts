/**
 * Meno's rules on a structure's stereo, on what the toolkit perceives of it
 * (the plugin boundary, 2026-10-31): which double bonds have no
 * configuration of their own, and which open double bonds run on into one
 * another. The plugin enumerates and embeds as it is asked; what is open,
 * and what is never chosen, are Meno's.
 */
import { valenceOrders } from "./kekulize";
import { readMolfile } from "./ctfile";
import { lonePairCentres, lonePairOfThree } from "./lonePairCentres";
import { implicitHydrogens } from "./molecule";
import { runsOf } from "./perception/stereo/runs";
import { configurationKey, groupsIn, type IsomerConfiguration, type ConfiguredCentre, type ConfiguredGroup, type GroupOnBond } from "./perception/stereo/configuration";
import { readStereo, type DrawnAtom, type DrawnBond } from "./perception/stereo/from2d";

// (the C=N bonds whose E/Z is none of their own, with why: the core's - perception/stereo/movingCN)
export { MOVING_CN, movingCN, type MovingWhy } from "./perception/stereo/movingCN";
import { MOVING_CN, movingCN, type MovingWhy } from "./perception/stereo/movingCN";

// (a configuration's types and key: the core's, one definition - perception/stereo/configuration)
export { configurationKey, NO_CONFIGURATION, type Configuration, type IsomerConfiguration, type ConfiguredCentre, type ConfiguredDouble, type ConfiguredGroup } from "./perception/stereo/configuration";

/** An atom as the rules read it: its element and charge, and its hydrogens where they are given (else by its valence). */
export type StereoAtom = { el: string; charge?: number; hs?: number };
/** A bond as the rules read it: its atoms and order (4 aromatic). */
export type StereoBond = { a: number; b: number; order: number };


/** Each atom's hydrogens that are no atoms of their own: those given, or those its valence leaves (lib/chem/molecule), aromatic bonds as a Kekulé structure has them (lib/chem/kekulize `valenceOrders`). */
export function implicitOf(atoms: readonly StereoAtom[], bonds: readonly StereoBond[]): number[] {
  const sum = atoms.map(() => 0);
  const orders = valenceOrders(atoms, bonds);
  bonds.forEach((b, k) => {
    const o = orders[k] <= 3 ? orders[k] : 0;
    sum[b.a] += o;
    sum[b.b] += o;
  });
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

/** What a structure's C=N bonds left open whose E/Z is none of their own are, in a line - each reason once - or null. */
export function movingSaid(whys: readonly MovingWhy[]): string | null {
  if (!whys.length) return null;
  return `E/Z of ${whys.length} C=N not enumerated: ${[...new Set(whys)].map((w) => MOVING_CN[w]).join("; ")} - no configuration of its own`;
}

/**
 * The double bonds `open` (by index, all cumulated) as the runs they make, each run's bonds in order of index: two that share an atom are
 * of one run. The runs are the core's (perception/stereo/runs, on through each atom with two double bonds); of each, the open bonds one
 * after another along it are one group. (Two open double bonds that meet at an atom of three or more double bonds are no run's here, and
 * two groups: no carbon has three.)
 */
export function cumulatedRuns(bonds: readonly StereoBond[], open: readonly number[]): number[][] {
  const isOpen = new Set(open);
  const key = (a: number, b: number) => (a < b ? `${a},${b}` : `${b},${a}`);
  const index = new Map<string, number>();
  for (const i of [...isOpen].sort((p, q) => p - q)) if (!index.has(key(bonds[i].a, bonds[i].b))) index.set(key(bonds[i].a, bonds[i].b), i);
  const atoms = Array.from({ length: bonds.reduce((n, b) => Math.max(n, b.a + 1, b.b + 1), 0) }, () => ({}));
  const runs = runsOf({ atoms, bonds }, "twoDoubles");
  const groups: number[][] = [];
  const placed = new Set<number>();
  for (const i of [...isOpen].sort((p, q) => p - q)) {
    if (placed.has(i)) continue;
    const along = runs.of(bonds[i].a, bonds[i].b).atoms;
    // (the open bonds along the run, split where one between them is not open)
    let group: number[] = [];
    for (let k = 1; k < along.length; k++) {
      const j = index.get(key(along[k - 1], along[k]));
      if (j == null) {
        if (group.includes(i)) break;
        group = [];
        continue;
      }
      group.push(j);
    }
    for (const j of group) placed.add(j);
    groups.push([...new Set([i, ...group])].sort((p, q) => p - q));
  }
  return groups.sort((p, q) => p[0] - q[0]);
}

/** Of the open double bonds (by index), those of cumulated double bonds - an allene's - whose stereoisomers are an axis's. */
export function openCumulenes(bonds: readonly StereoBond[], open: readonly number[]): number[] {
  const doubles = new Map<number, number>();
  for (const b of bonds) if (b.order === 2) for (const x of [b.a, b.b]) doubles.set(x, (doubles.get(x) ?? 0) + 1);
  return open.filter((i) => (doubles.get(bonds[i].a) ?? 0) > 1 || (doubles.get(bonds[i].b) ?? 0) > 1);
}

// (a configuration read from places: the core's, one reading - perception/stereo/from3d)
export { configuredFrom, type Place } from "./perception/stereo/from3d";

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

/**
 * Whether a configuration tells apart all that the plugin enumerates
 * (`open`: the centres and double bonds it was asked of): every open centre
 * and every open double bond has its configuration in it - but an axis's
 * (`cumulenes`), which a configuration never gives.
 */
function configuresAllOf(c: IsomerConfiguration, open: Pick<StereoLeft, "atoms" | "bonds" | "cumulenes">): boolean {
  if (!c.centres.length && !c.doubles.length) return false;
  const atoms = new Set(c.centres.map((x) => x.atom));
  const bonds = new Set(c.doubles.map((x) => x.bond));
  return open.atoms.every((i) => atoms.has(i)) && open.bonds.every((i) => bonds.has(i) && !open.cumulenes.includes(i));
}

/**
 * Stereoisomers each once, by their configuration, the first of each kept:
 * the toolkit enumerates what Meno does not see, by its own rules, and its
 * isomers then differ only there: a lone pair's inversion at an aziridine's
 * N, with a carbon centre beside it. The halves of an AND or OR group stay
 * apart: their centres are in the configuration read back where a
 * structure has groups (Workspace/chem/openStereo `stereoisomersOf`). An
 * isomer whose configuration leaves some of what the toolkit enumerates
 * out (`open`: an allene's axis, or a centre it gives none of) is kept
 * whatever - the others could differ there, and merged would be dropped
 * unseen - and so is one that gives no configuration at all.
 */
export function distinctIsomers<T extends { configured: IsomerConfiguration }>(isomers: readonly T[], open: Pick<StereoLeft, "atoms" | "bonds" | "cumulenes">): T[] {
  const seen = new Set<string>();
  return isomers.filter((i) => {
    if (!configuresAllOf(i.configured, open)) return true;
    const key = configurationKey(i.configured);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** What the plugin made of a structure's stereoisomers, as Meno asked for them (Workspace/chem/openStereo `stereoisomersOf`). */
export type IsomersMade =
  | { isomers: { configured: IsomerConfiguration; smiles: string; molblock?: string; configuration?: IsomerConfiguration; error?: string }[]; free: boolean }
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
export function leftOver(left: StereoLeft, configured: IsomerConfiguration, bonds: readonly StereoBond[]): StereoLeft {
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

/**
 * A structure's AND and OR groups as its drawing has them (lib/chem/perception/stereo/configuration `groupsIn`), its parts' MOL blocks read
 * as one: each group whose every centre the drawing's wedges read (lib/chem/perception/stereo/from2d, Meno's reading), to be turned as a
 * whole (`groups`), and each of those centres as drawn (`drawn`); each group one of whose centres does not read, with that atom (`held`:
 * made as drawn, never turned in part); the groups that hold a bond (`onBonds`: a bond's configuration is not turned); and every centre the
 * drawing reads (`read`), by atom. Null where a block cannot be read.
 */
export type DrawnGroups = {
  groups: ConfiguredGroup[];
  drawn: ConfiguredCentre[];
  held: { group: ConfiguredGroup; atom: number }[];
  onBonds: GroupOnBond[];
  read: Map<number, ConfiguredCentre>;
};

/** No group. */
export const NO_GROUPS: DrawnGroups = { groups: [], drawn: [], held: [], onBonds: [], read: new Map() };

export function drawnGroupsOf(molblocks: readonly string[]): DrawnGroups | null {
  const graph = stereoGraphOf(molblocks);
  if (!graph) return null;
  const all: ConfiguredGroup[] = [];
  const onBonds: GroupOnBond[] = [];
  const atoms: DrawnAtom[] = [];
  const bonds: DrawnBond[] = [];
  const hs = implicitOf(graph.atoms, graph.bonds);
  for (const block of molblocks) {
    const ct = readMolfile(block);
    if (!ct) return null;
    const at = atoms.length;
    const found = groupsIn(ct.collections, at);
    // (a group of the same kind and number in two parts is two groups: each part's own)
    all.push(...found.groups);
    for (const g of found.onBonds) if (!onBonds.some((x) => x.kind === g.kind && x.n === g.n)) onBonds.push(g);
    ct.atoms.forEach((a, i) => atoms.push({ x: a.x, y: a.y, el: a.symbol, ...(a.charge ? { charge: a.charge } : {}), hs: hs[at + i] ?? 0 }));
    for (const b of ct.bonds) {
      if (b.endpoints?.length) continue;
      bonds.push({
        a: b.a1 + at,
        b: b.a2 + at,
        order: b.type,
        ...(b.stereo === "up" || b.stereo === "down" ? { wedge: { narrow: b.a1 + at, stereo: b.stereo } } : {}),
        ...(b.stereo === "either" ? { either: true } : {}),
      });
    }
  }
  if (!all.length && !onBonds.length) return NO_GROUPS;
  // (a flat drawing's wedges, as Meno reads them; one drawn in perspective is not read here, and its group is made as drawn)
  const tetra = readStereo(atoms, bonds).tetra;
  const read = new Map<number, ConfiguredCentre>();
  for (const [atom, t] of tetra) read.set(atom, { atom, neighbours: t.neighbours.filter((n) => n >= 0), sense: t.volume });
  const groups: ConfiguredGroup[] = [];
  const held: DrawnGroups["held"] = [];
  for (const g of all) {
    const unread = g.centres.find((c) => !read.has(c));
    if (unread != null) held.push({ group: g, atom: unread });
    else groups.push(g);
  }
  return { groups, drawn: groups.flatMap((g) => g.centres.map((c) => read.get(c)!)), held, onBonds, read };
}
