/**
 * Clean-up: a structure laid out afresh by Meno's own engine - the drawing a
 * chemist would make of it (docs/LAYOUT-2D.md) - where it was drawn, with
 * the groups a chemist would write by name written so (lib/chem/contract),
 * as one undo step.
 */
import { contractGraph, contractionTrials, hiddenIn } from "../../../../lib/chem/contract";
import { chemistry, valencesAt } from "../../../../lib/chem/molecule";
import { styleOf, type DrawingStyle } from "../../../../lib/chem/style";
import { useAppSettings } from "../../../../lib/settings/appSettings";
import type { Layout2D } from "../../../../lib/layout/engine";
import { emptyWorkspaceDocument, endpointsHeld, relayout, writtenAsLabels, type WrittenAsLabel } from "../document";
import type { EditorStore } from "../store";
import type { Model } from "../store/types";
import { drawingOf, readAs, undrawnHydrogens } from "./drawing";
import { layoutJob, nextFree, relayoutFrom, statedOf, stereoOf, type LayoutJob } from "./engineLayout";
import { openDoubleBonds, openRuns, readStereo } from "../../../../lib/layout/drawn";
import { compared } from "../../../../lib/chem/perception/stereo/compare";
import { layOut } from "./layOut";
import { cisTransOfGiven, givenAtoms, tetraOfGiven, type Given } from "./givenConfiguration";
import { lonePairCentres } from "../../../../lib/chem/lonePairCentres";
import type { Cumulated } from "../../../../lib/layout/stereo";
import { atTrueSize } from "../../../../lib/chem/magnified2d";
import { formulaOf } from "../../../../lib/io/coordinates";
import { newmansIn } from "../projections/newman";

/**
 * An atom and every atom bonded to it, however far along - a haptic bond
 * joining a metal to every atom of its pi system (a Cp ring is one
 * structure with its metal) - and every atom of a structure of several parts
 * it is in (`Atom.joined`).
 */
export function fragmentOf(model: Model, atomId: number): Set<number> {
  return reached(neighboursIn(model), atomId);
}

/**
 * The atoms each atom is bonded to: through a haptic bond, every atom of the
 * pi system and its metal - and, `joined`, every atom that shares its
 * structure of several parts, bonded or not (docs/EDITOR-2D.md, *One
 * structure of several parts*). Clean-up asks without: it lays out each
 * piece as it is, and the parts keep where they stand.
 */
function neighboursIn(model: Model, joined = true): Map<number, number[]> {
  const next = new Map<number, number[]>();
  const join = (u: number, v: number) => {
    for (const [from, to] of [[u, v], [v, u]]) {
      const here = next.get(from);
      if (here) here.push(to);
      else next.set(from, [to]);
    }
  };
  for (const b of model.bonds) {
    join(b.a, b.b);
    for (const e of b.endpoints ?? []) join(b.a, e);
  }
  if (joined) {
    // (each of a number's atoms to the first of it: enough for them to be reached from one another)
    const first = new Map<number, number>();
    for (const a of model.atoms) {
      if (a.joined == null) continue;
      const f = first.get(a.joined);
      if (f == null) first.set(a.joined, a.id);
      else join(f, a.id);
    }
  }
  return next;
}

/** An atom and every atom `next` leads to from it, however far along. */
function reached(next: Map<number, number[]>, atomId: number): Set<number> {
  const seen = new Set([atomId]);
  const todo = [atomId];
  while (todo.length) {
    for (const n of next.get(todo.pop()!) ?? []) {
      if (!seen.has(n)) {
        seen.add(n);
        todo.push(n);
      }
    }
  }
  return seen;
}

/** Some of a structure: these atoms, and the bonds between them. */
export function partOf(model: Model, ids: Set<number>): Model {
  // (a haptic bond whose ring is not all in the part binds none in it)
  return endpointsHeld({
    atoms: model.atoms.filter((a) => ids.has(a.id)),
    bonds: model.bonds.filter((b) => ids.has(b.a) && ids.has(b.b)),
  });
}

