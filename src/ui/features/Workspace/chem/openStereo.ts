import type { ChemClient, Conformers, Like } from "../../../../lib/roles/client";
import { cipIn3d } from "../../../../lib/chem/cip/in3d";
import {
  configuredFrom,
  distinctIsomers,
  drawnGroupsOf,
  leftOver,
  MOST_ISOMERS,
  NO_CONFIGURATION,
  NO_GROUPS,
  stereoGraphOf,
  type Configuration,
  type IsomerConfiguration,
  type DrawnGroups,
  type IsomersMade,
  type StereoLeft,
} from "../../../../lib/chem/stereoOpen";
import { sentOf } from "../../../../lib/chem/perception/stereo/configuration";
import { identityKey, type IdentityInput } from "../../../../lib/chem/identity";
import { isMetal } from "../../../../lib/layout/perceive";
import { hydrogenCounts } from "../../../../lib/chem/perception/hydrogens";
import { halvesOf, onBondSaid, type Half } from "./groupHalves";
import { blocksRead, countOf, decidingAwaited, isomersByMeno, leftByMeno, type BlocksRead } from "./menoIsomers";
import { withConfiguration } from "./pageMirror";

/**
 * What a structure leaves open, as Meno decides it (lib/chem/stereoOpen) by
 * its candidates read from the structure's own blocks (chem/menoIsomers): `drawn`, the
 * stereocentres and double bonds its drawing leaves open; `configured`, the
 * configurations places made before give some of them (`like`: a molecule
 * in 3D made from the same drawing), with the structure's AND and OR
 * groups; `left`, what is open still; `groups`, those groups as drawn
 * (lib/chem/stereoOpen `drawnGroupsOf`); and `perceived`, every centre and
 * double bond the candidates give it, by index, and whether it has an
 * element a mirror cannot be told of by its centres (an axis, a cumulene).
 */
export type OpenStereo = {
  drawn: StereoLeft;
  configured: Configuration;
  left: StereoLeft;
  groups: DrawnGroups;
  perceived: { centres: number[]; doubles: number[]; handed: boolean };
  /** The blocks as Meno reads them (chem/menoIsomers `blocksRead`): what its stereoisomers are counted on. */
  read: BlocksRead;
};

/** A structure the plugin could not read (`problem` none), or could not make sense of (`problem`, in its words). */
export class StereoNotRead extends Error {
  constructor(
    message: string,
    readonly problem?: string,
  ) {
    super(message);
  }
}

/**
 * What a structure - its parts' MOL blocks, read as one - leaves open
 * (`OpenStereo`): read by Meno itself, its candidates (chem/menoIsomers),
 * the plugin asked nothing. One Meno cannot read is refused, saying so.
 * (`chem`, `program` and `ms` are its callers' still: nothing is asked here.)
 */
export async function openStereo(_chem: ChemClient, molblocks: readonly string[], like?: Like, _program = "Meno", _ms?: number): Promise<OpenStereo> {
  const graph = stereoGraphOf(molblocks);
  const read = graph ? blocksRead(molblocks) : null;
  if (!graph || !read) throw new StereoNotRead("Meno could not read it");
  // (which open places decide, the page given back meanwhile: a structure with many open places can write many identities)
  await decidingAwaited(read, nextFrame);
  const byMeno = leftByMeno(molblocks, read);
  const drawn = byMeno.left;
  const groups = drawnGroupsOf(molblocks) ?? NO_GROUPS;
  // (an allene's axis left open is none places can give as cis or trans of its double bonds: left as it is)
  const from = like ? configuredFrom(graph.bonds, like, drawn.atoms, drawn.bonds.filter((b) => !drawn.cumulenes.includes(b))) : NO_CONFIGURATION;
  const configured = { ...from, groups: groups.groups };
  const perceived = { centres: byMeno.centres, doubles: byMeno.doubles, handed: byMeno.handed };
  return { drawn, configured, left: like ? leftOver(drawn, configured, graph.bonds) : drawn, groups, perceived, read };
}

/** A wait for the page's next frame - or a moment, where frames are not drawn (no page, or a hidden one, whose frames wait). */
const nextFrame = () =>
  new Promise<void>((go) => {
    const timer = setTimeout(go, 50);
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => (clearTimeout(timer), go()));
  });

/** Whether a structure leaves anything open. */
export function anyOpen(left: Pick<StereoLeft, "atoms" | "bonds">): boolean {
  return left.atoms.length + left.bonds.length > 0;
}

/** How Meno asks for a structure's stereoisomers: at most `most`, refused whole past that where `whole`; only the first that can be made in 3D, at most `most` tried, with `first`; within `withinMs`, where given; as drawings too, with `drawings`. */
export type IsomersAsked = { most: number; whole?: boolean; first?: true; withinMs?: number; drawings?: boolean };

/** Whether a structure has AND or OR groups Meno reads (`OpenStereo.groups`): turned as a whole, or held as drawn. */
export const anyGroup = (open: Pick<OpenStereo, "groups">) => open.groups.groups.length + open.groups.held.length > 0;

