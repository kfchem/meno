/**
 * The steps Meno does itself (docs/WORKFLOWS.md, *Who does a step*), on a
 * set's entries alone: *As conformers*, *Energy window*, *Duplicates*,
 * *Populations* and *Choose one* - written for Meno from the specification and the
 * published methods. Each takes the entries that came in and says which
 * it keeps, which it sets aside, and what it found; or why it could not.
 */
import { speciesOf as speciesBy } from "../../../../lib/io/writers";
import { stereoIdentity, type Entry } from "../../../../lib/entry";
import type { OptionValues } from "../../../../lib/options";
import { compoundLetter, entryOfSet, entryState, FINISHED, MARKS_UNREAD, numberedRecord, shadowedIn, unlikeMade, type DrawnEntry, type SetEntry } from "./entries";
import { conditionsIn, filter } from "../../../../lib/nodes/filter";
import { enumerated } from "./enumerate";
import { positionIds, substituted } from "./substituents";
import type { StyleChoice } from "../../../../lib/chem/style";
import type { SeriesCore } from "../store/types";
import { kindInfo, optionsOf, type Holds3D, type StepKind } from "./kinds";
import { rmsd } from "./rmsd";
import { cappedSaid, SAME_CONFORMER, Sameness } from "./sameConformer";
import { least } from "../../../../lib/chem/lists";
import { boltzmann } from "../../../../lib/boltzmann";
import { factor } from "../../../../lib/units";
import { imaginaryWords } from "../../../../lib/calc/output";
import { FAILURE_WORDS } from "./failures";

/** Kilocalories per mole in a hartree (Meno's units table). */
const KCAL_PER_HARTREE = factor("Eh", "kcal/mol");

/** What a step did: the entries it kept - with their shares, where it found them - and those it set aside, as a set that holds `holds`; or why it could not. */
export type Outcome = Outcome3D | DrawnOutcome;
/** What a step did on molecules in 3D (`Outcome`). */
export type Outcome3D =
  | { ok: true; holds: Holds3D; kept: SetEntry[]; aside: SetEntry[]; shares?: number[]; said: string }
  | { ok: false; said: string };