/**
 * The structures on the canvas, each the atoms bonded together, a lone atom
 * not among them - or, `joined`, each structure of several parts as one, a
 * lone ion in one with the rest (Clean-up asks for the pieces).
 */
export function fragmentsOf(model: Model, joined = true): Set<number>[] {
  const seen = new Set<number>();
  const out: Set<number>[] = [];
  const bonded = new Set(model.bonds.flatMap((b) => [b.a, b.b]));
  if (joined) for (const a of model.atoms) if (a.joined != null) bonded.add(a.id);
  // (the bonds gone over once for them all, not again for each: a thousand
  // structures took 17 s)
  const next = neighboursIn(model, joined);
  for (const a of model.atoms) {
    if (seen.has(a.id) || !bonded.has(a.id)) continue;
    const f = reached(next, a.id);
    f.forEach((id) => seen.add(id));
    out.push(f);
  }
  return out;
}

/** The fragments that hold any of `atoms`, each once - a structure of several parts as one, unless not `joined` (Clean-up's pieces). */
export function fragmentsHolding(model: Model, atoms: Iterable<number>, joined = true): Set<number>[] {
  const out: Set<number>[] = [];
  const next = neighboursIn(model, joined);
  const there = new Set(model.atoms.map((a) => a.id));
  const taken = new Set<number>();
  for (const id of atoms) {
    if (taken.has(id) || !there.has(id)) continue;
    const f = reached(next, id);
    f.forEach((x) => taken.add(x));
    out.push(f);
  }
  return out;
}

/**
 * The atoms of `part` Clean-up leaves drawn out, whatever groups they are
 * in: those `expanded` holds - just drawn out of their label - a
 * stereocentre's, wedged, and any atom with more to it than its element and
 * charge (an isotope, a radical, an atom map...), which a label would not
 * say. A valence set to its element's own at its charge says nothing more
 * (`saysMore`): a file's VAL=4 on every Si leaves TMS and OTBS to be
 * written by name.
 */
function keptDrawn(part: Model, expanded: ReadonlySet<number>): Set<number> {
  const keep = new Set([...expanded].filter((id) => part.atoms.some((a) => a.id === id)));
  for (const a of part.atoms) {
    if (a.stereoCentre || Object.keys(chemistry(a)).some((k) => saysMore(a, k))) keep.add(a.id);
  }
  const drawing = drawingOf(part);
  for (const b of drawing.bonds) if (b.wedge) keep.add(part.atoms[b.wedge.narrow].id);
  return keep;
}

/** Whether `key` of an atom's chemistry says what a label would not: its charge never; its valence where it is not its element's own at that charge (the hydrogens the same either way). */
function saysMore(a: Model["atoms"][number], key: string): boolean {
  if (key === "charge") return false;
  if (key === "valence") return a.valence !== valencesAt(a.el, a.charge ?? 0, a.radical)[0];
  return true;
}

type Cleaned = { labels: WrittenAsLabel[]; part: Model; job: LayoutJob; laid: Layout2D };

/**
 * `part` laid out by the engine with the groups a chemist would write by
 * name written so: those the rules choose, and more, where the drawing
 * would hide something, as long as each more hides less (contractionTrials).
 */
async function laidOutWithLabels(part: Model, expanded: ReadonlySet<number>): Promise<Cleaned> {
  const index = new Map(part.atoms.map((a, i) => [a.id, i]));
  const graph = contractGraph(
    part.atoms.map((a) => ({ el: readAs(a), charge: a.charge })),
    part.bonds.map((b) => ({
      a1: index.get(b.a)!,
      a2: index.get(b.b)!,
      order: b.order,
      ...(b.endpoints ? { endpoints: b.endpoints.flatMap((e) => (index.has(e) ? [index.get(e)!] : [])) } : {}),
    })),
  );
  const keep = new Set([...keptDrawn(part, expanded)].map((id) => index.get(id)!));
  const trials = contractionTrials(graph, keep);
  let best: (Cleaned & { hidden: number }) | null = null;
  for (let trial = trials.next(); !trial.done; ) {
    const labels = trial.value.map((c) => ({
      atoms: c.atoms.map((i) => part.atoms[i].id),
      at: part.atoms[c.at].id,
      label: c.label,
    }));
    const written = labels.length ? writtenAsLabels({ ...emptyWorkspaceDocument(), model: part }, labels).model : part;
    const job = layoutJob(written);
    const laid = await layOut(job.input);
    const hidden = hiddenIn(job.input, laid);
    if (!best || hidden < best.hidden) best = { labels, part: written, job, laid, hidden };
    trial = trials.next(hidden);
  }
  return best!;
}

