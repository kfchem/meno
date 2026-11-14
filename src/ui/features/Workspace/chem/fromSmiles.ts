import { chemWorker } from "../../../../lib/roles/worker";
import type { ChemClient } from "../../../../lib/roles/client";
import { NOT_READ, notReadSaid } from "../../../../lib/chem/smilesWhy";
import type { Model } from "../store/types";
import { editorModelOf, processFileContent } from "../utils/io";
import { laidOut, type GivenRuns } from "./cleanUp";
import { arrangementsMarked } from "./engineLayout";
import { readSmiles } from "../../../../lib/chem/smiles";
import { leftOver, stereoGraphOf } from "../../../../lib/chem/stereoOpen";
import { openStereo } from "./openStereo";
import type { DrawingStyle } from "../../../../lib/chem/style";

/**
 * The structure a SMILES says, read by the plugin that fills that role and
 * drawn by Meno's own engine - or as the plugin laid it out, should the
 * engine fail. The first use sets the plugin up, asking before it downloads.
 * Laid out in `style` - the drawing's it goes into - or else the app's.
 */
export async function structureFromSmiles(smiles: string, style?: DrawingStyle): Promise<Model & { stereoOpen?: StereoOpen; asCame?: string }> {
  const c = await chemWorker("smiles");
  const molblock = await molblockOfSmiles(c, smiles);
  // (and how many of its stereocentres and double bonds the SMILES leaves without a configuration - what the same plugin
  //  perceives in it, Meno's rules on it, as a step refusing a structure for it has them (chem/openStereo), while it is
  //  drawn: none said where it cannot be asked, or does not answer in time - the structure comes all the same)
  // (an allene's axis and an odd cumulene's cis or trans, which the SMILES says and a MOL block cannot: Meno's own reading of the text, where it is of the same atoms)
  const given = givenRunsOf(smiles, molblock);
  const [open, drawn] = await Promise.all([withinTime(openStereo(c, [molblock]).then((o) => o.left), STEREO_ASK_MS).catch(() => null), drawingOf(molblock, style, given?.runs)]);
  const stereoOpen = stereoOpenOf(open && given ? specified(open, given.bonds, molblock) : open);
  return stereoOpen ? { ...drawn, stereoOpen } : drawn;
}

/**
 * A SMILES read by the plugin that fills the SMILES role, as its MOL block. Where it cannot be read, why is said in
 * Meno's words (lib/chem/smilesWhy), from the SMILES itself and what the plugin says its toolkit made of it
 * (`smiles_read`); any other refusal is passed on as it came.
 */
export async function molblockOfSmiles(c: ChemClient, smiles: string): Promise<string> {
  try {
    return (await c.request("from_smiles", { smiles })).molblock;
  } catch (e) {
    if (!(e instanceof Error) || e.message.trim() !== NOT_READ) throw e;
    throw new Error(await notReadSaid(smiles, (s) => c.request("smiles_read", { smiles: s })));
  }
}

/** How long the stereo a SMILES leaves open is waited for, in ms: no longer than a paste should wait for what it says. */
export const STEREO_ASK_MS = 3000;

/** `p`, or a refusal once `ms` have gone by first. */
function withinTime<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((done, fail) => {
    const timer = setTimeout(() => fail(new Error("no answer in time")), ms);
    p.then((v) => (clearTimeout(timer), done(v)), (e: unknown) => (clearTimeout(timer), fail(e)));
  });
}

/**
 * How many stereocentres, double bonds and axes a structure read from text leaves without a configuration, from
 * what the plugin says it leaves open: each run of cumulated double bonds one element - an allene's axis, of two or
 * four; cis or trans, of three - never as many as its bonds. None where nothing is open, or the answer is no answer.
 */
export function stereoOpenOf(open: { atoms?: unknown; bonds?: unknown; cumulated?: unknown } | null | undefined): StereoOpen | undefined {
  const centres = Array.isArray(open?.atoms) ? open.atoms.length : 0;
  const all = Array.isArray(open?.bonds) ? open.bonds.length : 0;
  const runs = Array.isArray(open?.cumulated) ? open.cumulated.filter((r): r is number[] => Array.isArray(r) && r.length > 0) : [];
  const inRuns = runs.reduce((k, r) => k + r.length, 0);
  const axes = runs.filter((r) => r.length % 2 === 0).length;
  const bonds = Math.max(0, all - inRuns) + runs.filter((r) => r.length % 2 === 1).length;
  return centres || bonds || axes ? { centres, bonds, axes } : undefined;
}

/** How many stereocentres, double bonds and axes a structure read from text leaves without a configuration. */
export type StereoOpen = { centres: number; bonds: number; axes?: number };

/**
 * What a structure read from text is told to be, where it leaves stereo
 * open - "1 stereocentre not specified", "2 stereocentres and 1 double
 * bond not specified", "1 axis not specified" - drawn as it is, plain or
 * of either configuration, nothing chosen for it; none where nothing is
 * open.
 */
export function stereoOpenSaid(open: StereoOpen | undefined): string | null {
  if (!open || (!open.centres && !open.bonds && !open.axes)) return null;
  const of = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const parts = [
    ...(open.centres ? [of(open.centres, "stereocentre", "stereocentres")] : []),
    ...(open.bonds ? [of(open.bonds, "double bond", "double bonds")] : []),
    ...(open.axes ? [of(open.axes, "axis", "axes")] : []),
  ];
  return `${parts.length > 2 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts.join(" and ")} not specified`;
}

