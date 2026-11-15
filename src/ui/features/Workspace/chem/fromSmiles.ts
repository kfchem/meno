import { chemWorker } from "../../../../lib/roles/worker";
import type { ChemClient } from "../../../../lib/roles/client";
import { NOT_READ, notReadSaid } from "../../../../lib/chem/smilesWhy";
import type { Model } from "../store/types";
import { editorModelOf, processFileContent } from "../utils/io";
import { laidOut, runsAsCame, type GivenRuns, type OpenDoubles } from "./cleanUp";
import { arrangementsMarked } from "./arrangementsMarked";
import { smilesInput } from "../../../../lib/layout/smilesInput";
import { openDoubleBonds } from "../../../../lib/layout/drawn";
import { readSmiles, type MarkedArrangement } from "../../../../lib/chem/smiles";
import { drawingOf as drawingOfModel } from "./drawing";
import { identityInputOf } from "./identityOf";
import { leftOver, stereoGraphOf } from "../../../../lib/chem/stereoOpen";
import { openStereo } from "./openStereo";
import { isMetal } from "../../../../lib/layout/perceive";
import type { DrawingStyle } from "../../../../lib/chem/style";
import { identityText } from "../../../../lib/chem/identity";

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
  // (a metal the SMILES gives the arrangement of - its mark, @SP or @OH, at the metal: the pairs the mark states, where Meno reads
  //  them (`metalPairsIn`), kept only where the drawing has them; where it does not read them, one with no chelate, whose drawing
  //  the plugin's picture carries)
  const marks = metalPairsIn(smiles, molblock);
  const arranged = [...new Set([...metalsArrangedIn(smiles, molblock), ...marks.map((m) => m.metal)])];
  // (and the double bonds it leaves open drawn as open: straight on, or a wavy bond on a group - Brecher 2006, ST-4.4)
  const opened = openDoublesOf(smiles, molblock);
  const [open, drawn] = await Promise.all([withinTime(openStereo(c, [molblock]).then((o) => o.left), STEREO_ASK_MS).catch(() => null), drawingOf(molblock, style, given?.runs, opened ?? undefined, arranged, marks)]);
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
export async function drawingOf(
  molblock: string,
  style?: DrawingStyle,
  given?: GivenRuns,
  open?: OpenDoubles,
  arrangedAt: readonly number[] = [],
  marks: readonly MarkedArrangement[] = [],
): Promise<Model & { asCame?: string }> {
  const result = await processFileContent("drawing.mol", molblock);
  const drawn = editorModelOf(result.model);
  // (the metals whose arrangement the input gave, by the block's atoms: their ids)
  const idOf = (i: number) => drawn.atoms[i]?.id;
  const arranged = new Set(arrangedAt.flatMap((i) => (idOf(i) != null ? [idOf(i)!] : [])));
  const byIds = marks.flatMap((m) => (idOf(m.metal) != null && m.pairs.every(([p, q]) => idOf(p) != null && idOf(q) != null) ? [{ metal: idOf(m.metal)!, pairs: m.pairs.map(([p, q]) => [idOf(p)!, idOf(q)!] as [number, number]) }] : []));
  // (as it came, said why: put down, it is said - asCameSaid; its coordinates the plugin's, nobody's drawing: laid out as new)
  const laid = await laidOut(drawn, style, given, open, true, arranged).catch((e: unknown) => {
    // (kept for whoever looks: what the sentence said plainly leaves out)
    console.warn("the structure is drawn as the plugin laid it out", e);
    // (a square-planar centre nobody gave the arrangement of marked so, as it would be laid out: the plugin's drawing says none; and an
    //  odd cumulene's cis or trans it shows by chance marked unsaid, unless the text gives that one: a MOL block cannot say it)
    return { ...arrangementsMarked(runsAsCame(drawn, given), arranged), asCame: e instanceof Error ? e.message : String(e) };
  });
  return marksKept(laid, byIds);
}

/**
 * `model` with each metal whose SMILES's mark states its pairs (`marks`, by id) checked against the drawing: where the pairs drawn
 * are not the mark's - a chelate laid out as another isomer, or one the plugin drew so - the metal is marked as one nobody gave the
 * arrangement of, wherever its donors could lie more ways than one (`arrangementsMarked`): never an isomer the input did not write.
 */