/**
 * Cleans up the fragment an atom is in - or the fragments a selection's
 * atoms are in, or every structure on the canvas -
 * each where it was: laid out afresh by Meno's own engine (engineLayout),
 * off the drawing's thread, the groups a chemist would write by name
 * written so, and applied as one undo step. What *Expand abbreviation* has
 * just drawn out is left drawn out. Refuses, rather than changing anything,
 * if the structure changed meanwhile, or if the new layout would not say
 * the stereochemistry the old one said. A projection - a ring drawn in
 * perspective, a chair the Projections tool put down - is kept where it is
 * and what is flat on it laid out onto it (`relayoutFrom`); `flat` lays it
 * out flat as any structure (a chair's right-click *Draw flat*).
 */
export async function cleanUp(
  store: EditorStore,
  around: number | Iterable<number> | null = null,
  flat = false,
): Promise<void> {
  // (each structure shown magnified laid out at its true size, and shown as large again: store relayout, utils/trueSize)
  const held = store.getState().model;
  const model = atTrueSize(held);
  const expanded = store.getState().justExpanded();
  const all = (
    // (each piece as it is: a structure of several parts is laid out piece by piece, its parts keeping where they stand)
    around == null
      ? fragmentsOf(model, false)
      : fragmentsHolding(model, typeof around === "number" ? [around] : around, false)
  )
    .map((ids) => partOf(model, ids))
    .filter((part) => part.bonds.length > 0);
  if (!all.length) return; // nothing to lay out
  // (a Newman pair is drawn as it is: two atoms at one place, which no flat layout keeps - Draw flat lays it out. A ring in perspective is
  //  kept by the layout itself, `relayoutFrom`)
  const isKept = (part: Model) => !flat && newmansIn(part).length > 0;
  const parts = all.filter((part) => !isKept(part));
  const pairs = all.filter(isKept).map((part) => ({ part, formula: partFormula(part), why: "it is a Newman projection, drawn as it is - Draw flat, in its right-click menu, lays it out flat" }));
  if (!parts.length) throw new CleanUpRefused(pairs, all.length);
  // (each on its own: one whose wedges cannot be kept, refused before it is laid out, named with the rest below)
  const settled = await Promise.allSettled(parts.map((part) => laidOutWithLabels(part, expanded)));
  // (each with the part it was laid out from: what is left as drawn is named by its atoms as they are on the page)
  const cleaned = settled.flatMap((r, i) => (r.status === "fulfilled" ? [{ ...r.value, from: parts[i] }] : []));
  const unlaid = settled.flatMap((r, i) => (r.status === "rejected" ? [{ part: parts[i], why: r.reason instanceof Error ? r.reason.message : String(r.reason) }] : []));
  if (store.getState().model !== held) {
    throw new Error(
      "The structure changed while it was being cleaned up, so nothing was moved.",
    );
  }
  const allLabels = cleaned.flatMap((c) => c.labels);
  const written = allLabels.length ? writtenAsLabels({ ...emptyWorkspaceDocument(), model }, allLabels).model : model;
  // (in the style it is drawn in: a bond to a terminal label drawn long enough for its labels)
  const style = styleOf(store.getState().docStyle);
  // each structure laid out on its own: one that cannot be - its stereochemistry not kept, an atom put on
  // another - left as it is drawn, named, and the rest laid out all the same, as one step
  const tried = cleaned.map((c) => {
    try {
      return { c, change: relayoutFrom(written, c.part, c.job, c.laid, style, flat) };
    } catch (e) {
      return { c, why: e instanceof Error ? e.message : String(e) };
    }
  });
  const done = tried.flatMap((t) => (t.change ? [{ ...t, change: t.change }] : []));
  const refused = tried.filter((t) => !t.change);
  if (done.length) {
    const changes = done.map((t) => t.change);
    store.getState().relayout(
      {
        atoms: changes.flatMap((c) => c.atoms),
        bonds: changes.flatMap((c) => c.bonds),
        added: changes.flatMap((c) => c.added ?? []),
        removed: changes.flatMap((c) => c.removed ?? []),
        eta: changes.flatMap((c) => c.eta ?? []),
      },
      done.flatMap((t) => t.c.labels),
    );
  }
  // (`from`, the part as it is on the page - what is named by its atoms; `part`, as it was laid out - what its formula is read from)
  const left: { part: Model; from: Model; why: string }[] = [...unlaid.map((u) => ({ ...u, from: u.part })), ...refused.map((t) => ({ part: t.c.part, from: t.c.from, why: t.why! }))];
  const named = [...left.map((l) => ({ part: l.from, formula: partFormula(l.part), why: l.why })), ...pairs];
  if (named.length) throw new CleanUpRefused(named, all.length);
}

