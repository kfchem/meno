/**
 * A configuration, as Meno gives one to what makes a structure in 3D: some of its stereocentres and double bonds given theirs, and its
 * groups - the centres a drawing puts in an AND or OR group (V3000's enhanced stereo, STERAC and STEREL: "CTfile Formats", *Enhanced
 * stereochemistry*), known only relative to each other. One definition (foundation part 7): `lib/chem/stereoOpen` and every user of a
 * configuration take it from here.
 *
 * What goes to the plugin is the centres and double bonds (`sentOf`): the groups are Meno's, and Meno says what it made of them.
 */

/** A centre's configuration: its neighbours, in the order named, and the sign of the volume the first three span seen from it. */
export type ConfiguredCentre = { atom: number; neighbours: number[]; sense: 1 | -1 };
/** A double bond's: an atom bonded to each end, and whether the two are on the same side. */
export type ConfiguredDouble = { bond: number; ends: [number, number]; cis: boolean };
/**
 * Centres known only relative to each other: both ways are present (`and`, a racemic group), or one of the two, not known which (`or`).
 * `n` is the group's number, as the drawing writes it ("and1"). Its centres are atoms: a group on a bond is not one of these.
 */
export type ConfiguredGroup = { kind: "and" | "or"; n: number; centres: number[] };
/**
 * Some of a structure's elements given configurations, in Meno's terms (the plugin makes them its own toolkit's), and the groups its
 * centres are in - an empty list where there are none: whatever builds a configuration says what it did with the groups.
 */
export type Configuration = { centres: ConfiguredCentre[]; doubles: ConfiguredDouble[]; groups: ConfiguredGroup[] };

/** What the plugin is given of a configuration, and gives back of a stereoisomer it made: its centres and double bonds, never groups. */
export type IsomerConfiguration = Pick<Configuration, "centres" | "doubles">;

/** Nothing configured, no group. */
export const NO_CONFIGURATION: Configuration = { centres: [], doubles: [], groups: [] };

/** What the plugin is given of a configuration: its centres and double bonds, never its groups. */
export const sentOf = (c: IsomerConfiguration): IsomerConfiguration => ({ centres: c.centres, doubles: c.doubles });

/**
 * One configuration, as a string that two of the same give: each centre by its atom and its sense taken over its neighbours in ascending
 * order (the sense turns with the parity of the order they were named in), each double bond by its bond, its ends (in ascending order: a
 * pair has no first) and whether they are cis - the elements in the order of their atoms and bonds. The groups are not in it: two
 * configurations alike centre by centre are one, whatever group a centre is in.
 */
export function configurationKey(c: IsomerConfiguration): string {
  const centres = [...c.centres]
    .sort((p, q) => p.atom - q.atom)
    .map((x) => {
      const sorted = [...x.neighbours].sort((p, q) => p - q);
      // (the swaps that put the neighbours in order, counted as inversions)
      let odd = false;
      for (let i = 0; i < x.neighbours.length; i++) for (let j = i + 1; j < x.neighbours.length; j++) if (x.neighbours[i] > x.neighbours[j]) odd = !odd;
      return [x.atom, sorted, odd ? -x.sense : x.sense];
    });
  const doubles = [...c.doubles].sort((p, q) => p.bond - q.bond).map((x) => [x.bond, [...x.ends].sort((p, q) => p - q), x.cis]);
  return JSON.stringify([centres, doubles]);
}

/** `c` with every centre of its group `group` (its place in `c.groups`) turned; nothing else touched. */
export function inverted(c: Configuration, group: number): Configuration {
  const turned = new Set(c.groups[group]?.centres ?? []);
  return { ...c, centres: c.centres.map((x) => (turned.has(x.atom) ? { ...x, sense: x.sense > 0 ? -1 : 1 } : x)) };
}

/** A half of a configuration with groups: the configuration, and which of its groups are turned (by their places in `groups`). */
export type Half = { configured: Configuration; turned: number[] };

/**
 * The 2^G halves a configuration's G groups give: each group as drawn or turned over as a whole, never in part - the one as drawn first,
 * then by which groups are turned, the first group's turn the lowest bit.
 */
export function halves(c: Configuration): Half[] {
  const out: Half[] = [];
  for (let k = 0; k < 2 ** c.groups.length; k++) {
    const turned = c.groups.flatMap((_, g) => ((k >> g) & 1 ? [g] : []));
    out.push({ configured: turned.reduce(inverted, c), turned });
  }
  return out;
}

/** A V3000 collection as the CTfile names it, with its atoms and bonds (0-based). */
export type StereoCollection = { name: string; atoms: readonly number[]; bonds: readonly number[] };

/**
 * What a V3000 collection's name says of the stereo of what it holds ("CTfile Formats", *Enhanced stereochemistry*): `MDLV30/STEABS`, the
 * configurations as drawn (absolute); `MDLV30/STERACn`, group n of AND (racemic: both); `MDLV30/STERELn`, group n of OR (relative: one of
 * the two, not known which) - and the same with `STEB` for one of bonds, as Meno's reader has always taken such names (the CTfile keeps a
 * group's bonds in its collection's own `BONDS=`, which `groupsIn` reads too). Null for any other collection.
 */
export function stereoGroupNamed(name: string): { kind: "abs" | "and" | "or"; n: number; onBonds: boolean } | null {
  const m = /^MDLV30\/STE(B?)(ABS|RAC|REL)(\d*)$/i.exec(name);
  if (!m) return null;
  const kind = m[2].toUpperCase() === "ABS" ? "abs" : m[2].toUpperCase() === "RAC" ? "and" : "or";
  return { kind, n: kind === "abs" ? 0 : Number.parseInt(m[3] || "1", 10), onBonds: m[1] !== "" };
}

/** A group a drawing puts a bond in: its kind and number ("and1"). Such a group is not turned (a bond's configuration is not). */
export type GroupOnBond = { kind: "and" | "or"; n: number };

/**
 * The AND and OR groups of one structure's collections (`stereoGroupNamed`), its atoms numbered on from `offset` (a part after others):
 * each group's centres, in their order - and the groups that hold a bond, each once, which are not turned. An absolute collection is no
 * group: its centres are as drawn.
 */
export function groupsIn(collections: readonly StereoCollection[], offset = 0): { groups: ConfiguredGroup[]; onBonds: GroupOnBond[] } {
  const groups: ConfiguredGroup[] = [];
  const onBonds: GroupOnBond[] = [];
  const same = (g: { kind: string; n: number }, h: { kind: string; n: number }) => g.kind === h.kind && g.n === h.n;
  for (const c of collections) {
    const named = stereoGroupNamed(c.name);
    if (!named || named.kind === "abs") continue;
    const at = { kind: named.kind, n: named.n };
    if (c.bonds.length && !onBonds.some((g) => same(g, at))) onBonds.push(at);
    if (named.onBonds || !c.atoms.length) continue;
    const g = groups.find((x) => same(x, at));
    const centres = c.atoms.map((a) => a + offset);
    if (g) g.centres.push(...centres.filter((a) => !g.centres.includes(a)));
    else groups.push({ ...at, centres });
  }
  return { groups, onBonds };
}

/** A group's name as a drawing writes it: "and1", "or2". */
export const groupName = (g: { kind: "and" | "or"; n: number }): string => `${g.kind}${g.n}`;