function marksKept<M extends Model>(model: M, marks: readonly { metal: number; pairs: readonly (readonly [number, number])[] }[]): M {
  if (!marks.length) return model;
  const drawing = drawingOfModel(model);
  const at = (id: number) => drawing.index.get(id);
  const key = (pairs: readonly (readonly [number, number])[]) => pairs.map(([p, q]) => (p < q ? `${p},${q}` : `${q},${p}`)).sort().join(" ");
  // (the pairs as identity reads them - the earlier picture's too, where it is one structure: chem/identityOf `identityInputOf`)
  const { input } = identityInputOf(model);
  const read = new Map((input.arrangements ?? []).map((x) => [x.metal, x.pairs]));
  // (the mark's pairs, or pairs that make the same structure with them - the earlier picture read by one of its alike readings)
  const same = (i: number, pairs: readonly (readonly [number, number])[]) => {
    const drawn = read.get(i);
    if (!drawn) return false;
    if (key(drawn) === key(pairs)) return true;
    const marked = { ...input, arrangements: (input.arrangements ?? []).map((x) => (x.metal === i ? { metal: i, pairs } : x)) };
    return identityText(marked) === identityText(input);
  };
  const wrong = new Set(
    marks.flatMap((m) => {
      const i = at(m.metal);
      const pairs = m.pairs.flatMap(([p, q]) => (at(p) != null && at(q) != null ? [[at(p)!, at(q)!] as const] : []));
      return i == null || pairs.length !== m.pairs.length || !same(i, pairs) ? [m.metal] : [];
    }),
  );
  if (!wrong.size) return model;
  // (only the metals found wrong asked: every other atom set aside as given)
  return { ...model, ...arrangementsMarked(model, new Set(model.atoms.map((a) => a.id).filter((id) => !wrong.has(id)))) };
}

/**
 * The pairs across each marked metal's mark states (lib/chem/smiles `pairsMarked`: @SP1-3, @OH1-30), by the atoms of the MOL
 * block the plugin read the SMILES to - the same atoms in the same order, joined by the same bonds - or none: where Meno's reader
 * refuses the SMILES or the mark, or the block is not of its atoms, nothing is read and `metalsArrangedIn` stands alone.
 */
export function metalPairsIn(smiles: string, molblock: string): MarkedArrangement[] {
  let own;
  try {
    own = readSmiles(smiles, { metalMarks: true });
  } catch {
    return [];
  }
  if (!own.arrangements?.length) return [];
  const graph = stereoGraphOf([molblock]);
  if (!graph || graph.atoms.length !== own.atoms.length || graph.atoms.some((a, i) => a.el !== own.atoms[i].el)) return [];
  const pair = (p: number, q: number) => (p < q ? `${p},${q}` : `${q},${p}`);
  const wanted = own.bonds.map((b) => pair(b.a1, b.a2)).sort();
  const had = graph.bonds.map((b) => pair(b.a, b.b)).sort();
  if (wanted.length !== had.length || wanted.some((k, i) => k !== had[i])) return [];
  return own.arrangements;
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

/**
 * The metals a SMILES gives the arrangement of - a square-planar mark (@SP1-3) at a metal of four neighbours, an octahedral one
 * (@OH1-30) at a metal of six - by the atoms of the MOL block the plugin read it to, which keep the SMILES's order. Any other mark at
 * a metal - a bare @ or @@, a tetrahedral one, one on the wrong count - states no pairs. None where the block's atoms are not the
 * SMILES's, element by element: then nothing it gives is taken as given. None with a chelate (`chelatedAt`).
 */
export function metalsArrangedIn(smiles: string, molblock: string): number[] {
  // (the SMILES's atoms in order: each bracket atom, with whether it carries a mark of configuration; each one of the organic subset)
  const atoms: { el: string; marked: "SP" | "OH" | false }[] = [];
  for (const t of smiles.matchAll(/\[([^\]]*)\]|Cl|Br|[BCNOPSFI]|[bcnops]|\*/g)) {
    if (t[1] == null) {
      atoms.push({ el: t[0].length === 1 && t[0] === t[0].toLowerCase() && t[0] !== "*" ? t[0].toUpperCase() : t[0], marked: false });
      continue;
    }
    const head = /^\d*([A-Z][a-z]?|[a-z]{1,2}|\*)(@(?:SP\d+|OH\d+)?)?/.exec(t[1]);
    const el = head?.[1] ?? "";
    atoms.push({ el: el.length && el === el.toLowerCase() && el !== "*" ? el[0].toUpperCase() + el.slice(1) : el, marked: arrangementMark(head?.[2] ?? "") });
  }
  if (!atoms.some((a) => a.marked && isMetal(a.el))) return [];
  const graph = stereoGraphOf([molblock]);
  if (!graph || graph.atoms.length !== atoms.length || graph.atoms.some((a, i) => a.el !== atoms[i].el)) return [];
  const degree = graph.atoms.map(() => 0);
  for (const { a, b } of graph.bonds) {
    degree[a]++;
    degree[b]++;
  }
  // (a square-planar mark on four neighbours, an octahedral one on six: any other mark at a metal - a bare @, a tetrahedral one,
  //  one on the wrong count - says no pairs, and the metal is not given)
  return atoms.flatMap((a, i) => (a.marked && isMetal(a.el) && degree[i] === (a.marked === "SP" ? 4 : 6) && !chelatedAt(i, graph.bonds) ? [i] : []));
}

