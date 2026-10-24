import { chemWorker } from "../../../../lib/roles/worker";
import type { Model } from "../store/types";
import { editorModelOf, processFileContent } from "../utils/io";
import { laidOut } from "./cleanUp";
import type { DrawingStyle } from "../../../../lib/chem/style";

/**
 * The structure a SMILES says, read by the plugin that fills that role and
 * drawn by Meno's own engine - or as the plugin laid it out, should the
 * engine fail. The first use sets the plugin up, asking before it downloads.
 * Laid out in `style` - the drawing's it goes into - or else the app's.
 */
export async function structureFromSmiles(smiles: string, style?: DrawingStyle): Promise<Model & { stereoOpen?: StereoOpen }> {
  const c = await chemWorker("smiles");
  const { molblock } = await c.request("from_smiles", { smiles });
  // (and how many of its stereocentres and double bonds the SMILES leaves without a configuration - asked of the same
  //  plugin, by the one definition a step refusing a structure for it uses (`stereo_left_open`), while it is drawn:
  //  none said where it cannot be asked, or does not answer in time - the structure comes all the same)
  const [open, drawn] = await Promise.all([withinTime(c.request("stereo_left_open", { molblock }), STEREO_ASK_MS).catch(() => null), drawingOf(molblock, style)]);
  const stereoOpen = stereoOpenOf(open);
  return stereoOpen ? { ...drawn, stereoOpen } : drawn;
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

/** A structure read from text without what it is told to be: what goes onto the page. */
export function withoutStereoOpen<T extends { stereoOpen?: StereoOpen }>(drawn: T): Omit<T, "stereoOpen"> {
  const { stereoOpen: _open, ...rest } = drawn;
  return rest;
}

/**
 * A plugin's drawing of a structure - a MOL block, laid out in 2D, its
 * stereo wedged - as Meno draws it: read as a file is, and laid out by
 * Meno's own engine in `style`, or as the plugin laid it out, should the
 * engine fail. One way for every such drawing: a SMILES's, and the
 * structures a step makes.
 */
export async function drawingOf(molblock: string, style?: DrawingStyle): Promise<Model> {
  const result = await processFileContent("drawing.mol", molblock);
  const drawn = editorModelOf(result.model);
  return laidOut(drawn, style).catch((e: unknown) => {
    console.warn("the structure is drawn as the plugin laid it out", e);
    return drawn;
  });
}
