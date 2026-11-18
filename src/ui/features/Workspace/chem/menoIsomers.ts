/**
 * A structure's stereoisomers decided by Meno (foundation part 13, its 3D asker): what it leaves open by Meno's candidates
 * (lib/chem/perception/stereo/candidates), read from its own MOL blocks, and its stereoisomers by Meno's count (lib/chem/isomers
 * `isomersOf`) - each given whole to the plugin that makes structures in 3D, which makes it or says it cannot. The plugin is asked
 * nothing of which places are open or how many ways they go: that is Meno's.
 */
import type { IdentityInput } from "../../../../lib/chem/identity";
import { isomersOf, type Stereoisomer } from "../../../../lib/chem/isomers";
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
  const model = editorModelOf(moleculesToEditorModel(parsed).model);
  if (model.atoms.length !== graph.atoms.length || model.bonds.length !== graph.bonds.length) return null;
  const { input, bondAt } = identityInputOf(model);
  const plain = plainHydrogenAtoms(input);
  const inputAt: number[] = [];
  input.atoms.forEach((_, i) => plain[i] || inputAt.push(i));
  return { input, bondAt, folded: hydrogensFolded(input), inputAt };
}

/** What a structure read (`BlocksRead`) leaves open by Meno's candidates, in the blocks' places, and every centre and double bond they give it. */
export function leftByMeno(molblocks: readonly string[], read: BlocksRead): { left: StereoLeft; centres: number[]; doubles: number[]; handed: boolean } {
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
  for (const c of candidates(g)) {
    if (c.kind === "centre") {
      centres.push(inputAt[c.at]);
      if (!g.atoms[c.at].tetra) openAtoms.push(inputAt[c.at]);
    } else if (c.kind === "bond") {
      const k = bondOf(g.bonds[c.at].a, g.bonds[c.at].b);
      if (k == null) continue;
      doubles.push(k);
      if (!g.bonds[c.at].stereo) openBonds.push(k);
    } else {
      handed = true;
      if (c.kind !== "biaryl" && !given.has(pair(c.ends[0], c.ends[1]))) runs.push(runOf(c.ends[0], c.ends[1]));
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
  const centres = g.atoms.flatMap((a, k) => {
    if (!a.tetra) return [];
    const c = inputAt[k];
    const neighbours = a.tetra.neighbours.flatMap((n) => (n >= 0 ? [inputAt[n]] : drawnH(c) != null ? [drawnH(c)] : []));
    return [{ atom: c, neighbours, sense: a.tetra.volume }];
  });
  const doubles = g.bonds.flatMap((b) => {
    const k = b.stereo ? blockBond.get(pair(inputAt[b.a], inputAt[b.b])) : undefined;
    return k == null || !b.stereo ? [] : [{ bond: k, ends: [inputAt[b.stereo.refs[0]], inputAt[b.stereo.refs[1]]] as [number, number], cis: b.stereo.cis }];
  });
  return { configuration: { centres, doubles }, handed: !!(g.axes?.length || g.cumulated?.length) };
}

/** What is said where stereoisomers that differ only at an axis or a cumulene are made as one: what is made, not how. */
export const HANDED_NOT_MADE = (n: number) => `${n} stereoisomer${n === 1 ? "" : "s"} differing only at an axis or a cumulated run cannot be made in 3D`;

/**
 * A structure's stereoisomers made in 3D as Meno counts them: each given whole to the plugin (`stereoisomers`, its configuration
 * `configured`, one asked), those it cannot make left out - none made, `free`; at most `most`, refused whole past it where `whole`;
 * those differing only at an axis or a cumulene made as the first of them, the rest said (`HANDED_NOT_MADE`). A structure Meno
 * does not count (`isomersOf`: a cage left open) is said so.
 */
export async function isomersByMeno(
  chem: ChemClient,
  molblocks: readonly string[],
  read: BlocksRead,
  readBack: { atoms: number[]; bonds: number[] },
  notEnumerated: readonly number[],
  asked: { most: number; whole?: boolean; withinMs?: number; drawings?: boolean },
  ms?: number,
): Promise<{ made: IsomersMade; said: string[] } | { notCounted: string }> {
  const counted = isomersOf(read.input);
  if ("notCounted" in counted) return counted;
  if ("tooMany" in counted) return { made: { tooMany: { counted: asked.most + 1, bound: counted.tooMany } }, said: [] };
  const given = counted.isomers.map((i) => asGiven(read, molblocks, i));
  // (those differing only where the plugin is given nothing - an axis, a cumulene: the first made, the rest said)
  const seen = new Set<string>();
  const kept = given.filter((x) => {
    const key = JSON.stringify(x.configuration);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
  }
  return { made: { isomers, free: !isomers.length }, said: given.length > kept.length ? [HANDED_NOT_MADE(given.length - kept.length)] : [] };
}
