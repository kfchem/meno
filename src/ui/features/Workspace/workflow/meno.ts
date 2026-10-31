/**
 * The steps Meno does itself (docs/WORKFLOWS.md, *Who does a step*), on a
 * set's entries alone: *As conformers*, *Energy window*, *Duplicates*,
 * *Populations* and *Choose one* - written for Meno from the specification and the
 * published methods. Each takes the entries that came in and says which
 * it keeps, which it sets aside, and what it found; or why it could not.
 */
import { speciesOf as speciesBy } from "../../../../lib/io/writers";
import { stereoIdentity } from "../../../../lib/entry";
import type { OptionValues } from "../../../../lib/options";
import { compoundLetter, drawnAsEntry, entryOfSet, entryState, FINISHED, freeEnergyOf, imaginaryOf, madeFrom, MARKS_UNREAD, STATE_FINISHED, numberedRecord, shadowedIn, unlikeMade, type DrawnEntry, type SetEntry } from "./entries";
import { conditionsIn, filter, type Condition } from "../../../../lib/nodes/filter";
import { entries as countEntries, workedOutAs } from "../../../../lib/nodes/base";
import { enumerated } from "./enumerate";
import { combinedSet, comparedSet, displacedSet, measuredSet, mergedSet, atomMapSet, rebondedSet, restrainedSet, SET_ASIDE, speciesSet, taggedSet, torsionsSet, withSaid } from "./structureSteps";
import type { Table } from "../../../../lib/table";
import { positionIds, substituted } from "./substituents";
import { rankedSet, valueKeysOf } from "./valueSteps";
import { joinedSet } from "./joinStep";
import { barrierSet } from "./barrierStep";
import { ensembleSet } from "./ensembleStep";
import type { StyleChoice } from "../../../../lib/chem/style";
import type { DrawnRecord, SeriesCore } from "../store/types";
import { displaceRead, kindInfo, optionsOf, type Holds3D, type StepKind } from "./kinds";
import { rmsd } from "./rmsd";
import { cappedSaid, SAME_CONFORMER, Sameness } from "./sameConformer";
import { least } from "../../../../lib/chem/lists";
import { boltzmann } from "../../../../lib/boltzmann";
import { factor } from "../../../../lib/units";
import { imaginaryWords } from "../../../../lib/calc/output";
import { numberText } from "../../../../lib/calc/results";
import { FAILURE_WORDS } from "./failures";

/** Kilocalories per mole in a hartree (Meno's units table). */
const KCAL_PER_HARTREE = factor("Eh", "kcal/mol");

/** What a step did: the entries it kept - with their shares, where it found them - and those it set aside, as a set that holds `holds`; or why it could not. */
export type Outcome = Outcome3D | DrawnOutcome;
/** What a step did on molecules in 3D (`Outcome`). */
export type Outcome3D =
  | { ok: true; holds: Holds3D; kept: SetEntry[]; aside: SetEntry[]; shares?: number[]; said: string; asideDrawn?: DrawnEntry[]; tables?: Readonly<Record<string, Table>> }
  | { ok: false; said: string };
