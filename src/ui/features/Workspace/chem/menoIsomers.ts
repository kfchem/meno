/**
 * A structure's stereoisomers decided by Meno (foundation part 13, its 3D asker): what it leaves open by Meno's candidates
 * (lib/chem/perception/stereo/candidates), read from its own MOL blocks, and its stereoisomers by Meno's count (lib/chem/isomers
 * `isomersOf`) - each given whole to the plugin that makes structures in 3D, which makes it or says it cannot. The plugin is asked
 * nothing of which places are open or how many ways they go: that is Meno's.
 */
import { automorphismGroup, identityKey, type IdentityInput } from "../../../../lib/chem/identity";
import { decidesAny, decidingOf, decidingWaited, firstWayOf, isomersOf, type Deciding, type Stereoisomer } from "../../../../lib/chem/isomers";
import { tiesOf } from "../../../../lib/chem/perception/stereo/ties";
import { parity } from "../../../../lib/chem/perception/stereo/geometry";
import { symmetryOrbits } from "../../../../lib/chem/perception/symmetry";
import type { ChemGraph } from "../../../../lib/chem/perception/graph";
import { hydrogensFolded, plainHydrogenAtoms } from "../../../../lib/chem/perception/fold";
import { candidates } from "../../../../lib/chem/perception/stereo/candidates";
import { sentOf, type IsomerConfiguration } from "../../../../lib/chem/perception/stereo/configuration";
import { movingCN, movingSaid, stereoGraphOf, type IsomersMade, type StereoLeft } from "../../../../lib/chem/stereoOpen";
import type { ChemClient } from "../../../../lib/roles/client";
import { moleculesToEditorModel, readMoleculesFromText } from "../../../../utils/importers";
import { editorModelOf } from "../utils/io";
import { identityInputOf } from "./identityOf";

/**
 * A structure's MOL blocks as Meno reads them for its stereoisomers: identity's input, its atoms and bonds in the blocks' order one
 * after another (`bondAt`: each block bond's place among the input's, -1 for one the input leaves out), and the structure with its
 * plain hydrogens folded in (`folded`), each of its atoms by its place in the input (`inputAt`).
 */
export type BlocksRead = { input: IdentityInput; bondAt: number[]; folded: IdentityInput; inputAt: number[] };

/** `molblocks` read as one (`BlocksRead`), or null where one cannot be read. */
export function blocksRead(molblocks: readonly string[]): BlocksRead | null {
  const parsed = molblocks.flatMap((b) => readMoleculesFromText(b, "mol"));
  const graph = stereoGraphOf(molblocks);
  if (!graph || !parsed.length) return null;
  // (a label written out into its block as its atoms is read as those atoms, each in its own place - not contracted to one again)
  const model = editorModelOf(moleculesToEditorModel(parsed, { asWritten: true }).model);
  if (model.atoms.length !== graph.atoms.length || model.bonds.length !== graph.bonds.length) return null;
  const { input, bondAt } = identityInputOf(model);
  const plain = plainHydrogenAtoms(input);
  const inputAt: number[] = [];
  input.atoms.forEach((_, i) => plain[i] || inputAt.push(i));
  return { input, bondAt, folded: hydrogensFolded(input), inputAt };
}

/** A structure's stereoisomers as Meno counts them (`isomersOf`), worked out once for each structure read and kept with it. */
const counts = new WeakMap<BlocksRead, ReturnType<typeof isomersOf>>();
function countedOf(read: BlocksRead): ReturnType<typeof isomersOf> {
  const known = counts.get(read);
  if (known) return known;
  const counted = isomersOf(read.input);
  counts.set(read, counted);
  return counted;
}

/**
 * How many stereoisomers a structure read has by Meno's count (`isomersOf`): `count`, or, past the ways the count tries, `upTo` its
 * bound - two to the power of its open places, true whatever its symmetry. Null where Meno does not count it.
 */
export function countOf(read: BlocksRead): { count: number } | { upTo: number } | null {
  const counted = countedOf(read);
  if ("notCounted" in counted) return null;
  return "tooMany" in counted ? { upTo: counted.tooMany } : { count: counted.isomers.length };
}