/**
 * What Clean-up left as drawn, each structure by its formula and why: the
 * rest of what it was asked about laid out all the same (`of`, how many in
 * all). Its message says so whole.
 */
export class CleanUpRefused extends Error {
  /** What it left as drawn, each by its formula, and why. */
  readonly refused: readonly { formula: string; why: string }[];
  /** The atoms of what it left as drawn, as they are on the page: what its words are about. */
  readonly atoms: readonly number[];
  constructor(
    refused: readonly { formula: string; why: string; part?: Model }[],
    readonly of: number,
  ) {
    // (of one among others laid out, not "nothing was moved": that one was left as it is)
    const each = refused.map((r) => `${r.formula}: ${r.why.replace(/, so nothing was moved\.?$/, ", so it was left as it is")}`).join("; ");
    super(of === 1 ? `Clean-up left ${refused[0].formula} as drawn: ${refused[0].why}.` : `Clean-up left ${refused.length} of ${of} structures as drawn - ${each}.`);
    this.name = "CleanUpRefused";
    this.atoms = refused.flatMap((r) => r.part?.atoms.map((a) => a.id) ?? []);
    this.refused = refused.map(({ formula, why }) => ({ formula, why }));
  }
}

/** A structure's formula as Hill writes one, its H carried counted as the page counts them (`undrawnHydrogens`); a label not an element written as it is. */
export function partFormula(part: Model): string {
  // (each atom's undrawn H as the page counts them - chem/drawing `undrawnHydrogens`: a dative, coordination or hydrogen bond as a
  //  drawing counts it, a valence a file sets first - so the formula said is the compound's: H3N->BH3 is BH6N; the chemistry check's
  //  ruling)
  const hs = undrawnHydrogens(part);
  const atoms: { el: string }[] = [];
  for (const a of part.atoms) {
    if (a.el === "*") continue;
    // (a held group's label written as it reads - the reader's mark stays out of a text a person sees; counted as the name it is)
    atoms.push({ el: a.el });
    // (a label not an element - an abbreviation - carries none counted here)
    for (let k = 0; k < (hs.get(a.id) ?? 0); k++) atoms.push({ el: "H" });
  }
  // (and its charge, as a formula writes one: NH4+, SO4 2-)
  const charge = part.atoms.reduce((t, a) => t + (a.charge ?? 0), 0);
  return formulaOf(atoms) + (charge ? `${Math.abs(charge) > 1 ? ` ${Math.abs(charge)}` : ""}${charge > 0 ? "+" : "-"}` : "");
}

/** Whether `given`'s atom indices are the job's: none of the drawing's atoms folded into another's. */
const givenFits = (job: LayoutJob, model: Model) => job.input.atoms.length === model.atoms.length;