/** What a step did on structures drawn: those it kept and those it set aside, each as drawn (`DrawnEntry`); or why it could not. */
export type DrawnOutcome = { ok: true; holds: "structures"; kept: DrawnEntry[]; aside: DrawnEntry[]; said: string; core?: SeriesCore } | { ok: false; said: string };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** A Meno step of `kind` on `entries`, of a set that holds `holds`, with its options (over its kind's defaults) - and what their energies are, where it ranks by them (`energiesBy`), and each molecule's, by id, where it compares them across molecules (`energyLevels`). */
export function runMeno(kind: StepKind, entries: readonly SetEntry[], holds: Holds3D, own?: OptionValues, energiesBy?: string, levels?: ReadonlyMap<number, string>): Outcome3D {
  if (!entries.length) return { ok: false, said: "Nothing came in" };
  const options = optionsOf(kindInfo(kind).options ?? [], own);
  switch (kind) {
    case "as-conformers":
      return asConformers(entries);
    case "energy-window":
      return options.within === "each value" ? energyWindowByValue(entries, holds, Number(options.window), String(options.groupBy ?? "")) : energyWindow(entries, Number(options.window), holds);
    case "duplicates":
      return drain(duplicates(entries, holds, mirrorsOf(options), never, options.within === "each value" ? String(options.groupBy ?? "") : undefined, levels));
    case "populations":
      return populations(entries, Number(options.temperature));
    case "choose":
      return chooseOne(entries, options.which === "number" ? Number(options.number) : null, energiesBy);
    case "filter":
      return filtered(entries, holds, String(options.conditions ?? ""), options.match === "any" ? "any" : "all");
    case "rank":
      return rankedSet(entries, holds, {
        property: String(options.property ?? ""),
        order: options.order === "highest first" ? "highest first" : "lowest first",
        keep: Number(options.keep),
        within: options.within === "all" ? "all" : options.within === "each value" ? "each value" : "each group",
        groupBy: String(options.groupBy ?? ""),
      });
    case "ensemble":
      return ensembleSet(entries, holds, options);
    case "tag":
      return taggedSet(entries, holds, String(options.name ?? ""));
    case "species":
      return speciesSet(entries, holds, String(options.charge ?? ""), String(options.multiplicity ?? ""));
    case "combine":
      return combinedSet(entries);
    case "measure":
      return measuredSet(entries, holds, String(options.measurements ?? ""));
    case "restraints":
      return restrainedSet(entries, holds, options);
    case "displace": {
      const r = displaceRead(options);
      return "why" in r ? { ok: false, said: r.why } : displacedSet(entries, holds, r);
    }
    default:
      return { ok: false, said: "Meno does not do this itself" };
  }
}

/** The kinds Meno does on two inputs, each a set's entries (workflow/structureSteps, workflow/joinStep): *Merge*, *Re-bond*, *Compare bonding*, *Torsion restraints*, *Join*, *Atom map* and *Barrier*. */
export const PAIRED: readonly StepKind[] = ["merge", "rebond", "compare-bonding", "torsion-restraints", "join", "atom-map", "barrier"];

/** A Meno step of two inputs, `kind`, on what came into each - its first input's, `a`, and its second's, `b` - with its options (over its kind's defaults). */
export function runMenoPair(kind: StepKind, a: { entries: readonly SetEntry[]; holds: Holds3D }, b: { entries: readonly SetEntry[]; holds: Holds3D }, own?: OptionValues): Outcome3D {
  const o = optionsOf(kindInfo(kind).options ?? [], own);
  // (Merge of two sets, one of them empty: nothing of it to add - the other's entries, its line saying so; both empty, nothing to merge)
  if (kind === "merge" && !a.entries.length !== !b.entries.length) {
    const out = mergedSet(a.entries, b.entries, a.entries.length ? a.holds : b.holds, o.keep === "one" ? "one" : "all", String(o.property ?? ""));
    return out.ok ? { ...out, said: `${out.said} · nothing came from ${a.entries.length ? "Second" : "First"}` } : out;
  }
  if (!a.entries.length) return { ok: false, said: "Nothing came into its first input" };
  if (!b.entries.length) return { ok: false, said: "Nothing came into its second input" };
  switch (kind) {
    case "merge":
      return mergedSet(a.entries, b.entries, a.holds, o.keep === "one" ? "one" : "all", String(o.property ?? ""));
    case "rebond":
      return rebondedSet(a.entries, b.entries, a.holds, o.pairs === "property" ? "property" : "each", String(o.property ?? ""));
    case "compare-bonding":
      return comparedSet(a.entries, b.entries, a.holds, {
        reference: o.reference === "property" ? "property" : "each",
        property: String(o.property ?? ""),
        writes: String(o.writes ?? ""),
        from: String(o.from ?? ""),
        rs: o.rs === true,
        ez: o.ez === true,
        numbered: o.numbered === true,
        atoms: String(o.atoms ?? ""),
        elements: String(o.elements ?? ""),
        reach: Number(o.reach),
        floor: Number(o.floor),
      });
    case "join":
      return joinedSet(a.entries, b.entries, a.holds, String(o.on ?? ""), String(o.carry ?? ""));
    case "barrier":
      return barrierSet(a.entries, b.entries, a.holds, {
        energy: o.energy === "E" ? "E" : "G",
        free: String(o.free ?? ""),
        pairs: o.pairs === "each" ? "each" : o.pairs === "property" ? "property" : "order",
        property: String(o.property ?? ""),
        symmetry: o.symmetry === "left-out" ? "left-out" : "as-read",
      });
    case "torsion-restraints":
      return torsionsSet(a.entries, b.entries, a.holds, o);
    case "atom-map":
      return atomMapSet(a.entries, b.entries, a.holds, o);
    default:
      return { ok: false, said: "Meno does not do this itself on two inputs" };
  }
}

/**
 * A Meno step of `kind` on structures drawn, each as drawn, with its
 * options (over its kind's defaults) - laid out in the workspace's `style`
 * where it draws anything: what it keeps, and what it sets aside, as
 * structures drawn, each with what the step says of it. *Enumerate*
 * (workflow/enumerate) and *Filter* do.
 */
export function runMenoDrawn(kind: StepKind, entries: readonly DrawnEntry[], own?: OptionValues, style?: StyleChoice, said: readonly string[] = []): DrawnOutcome {
  if (!entries.length) return { ok: false, said: "Nothing came in" };
  switch (kind) {
    case "enumerate": {
      if (entries.length > 1) return { ok: false, said: `Enumerate takes one structure drawn, its template: ${entries.length} came in` };
      const options = optionsOf(kindInfo(kind).options ?? [], own);
      const r =
        options.way === "substituents"
          ? substituted(entries[0].drawn, positionIds(String(options.positions ?? "")), String(options.groups ?? ""), options.combine === "together" ? "together" : "one", style)
          : enumerated(entries[0].drawn, String(options.lists ?? ""), style);
      if (!r.ok) return { ok: false, said: r.problems.join(" \u00b7 ") };
      // (each made from its template: what that was made from, and its values as the template's - `made_from.nll` - never as
      //  its own; a template drawn on the page has none)
      const template = entries[0].record;
      const fromTemplate = (record: DrawnRecord): DrawnRecord => ({
        ...(template?.from?.length ? { from: template.from } : {}),
        ...record,
        properties: { ...record.properties, ...Object.fromEntries(madeFrom(template)) },
      });
      const as = (m: (typeof r.made)[number], why?: string) => ({ place: m.number - 1, drawn: m.drawn, record: fromTemplate(numberedRecord(m.number, m.how, why)) });
      // (its valence as it was checked before it ran, where it was: never claimed where it was not)
      // (run with nothing asked first - in another step's run, as one before it: neither its valence nor its configurations left open looked at, and said so)
      const valence = said.length ? said : ["Valence not checked", "Configurations left open not looked for"];
      return { ok: true, holds: "structures", kept: r.made.map((m) => as(m)), aside: r.aside.map((m) => as(m, m.why)), said: [...r.said, ...valence].join(" \u00b7 "), core: r.core };
    }
    case "filter": {
      const options = optionsOf(kindInfo(kind).options ?? [], own);
      return filteredDrawn(entries, String(options.conditions ?? ""), options.match === "any" ? "any" : "all");
    }
    default:
      return { ok: false, said: "Meno does not do this itself on structures drawn" };
  }
}

/**
 * How a step done in turns goes: each turn as long as `slice` by the clock
 * `now` (milliseconds), the turns let go between (`pause`), told how many
 * entries it has been through at most every `tell` (`onDone`), and given
 * up where it is `stopped`.
 */
export type Turns = { onDone?: (done: number) => void; pause?: () => Promise<void>; slice?: number; tell?: number; now?: () => number; stopped?: () => boolean };

/**
 * `runMeno`, Duplicates done in turns that let the page go on between them
 * - thousands of conformers alike take seconds - saying after each how
 * many entries it has been through, and given up between two where it is
 * stopped: null. The other steps take no time to speak of, and are done
 * at once.
 */
export async function runMenoInTurns(kind: StepKind, entries: readonly SetEntry[], holds: Holds3D, own?: OptionValues, energiesBy?: string, how: Turns = {}, levels?: ReadonlyMap<number, string>): Promise<Outcome3D | null> {
  if (kind !== "duplicates" || !entries.length) return runMeno(kind, entries, holds, own, energiesBy, levels);
  const options = optionsOf(kindInfo(kind).options ?? [], own);
  const now = how.now ?? (() => performance.now());
  const least = how.slice ?? TURN_MS;
  let slice = least;
  let began = now();
  let told = began;
  const turns = duplicates(entries, holds, mirrorsOf(options), () => now() - began >= slice, options.within === "each value" ? String(options.groupBy ?? "") : undefined, levels);
  for (;;) {
    const turn = turns.next();
    if (turn.done) return turn.value;
    // (said at most so often: each saying draws the card again)
    if (now() - told >= (how.tell ?? TELL_MS)) {
      how.onDone?.(turn.value);
      told = now();
    }
    const left = now();
    await (how.pause ?? nextTurn)();
    if (how.stopped?.()) return null;
    began = now();
    // (the page's own turn taken into account - a frame drawn, say: each slice at least four times as long as it took, so that the work has four fifths of the time, up to TURN_MOST_MS, the page still answering within a frame or three)
    slice = Math.min(TURN_MOST_MS, Math.max(least, 4 * (began - left)));
  }
}

/** How long a turn of Duplicates' is before it lets the page go on, at least and at most, and how often at most it says how far it is, in milliseconds. */
export const TURN_MS = 11;
export const TURN_MOST_MS = 50;
export const TELL_MS = 100;

/**
 * The next turn of the page's - what waits to be drawn, or pointed at,
 * done first - by a message posted to itself: a timer of nought, set again
 * and again, is held to four milliseconds at the least, and the turns cost
 * more than the work.
 */
const nextTurn = () =>
  new Promise<void>((resolve) => {
    const { port1, port2 } = new MessageChannel();
    port1.onmessage = () => {
      port1.close();
      resolve();
    };
    port2.postMessage(null);
  });

/** What work done in turns comes to, done all at once. */
function drain<T>(turns: Generator<number, T>): T {
  for (;;) {
    const turn = turns.next();
    if (turn.done) return turn.value;
  }
}

/**
 * Whether two entries are of the same constitution: the same atoms, in the
 * same order, bonded the same way - and of the same charge and spin, as the
 * programs are told them (lib/io/writers `speciesOf`), so that a triplet is
 * never a conformer of its singlet.
 */
export function constitutionOf(e: Pick<SetEntry, "atoms" | "bonds" | "charge" | "multiplicity">): string {
  const atoms = e.atoms.map((a) => `${a.el}${a.charge ? `(${a.charge})` : ""}`).join(" ");
  const bonds = e.bonds
    .map((b) => `${Math.min(b.a1, b.a2)}-${Math.max(b.a1, b.a2)}:${b.order}`)
    .sort()
    .join(" ");
  return `${atoms}|${bonds}|${speciesOf(e)}`;
}

/**
 * An entry's charge and spin multiplicity, as the programs are told them
 * (lib/io/writers `speciesOf`): what a calculation it was read from said,
 * else what its atoms say. Entries that differ in them are different
 * species - an anion read from a calculation is no conformer of its neutral.
 */
function speciesOf(e: Pick<SetEntry, "atoms" | "charge" | "multiplicity" | "skeleton">): string {
  const atoms = e.atoms.map((a) => ({ el: a.el, x: 0, y: 0, z: 0, ...(a.charge ? { charge: a.charge } : {}), ...(a.radical ? { radical: a.radical } : {}) }));
  // (a skeleton's has none: such entries go together, as they are - their shapes alone are compared)
  const species = speciesBy({ atoms, bonds: [], ...(e.skeleton ? { skeleton: true } : {}) }, e);
  return species ? `${species.charge} ${species.multiplicity}` : "skeleton";
}

/**
 * `value` added to the group of `key` in `groups`, in place, and the groups
 * given back: grouping thousands of entries copied each group again for
 * every entry put in it, and took seconds at 20,000.
 */
export function pushTo<K, V>(groups: Map<K, V[]>, key: K, value: V): Map<K, V[]> {
  const group = groups.get(key);
  if (group) group.push(value);
  else groups.set(key, [value]);
  return groups;
}

/**
 * A compound set as a conformer set: entries of the same constitution and
 * the same stereoisomer (lib/entry `stereoIdentity`, from each one's own
 * geometry, asked before it runs: kinds `perceives`) as conformers of one
 * compound, numbered in the order they came - where each compound's
 * entries were made alike (entries `unlikeMade`): one calculation's
 * energies in one list, what made them said once. Else not at all, and
 * why: an entry whose stereoisomer is not known - not asked, not
 * perceived, or a centre left unspecified - is no conformer of a known
 * compound; constitution alone would sum diastereomers.
 */
function asConformers(entries: readonly SetEntry[]): Outcome3D {
  const unknown = entries.findIndex((e) => stereoIdentity(e.stereo) == null);
  if (unknown >= 0) {
    const st = entries[unknown].stereo;
    const why = !st ? "it has not been asked" : !st.perceived ? st.why : "a centre or double bond of it is left unspecified";
    return { ok: false, said: `Which stereoisomer entry ${unknown + 1} is is not known: ${why}` };
  }
  const groups = new Map<string, SetEntry[]>();
  for (const e of entries) pushTo(groups, `${constitutionOf(e)}|${stereoIdentity(e.stereo)}`, e);
  const unlike = [...groups.values()].map(unlikeMade);
  const first = unlike.findIndex((why) => why != null);
  if (first >= 0) return { ok: false, said: `Compound ${compoundLetter(first)}: ${unlike[first]}` };
  const kept = [...groups.values()].flatMap((g, compound) => g.map((e, i) => ({ ...e, compound, number: i + 1 })));
  return { ok: true, holds: "conformers", kept, aside: [], said: `${plural(groups.size, "compound")} · ${kept.length}` };
}

/** The entries of each compound, in the order they came. */
function byCompound(entries: readonly SetEntry[]): SetEntry[][] {
  const out = new Map<number, SetEntry[]>();
  for (const e of entries) pushTo(out, e.compound, e);
  return [...out.values()];
}

/** The properties a Filter's condition reads: its own, and the one it is compared with where it is another of the entry's. */
const namesOf = (c: Condition): string[] => ("its" in c ? [c.property, c.its] : [c.property]);

/**
 * Entries kept by conditions on their properties (lib/nodes `filter`), read
 * as each is an entry (`entryOfSet`): those that meet them, the rest set
 * aside - said, both counted, with why each of the rest was, an entry with
 * no value for a property named among them. A condition on a name that is
 * both Meno's own and one an entry carries of its own is refused, never
 * read as either.
 */
function filtered(entries: readonly SetEntry[], holds: Holds3D, text: string, match: "all" | "any"): Outcome3D {
  const read = conditionsIn(text);
  if ("why" in read) return { ok: false, said: read.why };
  // (a condition on a name that is Meno's and an entry's own too - "energy" given by a plugin as well: which is meant cannot be told, so it is not guessed)
  for (const name of read.conditions.flatMap(namesOf)) {
    const both = entries.filter((e) => shadowedIn(e).includes(name)).length;
    if (both) return { ok: false, said: `"${name}" is Meno's own, and ${both === 1 ? "1 entry carries one" : `${both} entries carry one`} of its own by that name too: which is meant cannot be told` };
  }
  // (a value of one that is no result - failed, not converged, its marks unread - is not to be trusted: on a condition on any
  //  value but its state, never kept, but set aside named, its state said; on its state alone it is judged by that)
  const onValues = read.conditions.some((c) => namesOf(c).some((n) => n !== "state"));
  const notResult = (x: { id: string }) => {
    const e = entries[Number(x.id)];
    const state = entryState(e);
    return state === FINISHED ? null : `${compoundLetter(e.compound)} #${e.number} ${state}`;
  };
  const out = filter(
    entries.map((e, i) => entryOfSet(e, String(i))),
    { conditions: read.conditions, match, ...(onValues ? { unread: notResult } : {}) },
  );
  if (!out.ok) return out;
  const back = (es: readonly { id: string }[]) => es.map((e) => entries[Number(e.id)]);
  return { ok: true, holds, kept: back(out.exits.kept), aside: back(out.exits.rest), said: out.said };
}

/**
 * *Filter* on structures drawn (lib/nodes `filter`): each read by its
 * record alone - the properties a step gave it (Descriptors' molecular
 * weight, a model's NLL), each with its unit and what worked it out - the
 * drawing itself not read. Those kept as they came, but for what an
 * earlier step said of them: kept, none is set aside. The rest each with
 * its record saying why - after why an earlier step set it aside, where
 * one did. One edited since its properties were given has none left to
 * read (workflow/entries `recordNow`): it goes to the rest saying so (its
 * record's `stale`), counted by that on the line.
 */
function filteredDrawn(entries: readonly DrawnEntry[], text: string, match: "all" | "any"): DrawnOutcome {
  const read = conditionsIn(text);
  if ("why" in read) return { ok: false, said: read.why };
  // (its state is Meno's on a structure drawn too: one its record carries of its own by that name cannot be told from it)
  if (read.conditions.some((c) => namesOf(c).includes("state"))) {
    const both = entries.filter((e) => e.record?.properties && "state" in e.record.properties).length;
    if (both) return { ok: false, said: `"state" is Meno's own, and ${both === 1 ? "1 structure carries one" : `${both} structures carry one`} of its own by that name too: which is meant cannot be told` };
  }
  // (edited since its properties were given: none to read. And one that failed is no result: on a condition on any value but
  //  its state never kept, but set aside named, its why said; on its state alone it is judged by that)
  const onValues = read.conditions.some((c) => namesOf(c).some((n) => n !== "state"));
  const unread = (x: { id: string }) => {
    const e = entries[Number(x.id)];
    if (e.record?.stale) return e.record.stale;
    const status = e.record?.status;
    return onValues && typeof status === "object" && "failed" in status ? `structure ${e.place + 1} failed: ${status.failed}` : null;
  };
  const out = filter(entries.map((e, i) => drawnAsEntry(e, String(i))), { conditions: read.conditions, match, unread });
  if (!out.ok) return out;
  // (kept: its record without the status it came in with - an earlier step's "aside" is not what this one says of it)
  const kept = out.exits.kept.map((e) => {
    const was = entries[Number(e.id)];
    const { status: _status, ...rest } = was.record ?? {};
    const { record: _record, ...drawn } = was;
    return Object.keys(rest).length ? { ...drawn, record: rest } : drawn;
  });
  // (set aside: why, on its record - after an earlier step's why, where one set it aside or it failed; its properties as they were)
  const aside = out.exits.rest.map((e) => {
    const was = entries[Number(e.id)];
    const now = typeof e.status === "object" && "aside" in e.status ? e.status.aside : "";
    const before = typeof was.record?.status === "object" ? ("aside" in was.record.status ? was.record.status.aside : was.record.status.failed) : "";
    // (an earlier why first - but once, where this one says it already)
    return { ...was, record: { ...was.record, status: { aside: before && !now.includes(before) ? `${before}; ${now}` : now } } };
  });
  return { ok: true, holds: "structures", kept, aside, said: out.said };
}

/** Where compounds have one conformer each, so that a window or shares over them can do nothing: how many, said after a step's line - none where none has. */
function onesSaid(entries: readonly SetEntry[]): string {
  const groups = byCompound(entries);
  const ones = groups.filter((g) => g.length === 1).length;
  if (!ones) return "";
  if (ones === groups.length) return groups.length === 1 ? " · the compound has one conformer" : " · each compound has one conformer";
  return ` · ${ones === 1 ? "1 compound has" : `${ones} compounds have`} one conformer`;
}

const NO_ENERGY: Outcome3D = { ok: false, said: "Not every entry has an energy" };

/** Whether an entry has an energy: one that is a number - NaN or an infinite one is none. */
const hasEnergy = (e: SetEntry): boolean => e.energy != null && Number.isFinite(e.energy);

/**
 * The energy a window or shares are worked out on (docs/WORKFLOWS.md,
 * *Which energy*): the free energy G, where every entry has one (entries
 * `freeEnergyOf`) and each compound's were all worked out alike - the same
 * temperature, pressure, solvent, program, method, basis and treatment
 * (lib/nodes `workedOutAs`) - at `kelvin`, where shares are asked at one;
 * else the electronic energy, and, where any had a G, why not it. Said
 * either way: which it was.
 */
type Basis = { energy: (e: SetEntry) => number | undefined; free: boolean; words: string };
function basisOf(entries: readonly SetEntry[], kelvin?: number, groups: readonly { said: string; entries: readonly SetEntry[] }[] = byCompound(entries).map((c) => ({ said: `compound ${compoundLetter(c[0].compound)}'s`, entries: c }))): Basis {
  const name = (e: SetEntry) => `${compoundLetter(e.compound)} #${e.number}`;
  const electronic = (why?: string): Basis => ({
    energy: (e) => (hasEnergy(e) ? e.energy : undefined),
    free: false,
    words: `electronic energies${why ? ` (not free energies: ${why})` : ""}`,
  });
  const g = new Map(entries.map((e) => [e, freeEnergyOf(e)]));
  if (![...g.values()].some(Boolean)) return electronic();
  const without = entries.find((e) => !g.get(e));
  if (without) return electronic(`${name(without)} has none`);
  for (const { said, entries: c } of groups) {
    const first = workedOutAs(g.get(c[0])!);
    for (const e of c.slice(1)) {
      const these = workedOutAs(g.get(e)!);
      const k = these.findIndex(([, v], i) => v !== first[i][1]);
      if (k >= 0) return electronic(`${said} differ in ${first[k][0]}: ${first[k][1]} (${name(c[0])}) and ${these[k][1]} (${name(e)})`);
    }
  }
  if (kelvin != null) {
    const off = entries.find((e) => g.get(e)!.at?.kelvin !== kelvin);
    if (off) {
      const at = g.get(off)!.at?.kelvin;
      return electronic(at == null ? `${name(off)}'s G states no temperature` : `${name(off)}'s G is at ${at} K, not ${kelvin} K`);
    }
  }
  const at = g.get(entries[0])!.at?.kelvin;
  const same = entries.every((e) => g.get(e)!.at?.kelvin === at);
  // (G given with nothing said of how - no temperature, program, method...: said so, never read as of known conditions)
  const unsaid = entries.every((e) => workedOutAs(g.get(e)!).every(([, v]) => v === "not stated" || v === "unknown"));
  const words = `free energies (G${kelvin == null && same && at != null ? `, ${at} K` : ""})${unsaid ? ", conditions not stated" : ""}`;
  return { energy: (e) => g.get(e)!.value as number, free: true, words };
}

/** Entries as a part of their compound's conformers (`SetEntry.partOf`). */
const asPart = (g: readonly SetEntry[]): SetEntry[] => g.map((e) => (e.partOf ? e : { ...e, partOf: true as const }));

/**
 * Each compound's conformers within `kcal` of its lowest; the rest set
 * aside. A compound split between the two, a part of it in each
 * (`partOf`); one all within, whole as it came.
 */
function energyWindow(entries: readonly SetEntry[], kcal: number, holds: Holds3D): Outcome3D {
  // (as Populations refuses a temperature it cannot use: a window below 0 would keep nothing, not even the lowest)
  if (!(Number.isFinite(kcal) && kcal >= 0)) return NO_WINDOW;
  // (molecules are no compound's conformers: each its own group, as Rank takes them, so none is outside its window - said, that the chemist names a property to take them together)
  if (holds !== "conformers") return { ok: true, holds, kept: [...entries], aside: [], said: `${entries.length} of ${countEntries(entries.length)} kept: each molecule is its own group` };
  const basis = basisOf(entries);
  if (!basis.free && !entries.every(hasEnergy)) return NO_ENERGY;
  // (one that did not converge is no minimum: its energy is where its optimisation stopped. One its calculation found
  //  imaginary frequencies of - a transition state, a saddle point - is none either, on electronic energies as on free
  //  ones: kept in a window, or set aside from it, as if it were a conformer, it would stand for a population it has not)
  const unconverged = notAllMinima(entries);
  if (unconverged) return { ok: false, said: unconverged };
  const kept: SetEntry[] = [];
  const aside: SetEntry[] = [];
  for (const g of byCompound(entries)) {
    const lowest = least(g.map((e) => basis.energy(e)!));
    const within = g.filter((e) => (basis.energy(e)! - lowest) * KCAL_PER_HARTREE <= kcal + 1e-9);
    const out = g.filter((e) => !within.includes(e));
    kept.push(...(out.length ? asPart(within) : within));
    aside.push(...asPart(out));
  }
  return { ok: true, holds: "conformers", kept, aside, said: `${kept.length} of ${entries.length} kept, on ${basis.words}${onesSaid(entries)}` };
}

const NO_WINDOW: Outcome3D = { ok: false, said: "The window must be 0 kcal/mol or more" };

/** What an entry is, as its frequencies say: a saddle point where it has an imaginary one, a minimum where they were worked out with none, else not known (entries `imaginaryOf`). */
const kindOf = (e: SetEntry): "minimum" | "saddle point" | "not known" => {
  const im = imaginaryOf(e);
  return im === "not computed" ? "not known" : im.length ? "saddle point" : "minimum";
};
/** An entry as a step's line names it: its compound's letter and its number ("b #2"). */
const named = (e: SetEntry) => `${compoundLetter(e.compound)} #${e.number}`;

/**
 * Entries within `kcal` of the lowest of those with the same value of
 * `name` (*Within: Each value of a property* - a path, a product): each
 * group's lowest and those near it kept, the rest set aside, each saying
 * how far above it. One without that property, or without an energy, is
 * set aside saying so - never taken into a group, nor left out unsaid.
 * Entries that are no result are refused, named, as the window over
 * compounds refuses them; a saddle point is not - which entries should be
 * transition states is the chemist's to say (a window over each product's
 * transition states, say). The energy is chosen as over compounds
 * (`basisOf`), each group's values alike.
 */
function energyWindowByValue(entries: readonly SetEntry[], holds: Holds3D, kcal: number, groupBy: string): Outcome3D {
  if (!(Number.isFinite(kcal) && kcal >= 0)) return NO_WINDOW;
  const name = groupBy.trim();
  if (!name) return { ok: false, said: "Name the property whose values are the groups" };
  const failed = notResults(entries, (k) => compoundLetter(entries[k].compound));
  if (failed) return { ok: false, said: failed };
  const keys = valueKeysOf(entries.map((e, i) => entryOfSet(e, String(i))), name);
  const why = new Map<SetEntry, string>();
  entries.forEach((e, i) => keys[i] == null && why.set(e, `it has no ${name}`));
  const valued = entries.filter((_, i) => keys[i] != null);
  const groups = new Map<string, SetEntry[]>();
  valued.forEach((e) => pushTo(groups, keys[entries.indexOf(e)]!, e));
  const basis = basisOf(valued, undefined, [...groups.entries()].map(([key, g]) => ({ said: `the ${name} ${key}'s`, entries: g })));
  const kept: SetEntry[] = [];
  // (a window means something within one kind: minima, or saddle points - one of each in a group is refused for that group, and one whose kind is not known beside one whose is; a group none of whose is known is windowed, and the line says so)
  let unknown = 0;
  for (const [key, g] of groups) {
    const kinds = g.map((e) => kindOf(e));
    const unlike = kinds.includes("minimum") && kinds.includes("saddle point") ? `its ${name} ${key} holds minima and saddle points together: not windowed against each other` : null;
    const open = kinds.includes("not known") && kinds.some((k) => k !== "not known") ? `in its ${name} ${key}, whether ${named(g[kinds.indexOf("not known")])} is a minimum or a saddle point is not known (no frequencies)` : null;
    if (unlike ?? open) {
      for (const e of g) why.set(e, (unlike ?? open)!);
      continue;
    }
    if (kinds.every((k) => k === "not known")) unknown++;
    const has = g.filter((e) => basis.energy(e) != null);
    for (const e of g) if (basis.energy(e) == null) why.set(e, "it has no energy");
    if (!has.length) continue;
    const lowest = least(has.map((e) => basis.energy(e)!));
    for (const e of has) {
      const above = (basis.energy(e)! - lowest) * KCAL_PER_HARTREE;
      if (above <= kcal + 1e-9) kept.push(e);
      else why.set(e, `${numberText(above, 2)} kcal/mol above the lowest of its ${name}`);
    }
  }
  // (a compound's conformers split between the two exits: a part of it in each, as over compounds)
  const outOf = new Set(entries.filter((e) => why.has(e)).map((e) => e.compound));
  const inOf = new Set(kept.map((e) => e.compound));
  const part = (e: SetEntry): SetEntry => (holds === "conformers" && outOf.has(e.compound) && inOf.has(e.compound) ? { ...e, partOf: true as const } : e);
  const keptOut = entries.filter((e) => !why.has(e)).map(part);
  const aside = entries.filter((e) => why.has(e)).map((e) => withSaid(part(e), SET_ASIDE, why.get(e)!));
  const counts = new Map<string, number>();
  for (const w of why.values()) {
    const k = /kcal\/mol above/.test(w) ? "outside the window" : w;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  // (the reasons counted only where any is more than being outside it - its exit says that much, and each entry its own)
  const only = counts.size === 1 && counts.has("outside the window");
  const rest = aside.length ? ` · rest ${aside.length}${only ? "" : ` (${[...counts].map(([w, n]) => `${n}: ${w}`).join("; ")})`}` : "";
  const kinds = unknown ? ` · ${unknown === groups.size ? "whether minima or saddle points not known" : `${unknown} of ${groups.size} ${name}s: whether minima or saddle points not known`} (no frequencies)` : "";
  return { ok: true, holds, kept: keptOut, aside, said: `${keptOut.length} of ${countEntries(entries.length)} kept, on ${basis.words}${rest}${kinds}` };
}

/** How Duplicates takes a conformer's mirror image, in an achiral molecule: kept apart (the default), or counted in its twin. */
type Mirrors = "apart" | "counted";
const mirrorsOf = (options: OptionValues): Mirrors => (options.mirrors === "counted" ? "counted" : "apart");

/**
 * Each entry unlike the others kept: an entry that is the same conformer as
 * one kept before it (workflow/sameConformer: all atoms within 0.01 Å, over
 * the ways the molecule maps onto itself, never reflected) is set aside.
 * Taken lowest energy first where all have one, else in order. In a
 * conformer set they are compared within each compound; in a compound set,
 * each with those of the same atoms, bonded alike, in the same order - a
 * structure there twice is the same structure, not two compounds. Never
 * two of different charge or spin: they are different species, however
 * alike in shape.
 *
 * A conformer's mirror image (the maintainer, 2026-10-22) is kept apart -
 * an atom's average over both needs both: enantiotopic atoms swap values
 * between them - unless `mirrors` is `counted`: then it is counted in the
 * one kept, whose degeneracy it adds to (2, as a rule), the atoms the
 * mirror image swaps kept with it (`SetEntry.mirror`) so that an average by
 * atom can still be made. Only of one stereoisomer - a chiral molecule's
 * mirror image is its enantiomer, never counted in - so each entry's must
 * be known, or nothing is done.
 *
 * In a conformer set, those set aside are a part of their compound's
 * conformers (`partOf`); those kept, the compound as it came, its copies
 * merged. In a compound set they are copies of a structure, of no search.
 */
function* duplicates(entries: readonly SetEntry[], holds: Holds3D, mirrors: Mirrors, due: () => boolean, groupBy?: string, levels?: ReadonlyMap<number, string>): Generator<number, Outcome3D> {
  if (mirrors === "counted") {
    const unknown = entries.findIndex((e) => stereoIdentity(e.stereo) == null);
    if (unknown >= 0) return { ok: false, said: `Which stereoisomer entry ${unknown + 1} is is not known: a mirror image is counted in only where it is the same stereoisomer` };
  }
  // (in each value of a property - a product, a path - across compounds: each saddle point its own compound, the same one found by two paths is two entries of one value)
  const by = groupBy?.trim();
  if (groupBy != null && !by) return { ok: false, said: "Name the property whose values are the groups" };
  const why = new Map<SetEntry, string>();
  let unknownKinds = 0;
  let valued = entries;
  let valueOf = new Map<SetEntry, string | undefined>();
  let keyOf = (e: SetEntry) => `${holds === "conformers" ? `#${e.compound}` : `${atomsOf(e)}|${bondsOf(e)}`}|${speciesOf(e)}`;
  if (by) {
    const failed = notResults(entries, (k) => compoundLetter(entries[k].compound));
    if (failed) return { ok: false, said: failed };
    const keys = valueKeysOf(entries.map((e, i) => entryOfSet(e, String(i))), by);
    valueOf = new Map(entries.map((e, i) => [e, keys[i]]));
    for (const e of entries) if (valueOf.get(e) == null) why.set(e, `it has no ${by}`);
    // (a comparison means something within one kind, as a window does: minima and saddle points of one value are set aside together, and one whose kind is not known beside one whose is)
    const ofValue = new Map<string, SetEntry[]>();
    for (const e of entries) if (valueOf.get(e) != null) pushTo(ofValue, valueOf.get(e)!, e);
    for (const [key, g] of ofValue) {
      const kinds = g.map(kindOf);
      const unlike = kinds.includes("minimum") && kinds.includes("saddle point") ? `its ${by} ${key} holds minima and saddle points together: not compared with each other` : null;
      const open = kinds.includes("not known") && kinds.some((k) => k !== "not known") ? `in its ${by} ${key}, whether ${named(g[kinds.indexOf("not known")])} is a minimum or a saddle point is not known (no frequencies)` : null;
      if (unlike ?? open) for (const e of g) why.set(e, (unlike ?? open)!);
      else if (kinds.every((k) => k === "not known")) unknownKinds++;
    }
    valued = entries.filter((e) => !why.has(e));
    keyOf = (e: SetEntry) => `${valueOf.get(e)}|${atomsOf(e)}|${bondsOf(e)}|${speciesOf(e)}`;
  }
  const energies = valued.every(hasEnergy);
  const groups = [...valued.reduce((m, e) => pushTo(m, keyOf(e), e), new Map<string, SetEntry[]>()).values()];
  // (across compounds, of those alike - first found so, as they came - the lower is kept only where their energies were
  //  worked out alike: across paths they need not be. Free energies where each has one, else electronic, as Energy
  //  window's basis; energies of two levels never decide, those alike set aside saying how they differ - those unlike
  //  any other kept, whatever their level. Where one of those alike has no energy, the first kept, the line saying so)
  let asCame = 0;
  // (ranked by energy, which copy is kept is the lowest's: one that is no minimum - not converged, a saddle point, its
  //  marks not read - would be kept for an energy that is not a minimum's. Refused, naming it, as Populations does; in
  //  each value of a property, saddle points are compared with saddle points, as the kinds above are kept apart)
  const notMinimum = energies && !by ? notAllMinima(entries) : null;
  if (notMinimum) return { ok: false, said: notMinimum };
  const kept = new Map<SetEntry, { degeneracy: number; mirror?: number[] }>();
  let done = 0;
  let counted = 0;
  // (compounds with too many ways onto themselves to try, taken atom against atom: a duplicate of one could be missed - said)
  let capped = 0;
  for (const g of groups) {
    const same = new Sameness(g[0].atoms, g[0].bonds, g[0].xyz);
    if (same.capped && g.length > 1) capped++;
    const here: { e: SetEntry; sig: Float64Array }[] = [];
    let order: readonly SetEntry[] = energies ? [...g].sort((p, q) => p.energy! - q.energy!) : g;
    if (by) {
      const seeds: { e: SetEntry; sig: Float64Array; members: SetEntry[] }[] = [];
      for (const e of g) {
        if (done > 0 && due()) yield done;
        done++;
        const sig = same.signature(e.xyz);
        const seed = seeds.find((k) => same.bound(k.sig, sig) <= SAME_CONFORMER + 1e-9 && same.same(k.e.xyz, e.xyz));
        if (seed) seed.members.push(e);
        else seeds.push({ e, sig, members: [e] });
      }
      order = seeds.flatMap(({ members }) => {
        if (members.length === 1) return members;
        const level = members.every(hasEnergy) ? levelsOf(members, levels) : null;
        if (level && "unlike" in level) {
          for (const e of members) why.set(e, `in its ${by} ${valueOf.get(e)}, ${LOWER_UNKNOWN}: ${level.unlike}`);
          return [];
        }
        const first = level ? members.reduce((a, b) => (level.energy(b) < level.energy(a) ? b : a)) : members[0];
        if (!level) asCame++;
        for (const e of members) if (e !== first) why.set(e, `the same as ${named(first)}, which was kept`);
        return [first];
      });
    }
    for (const e of order) {
      if (done > 0 && due()) yield done;
      if (!by) done++;
      const sig = same.signature(e.xyz);
      // (only those it could be within reach of: a mirror image's atoms lie as far from its centre)
      const near = here.filter((k) => same.bound(k.sig, sig) <= SAME_CONFORMER + 1e-9);
      const twinOf = near.find((k) => same.same(k.e.xyz, e.xyz));
      if (twinOf) {
        if (by) why.set(e, `the same as ${named(twinOf.e)}, which was kept`);
        continue;
      }
      if (mirrors === "counted") {
        const twin = near.find((k) => !kept.get(k.e)!.mirror && stereoIdentity(k.e.stereo) === stereoIdentity(e.stereo) && same.mirrorOf(k.e.xyz, e.xyz));
        if (twin) {
          const k = kept.get(twin.e)!;
          k.mirror = same.mirrorOf(twin.e.xyz, e.xyz)!.to;
          k.degeneracy += e.degeneracy ?? 1;
          counted++;
          continue;
        }
      }
      here.push({ e, sig });
      kept.set(e, { degeneracy: e.degeneracy ?? 1 });
    }
  }
  // (in the order they came; counted in, each kept says how many it stands for - every one, so that Populations counts them)
  const keptOnes = entries.filter((e) => kept.has(e)).map((e) => {
    const k = kept.get(e)!;
    return mirrors === "counted" ? { ...e, degeneracy: k.degeneracy, ...(k.mirror ? { mirror: k.mirror } : {}) } : e;
  });
  // (those alike, the copies taken out - in a conformer set, a part of its compound's conformers; in a compound set, copies of a
  // structure, of no search, as they came)
  const alike = entries.filter((e) => !kept.has(e));
  const twins = counted ? ` · ${counted} mirror image${counted === 1 ? "" : "s"} counted in (degeneracy 2)` : "";
  const cap = capped ? ` \u00b7 ${cappedSaid(capped)}` : "";
  if (!by) {
    const aside = holds === "conformers" ? asPart(alike) : alike;
    return { ok: true, holds, kept: keptOnes, aside, said: `${keptOnes.length} of ${entries.length} kept${onesSaid(entries)}${twins}${cap}` };
  }
  // (each set aside saying why - the one it is the same as, named; a compound's conformers split between the two exits, a part of it in each)
  const outOf = new Set(alike.map((e) => e.compound));
  const inOf = new Set(keptOnes.map((e) => e.compound));
  const part = (e: SetEntry): SetEntry => (holds === "conformers" && outOf.has(e.compound) && inOf.has(e.compound) ? { ...e, partOf: true as const } : e);
  const aside = alike.map((e) => withSaid(part(e), SET_ASIDE, why.get(e) ?? "the same as one kept"));
  const counts = new Map<string, number>();
  for (const e of alike) {
    const w = why.get(e) ?? "";
    const k = w.startsWith("the same as ") ? "the same as one kept" : w.includes(LOWER_UNKNOWN) ? "alike, energies at different levels" : w;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  // (the reasons counted only where any is more than being alike: its exit is named *Alike*, and each says which it is the same as)
  const only = counts.size === 1 && counts.has("the same as one kept");
  const rest = alike.length ? ` · rest ${alike.length}${only ? "" : ` (${[...counts].map(([w, n]) => `${n}: ${w}`).join("; ")})`}` : "";
  const kinds = unknownKinds ? ` · whether minima or saddle points not known (no frequencies)` : "";
  const first = asCame ? ` · where one of those alike has no energy, the first kept` : "";
  return { ok: true, holds, kept: keptOnes.map(part), aside, said: `${keptOnes.length} of ${countEntries(entries.length)} kept${rest}${first}${twins}${cap}${kinds}` };
}

/** Why those alike across compounds are set aside, before how their energies differ (`levelsOf`): the line counts them under one reason. */
const LOWER_UNKNOWN = "alike, but which is lower is not known";

/**
 * How entries' energies were worked out, where Duplicates keeps the lower
 * of those alike across compounds: their free energies, where each has one
 * worked out the same way (`workedOutAs`); else their electronic energies,
 * where each molecule's calculation (`levels`, by molecule id - its program
 * and level, `energyLevels`) is the same, or none says one. Else how two
 * differ - "free energies differ in method, M1 (b #1) and M2 (c #1)".
 */
function levelsOf(g: readonly SetEntry[], levels?: ReadonlyMap<number, string>): { energy: (e: SetEntry) => number } | { unlike: string } {
  const free = g.map(freeEnergyOf);
  if (free.every(Boolean)) {
    const first = workedOutAs(free[0]!);
    for (let i = 1; i < g.length; i++) {
      const these = workedOutAs(free[i]!);
      const k = these.findIndex(([, v], j) => v !== first[j][1]);
      if (k >= 0) return { unlike: `free energies differ in ${first[k][0]}, ${first[k][1]} (${named(g[0])}) and ${these[k][1]} (${named(g[i])})` };
    }
    return { energy: (e) => freeEnergyOf(e)!.value as number };
  }
  const level = (e: SetEntry) => (e.from != null ? levels?.get(e.from) : undefined) ?? "not stated";
  const k = g.findIndex((e) => level(e) !== level(g[0]));
  if (k >= 0) return { unlike: `energies differ in level, ${level(g[0])} (${named(g[0])}) and ${level(g[k])} (${named(g[k])})` };
  return { energy: (e) => e.energy! };
}

const atomsOf = (e: SetEntry) => e.atoms.map((a) => a.el).join(" ");
const bondsOf = (e: SetEntry) => e.bonds.map((b) => `${Math.min(b.a1, b.a2)}-${Math.max(b.a1, b.a2)}:${b.order}`).sort().join(" ");

/**
 * Of `order` - entries of the same atoms in the same order - those kept,
 * each unlike every one kept before it: its RMSD after the best fit to
 * each above `most`. Each is laid over only those kept that could be
 * within `most` of it, by two bounds the RMSD is never below (its atoms
 * taken in their own order, rmsd.ts): the difference of their radii of
 * gyration, and, atom by atom, of their distances from their middles - so
 * none alike is missed. Laid over every one kept, thousands of distinct
 * conformers took minutes. `measure` is the RMSD (counted, in a test).
 */
export function keptApart(order: readonly SetEntry[], most: number, measure: (p: readonly number[], q: readonly number[]) => number = rmsd): SetEntry[] {
  return drain(keptApartInTurns(order, most, measure, never));
}

/** A turn that is never over: work done at once. */
const never = () => false;

/** `keptApart`, in turns, each over once it is `due`: after each, how many of `order` it has been through. */
function* keptApartInTurns(order: readonly SetEntry[], most: number, measure: (p: readonly number[], q: readonly number[]) => number, due: () => boolean): Generator<number, SetEntry[]> {
  // (bounds worked out in floating point, given a hair's room: one alike by a hair is never passed over)
  const reach = most + 1e-9;
  const kept: { e: SetEntry; radii: Float64Array; rg: number }[] = [];
  const out: SetEntry[] = [];
  // (the first kept whose radius of gyration is at least `rg`: those kept are in that order)
  const from = (rg: number) => {
    let lo = 0;
    let hi = kept.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (kept[mid].rg < rg) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  for (const [done, e] of order.entries()) {
    if (done > 0 && due()) yield done;
    const shape = shapeOf(e.xyz);
    let alike = false;
    for (let j = from(shape.rg - reach); j < kept.length && kept[j].rg <= shape.rg + reach && !alike; j++) {
      const k = kept[j];
      if (apartAtLeast(k.radii, shape.radii) > reach) continue;
      alike = measure(k.e.xyz, e.xyz) <= most;
    }
    if (alike) continue;
    kept.splice(from(shape.rg), 0, { e, ...shape });
    out.push(e);
  }
  return out;
}

/** A geometry's atoms' distances from its middle, in their order, and its radius of gyration. */
function shapeOf(xyz: readonly number[]): { radii: Float64Array; rg: number } {
  const n = xyz.length / 3;
  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (let i = 0; i < n; i++) {
    cx += xyz[3 * i];
    cy += xyz[3 * i + 1];
    cz += xyz[3 * i + 2];
  }
  cx /= n;
  cy /= n;
  cz /= n;
  const radii = new Float64Array(n);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const r = Math.hypot(xyz[3 * i] - cx, xyz[3 * i + 1] - cy, xyz[3 * i + 2] - cz);
    radii[i] = r;
    sum += r * r;
  }
  return { radii, rg: n ? Math.sqrt(sum / n) : 0 };
}

/** The least RMSD two geometries could have after any fit, from their atoms' distances from their middles: each atom at least as far from its fellow as their distances differ. */
function apartAtLeast(p: Float64Array, q: Float64Array): number {
  let sum = 0;
  for (let i = 0; i < p.length; i++) sum += (p[i] - q[i]) ** 2;
  return p.length ? Math.sqrt(sum / p.length) : 0;
}

/**
 * Why `entries` cannot be weighed against one another by their energies,
 * where one is no result to stand on or no minimum: every one that failed,
 * by any kind, or whose file's marks did not read (`notResults`) - then
 * every one its calculation judged has an imaginary frequency (the
 * maintainer, 2026-10-22: each program's own judgement of which are
 * imaginary) - each named, for the chemist to take it out. Null where none
 * is.
 */
export function notAllMinima(entries: readonly SetEntry[]): string | null {
  const name = (e: SetEntry) => `${compoundLetter(e.compound)} #${e.number}`;
  const failed = notResults(entries, (k) => compoundLetter(entries[k].compound));
  if (failed) return failed;
  const saddles = entries.filter((x) => x.imaginary?.length).map((e) => `${name(e)} has ${imaginaryWords(e.imaginary!)}`);
  if (!saddles.length) return null;
  return saddles.length === 1 ? `${saddles[0]}: it is no minimum - take it out first` : `${saddles.join("; ")}: they are no minima - take them out first`;
}

/**
 * Of entries a value is read from as a result - an energy diagram's levels
 * - those that are none: one that failed, by any kind (not converged,
 * refused, an error...), or whose file's marks did not read
 * (`MARKS_UNREAD`) - each named by `name` and its number, in the words a
 * step's line counts them in (`FAILURE_WORDS`), for the chemist to take it
 * out first. As `notAllMinima` refuses for Energy window and Populations,
 * but every one named, and every kind of failure: a level's lowest may be
 * the one that failed, and the lowest of the rest is then not its energy.
 * A Filter on the entries' state takes them out (`STATE_FINISHED`).
 * Imaginary frequencies are not among them: which level should be a saddle
 * point is the chemist's to say. Null where none is.
 */
/** The condition that keeps only the entries that are results to stand on, as a Filter is given it (entries `entryState`, `STATE_FINISHED`). */
export { STATE_FINISHED };

export function notResults(entries: readonly SetEntry[], name: (k: number) => string): string | null {
  const bad = entries.flatMap((e, k) =>
    e.failed ? [`${name(k)} #${e.number} ${FAILURE_WORDS[e.failed.kind] ?? e.failed.kind}`] : e.marksUnread ? [`${name(k)} #${e.number}: ${MARKS_UNREAD}`] : [],
  );
  return bad.length ? `Not every entry is a result to stand on: ${bad.join("; ")} - take ${bad.length === 1 ? "it" : "them"} out first (a Filter on "${STATE_FINISHED}")` : null;
}

/**
 * Each conformer's Boltzmann population within its compound at `kelvin`.
 * Of a part of a search's conformers (`partOf`), shares over those given,
 * and it says so: they are not the compound's populations.
 */
function populations(entries: readonly SetEntry[], kelvin: number): Outcome3D {
  // (at 0 K or below there are no shares to give: all would be 0/0, or the highest energy the most - and none at no number of kelvins, or infinitely many)
  if (!(kelvin > 0 && Number.isFinite(kelvin))) return { ok: false, said: "The temperature must be above 0 K" };
  const basis = basisOf(entries, kelvin);
  if (!basis.free && !entries.every(hasEnergy)) return NO_ENERGY;
  // (a saddle point's energy weighed as a minimum's would be a population of nothing: refused, naming it)
  const saddle = notAllMinima(entries);
  if (saddle) return { ok: false, said: saddle };
  const shares = new Map<SetEntry, number>();
  for (const g of byCompound(entries)) {
    // (each counted as many times as its conformer search found it alike, where it said: as CREST's own weights are)
    const w = boltzmann(g.map((e) => basis.energy(e)!), kelvin, g.every((e) => e.degeneracy != null) ? g.map((e) => e.degeneracy!) : undefined);
    g.forEach((e, i) => shares.set(e, w[i]));
  }
  const groups = byCompound(entries);
  // (shares over a part of a search's conformers are not the compound's populations: said so, next to the temperature)
  const parts = groups.filter((g) => g.some((e) => e.partOf));
  const over = !parts.length
    ? ""
    : groups.length === 1
      ? ` · shares over the ${plural(entries.length, "conformer")} given, part of a search`
      : ` · ${parts.length} of them part of a search, shares over the conformers given`;
  return {
    ok: true,
    holds: "conformers",
    kept: [...entries],
    aside: [],
    shares: entries.map((e) => shares.get(e)!),
    // (which energy they are of - free energies, or electronic ones and why not free: said, so that the one is never read as the other)
    said: `${plural(groups.length, "compound")} at ${kelvin} K, from ${basis.words}${onesSaid(entries)}${over}`,
  };
}

/**
 * One conformer of each compound, chosen on purpose (docs/WORKFLOWS.md,
 * *Kinds of step*): its lowest in energy - or, given `number`, the one of
 * that number - as a compound of its own; the rest set aside, each a part
 * of its compound's conformers where it had more than one. What it says
 * names the one chosen, of how many, and what the energies it was ranked
 * by are (`by`: the program and method that worked them out).
 */
function chooseOne(entries: readonly SetEntry[], number: number | null, by?: string): Outcome3D {
  if (number == null && !entries.every(hasEnergy)) return NO_ENERGY;
  // (the lowest chosen is the lowest minimum: one that is no minimum is refused, naming it - chosen by number, any may be)
  const notMinimum = number == null ? notAllMinima(entries) : null;
  if (notMinimum) return { ok: false, said: notMinimum };
  const kept: SetEntry[] = [];
  const aside: SetEntry[] = [];
  const groups = byCompound(entries);
  for (const g of groups) {
    const chosen = number == null ? g.reduce((a, b) => (b.energy! < a.energy! ? b : a)) : g.find((e) => e.number === number);
    if (!chosen) return { ok: false, said: `${compoundLetter(g[0].compound)} has no conformer ${number}` };
    // (one of several, and the others: each a part of the compound's conformers)
    kept.push({ ...chosen, compound: kept.length, ...(g.length > 1 ? { partOf: true as const } : {}) });
    aside.push(...asPart(g.filter((e) => e !== chosen)));
  }
  const which = number == null ? "lowest" : "chosen";
  const said =
    groups.length === 1 ? `#${kept[0].number} of ${entries.length}, ${which}` : `${plural(groups.length, "compound")}, each its ${number == null ? "lowest" : `#${number}`}`;
  return { ok: true, holds: "molecules", kept, aside, said: by && number == null ? `${said} · ${by}` : said };
}