/** The open places of each structure read whose choice changes the compound (lib/chem/isomers `decidingOf`), found once and kept. */
const decidingKept = new WeakMap<BlocksRead, Deciding | null>();
function decidingFor(read: BlocksRead): Deciding | null {
  if (!decidingKept.has(read)) decidingKept.set(read, decidingOf(read.input));
  return decidingKept.get(read)!;
}

/** `decidingFor`, the page given back between every few identities written (`pause`): kept for `leftByMeno` to read. */
export async function decidingAwaited(read: BlocksRead, pause: () => Promise<void>): Promise<void> {
  if (!decidingKept.has(read)) decidingKept.set(read, await decidingWaited(read.input, pause));
}

/**
 * What a structure read (`BlocksRead`) leaves open by Meno's candidates, in the blocks' places - only where the choice changes the
 * compound, alone or with others (`isomersOf`'s `deciding`: never methylcyclohexane's ring CH; both ring atoms of
 * 1,4-dimethylcyclohexane), every candidate where it is not counted - and every centre and double bond they give it. With `every`,
 * every candidate left open, the count not asked.
 */
export function leftByMeno(molblocks: readonly string[], read: BlocksRead, every = false): { left: StereoLeft; centres: number[]; doubles: number[]; handed: boolean } {
  const graph = stereoGraphOf(molblocks)!;
  const { folded: g, inputAt, bondAt } = read;
  const pair = (p: number, q: number) => (p < q ? `${p},${q}` : `${q},${p}`);
  const blockBond = new Map<string, number>();
  graph.bonds.forEach((b, k) => bondAt[k] >= 0 && blockBond.set(pair(b.a, b.b), k));
  const bondOf = (p: number, q: number) => blockBond.get(pair(inputAt[p], inputAt[q]));
  const byIndex = (p: number, q: number) => p - q;
  const centres: number[] = [];
  const doubles: number[] = [];
  const openAtoms: number[] = [];
  const openBonds: number[] = [];
  const runs: number[][] = [];
  const given = new Set([...(g.axes ?? []), ...(g.cumulated ?? [])].map((x) => pair(x.atoms[0], x.atoms[1])));
  // (a run's double bonds, by their block places, from one end to the other)
  const around: number[][] = g.atoms.map(() => []);
  const order = new Map<string, number>();
  for (const b of g.bonds) {
    around[b.a].push(b.b);
    around[b.b].push(b.a);
    order.set(pair(b.a, b.b), b.order);
  }
  const runOf = (from: number, to: number): number[] => {
    const out: number[] = [];
    let at = from;
    let before = -1;
    while (at !== to) {
      const next = around[at].find((n) => n !== before && order.get(pair(at, n)) === 2);
      if (next == null) break;
      const k = bondOf(at, next);
      if (k != null) out.push(k);
      before = at;
      at = next;
    }
    return out;
  };
  let handed = false;
  // (which places decide, by witnesses - never the whole count, which only the number of stereoisomers needs)
  const deciding = every ? null : decidingFor(read);
  const decides = (c: ReturnType<typeof candidates>[number]): boolean => {
    if (!deciding) return true;
    if (c.kind === "centre") return deciding.atoms.includes(c.at);
    if (c.kind === "bond") return deciding.bonds.includes(c.at);
    if (c.kind === "biaryl") return true;
    const [p, q] = c.ends[0] < c.ends[1] ? [c.ends[0], c.ends[1]] : [c.ends[1], c.ends[0]];
    return deciding.runs.some((r) => r[0] === p && r[1] === q);
  };
  for (const c of candidates(g)) {
    if (c.kind === "centre") {
      centres.push(inputAt[c.at]);
      if (!g.atoms[c.at].tetra && decides(c)) openAtoms.push(inputAt[c.at]);
    } else if (c.kind === "bond") {
      const k = bondOf(g.bonds[c.at].a, g.bonds[c.at].b);
      if (k == null) continue;
      doubles.push(k);
      if (!g.bonds[c.at].stereo && decides(c)) openBonds.push(k);
    } else {
      handed = true;
      if (c.kind !== "biaryl" && !given.has(pair(c.ends[0], c.ends[1])) && decides(c)) runs.push(runOf(c.ends[0], c.ends[1]));
    }
  }
  // (a C=N whose E/Z is none of its own: never a candidate, said where it is drawn open)
  const moving = movingCN(graph.atoms, graph.bonds);
  const notEnumerated = graph.bonds.flatMap((b, k) => (b.order === 2 && moving.has(k) && !(bondAt[k] >= 0 && read.input.bonds[bondAt[k]].stereo) ? [k] : [])).sort(byIndex);
  const cumulenes = runs.flat().sort(byIndex);
  const left: StereoLeft = {
    atoms: openAtoms.sort(byIndex),
    bonds: [...new Set([...openBonds, ...cumulenes])].sort(byIndex),
    cumulenes,
    cumulated: runs,
    notEnumerated,
    said: movingSaid(notEnumerated.map((k) => moving.get(k)!)),
  };
  return { left, centres: centres.sort(byIndex), doubles: doubles.sort(byIndex), handed };
}

