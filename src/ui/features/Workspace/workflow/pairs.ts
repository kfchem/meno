/**
 * The entries of a program step of two inputs - *Path search*'s *Start* and
 * *End* - paired as its options say (docs/WORKFLOWS.md, *Path search*): in
 * order, each start with the end in its place; each with each; or matched
 * on a property the chemist types, an ID a *Tag* gave (lib/nodes `matchedOn`)
 * - never by an implicit rule. Each pair is one entry, the start's, with its
 * end beside it (`SetEntry.end`). A pair that cannot be worked out - its two
 * not the same atoms in one numbering, or not of one charge and spin; one of
 * them no converged optimisation, or the two not at one level (method, basis
 * set, solvation), so that a barrier from its start would be none; or a
 * start with no end to pair with - is kept, refused with why: it goes out
 * of the step's *Failed* exit, never dropped.
 */
import { levelOf, type CalcInfo } from "../../../../lib/calc/output";
import { matchedOn } from "../../../../lib/nodes/match";
import { compoundLetter, entryOfSet, type SetEntry } from "./entries";

export type Pairing = "order" | "each" | "property";

/** A start and an end, as one entry: the start's, with the end it is paired with - none where it is paired with none, and refused. */
export type Paired = { entries: SetEntry[]; refused: { entry: number; why: string }[] } | { why: string };

const named = (e: SetEntry) => `${compoundLetter(e.compound)} #${e.number}`;
const speciesOf = (e: SetEntry) => {
  const s = entryOfSet(e, "").species;
  return s ? `${s.charge}|${s.multiplicity}` : "none";
};

/** A calculation's level, as two are compared: its method, basis set and solvation, each in any case, none said as none. */
export const levelKey = (c: CalcInfo | undefined): string =>
  [c?.method, c?.basis, c?.solvation === "none" ? null : c?.solvation].map((v) => (v ?? "").trim().toLowerCase()).join("|");
/** A calculation's level in words: "GFN2-xTB", "B3LYP/def2-SVP · SMD(water)" - or that none was said. */
export const levelSaid = (c: CalcInfo | undefined): string => (c && levelOf(c)) || "no level said";

/** Whether an entry is a converged optimisation: its calculation optimised it, to its end, and it failed in nothing. */
const optimised = (e: SetEntry) => e.calc?.optimised === true && !e.failed;

/**
 * Why a start and an end cannot be one path's: other atoms, or another order of them; another charge or spin; one of
 * them no converged optimisation - a path's barrier is from its start, which is then no minimum - or the two not at one
 * level. None where they can.
 */
function unlike(start: SetEntry, end: SetEntry): string | null {
  if (start.atoms.length !== end.atoms.length || start.atoms.some((a, i) => a.el !== end.atoms[i].el))
    return `${named(start)} and its end ${named(end)} are not the same atoms in one numbering: put the end in the start's numbering first (a reaction arrow's Atom map, then Export reaction in 3D…)`;
  if (speciesOf(start) !== speciesOf(end)) return `${named(start)} and its end ${named(end)} are not of one charge and spin`;
  const not = [start, end].filter((e) => !optimised(e));
  if (not.length)
    return `${not.map((e) => (e === start ? named(start) : `its end ${named(end)}`)).join(" and ")} ${not.length === 1 ? "is no converged optimisation" : "are no converged optimisations"}: optimise ${not.length === 1 ? "it" : "them"} first, at the path's level`;
  if (levelKey(start.calc) !== levelKey(end.calc))
    return `${named(start)} (${levelSaid(start.calc)}) and its end ${named(end)} (${levelSaid(end.calc)}) are not at one level: optimise both at the path's`;
  return null;
}

/**
 * What a kind's two inputs are called - each port's name, and what one of
 * each is - and why two of them cannot be worked out together: a path's
 * start and end (`unlike`), or a guess and one of its sides (`sideUnlike`).
 */
export type PairAs = { first: string; second: string; one: string; other: string; unlike: (a: SetEntry, b: SetEntry) => string | null };

/** A path search's start and end. */
export const PATH_PAIR: PairAs = { first: "Start", second: "End", one: "start", other: "end", unlike };

/**
 * Why a guess and one of its sides - `other`, "reactant side" - cannot be
 * one saddle point's, taken by its program as a geometry beside it: other
 * atoms, or another order of them; another charge or spin. None where they
 * can: a side need be no optimisation, nor at any level.
 */
export const sideUnlike =
  (other: string) =>
  (guess: SetEntry, side: SetEntry): string | null => {
    if (guess.atoms.length !== side.atoms.length || guess.atoms.some((a, i) => a.el !== side.atoms[i].el))
      return `${named(guess)} and its ${other} ${named(side)} are not the same atoms in one numbering`;
    if (speciesOf(guess) !== speciesOf(side)) return `${named(guess)} and its ${other} ${named(side)} are not of one charge and spin`;
    return null;
  };

/** Which of the second each of the first is paired with, by their places - a list each, empty where it is paired with none, with why - or why none can be. */
export type Matches = { ends: number[][]; why: (string | undefined)[] } | { why: string };

/** Each of the first matched with the second as `pairing` says (`property`, the name matched on): by their places. */
export function matchesOf(starts: readonly SetEntry[], ends: readonly SetEntry[], pairing: Pairing, property: string, as: PairAs): Matches {
  if (!starts.length) return { why: `Nothing comes into ${as.first}` };
  if (!ends.length) return { why: `Nothing comes into ${as.second}` };
  if (pairing === "order") {
    if (starts.length !== ends.length) return { why: `${as.first} holds ${starts.length} and ${as.second} ${ends.length}: in order, each ${as.one} is paired with the ${as.other} in its place` };
    return { ends: starts.map((_, k) => [k]), why: starts.map(() => undefined) };
  }
  if (pairing === "each") return { ends: starts.map(() => ends.map((_, j) => j)), why: starts.map(() => undefined) };
  const name = property.trim();
  if (!name) return { why: "Name the property to pair them on" };
  const matched = matchedOn(
    starts.map((e, i) => entryOfSet(e, String(i))),
    ends.map((e, i) => entryOfSet(e, String(i))),
    name,
    as.second,
  );
  return {
    ends: starts.map((_, k) => ("index" in matched[k] ? [(matched[k] as { index: number }).index] : [])),
    why: starts.map((s, k) => {
      const m = matched[k];
      return "index" in m ? undefined : `${named(s)} is paired with no ${as.other}: ${m.why}`;
    }),
  };
}

/** Each of the first paired with one of the second as `pairing` says (`property`, the name matched on), and checked as `as` says; or why they cannot be paired at all. */
export function pairEntries(starts: readonly SetEntry[], ends: readonly SetEntry[], pairing: Pairing, property = "", as: PairAs = PATH_PAIR): Paired {
  const m = matchesOf(starts, ends, pairing, property, as);
  if ("ends" in m === false) return { why: (m as { why: string }).why };
  const { ends: to, why: none } = m as { ends: number[][]; why: (string | undefined)[] };
  const entries: SetEntry[] = [];
  const refused: { entry: number; why: string }[] = [];
  starts.forEach((start, k) => {
    if (!to[k].length) {
      refused.push({ entry: entries.length, why: none[k] ?? `${named(start)} is paired with no ${as.other}` });
      entries.push({ ...start });
      return;
    }
    for (const j of to[k]) {
      const why = as.unlike(start, ends[j]);
      if (why) refused.push({ entry: entries.length, why });
      entries.push({ ...start, end: ends[j] });
    }
  });
  return { entries, refused };
}