/** A structure read from text without what it is told to be - the stereo it leaves open, that it came as it was drawn: what goes onto the page. */
export function withoutStereoOpen<T extends { stereoOpen?: StereoOpen; asCame?: string }>(drawn: T): Omit<T, "stereoOpen" | "asCame"> {
  const { stereoOpen: _open, asCame: _came, ...rest } = drawn;
  return rest;
}

/**
 * A plugin's drawing of a structure - a MOL block, laid out in 2D, its
 * stereo wedged - as Meno draws it: read as a file is, and laid out by
 * Meno's own engine in `style`, or as the plugin laid it out, should the
 * engine fail. One way for every such drawing: a SMILES's, and the
 * structures a step makes - laid out as new, not kept in forms the
 * plugin's coordinates happen to have (`laidOut`'s `asNew`).
 */
export async function drawingOf(molblock: string, style?: DrawingStyle, given?: GivenRuns): Promise<Model & { asCame?: string }> {
  const result = await processFileContent("drawing.mol", molblock);
  const drawn = editorModelOf(result.model);
  // (as it came, said why: put down, it is said - asCameSaid; its coordinates the plugin's, nobody's drawing: laid out as new)
  return laidOut(drawn, style, given, true).catch((e: unknown) => {
    // (kept for whoever looks: what the sentence said plainly leaves out)
    console.warn("the structure is drawn as the plugin laid it out", e);
    // (a square-planar centre nobody gave the arrangement of marked so, as it would be laid out: the plugin's drawing says none)
    return { ...arrangementsMarked(drawn), asCame: e instanceof Error ? e.message : String(e) };
  });
}

/**
 * What to say of a structure drawn as it came, not laid out (`drawingOf`): one plain sentence of what kept it so -
 * never how its wedges are read, nor of a drawing the person did not make (docs: no mechanism in what Meno says).
 * None where it was laid out.
 */
export function asCameSaid(drawn: { asCame?: string }): string | null {
  if (!drawn.asCame) return null;
  if (/one atom on another|on a bond/.test(drawn.asCame)) return "Drawn as it came: it could not be laid out without putting one atom on another.";
  if (/stereochemistry|configuration|wedge/.test(drawn.asCame)) return "Drawn as it came: it could not be laid out keeping its stereochemistry.";
  return "Drawn as it came: it could not be laid out.";
}

/**
 * The allenes' axes and odd cumulenes' cis or trans a SMILES gives (lib/chem/smiles), by the atoms of the MOL block the plugin read it to - the
 * same atoms, in the same order, or none - and the double bonds of the MOL block each run is made of (what the plugin left open of them is then
 * given, `specified`). None where the SMILES has none, or reads otherwise, or where the block's atoms or bonds are not the SMILES's - then what it leaves open stays said open.
 */
export function givenRunsOf(smiles: string, molblock: string): { runs: GivenRuns; bonds: number[] } | null {
  let own;
  try {
    own = readSmiles(smiles);
  } catch {
    return null;
  }
  const runs = { axes: own.axes ?? [], cumulated: own.cumulated ?? [] };
  if (!runs.axes.length && !runs.cumulated.length) return null;
  const graph = stereoGraphOf([molblock]);
  if (!graph || graph.atoms.length !== own.atoms.length || graph.atoms.some((a, i) => a.el !== own.atoms[i].el)) return null;
  // (the same bonds between the same atoms - orders may differ by a Kekule form - or the atoms are only alike: a hand read for other groups would be drawn on a structure it was not read of)
  const pair = (p: number, q: number) => (p < q ? `${p},${q}` : `${q},${p}`);
  const wanted = own.bonds.map((b) => pair(b.a1, b.a2)).sort();
  const had = graph.bonds.map((b) => pair(b.a, b.b)).sort();
  if (wanted.length !== had.length || wanted.some((k, i) => k !== had[i])) return null;
  // (each run's double bonds: along double bonds from one end to the other)
  const bonds: number[] = [];
  for (const [i, j] of [...runs.axes, ...runs.cumulated].map((r) => r.atoms)) {
    const along = (at: number, to: number, seen: readonly number[]): number[] | null => {
      if (at === to) return [];
      for (const [k, b] of graph.bonds.entries()) {
        if (b.order !== 2 || (b.a !== at && b.b !== at)) continue;
        const next = b.a === at ? b.b : b.a;
        if (seen.includes(next)) continue;
        const rest = along(next, to, [...seen, next]);
        if (rest) return [k, ...rest];
      }
      return null;
    };
    bonds.push(...(along(i, j, [i]) ?? []));
  }
  return { runs, bonds };
}

/** What the plugin leaves open, less the double bonds of the runs the SMILES configures (`givenRunsOf`). */
export function specified(open: Parameters<typeof leftOver>[0], bonds: readonly number[], molblock: string) {
  const graph = stereoGraphOf([molblock]);
  return graph ? leftOver(open, { centres: [], doubles: bonds.map((bond) => ({ bond, ends: [0, 0] as [number, number], cis: true })) }, graph.bonds) : open;
}