/** Which kind of arrangement a SMILES's mark at an atom states: square planar (@SP1-3), octahedral (@OH1-30), or none. */
function arrangementMark(mark: string): "SP" | "OH" | false {
  const m = /^@(SP|OH)(\d+)$/.exec(mark);
  if (!m) return false;
  const n = Number.parseInt(m[2], 10);
  return m[1] === "SP" ? (n >= 1 && n <= 3 ? "SP" : false) : n >= 1 && n <= 30 ? "OH" : false;
}

/**
 * Whether two of the metal `m`'s donors are joined other than through it - a chelate's ring, or a bridge. Such a metal is not
 * taken as given by its SMILES's mark: where donors sit in chelate rings the plugin's picture was found not to carry the mark's
 * pairs, and nothing yet reads them from the mark itself (found in the chemistry check). It is laid out and marked as one
 * nobody gave the arrangement of: never an isomer the input did not write.
 */
function chelatedAt(m: number, bonds: readonly { a: number; b: number }[]): boolean {
  const around = new Map<number, number[]>();
  for (const { a, b } of bonds) {
    around.set(a, [...(around.get(a) ?? []), b]);
    around.set(b, [...(around.get(b) ?? []), a]);
  }
  const donors = around.get(m) ?? [];
  // (from each donor, through any atom but the metal: reaching another donor is a ring with the metal in it)
  for (const d of donors) {
    const seen = new Set([m, d]);
    const queue = [d];
    while (queue.length) {
      const at = queue.shift()!;
      for (const next of around.get(at) ?? []) {
        if (seen.has(next)) continue;
        if (donors.includes(next)) return true;
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return false;
}

/**
 * The double bonds a SMILES leaves without a configuration that could have one (layout/drawn `openDoubleBonds`), by the MOL block the plugin
 * read it to - its atoms and bonds the SMILES's, or none: each end to keep straight on, by atom; each bond to give a wavy bond, by bond.
 * None where nothing is open, or the block is not the SMILES's atoms and bonds (then it is drawn as the plugin's drawing says).
 */
export function openDoublesOf(smiles: string, molblock: string): OpenDoubles | null {
  let input;
  try {
    input = smilesInput(smiles);
  } catch {
    return null;
  }
  const open = openDoubleBonds(input);
  if (!open.straight.length && !open.either.length) return null;
  const graph = stereoGraphOf([molblock]);
  if (!graph || graph.atoms.length !== input.atoms.length || graph.atoms.some((a, i) => a.el !== input.atoms[i].el)) return null;
  const pair = (p: number, q: number) => (p < q ? `${p},${q}` : `${q},${p}`);
  const blockBond = new Map(graph.bonds.map((b, k) => [pair(b.a, b.b), k]));
  if (blockBond.size !== input.bonds.length || input.bonds.some((b) => !blockBond.has(pair(b.a, b.b)))) return null;
  return { straight: open.straight, either: open.either.map((i) => blockBond.get(pair(input.bonds[i].a, input.bonds[i].b))!) };
}

/** What the plugin leaves open, less the double bonds of the runs the SMILES configures (`givenRunsOf`). */
export function specified(open: Parameters<typeof leftOver>[0], bonds: readonly number[], molblock: string) {
  const graph = stereoGraphOf([molblock]);
  return graph ? leftOver(open, { centres: [], doubles: bonds.map((bond) => ({ bond, ends: [0, 0] as [number, number], cis: true })) }, graph.bonds) : open;
}