/**
 * `job` given what the structure's source says of its configuration (`Given`) in place of what its drawing says: the text's axes and odd
 * cumulenes, and - where the plugin sent its reading beside the drawing - its centres and double bonds, each as given and the drawing's own
 * reading of them set aside. A centre whose fourth place is a lone pair is given only where Meno's own rules hold one there
 * (lib/chem/lonePairCentres); one whose atoms are not the drawing's is not given. Meno's own centres (`Given.own`) are laid over the
 * plugin's, or - where it sent none - over the drawing's own reading, whose other centres and double bonds stand. The drawing laid out is
 * then held to the whole of it (`LayoutJob.stated`).
 */
function withGiven(job: LayoutJob, model: Model, given: Given, ungivenDoubles: "kept" | "dropped" = "kept"): LayoutJob {
  const input = { ...job.input, ...(given.axes.length ? { axes: given.axes } : {}), ...(given.cumulated.length ? { cumulated: given.cumulated } : {}) };
  const c = given.configuration;
  const own = given.own ?? [];
  if (!c && !own.length) return { ...job, given: true, stated: true, input };
  const n = job.ids.length;
  const pair = (p: number, q: number) => (p < q ? `${p},${q}` : `${q},${p}`);
  const bondsThere = new Set(input.bonds.map((b) => pair(b.a, b.b)));
  const bonded = (x: number, y: number) => bondsThere.has(pair(x, y));
  const around = new Map<number, number[]>();
  for (const b of input.bonds) for (const [x, y] of [[b.a, b.b], [b.b, b.a]]) around.set(x, [...(around.get(x) ?? []), y]);
  const drawing = drawingOf(model);
  const keepsPyramid = lonePairCentres(drawing.atoms, drawing.bonds);
  // (the plugin's centres, where it sent them, and Meno's own laid over them; where it sent none, Meno's own laid over the drawing's reading)
  const centres = new Map(
    [...(c?.centres ?? []), ...own]
      .filter((x) => x.atom < n && x.neighbours.every((k) => k < n && bonded(x.atom, k)) && (x.neighbours.length === 4 || (input.atoms[x.atom].hs ?? 0) > 0 || keepsPyramid(x.atom)))
      .map((x) => [x.atom, tetraOfGiven(x, x.neighbours.length === 3 && !((input.atoms[x.atom].hs ?? 0) > 0))] as const),
  );
  // (a double bond by its atoms: the block's bond numbers are the drawing's, as it was read)
  const index = new Map(model.atoms.map((a, i) => [a.id, i]));
  if (!c) return { ...job, given: true, stated: true, input: { ...input, atoms: input.atoms.map((a, k) => (centres.has(k) ? { ...a, tetra: centres.get(k)! } : a)) } };
  const doubles = new Map(
    c.doubles.flatMap((d) => {
      const b = model.bonds[d.bond];
      return b ? [[pair(index.get(b.a)!, index.get(b.b)!), d] as const] : [];
    }),
  );
  return {
    ...job,
    given: true,
    stated: true,
    input: {
      ...input,
      atoms: input.atoms.map((a, k) => {
        const { tetra: _drawn, ...rest } = a;
        const t = centres.get(k);
        return t ? { ...rest, tetra: t } : rest;
      }),
      bonds: input.bonds.map((b) => {
        const d = doubles.get(pair(b.a, b.b));
        // (a double bond the plugin gives nothing of, which the drawing reads cis or trans - an aromatic macrocycle's, which Meno's own
        //  rules read and the toolkit's do not: as the drawing reads it, as before; the two are listed in the differential)
        if (!d && ungivenDoubles === "kept") return b;
        if (!d) {
          const { stereo: _drawn, ...bare } = b;
          return bare;
        }
        const { stereo: _drawn, ...rest } = b;
        const ct = b.order === 2 ? cisTransOfGiven(d, b.a, b.b, (x) => around.get(x) ?? []) : null;
        return ct ? { ...rest, stereo: ct } : rest;
      }),
    },
  };
}

