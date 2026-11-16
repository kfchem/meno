/**
 * The halves of a structure whose centres are drawn in AND or OR groups (docs/WORKSPACE.md, *3D structures*): which there are, which the
 * plugin made, in what order, which is another's mirror image, and what is said of each. Meno's, all of it (the plugin boundary,
 * 2026-10-31): the plugin that finds stereoisomers turns each group whole and tries each in 3D (its toolkit's own enumeration), and its
 * answer says only what it made; which halves there are, which is drawn, why one is missing and which is a mirror image are decided here.
 *
 * - A group is turned as a whole or not at all: a stereoisomer with some of a group's centres turned and others not, or with a centre
 *   outside every group and not left open turned, is none of the halves, and the structure is made with that group as drawn, said.
 * - A half that did not come back is said ("and1 turned over cannot be made in 3D"), but where Meno's identity takes it for one that did
 *   (a meso form, its two centres one group): then it is that one, and nothing is said.
 * - A half that is the mirror image of one listed before it is made as that one's reflection, not searched again - but where the structure
 *   has anything the reflection would turn that its centres do not show (`mirrorable`: an axis, a cumulene, a metal's arrangement).
 */
import { configurationKey, groupName, type Configuration, type IsomerConfiguration, type ConfiguredCentre, type ConfiguredGroup } from "../../../../lib/chem/perception/stereo/configuration";
import type { DrawnGroups, StereoLeft } from "../../../../lib/chem/stereoOpen";

/**
 * Which half a stereoisomer made is: its groups turned (by place among the groups), its name ("and1 turned over"), what is said of it as a
 * drawing (`plain`) and in 3D (`words`); and, where it is made in 3D as the reflection of one listed before it, that one's place
 * (`mirrorOf`) and name (`mirrorName`).
 */
export type Half = { turned: number[]; name: string; plain: string; words: string; mirrorOf?: number; mirrorName?: string };

/** The halves made, each its configuration, which half it is and the place of the plugin's isomer it is made of (`from`), in Meno's order - and what is said of the structure. */
export type Halves = { made: { configured: Configuration; half?: Half; from: number }[]; said: string[] };

/** Whether two configurations of one centre are the same, whatever order their neighbours are named in. */
const agrees = (a: ConfiguredCentre, b: ConfiguredCentre) => configurationKey({ centres: [a], doubles: [] }) === configurationKey({ centres: [b], doubles: [] });

/** A centre turned. */
const turnedCentre = (c: ConfiguredCentre): ConfiguredCentre => ({ ...c, sense: c.sense > 0 ? -1 : 1 });

/** Every centre of a configuration turned: its mirror image, where nothing else in the structure has a hand. */
export const mirrored = (c: IsomerConfiguration): IsomerConfiguration => ({ centres: c.centres.map(turnedCentre), doubles: c.doubles });

/** What a half is called: each group as drawn or turned over. */
export const halfName = (groups: readonly ConfiguredGroup[], turned: readonly number[]): string =>
  groups.map((g, k) => `${groupName(g)} ${turned.includes(k) ? "turned over" : "as drawn"}`).join(", ");

/** What is said of a half: its name, the half it is the mirror image of where it is made so, and for an OR group that it is one of the two, not known which. */
export function halfWords(groups: readonly ConfiguredGroup[], name: string, mirrorName?: string): string {
  const mirror = mirrorName ? `: the mirror image of ${mirrorName} (same energies)` : "";
  const or = groups.some((g) => g.kind === "or") ? `${mirror ? ";" : ":"} one of the two, not known which` : "";
  return `${name}${mirror}${or}`;
}

/** The line a group not turned says, with its atom (numbered from 1, as a MOL block numbers it). */
export const heldSaid = (g: ConfiguredGroup, atom: number, why: string) => `${groupName(g)} is made as drawn: ${why} at atom ${atom + 1}`;

/** The line a group that holds a bond says. */
export const onBondSaid = (g: { kind: "and" | "or"; n: number }) => `its ${groupName(g)} on a bond is made as drawn: a bond's configuration is not turned`;

/**
 * The halves of what the plugin made (`isomers`, each with the configuration of every centre and double bond it was asked to read back)
 * of a structure with `groups` (lib/chem/stereoOpen `drawnGroupsOf`), what it leaves open (`left`) and `structure`'s groups as Meno
 * gives them on: each kept in Meno's order - by what is left open, in the plugin's order, and within that the half as drawn first, then by
 * which groups are turned (the first group the lowest bit) - each with its words. `identity` keys a full configuration (two the same
 * structure, the same key); `mirrorable`, whether a mirror image is told by its centres alone (see the file's header).
 */