/**
 * What the plugin is asked to read back of each stereoisomer it makes: the elements the drawing leaves open - and, where the structure
 * has groups, every centre and double bond it perceives, so that which half each is can be told (chem/groupHalves).
 */
function readBack(open: OpenStereo): { atoms: number[]; bonds: number[] } {
  if (!anyGroup(open)) return { atoms: open.drawn.atoms, bonds: open.drawn.bonds };
  const sorted = (xs: number[]) => [...new Set(xs)].sort((p, q) => p - q);
  return { atoms: sorted([...open.drawn.atoms, ...open.perceived.centres]), bonds: sorted([...open.drawn.bonds, ...open.perceived.doubles]) };
}

/**
 * A structure's stereoisomers, asked of the plugin as Meno chose (`IsomersAsked`):
 * its open elements given each configuration that can be made in 3D - those
 * `open.configured` gives made so first, the C=N bonds whose E/Z is none of
 * their own passed by - each with its configuration of the elements the drawing
 * leaves open (and of every centre and double bond, where it has groups: the
 * plugin's toolkit turns each AND or OR group whole, as it reads them in the
 * block).
 */
export async function stereoisomersOf(chem: ChemClient, molblocks: readonly string[], open: OpenStereo, asked: IsomersAsked, ms?: number): Promise<IsomersMade & { said?: string[] }> {
  // (no group: Meno's stereoisomers, each made whole by the plugin - chem/menoIsomers. A structure Meno does not count - a cage left
  //  open - and one with groups, whose halves the plugin's toolkit turns: its enumeration, as before)
  // (one Meno does not count is made as the toolkit enumerates it, and said so on what is made: never one hand unsaid)
  let notCounted: string[] = [];
  if (!anyGroup(open) && !open.configured.centres.length && !open.configured.doubles.length) {
    const byMeno = await isomersByMeno(chem, molblocks, open.read, readBack(open), open.drawn.notEnumerated, asked, ms);
    if (!("notCounted" in byMeno)) return { ...byMeno.made, ...(byMeno.said.length ? { said: byMeno.said } : {}) };
    notCounted = [byMeno.notCounted];
  }
  const made = await chem.request(
    "stereoisomers",
    {
      molblocks: [...molblocks],
      open: readBack(open),
      configured: sentOf(open.configured),
      notEnumerated: open.drawn.notEnumerated,
      most: asked.most,
      inThreeD: true,
      ...(asked.whole ? { whole: true } : {}),
      ...(asked.withinMs != null ? { withinMs: asked.withinMs } : {}),
      ...(asked.drawings ? { drawings: true } : {}),
    },
    ms,
  );
  // (each configuration once: the plugin's toolkit may enumerate what Meno's rules leave out, an aziridine's N - but isomers differing where
  //  a configuration does not tell stay, and so do the halves of a group: their centres are in the configuration read back)
  return "isomers" in made ? { ...made, isomers: distinctIsomers(made.isomers, open.drawn), ...(notCounted.length ? { said: notCounted } : {}) } : made;
}

/**
 * The halves of what the plugin made of a structure with groups (chem/groupHalves `halvesOf`), its parts' MOL blocks read as one: Meno's
 * identity tells which are one structure and which are mirror images - none taken for a mirror image where the structure has an axis, a
 * cumulene or a metal, which a reflection turns too.
 */
export function halvesMade<T extends { configured: IsomerConfiguration }>(open: OpenStereo, molblocks: readonly string[], isomers: readonly T[]) {
  const graph = stereoGraphOf(molblocks);
  const hs = graph ? hydrogenCounts(graph.atoms, graph.bonds) : [];
  const input: IdentityInput | null = graph
    ? { atoms: graph.atoms.map((a, i) => ({ el: a.el, ...(a.charge ? { charge: a.charge } : {}), hs: hs[i] })), bonds: graph.bonds.map((b) => ({ a: b.a, b: b.b, order: b.order })) }
    : null;
  const identity = (c: IsomerConfiguration) => {
    const given = input && withConfiguration(input, c);
    try {
      return given ? identityKey(given) : `as configured ${JSON.stringify(c)}`;
    } catch {
      return `as configured ${JSON.stringify(c)}`;
    }
  };
  const mirrorable = !!graph && !open.perceived.handed && !graph.atoms.some((a) => isMetal(a.el));
  const halves = halvesOf(isomers, open.groups, open.drawn, identity, mirrorable);
  // (each made one, the plugin's isomer it is made of - by its place: a meso form's half as drawn may be made of the half the toolkit kept)
  return { made: halves.made.map((h) => ({ isomer: isomers[h.from], configured: h.configured, half: h.half })), said: halves.said };
}

/** What a structure's 3D is made of: its open stereo, how many, whether none holds, the configurations - and, of one with groups, which half each is and what is said of them. */
export type ToMake = { open: OpenStereo; count: number; upTo?: true; free: boolean; isomers: Configuration[]; halves?: (Half | undefined)[]; said: string[] };