/**
 * `model` laid out afresh by the engine as a whole - a salt's ions set out
 * together - for a structure that has only just arrived, before it is
 * added: a plugin's drawing of a SMILES. In `style` - the app's, unless
 * given - as Clean-up lays one out. `open`: the double bonds its text leaves
 * open (`OpenDoubles`). `asNew`: a drawing nobody made - a
 * plugin's coordinates - whose forms are not kept as a chemist's are (a
 * four-bond metal's cross or X: docs/LAYOUT-2D.md, *A metal with four
 * bonds*), but laid out as from a SMILES; `arranged`, of such a drawing, the
 * metals (by id) whose arrangement its input gave: their donors kept
 * opposite each other as it has them, and not marked as not given.
 */
/**
 * How much of what a structure's source gives (`Given`) its drawing `model` does not show, read by the one reader: of its stereocentres, its
 * double bonds' cis or trans, and its axes, how many are not shown, of how many given. None where the given cannot be laid on the drawing's
 * atoms. For a drawing kept as it came (fromSmiles `drawingOf`), so that what it leaves out is said.
 */
export function notShownOf(model: Model, given: Given): { centres: [number, number]; doubles: [number, number]; axes: [number, number] } | null {
  const read = layoutJob(model, givenAtoms(given));
  if (!givenFits(read, model)) return null;
  const stated = statedOf(withGiven(read, model, given), model);
  // (each unit given and not shown as given: lost, turned or no longer one - lib/chem/perception/stereo/compare `compared`)
  const lost = compared(stated, stereoOf(model)).filter((d) => d.how !== "closed");
  const [centres, doubles, axes] = (["centre", "double", "axis"] as const).map((kind) => lost.filter((d) => d.kind === kind).length);
  return { centres: [centres, stated.centres.size], doubles: [doubles, stated.doubles.size], axes: [axes, stated.axes.size] };
}

/**
 * The double bonds of a structure whose source gave its configuration beside its drawing (`Given`) that could be cis or trans and that it
 * does not name: open, so drawn that they state neither - each end straight on, or a wavy bond on a group (Brecher 2006, ST-4.4), as the
 * layout's own test has them (lib/layout/drawn `openDoubleBonds`). Read from what was given and the drawing alone: nothing of Meno's own
 * reading of a SMILES. None where the plugin sent no configuration, or its atoms are not the drawing's.
 */
export function openOfField(model: Model, given: Given): OpenDoubles | null {
  if (!given.configuration) return null;
  const read = layoutJob(model, givenAtoms(given));
  if (!givenFits(read, model)) return null;
  // (what was given held, the drawing's own cis or trans of every other double bond set aside: what is left that could have one is open)
  return openDoubleBonds(withGiven(read, model, given, "dropped").input);
}

/**
 * A drawing kept as it came (fromSmiles `drawingOf`, where Meno's layout could not be made) with its open double bonds - the text's, and the
 * field's - drawn so that they state neither: a wavy bond on each (its ends cannot be put straight on without a layout). Else it would state
 * whatever the plugin's picture shows.
 */
export function openAsCame(model: Model, given: Given | undefined, open: OpenDoubles | undefined): Model {
  const all = bothOpen(open, given ? openOfField(model, given) : null);
  if (!all) return model;
  const ends = new Set(all.straight.map((i) => model.atoms[i]?.id));
  const either = new Set(all.either);
  return { ...model, bonds: model.bonds.map((b, i) => (b.order === 2 && (either.has(i) || (ends.has(b.a) && ends.has(b.b))) ? { ...b, stereo: "either" as const } : b)) };
}

/** Two sets of open double bonds as one: the text's, where Meno read it, and the field's. */
function bothOpen(p: OpenDoubles | null | undefined, q: OpenDoubles | null | undefined): OpenDoubles | undefined {
  if (!p) return q ?? undefined;
  if (!q) return p;
  return { straight: [...new Set([...p.straight, ...q.straight])], either: [...new Set([...p.either, ...q.either])] };
}