/**
 * Whether a structure read leaves open some stereo whose choice changes the compound - `leftByMeno`'s centres and double bonds, not
 * none - asked without the whole count where it is not already known (lib/chem/isomers `decidesAny`).
 */
export function leavesOpen(molblocks: readonly string[], read: BlocksRead): boolean {
  if (decidingKept.has(read)) return anyLeft(leftByMeno(molblocks, read).left);
  return anyLeft(leftByMeno(molblocks, read, true).left) && decidesAny(read.input);
}
const anyLeft = (left: StereoLeft) => left.atoms.length + left.bonds.length > 0;

/**
 * A stereoisomer (`isomersOf`, of `read.folded`) as the plugin is given it: each centre and double bond it configures, by the
 * blocks' places - a centre's neighbours as its bonds' atoms, a plain H drawn as an atom named where its folded place stood, one
 * not drawn left out (the plugin's toolkit takes the first three) - and whether it configures an axis or a cumulene, which the
 * plugin is not given.
 */
export function asGiven(read: BlocksRead, molblocks: readonly string[], isomer: Stereoisomer): { configuration: IsomerConfiguration; handed: boolean } {
  const graph = stereoGraphOf(molblocks)!;
  const { inputAt, bondAt } = read;
  const pair = (p: number, q: number) => (p < q ? `${p},${q}` : `${q},${p}`);
  const blockBond = new Map<string, number>();
  graph.bonds.forEach((b, k) => bondAt[k] >= 0 && blockBond.set(pair(b.a, b.b), k));
  // (each atom's plain H drawn as an atom, by block place: what a folded centre's -1 names)
  const plain = plainHydrogenAtoms(read.input);
  const drawnH = (c: number) => graph.bonds.flatMap((b) => (b.a === c && plain[b.b] ? [b.b] : b.b === c && plain[b.a] ? [b.a] : []))[0];
  const g = isomer.input;
  // (a centre kept among the frames made only where it is one (the chemistry check's ruling): turned alone it makes another
  //  stereoisomer - an isopropyl's CH, a DMSO's S, which two alike groups leave none, is left to the toolkit; and a set of
  //  bridgeheads its ring system ties together (`tiesOf`), all or none, only where turning the whole set, all else kept, makes
  //  another - Troeger's base's two N, camphor's bridgeheads, not quinuclidine's, DABCO's, adamantane's or cubane's, whose
  //  turned form is the same molecule taken the other way round (`flipIsOwn`). An N is asked so alone too: identity does not
  //  see an N's sense)
  const here = identityKey(g);
  const sets = tiedSets(g);
  const setOf = new Map(sets.flatMap((s) => s.map((k) => [k, s] as const)));
  const held = new Map(sets.map((s) => [s, !flipIsOwn(g, s)] as const));
  const stereogenic = (k: number) => {
    const set = setOf.get(k);
    if (set) return held.get(set)!;
    if (g.atoms[k].el === "N") return !flipIsOwn(g, [k]);
    const t = g.atoms[k].tetra!;
    return identityKey({ ...g, atoms: g.atoms.map((x, i) => (i === k ? { ...x, tetra: { ...t, volume: t.volume > 0 ? -1 : 1 } } : x)) }) !== here;
  };
  const centres = g.atoms.flatMap((a, k) => {
    if (!a.tetra || !stereogenic(k)) return [];
    const c = inputAt[k];
    const neighbours = a.tetra.neighbours.flatMap((n) => (n >= 0 ? [inputAt[n]] : drawnH(c) != null ? [drawnH(c)] : []));
    return [{ atom: c, neighbours, sense: a.tetra.volume }];
  });
  const doubles = g.bonds.flatMap((b) => {
    const k = b.stereo ? blockBond.get(pair(inputAt[b.a], inputAt[b.b])) : undefined;
    return k == null || !b.stereo ? [] : [{ bond: k, ends: [inputAt[b.stereo.refs[0]], inputAt[b.stereo.refs[1]]] as [number, number], cis: b.stereo.cis }];
  });
  // (an axis's and a run's, by the blocks' places: Meno's own, never given to the plugin - kept among what it makes, chem/make3d)
  const pairOf = (x: { atoms: readonly [number, number]; refs: readonly [number, number] }) => ({ atoms: [inputAt[x.atoms[0]], inputAt[x.atoms[1]]] as [number, number], refs: [inputAt[x.refs[0]], inputAt[x.refs[1]]] as [number, number] });
  const axes = (g.axes ?? []).map((x) => ({ ...pairOf(x), sense: x.sense }));
  const cumulated = (g.cumulated ?? []).map((x) => ({ ...pairOf(x), cis: x.cis }));
  return { configuration: { centres, doubles, ...(axes.length ? { axes } : {}), ...(cumulated.length ? { cumulated } : {}) }, handed: !!(axes.length || cumulated.length) };
}