/**
 * The stereoisomers of a structure to make in 3D, on the page or by a
 * *Conformers* step: what it leaves open (`open`), how many stereoisomers
 * it can be (`count`: one where nothing is open; up to MOST_ISOMERS by Meno's
 * count, each tried in 3D, the number made - a bridgehead held one way by its
 * ring is not counted twice; past that, not each tried, Meno's count, or past
 * the ways the count tries its bound, said as at most that many, `upTo`) and
 * whether none holds it (`free`: made as the embedding places it, its stereo
 * free); and the configurations to make - each that can be made in 3D, the
 * first alone for `one`; past MOST_ISOMERS by Meno's count only the first of
 * them that can be made, at most MOST_ISOMERS tried, none made an error
 * (never `free`: not all were tried) - or, nothing open, or none that holds,
 * only those places made before give. A structure with AND or OR
 * groups is made in its halves (chem/groupHalves), the half as drawn
 * first; past MOST_ISOMERS of them it is refused whole; with `one`, the half
 * as drawn alone, said so.
 */
export async function isomersToMake(chem: ChemClient, molblock: string, like: Like | undefined, which: "one" | "all", ms?: number): Promise<ToMake> {
  const open = await openStereo(chem, [molblock], like, undefined, ms);
  const bonds = open.groups.onBonds.map(onBondSaid);
  if (!anyGroup(open)) {
    if (!anyOpen(open.left)) return { open, count: 1, free: false, isomers: [open.configured], said: bonds };
    // (Meno's count, where it is Meno's to make them - stereoisomersOf: past MOST_ISOMERS, the first that can be made in 3D alone)
    const counted = !open.configured.centres.length && !open.configured.doubles.length ? countOf(open.read) : null;
    const past = counted && ("upTo" in counted || counted.count > MOST_ISOMERS) ? counted : null;
    const made = await stereoisomersOf(chem, [molblock], open, past ? { most: MOST_ISOMERS, first: true } : { most: MOST_ISOMERS }, ms);
    if (!("isomers" in made)) throw new Error("its stereoisomers could not be made");
    // (past MOST_ISOMERS none of those tried made: not all were tried, so never said to hold none)
    if (past && !made.isomers.length) throw new Error("its stereoisomers could not be made");
    const said = [...bonds, ...(made.said ?? [])];
    if (!made.isomers.length) return { open, count: 1, free: true, isomers: [open.configured], said };
    const all = made.isomers.map((i) => ({ ...i.configured, groups: [] }));
    if (past) return { open, count: "upTo" in past ? past.upTo : past.count, upTo: true, free: false, isomers: all.slice(0, 1), said };
    return { open, count: all.length, free: false, isomers: which === "one" ? all.slice(0, 1) : all, said };
  }
  // (with groups: every half asked for, at most MOST_ISOMERS of all of them, refused whole past that - never a few of them)
  const made = await stereoisomersOf(chem, [molblock], open, { most: MOST_ISOMERS, whole: true }, ms);
  if ("tooMany" in made) throw new Error(`it is more than the ${MOST_ISOMERS} stereoisomers made of one`);
  if (!("isomers" in made)) throw new Error("its stereoisomers could not be made");
  const halves = halvesMade(open, [molblock], made.isomers);
  if (!halves.made.length) return { open, count: 1, free: true, isomers: [open.configured], said: halves.said };
  const kept = which === "one" ? halves.made.slice(0, 1) : halves.made;
  // (one made of several halves: the half as drawn, said to be that alone)
  const only = (h: Half | undefined): Half | undefined => (h && which === "one" && halves.made.length > 1 ? { ...h, words: `${h.name} only` } : h);
  return {
    open,
    count: halves.made.length,
    free: false,
    isomers: kept.map((h) => h.configured),
    halves: kept.map((h) => only(h.half)),
    said: halves.said,
  };
}

/**
 * A stereoisomer's conformers with their CIP labels Meno's own, read from
 * the first conformer's places (lib/chem/cip/in3d): what the plugin sends
 * is never read.
 */
export function withOwnCip<T extends Pick<Conformers, "atoms" | "bonds" | "frames" | "cip">>(c: T): T {
  return { ...c, cip: cipIn3d({ atoms: c.atoms, bonds: c.bonds, xyz: c.frames[0] ?? [] }) };
}

/**
 * A stereoisomer's conformers with which of its configurations were chosen (`chosen`): the CIP labels (`withOwnCip`) of the elements its
 * drawing leaves open, those places made before gave among them - and of the centres of its AND and OR groups turned as a whole, which tell
 * its halves apart.
 */
export function withChosen<T extends { cip: { atoms: Record<string, string>; bonds: Record<string, string> } }>(c: T, open: Pick<OpenStereo, "drawn"> & Partial<Pick<OpenStereo, "groups">>): T & { chosen: T["cip"] } {
  const of = (labels: Record<string, string>, open: readonly number[]) => Object.fromEntries(open.flatMap((i) => (labels[String(i)] != null ? [[String(i), labels[String(i)]]] : [])));
  const atoms = [...open.drawn.atoms, ...(open.groups?.groups.flatMap((g) => g.centres) ?? [])];
  return { ...c, chosen: { atoms: of(c.cip.atoms, atoms), bonds: of(c.cip.bonds, open.drawn.bonds) } };
}