export async function laidOut(
  model: Model,
  style: DrawingStyle = styleOf(useAppSettings.getState().drawingStyle),
  given?: Given,
  open?: OpenDoubles,
  asNew = false,
  arranged: ReadonlySet<number> = new Set(),
): Promise<Model> {
  if (!model.bonds.length) return model;
  open = given?.configuration ? bothOpen(open, openOfField(model, given)) : open;
  // (an odd cumulene's cis or trans in a drawing nobody made that Meno's own reading of the text did not give - a MOL block cannot say one,
  //  and a text Meno's reader does not take gives none: open, as one the text leaves open is; its picture shows one only by chance)
  if (asNew) open = bothOpen(open, runsOpenOf(model, given));
  // (a double bond the structure's own text leaves open, with an end of two groups: a wavy bond on a group - Brecher 2006, ST-4.4)
  const either = new Set(open?.either ?? []);
  // (one left open with one group at each end, its ends kept straight on below: the plugin's own mark of either configuration taken off it,
  //  so that the drawing says it once, by its straight ends, and Clean-up keeps them straight as it keeps any drawn so - layout/drawn
  //  `straightEnds` reads no end of a bond so marked)
  const straight = new Set((open?.straight ?? []).map((i) => model.atoms[i]?.id).filter((id): id is number => id != null));
  const straightOn = (b: Model["bonds"][number]) => b.order === 2 && straight.has(b.a) && straight.has(b.b);
  const m =
    either.size || straight.size
      ? {
          ...model,
          bonds: model.bonds.map((b, i) => {
            if (either.has(i) && b.order === 2) return { ...b, stereo: "either" as const };
            if (straightOn(b) && b.stereo === "either") {
              const { stereo: _s, ...rest } = b;
              return rest;
            }
            return b;
          }),
        }
      : model;
  const job0 = layoutJob(m, givenAtoms(given));
  // (a drawing nobody made keeps no metal's form - but one whose arrangement its input gave keeps the form it carries, the X of a square-planar centre so arranged)
  const read = asNew
    ? { ...job0, asNew: true as const, ...(arranged.size ? { arranged } : {}), input: { ...job0.input, atoms: job0.input.atoms.map(({ fourForm, ...a }, i) => (fourForm && arranged.has(job0.ids[i]) ? { ...a, fourForm } : a)) } }
    : job0;
  let job: LayoutJob = given && givenFits(read, m) ? withGiven(read, m, given) : read;
  // (a run so given is drawn as given, not kept straight at its ends as the plugin's drawing of it may have them - a drawing of the
  //  structure with nothing given, which leaves an odd cumulene open: layout/drawn `openDoubleBonds`)
  if (job !== read && given?.cumulated.length) {
    const ends = new Set(given.cumulated.flatMap((c) => c.atoms));
    job = { ...job, input: { ...job.input, atoms: job.input.atoms.map(({ linear, ...a }, k) => (linear && !ends.has(k) ? { ...a, linear } : a)) } };
  }
  // (and one left open with one group at each end: each end kept straight on from it, so that it states neither cis nor trans - ST-4.4 -
  //  whatever the plugin's drawing of it said)
  if (straight.size) {
    const pair = (p: number, q: number) => (p < q ? `${p},${q}` : `${q},${p}`);
    const linear = new Set(job.ids.flatMap((id, k) => (straight.has(id) ? [k] : [])));
    // (an odd cumulene's the same, by its run's two ends: the cis or trans the plugin's drawing of it read, its ends now kept straight on)
    const runOpen = (c: Cumulated) => linear.has(c.atoms[0]) && linear.has(c.atoms[1]);
    const runs = job.input.cumulated ?? [];
    // (read from the plugin's drawing, whether or not another run of it is given, which takes the place of what the drawing read)
    const pictured = [...(read.input.cumulated ?? []), ...runs].filter(runOpen);
    const opened = [...model.bonds.filter(straightOn).map((b) => pair(b.a, b.b)), ...pictured.map((c) => pair(job.ids[c.atoms[0]], job.ids[c.atoms[1]]))];
    const { cumulated: _c, ...input } = job.input;
    const kept = runs.filter((c) => !runOpen(c));
    job = {
      ...job,
      opened,
      input: {
        ...input,
        atoms: job.input.atoms.map((a, k) => (linear.has(k) ? { ...a, linear: true } : a)),
        // (nor asked of the engine to lay out the cis or trans the plugin's drawing read: with its ends straight on it could show none, and
        //  `opened` keeps it from being taken as the drawing's - so this keeps the engine's input to what the text says, not a case of its own)
        bonds: job.input.bonds.map((b) => (b.stereo && b.order === 2 && linear.has(b.a) && linear.has(b.b) ? { a: b.a, b: b.b, order: b.order } : b)),
        ...(kept.length ? { cumulated: kept } : {}),
      },
    };
  }
  const change = relayoutFrom(m, m, job, await layOut(job.input), style);
  return relayout({ ...emptyWorkspaceDocument(), model: m, nextId: nextFree(m) }, change).model;
}

