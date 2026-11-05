import type { ChemClient, Conformers, Like } from "../../../../lib/roles/client";
import { cipIn3d } from "../../../../lib/chem/cip/in3d";
import { configuredFrom, leftOver, MOST_ISOMERS, stereoGraphOf, stereoLeft, type Configuration, type IsomersMade, type StereoLeft } from "../../../../lib/chem/stereoOpen";

/**
 * What a structure leaves open, as Meno decides it (lib/chem/stereoOpen) on
 * what the plugin that finds stereoisomers perceives in it: `drawn`, the
 * stereocentres and double bonds its drawing leaves open; `configured`, the
 * configurations places made before give some of them (`like`: a molecule
 * in 3D made from the same drawing); and `left`, what is open still.
 */
export type OpenStereo = { drawn: StereoLeft; configured: Configuration; left: StereoLeft };

/** A structure the plugin could not read (`problem` none), or could not make sense of (`problem`, in its words). */
export class StereoNotRead extends Error {
  constructor(
    message: string,
    readonly problem?: string,
  ) {
    super(message);
  }
}

/** Nothing configured. */
const NONE: Configuration = { centres: [], doubles: [] };

/**
 * What a structure - its parts' MOL blocks, read as one - leaves open
 * (`OpenStereo`): its elements asked of the plugin (`stereo_elements`),
 * Meno's rules on them. One the plugin cannot read, or make sense of, is
 * refused, saying so; `program` names the toolkit that read it.
 */
export async function openStereo(chem: ChemClient, molblocks: readonly string[], like?: Like, program = "The plugin", ms?: number): Promise<OpenStereo> {
  const found = await chem.request("stereo_elements", { molblocks: [...molblocks] }, ms);
  const graph = stereoGraphOf(molblocks);
  if (!found.read || !graph) throw new StereoNotRead(`${program} could not read it`);
  if (found.problem != null || !found.elements) throw new StereoNotRead(`${program} could not read it (${found.problem ?? "no elements"})`, found.problem ?? "no elements");
  const drawn = stereoLeft(found.elements, graph.atoms, graph.bonds);
  // (an allene's axis left open is none places can give as cis or trans of its double bonds: left as it is)
  const configured = like ? configuredFrom(graph.bonds, like, drawn.atoms, drawn.bonds.filter((b) => !drawn.cumulenes.includes(b))) : NONE;
  return { drawn, configured, left: like ? leftOver(drawn, configured, graph.bonds) : drawn };
}

/** Whether a structure leaves anything open. */
export function anyOpen(left: Pick<StereoLeft, "atoms" | "bonds">): boolean {
  return left.atoms.length + left.bonds.length > 0;
}

/** How Meno asks for a structure's stereoisomers: at most `most`, refused whole past that where `whole`; within `withinMs`, where given; as drawings too, with `drawings`. */
export type IsomersAsked = { most: number; whole?: boolean; withinMs?: number; drawings?: boolean };

/**
 * A structure's stereoisomers, asked of the plugin as Meno chose (`IsomersAsked`):
 * its open elements given each configuration that can be made in 3D - those
 * `open.configured` gives made so first, the C=N bonds whose E/Z is none of
 * their own passed by - each with its configuration of the elements the drawing
 * leaves open.
 */
export async function stereoisomersOf(chem: ChemClient, molblocks: readonly string[], open: OpenStereo, asked: IsomersAsked, ms?: number): Promise<IsomersMade> {
  return chem.request(
    "stereoisomers",
    {
      molblocks: [...molblocks],
      open: { atoms: open.drawn.atoms, bonds: open.drawn.bonds },
      configured: open.configured,
      notEnumerated: open.drawn.notEnumerated,
      most: asked.most,
      inThreeD: true,
      ...(asked.whole ? { whole: true } : {}),
      ...(asked.withinMs != null ? { withinMs: asked.withinMs } : {}),
      ...(asked.drawings ? { drawings: true } : {}),
    },
    ms,
  );
}

/**
 * The stereoisomers of a structure to make in 3D, on the page or by a
 * *Conformers* step: what it leaves open (`open`), how many ways that can go
 * in 3D (`count`: one where nothing is open) and whether none holds it
 * (`free`: made as the embedding places it, its stereo free); and the
 * configurations to make - each that can be made in 3D, at most
 * MOST_ISOMERS, the first alone for `one` - or, nothing open, or none that
 * holds, only those places made before give.
 */
export async function isomersToMake(
  chem: ChemClient,
  molblock: string,
  like: Like | undefined,
  which: "one" | "all",
  ms?: number,
): Promise<{ open: OpenStereo; count: number; free: boolean; isomers: Configuration[] }> {
  const open = await openStereo(chem, [molblock], like, undefined, ms);
  if (!anyOpen(open.left)) return { open, count: 1, free: false, isomers: [open.configured] };
  const made = await stereoisomersOf(chem, [molblock], open, { most: MOST_ISOMERS }, ms);
  if (!("isomers" in made)) throw new Error("its stereoisomers could not be made");
  if (!made.isomers.length) return { open, count: 1, free: true, isomers: [open.configured] };
  const all = made.isomers.map((i) => i.configured);
  return { open, count: all.length, free: false, isomers: which === "one" ? all.slice(0, 1) : all };
}

/**
 * A stereoisomer's conformers with their CIP labels Meno's own, read from
 * the first conformer's places (lib/chem/cip/in3d): what the plugin sends
 * is never read.
 */
export function withOwnCip<T extends Pick<Conformers, "atoms" | "bonds" | "frames" | "cip">>(c: T): T {
  return { ...c, cip: cipIn3d({ atoms: c.atoms, bonds: c.bonds, xyz: c.frames[0] ?? [] }) };
}

/** A stereoisomer's conformers with which of its configurations were chosen (`chosen`): the CIP labels (`withOwnCip`) of the elements its drawing leaves open, those places made before gave among them. */
export function withChosen<T extends { cip: { atoms: Record<string, string>; bonds: Record<string, string> } }>(c: T, open: OpenStereo): T & { chosen: T["cip"] } {
  const of = (labels: Record<string, string>, open: readonly number[]) => Object.fromEntries(open.flatMap((i) => (labels[String(i)] != null ? [[String(i), labels[String(i)]]] : [])));
  return { ...c, chosen: { atoms: of(c.cip.atoms, open.drawn.atoms), bonds: of(c.cip.bonds, open.drawn.bonds) } };
}
