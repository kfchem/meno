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

/**
 * The most pairs *Each with each* makes in one run: Meno's own limit, so
 * that one option does not start a job for every pair of two large sets
 * (two sets of 29 conformers, 841) - pairs matched on a property are as
 * many as there are starts, and are not limited.
 */
export const MOST_PAIRS = 100;

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
    return `${named(start)} and its end ${named(end)} are not the same atoms in one numbering: Re-bond them first`;
  if (speciesOf(start) !== speciesOf(end)) return `${named(start)} and its end ${named(end)} are not of one charge and spin`;
  const not = [start, end].filter((e) => !optimised(e));
  if (not.length)
    return `${not.map((e) => (e === start ? named(start) : `its end ${named(end)}`)).join(" and ")} ${not.length === 1 ? "is no converged optimisation" : "are no converged optimisations"}: optimise ${not.length === 1 ? "it" : "them"} first, at the path's level`;
  if (levelKey(start.calc) !== levelKey(end.calc))
    return `${named(start)} (${levelSaid(start.calc)}) and its end ${named(end)} (${levelSaid(end.calc)}) are not at one level: optimise both at the path's`;
  return null;
}

/** Each start paired with an end as `pairing` says (`property`, the name matched on); or why they cannot be paired at all. */
export function pairEntries(starts: readonly SetEntry[], ends: readonly SetEntry[], pairing: Pairing, property = ""): Paired {
  if (!starts.length) return { why: "Nothing comes into Start" };
  if (!ends.length) return { why: "Nothing comes into End" };
  const made: { start: SetEntry; end?: SetEntry; why?: string }[] = [];
  if (pairing === "order") {
    if (starts.length !== ends.length) return { why: `Start holds ${starts.length} and End ${ends.length}: in order, each start is paired with the end in its place` };
    starts.forEach((s, k) => made.push({ start: s, end: ends[k] }));
  } else if (pairing === "each") {
    if (starts.length * ends.length > MOST_PAIRS)
      return { why: `Start holds ${starts.length} and End ${ends.length}: each with each makes ${starts.length * ends.length} pairs, and it makes at most ${MOST_PAIRS} - match them on a property instead` };
    for (const s of starts) for (const e of ends) made.push({ start: s, end: e });
  } else {
    const name = property.trim();
    if (!name) return { why: "Name the property to pair them on" };
    const matched = matchedOn(
      starts.map((e, i) => entryOfSet(e, String(i))),
      ends.map((e, i) => entryOfSet(e, String(i))),
      name,
      "End",
    );
    starts.forEach((s, k) => {
      const m = matched[k];
      made.push("index" in m ? { start: s, end: ends[m.index] } : { start: s, why: `${named(s)} is paired with no end: ${m.why}` });
    });
  }
  const entries: SetEntry[] = [];
  const refused: { entry: number; why: string }[] = [];
  made.forEach((p, k) => {
    entries.push(p.end ? { ...p.start, end: p.end } : { ...p.start });
    const why = p.why ?? (p.end ? unlike(p.start, p.end) : null);
    if (why) refused.push({ entry: k, why });
  });
  return { entries, refused };
}