/**
 * The double bonds a structure's own text leaves without a configuration that could have one, by the drawing's indices (layout/drawn
 * `openDoubleBonds`): the ends to keep straight on, by atom, and the bonds to give a wavy bond, by bond.
 */
export type OpenDoubles = { straight: readonly number[]; either: readonly number[] };

/**
 * The odd cumulenes (a butatriene's) of a drawing nobody made that `given` - Meno's own reading of the structure's text - does not give,
 * open (layout/drawn `openRuns`), by the drawing's indices: none where there are none.
 */
function runsOpenOf(model: Model, given: Pick<Given, "cumulated"> | undefined): OpenDoubles | null {
  const d = drawingOf(model);
  const o = openRuns({
    atoms: d.atoms.map((a) => ({ el: a.el ?? "C", hs: a.hs, ...(a.charge ? { charge: a.charge } : {}) })),
    bonds: d.bonds.map(({ a, b, order }) => ({ a, b, order })),
    ...(given?.cumulated.length ? { cumulated: given.cumulated } : {}),
  });
  if (!o.straight.length && !o.either.length) return null;
  // (the bonds by the model's own, by their atoms)
  const ids = model.atoms.map((a) => a.id);
  const either = o.either.flatMap((k) => {
    const [p, q] = [ids[d.bonds[k].a], ids[d.bonds[k].b]];
    const i = model.bonds.findIndex((b) => (b.a === p && b.b === q) || (b.a === q && b.b === p));
    return i >= 0 ? [i] : [];
  });
  return { straight: o.straight, either };
}

/**
 * A plugin's drawing kept as it came - not laid out (`laidOut` refused) - with each odd cumulene's cis or trans (a butatriene's) it shows
 * other than the text gives marked unsaid: its double bond at an end of the run "either", drawn with a wavy bond. A MOL block cannot say a
 * run's cis or trans, so what the plugin's picture shows of one is chance: kept, it would state an isomer the text never wrote, or one it
 * left open. One the text gives (`given`), shown as given, stays. The same model where there is none.
 */
export function runsAsCame(model: Model, given: Pick<Given, "cumulated"> | undefined): Model {
  const d = drawingOf(model);
  const shown = readStereo(d.atoms, d.bonds).cumulated;
  if (!shown.length) return model;
  const pair = (p: number, q: number) => (p < q ? `${p},${q}` : `${q},${p}`);
  const told = new Map((given?.cumulated ?? []).map((c) => [pair(c.atoms[0], c.atoms[1]), c.cis]));
  const ends = new Set(shown.filter((r) => told.get(pair(r.atoms[0], r.atoms[1])) !== r.cis).map((r) => model.atoms[r.atoms[0]].id));
  if (!ends.size) return model;
  // (the run's own double bond at that end: an end of a run has no other)
  return {
    ...model,
    // (a bond read from a block carries "none" for no mark)
    bonds: model.bonds.map((b) => ((ends.has(b.a) || ends.has(b.b)) && b.order === 2 && (b.stereo ?? "none") === "none" ? { ...b, stereo: "either" as const } : b)),
  };
}