/** The sets of centres a structure's ring systems tie together (lib/chem/perception/stereo/ties `tiesOf`): each tie joins two, and a cage's bridgeheads tied pair by pair - adamantane's four - are one set. */
function tiedSets(g: ChemGraph): number[][] {
  const root = new Map<number, number>();
  const find = (k: number): number => {
    const r = root.get(k) ?? k;
    if (r === k) return k;
    const top = find(r);
    root.set(k, top);
    return top;
  };
  for (const t of tiesOf(g)) {
    const [a, b] = [find(t.a), find(t.b)];
    root.set(a, a);
    root.set(b, b);
    if (a !== b) root.set(a, b);
  }
  const by = new Map<number, number[]>();
  for (const k of root.keys()) by.set(find(k), [...(by.get(find(k)) ?? []), k]);
  return [...by.values()].map((s) => s.sort((p, q) => p - q));
}

/**
 * Whether turning the senses of `set`, every other centre and double bond kept, gives the same molecule: some automorphism of
 * its constitution takes the turned structure onto `g` as configured - each centre's sense compared as the parity of its
 * neighbours' order through it, an implicit H last, and each double bond's side by its refs taken through it. Quinuclidine's
 * bridgeheads turned are the cage taken the other way round; Troeger's base's two N turned are its mirror image, no
 * automorphism's. Where the automorphisms could not all be found, it is not (the set is kept, as before).
 */