/** What a step did on structures drawn: those it kept and those it set aside, each as drawn (`DrawnEntry`); or why it could not. */
export type DrawnOutcome = { ok: true; holds: "structures"; kept: DrawnEntry[]; aside: DrawnEntry[]; said: string; core?: SeriesCore } | { ok: false; said: string };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** A Meno step of `kind` on `entries`, of a set that holds `holds`, with its options (over its kind's defaults) - and what their energies are, where it ranks by them (`energiesBy`). */
export function runMeno(kind: StepKind, entries: readonly SetEntry[], holds: Holds3D, own?: OptionValues, energiesBy?: string): Outcome3D {
  if (!entries.length) return { ok: false, said: "Nothing came in" };
  const options = optionsOf(kindInfo(kind).options ?? [], own);
  switch (kind) {
    case "as-conformers":
      return asConformers(entries);
    case "energy-window":
      return energyWindow(entries, Number(options.window));
    case "duplicates":
      return drain(duplicates(entries, holds, mirrorsOf(options), never));
    case "populations":
      return populations(entries, Number(options.temperature));
    case "choose":
      return chooseOne(entries, options.which === "number" ? Number(options.number) : null, energiesBy);
    case "filter":
      return filtered(entries, holds, String(options.conditions ?? ""), options.match === "any" ? "any" : "all");
    default:
      return { ok: false, said: "Meno does not do this itself" };
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
      const as = (m: (typeof r.made)[number], why?: string) => ({ place: m.number - 1, drawn: m.drawn, record: numberedRecord(m.number, m.how, why) });
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
export async function runMenoInTurns(kind: StepKind, entries: readonly SetEntry[], holds: Holds3D, own?: OptionValues, energiesBy?: string, how: Turns = {}): Promise<Outcome3D | null> {
  if (kind !== "duplicates" || !entries.length) return runMeno(kind, entries, holds, own, energiesBy);
  const options = optionsOf(kindInfo(kind).options ?? [], own);
  const now = how.now ?? (() => performance.now());
  const least = how.slice ?? TURN_MS;
  let slice = least;
  let began = now();
  let told = began;
  const turns = duplicates(entries, holds, mirrorsOf(options), () => now() - began >= slice);
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
  for (const c of read.conditions) {
    const both = entries.filter((e) => shadowedIn(e).includes(c.property)).length;
    if (both) return { ok: false, said: `"${c.property}" is Meno's own, and ${both === 1 ? "1 entry carries one" : `${both} entries carry one`} of its own by that name too: which is meant cannot be told` };
  }
  // (a value of one that is no result - failed, not converged, its marks unread - is not to be trusted: on a condition on any
  //  value but its state, never kept, but set aside named, its state said; on its state alone it is judged by that)
  const onValues = read.conditions.some((c) => c.property !== "state");
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
  if (read.conditions.some((c) => c.property === "state")) {
    const both = entries.filter((e) => e.record?.properties && "state" in e.record.properties).length;
    if (both) return { ok: false, said: `"state" is Meno's own, and ${both === 1 ? "1 structure carries one" : `${both} structures carry one`} of its own by that name too: which is meant cannot be told` };
  }
  // (edited since its properties were given: none to read. And one that failed is no result: on a condition on any value but
  //  its state never kept, but set aside named, its why said; on its state alone it is judged by that)
  const onValues = read.conditions.some((c) => c.property !== "state");
  const unread = (x: { id: string }) => {
    const e = entries[Number(x.id)];
    if (e.record?.stale) return e.record.stale;
    const status = e.record?.status;
    return onValues && typeof status === "object" && "failed" in status ? `structure ${e.place + 1} failed: ${status.failed}` : null;
  };
  const out = filter(entries.map(recordAsEntry), { conditions: read.conditions, match, unread });
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

/**
 * A structure drawn as Filter reads it, by its place: its record's
 * properties, what it was made from and its status - its drawing no part
 * of it (no structure, no geometry) - and Meno's `state` of it: "failed:
 * <why>" where its record says it failed, else finished (one an earlier
 * step set aside - the same as another - is no failure).
 */
const recordAsEntry = (e: DrawnEntry, i: number): Entry => {
  const status = e.record?.status;
  const state = typeof status === "object" && "failed" in status ? `failed: ${status.failed}` : FINISHED;
  return {
    id: String(i),
    from: e.record?.from ?? [],
    structure: { atoms: [], bonds: [] },
    geometry: { kind: "none" },
    species: null,
    properties: { ...e.record?.properties, state: { value: state, unit: "none", status: "computed" } },
    status: status ?? "done",
  };
};

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

/** Entries as a part of their compound's conformers (`SetEntry.partOf`). */
const asPart = (g: readonly SetEntry[]): SetEntry[] => g.map((e) => (e.partOf ? e : { ...e, partOf: true as const }));

/**
 * Each compound's conformers within `kcal` of its lowest; the rest set
 * aside. A compound split between the two, a part of it in each
 * (`partOf`); one all within, whole as it came.
 */
function energyWindow(entries: readonly SetEntry[], kcal: number): Outcome3D {
  // (as Populations refuses a temperature it cannot use: a window below 0 would keep nothing, not even the lowest)
  if (!(Number.isFinite(kcal) && kcal >= 0)) return { ok: false, said: "The window must be 0 kcal/mol or more" };
  if (!entries.every(hasEnergy)) return NO_ENERGY;
  // (one that did not converge is no minimum: its energy is where its optimisation stopped. Its imaginary
  //  frequencies are another matter: they would refuse it where the window is on free energies, which it is not)
  const unconverged = notAllMinima(entries.filter((e) => e.failed?.kind === "not-converged" || e.marksUnread));
  if (unconverged) return { ok: false, said: unconverged };
  const kept: SetEntry[] = [];
  const aside: SetEntry[] = [];
  for (const g of byCompound(entries)) {
    const lowest = least(g.map((e) => e.energy!));
    const within = g.filter((e) => (e.energy! - lowest) * KCAL_PER_HARTREE <= kcal + 1e-9);
    const out = g.filter((e) => !within.includes(e));
    kept.push(...(out.length ? asPart(within) : within));
    aside.push(...asPart(out));
  }
  return { ok: true, holds: "conformers", kept, aside, said: `${kept.length} of ${entries.length} kept${onesSaid(entries)}` };
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
function* duplicates(entries: readonly SetEntry[], holds: Holds3D, mirrors: Mirrors, due: () => boolean): Generator<number, Outcome3D> {
  if (mirrors === "counted") {
    const unknown = entries.findIndex((e) => stereoIdentity(e.stereo) == null);
    if (unknown >= 0) return { ok: false, said: `Which stereoisomer entry ${unknown + 1} is is not known: a mirror image is counted in only where it is the same stereoisomer` };
  }
  const keyOf = (e: SetEntry) => `${holds === "conformers" ? `#${e.compound}` : `${atomsOf(e)}|${bondsOf(e)}`}|${speciesOf(e)}`;
  const groups = [...entries.reduce((m, e) => pushTo(m, keyOf(e), e), new Map<string, SetEntry[]>()).values()];
  const energies = entries.every(hasEnergy);
  // (ranked by energy, which copy is kept is the lowest's: one that is no minimum - not converged, a saddle point, its
  //  marks not read - would be kept for an energy that is not a minimum's. Refused, naming it, as Populations does)
  const notMinimum = energies ? notAllMinima(entries) : null;
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
    for (const e of energies ? [...g].sort((p, q) => p.energy! - q.energy!) : g) {
      if (done > 0 && due()) yield done;
      done++;
      const sig = same.signature(e.xyz);
      // (only those it could be within reach of: a mirror image's atoms lie as far from its centre)
      const near = here.filter((k) => same.bound(k.sig, sig) <= SAME_CONFORMER + 1e-9);
      if (near.some((k) => same.same(k.e.xyz, e.xyz))) continue;
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
  const aside = holds === "conformers" ? asPart(alike) : alike;
  const twins = counted ? ` · ${counted} mirror image${counted === 1 ? "" : "s"} counted in (degeneracy 2)` : "";
  return { ok: true, holds, kept: keptOnes, aside, said: `${keptOnes.length} of ${entries.length} kept${onesSaid(entries)}${twins}${capped ? ` \u00b7 ${cappedSaid(capped)}` : ""}` };
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
 * where one is no minimum: the first whose optimisation did not converge,
 * or that its calculation judged has an imaginary frequency, named with
 * it, for the chemist to take it out (the maintainer, 2026-10-22: each
 * program's own judgement of which are imaginary) - or whose file's marks
 * of that did not read (`SetEntry.marksUnread`). Null where none is.
 */
export function notAllMinima(entries: readonly SetEntry[]): string | null {
  const name = (e: SetEntry) => `${compoundLetter(e.compound)} #${e.number}`;
  // (its file's marks of which frames failed did not read: whether it is a minimum is not known)
  const unread = entries.find((x) => x.marksUnread);
  if (unread) return `${name(unread)}: ${MARKS_UNREAD} - take it out first`;
  const unconverged = entries.find((x) => x.failed?.kind === "not-converged");
  if (unconverged) return `${name(unconverged)} is ${FAILURE_WORDS["not-converged"]}: it is no minimum - take it out first`;
  const e = entries.find((x) => x.imaginary?.length);
  return e ? `${name(e)} has ${imaginaryWords(e.imaginary!)}: it is no minimum - take it out first` : null;
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
/** The condition that keeps only the entries that are results to stand on, as a Filter is given it (entries `entryState`). */
export const STATE_FINISHED = `state = ${FINISHED}`;

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
  if (!entries.every(hasEnergy)) return NO_ENERGY;
  // (a saddle point's energy weighed as a minimum's would be a population of nothing: refused, naming it)
  const saddle = notAllMinima(entries);
  if (saddle) return { ok: false, said: saddle };
  // (at 0 K or below there are no shares to give: all would be 0/0, or the highest energy the most - and none at no number of kelvins, or infinitely many)
  if (!(kelvin > 0 && Number.isFinite(kelvin))) return { ok: false, said: "The temperature must be above 0 K" };
  const shares = new Map<SetEntry, number>();
  for (const g of byCompound(entries)) {
    // (each counted as many times as its conformer search found it alike, where it said: as CREST's own weights are)
    const w = boltzmann(g.map((e) => e.energy!), kelvin, g.every((e) => e.degeneracy != null) ? g.map((e) => e.degeneracy!) : undefined);
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
    // (from the electronic energy, which is all a set's entries carry today: said, so that its shares are not read as free energies' shares - the Populations node of lib/nodes weights G)
    said: `${plural(groups.length, "compound")} at ${kelvin} K, from electronic energies${onesSaid(entries)}${over}`,
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