export function halvesOf(
  isomers: readonly { configured: IsomerConfiguration }[],
  groups: DrawnGroups,
  left: Pick<StereoLeft, "atoms" | "bonds">,
  identity: (c: IsomerConfiguration) => string,
  mirrorable: boolean,
): Halves {
  const said: string[] = [];
  for (const h of groups.held) said.push(heldSaid(h.group, h.atom, "its configuration does not read"));
  for (const g of groups.onBonds) said.push(onBondSaid(g));
  const drawn = new Map(groups.drawn.map((c) => [c.atom, c]));
  const inGroup = new Set([...groups.groups, ...groups.held.map((h) => h.group)].flatMap((g) => g.centres));
  const open = new Set(left.atoms);
  // (the centres the drawing reads that are in no group and not left open: as drawn in every half)
  const fixed = [...groups.read.values()].filter((c) => !inGroup.has(c.atom) && !open.has(c.atom));
  let turnable = groups.groups;
  // (each group's state in an isomer: 0 as drawn, 1 turned, null turned in part or not read back - and for the centres outside: whether all are as drawn)
  const stateOf = (c: IsomerConfiguration, g: ConfiguredGroup): 0 | 1 | null => {
    const states = g.centres.map((a) => {
      const got = c.centres.find((x) => x.atom === a);
      return got ? (agrees(got, drawn.get(a)!) ? 0 : 1) : null;
    });
    return states.every((s) => s === 0) ? 0 : states.every((s) => s === 1) ? 1 : null;
  };
  const asDrawnOutside = (c: IsomerConfiguration) =>
    fixed.every((f) => {
      const got = c.centres.find((x) => x.atom === f.atom);
      return !got || agrees(got, f);
    }) &&
    groups.held.every((h) =>
      h.group.centres.every((a) => {
        const got = c.centres.find((x) => x.atom === a);
        const r = groups.read.get(a);
        return !got || !r || agrees(got, r);
      }),
    );
  // (a group some isomer turns in part: none of its halves is taken, and it is made as drawn, said - never a group turned in part)
  for (const g of turnable) {
    if (isomers.some((i) => stateOf(i.configured, g) == null)) said.push(heldSaid(g, g.centres[0], "its centres did not turn as one"));
  }
  turnable = turnable.filter((g) => !isomers.some((i) => stateOf(i.configured, g) == null));
  const groupsGiven: ConfiguredGroup[] = turnable;
  const baseKey = (c: IsomerConfiguration) =>
    configurationKey({ centres: c.centres.filter((x) => open.has(x.atom)), doubles: c.doubles.filter((x) => left.bonds.includes(x.bond)) });
  type Kept = { configured: IsomerConfiguration; mask: number; index: number };
  const bases = new Map<string, Map<number, Kept>>();
  for (const [index, i] of isomers.entries()) {
    if (!asDrawnOutside(i.configured)) continue;
    let mask = 0;
    groups.groups.forEach((g) => {
      const at = turnable.indexOf(g);
      const s = stateOf(i.configured, g);
      if (at < 0 && s !== 0) mask = -1;
      else if (at >= 0 && s === 1 && mask >= 0) mask |= 1 << at;
    });
    if (mask < 0) continue;
    const key = baseKey(i.configured);
    if (!bases.has(key)) bases.set(key, new Map());
    const halves = bases.get(key)!;
    if (!halves.has(mask)) halves.set(mask, { configured: i.configured, mask, index });
  }
  const turnedOf = (mask: number) => turnable.flatMap((_, k) => ((mask >> k) & 1 ? [k] : []));
  // (a half turned from another: its groups' centres turned where the masks differ)
  const turnedFrom = (k: Kept, mask: number): IsomerConfiguration => {
    const flip = new Set(turnable.flatMap((g, b) => (((k.mask ^ mask) >> b) & 1 ? g.centres : [])));
    return { centres: k.configured.centres.map((c) => (flip.has(c.atom) ? turnedCentre(c) : c)), doubles: k.configured.doubles };
  };
  const made: Halves["made"] = [];
  const keys: string[] = [];
  const missing = new Set<string>();
  for (const halves of bases.values()) {
    const some = [...halves.values()][0];
    const masks = Array.from({ length: 2 ** turnable.length }, (_, mask) => mask);
    // (each half's compound, by Meno's identity: worked out from any half made, its groups turned where the masks differ)
    const compound = masks.map((mask) => identity(turnedFrom(some, mask)));
    const made_ = [...halves.values()].map((k) => ({ k, id: identity(k.configured) }));
    // (halves all one compound - a meso form whose two centres are one group: no "one of the two" for an OR group)
    const one = new Set(compound).size === 1;
    for (const mask of masks) {
      // (the same compound as a half listed before it: that one, nothing said - whichever of the two the plugin's toolkit kept)
      if (compound.indexOf(compound[mask]) < mask) continue;
      const got = halves.get(mask) ?? made_.find((m) => m.id === compound[mask])?.k;
      if (!got) {
        missing.add(`${halfName(turnable, turnedOf(mask))} cannot be made in 3D`);
        continue;
      }
      // (made as this half: where the toolkit kept another half of the same compound, its groups turned back to this one's)
      const configured = got.mask === mask ? got.configured : turnedFrom(got, mask);
      const name = halfName(turnable, turnedOf(mask));
      const plain = one ? name : halfWords(turnable, name);
      const half: Half = { turned: turnedOf(mask), name, plain, words: plain };
      // (the mirror image of one listed before it: made as its reflection, where a reflection is told by the centres alone)
      if (mirrorable && mask) {
        const theirs = identity(mirrored(configured));
        const j = keys.indexOf(theirs);
        if (j >= 0) {
          const other = made[j].half;
          half.mirrorOf = j;
          half.mirrorName = other?.name ?? "the half as drawn";
          half.words = halfWords(turnable, name, other?.turned.length ? `the half with ${other.name}` : "the half as drawn");
        }
      }
      made.push({ configured: { ...configured, groups: groupsGiven }, ...(turnable.length ? { half } : {}), from: got.index });
      keys.push(identity(configured));
    }
  }
  return { made, said: [...said, ...missing] };
}