export function flipIsOwn(g: ChemGraph, set: readonly number[]): boolean {
  const n = g.atoms.length;
  const plain: ChemGraph = { atoms: g.atoms.map((a) => ({ el: a.el, ...(a.charge ? { charge: a.charge } : {}), ...(a.hs != null ? { hs: a.hs } : {}) })), bonds: g.bonds.map((b) => ({ a: b.a, b: b.b, order: b.order })) };
  const found = symmetryOrbits(plain);
  if (!found.complete) return false;
  const group = automorphismGroup(found.automorphisms, n);
  if (!group.complete) return false;
  const turned = new Set(set);
  // (a centre's sense by its neighbours' order: the volume, times the parity of the order they are listed in - an implicit H last)
  const sense = (list: readonly number[], volume: number) => volume * parity(list.map((x) => (x < 0 ? n : x)));
  const bondAt = new Map(g.bonds.map((b) => [b.a < b.b ? `${b.a},${b.b}` : `${b.b},${b.a}`, b] as const));
  return group.members.some((pi) => {
    if (pi.every((x, i) => x === i)) return false;
    const at = (x: number) => (x < 0 ? x : pi[x]);
    const centresMatch = g.atoms.every((a, k) => {
      if (!a.tetra) return !g.atoms[pi[k]].tetra;
      const to = g.atoms[pi[k]].tetra;
      if (!to) return false;
      const volume = turned.has(k) ? -a.tetra.volume : a.tetra.volume;
      return sense(a.tetra.neighbours.map(at), volume) === sense(to.neighbours, to.volume);
    });
    if (!centresMatch) return false;
    return g.bonds.every((b) => {
      if (!b.stereo) return true;
      const [pa, pb] = [pi[b.a], pi[b.b]];
      const to = bondAt.get(pa < pb ? `${pa},${pb}` : `${pb},${pa}`);
      if (!to?.stereo) return false;
      // (its refs taken through the automorphism, each on the end it was on; a ref other than the other's own turns the side)
      const [r0, r1] = [at(b.stereo.refs[0]), at(b.stereo.refs[1])];
      const ownA = to.a === pa ? to.stereo.refs[0] : to.stereo.refs[1];
      const ownB = to.a === pa ? to.stereo.refs[1] : to.stereo.refs[0];
      return (b.stereo.cis !== (r0 !== ownA)) !== (r1 !== ownB) === to.stereo.cis;
    });
  });
}

/**
 * A structure's stereoisomers made in 3D as Meno counts them: each given whole to the plugin (`stereoisomers`, its configuration
 * `configured`, one asked), those it cannot make left out - none made, `free`; at most `most`, refused whole past it where `whole`;
 * with `first`, only the first made of those tried (past the ways the count tries, the first way), none made never `free`.
 * An axis's or a run's configuration goes with each, Meno's own: the plugin is not given it, and chem/make3d keeps among the
 * conformers made those that have it. A structure Meno does not count (`isomersOf`: a cage left open) is said so.
 */
export async function isomersByMeno(
  chem: ChemClient,
  molblocks: readonly string[],
  read: BlocksRead,
  readBack: { atoms: number[]; bonds: number[] },
  notEnumerated: readonly number[],
  asked: { most: number; whole?: boolean; first?: true; withinMs?: number; drawings?: boolean },
  ms?: number,
): Promise<{ made: IsomersMade; said: string[] } | { notCounted: string }> {
  const counted = countedOf(read);
  if ("notCounted" in counted) return counted;
  // (past the ways the count tries, the first asked: the first way, made without the count - chem/openStereo `isomersToMake`)
  const first = "tooMany" in counted && asked.first ? firstWayOf(read.input) : null;
  if ("tooMany" in counted && !first) return { made: { tooMany: { counted: asked.most + 1, bound: counted.tooMany } }, said: [] };
  // (each whole: an axis's and a run's are Meno's to keep among what is made - chem/make3d - never the plugin's to give)
  const kept = ("tooMany" in counted ? [first!] : counted.isomers).map((i) => asGiven(read, molblocks, i));
  if (asked.whole && kept.length > asked.most) return { made: { tooMany: { counted: asked.most + 1, bound: kept.length } }, said: [] };
  const started = Date.now();
  const isomers: Extract<IsomersMade, { isomers: unknown }>["isomers"] = [];
  for (const x of kept.slice(0, asked.most)) {
    if (asked.withinMs != null && Date.now() - started > asked.withinMs) return { made: { tooLong: true }, said: [] };
    const made = await chem.request(
      "stereoisomers",
      {
        molblocks: [...molblocks],
        open: readBack,
        configured: sentOf(x.configuration),
        notEnumerated: [...notEnumerated],
        most: 1,
        inThreeD: true,
        ...(asked.drawings ? { drawings: true } : {}),
      },
      ms,
    );
    if ("isomers" in made && made.isomers.length) isomers.push({ ...made.isomers[0], configured: x.configuration });
    if (asked.first && isomers.length) break;
  }
  // (the first asked of more than are tried: none made is not none that holds - not all were tried)
  return { made: { isomers, free: !isomers.length && !asked.first }, said: [] };
}
