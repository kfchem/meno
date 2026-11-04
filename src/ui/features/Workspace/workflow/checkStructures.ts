/**
 * *Check structures*, Meno's (docs/WORKFLOWS.md, *Check structures*): each
 * structure drawn kept as drawn - never one changed - or set aside, saying
 * why, by Meno's rules on what the plugin that does the checks makes of it
 * (the `checks` role's `structure_facts`: each atom's element, charge,
 * valence and the most it could be, its unpaired electrons, its part - and
 * what its toolkit could not make sense of). The decisions, and the words,
 * are Meno's; only a failure the toolkit alone reports is said in its words.
 */
import type { Option } from "../../../../lib/options";
import type { FactAtom, StructureFacts } from "../../../../lib/roles/client";

/** What *Check structures* looks for, each set aside unless its option keeps it. */
export const CHECKS = ["parts", "valence", "electrons", "radicals"] as const;
export type Check = (typeof CHECKS)[number];

/** Its options: each finding set aside, or kept. */
export const CHECK_OPTIONS: readonly Option[] = [
  { id: "parts", label: "More than one part (a salt, a mixture)", type: "choice", choices: [{ value: "aside", label: "Set aside" }, { value: "keep", label: "Keep" }], default: "aside" },
  { id: "valence", label: "An atom with more bonds than it can have", type: "choice", choices: [{ value: "aside", label: "Set aside" }, { value: "keep", label: "Keep as drawn" }], default: "aside" },
  { id: "electrons", label: "A part with no electrons (H+)", type: "choice", choices: [{ value: "aside", label: "Set aside" }, { value: "keep", label: "Keep" }], default: "aside" },
  { id: "radicals", label: "Radicals", type: "choice", choices: [{ value: "aside", label: "Set aside" }, { value: "keep", label: "Keep" }], default: "aside" },
];

/** What is said of one structure: kept as drawn, or set aside with why and its kind. */
export type Checked = { as: "drawn" } | { aside: string; kind: string };

/** Atoms said as a chemist reads them: their elements, each once, in the order met - "C, O". */
export function described(atoms: readonly { el: string }[]): string {
  return [...new Set(atoms.map((a) => a.el))].join(", ");
}

/** A part as a formula: its elements in the order met, each with how many, and its charge - "H+", "He2+". */
export function partFormula(atoms: readonly { el: string; charge: number }[]): string {
  const counts = new Map<string, number>();
  for (const a of atoms) counts.set(a.el, (counts.get(a.el) ?? 0) + 1);
  const charge = atoms.reduce((q, a) => q + a.charge, 0);
  const sign = charge ? `${Math.abs(charge) > 1 ? Math.abs(charge) : ""}${charge > 0 ? "+" : "-"}` : "";
  return [...counts].map(([el, n]) => (n > 1 ? `${el}${n}` : el)).join("") + sign;
}

/**
 * One structure checked: the first finding not kept, in this order - more
 * than one part (as many as its blocks: a salt, a mixture); an atom with
 * more bonds than it can have (its valence past the most its element, or
 * the element it has the electrons of, takes), or else any the toolkit
 * could not make sense of; a part with no electrons (its atoms' atomic
 * numbers no more than their charges: H+); a radical - else kept as
 * drawn. `program`: the toolkit that read it, named where it alone failed.
 */
export function checked(facts: StructureFacts, parts: number, keep: ReadonlySet<Check>, program: string): Checked {
  if (!facts.read) return { aside: `${program} could not read it`, kind: "unreadable" };
  if (!keep.has("parts") && parts > 1) return { aside: `${parts} parts (a salt, or a mixture)`, kind: "parts" };
  if (!keep.has("valence")) {
    const over = facts.atoms.filter((a) => a.most != null && a.valence > a.most);
    if (over.length) return { aside: `an atom with more bonds than it can have (${described(over)})`, kind: "valence" };
    if (facts.problem) return { aside: `${program} could not read it (${facts.problem})`, kind: "valence" };
  }
  if (!keep.has("electrons")) {
    const byPart = new Map<number, FactAtom[]>();
    for (const a of facts.atoms) byPart.set(a.part, [...(byPart.get(a.part) ?? []), a]);
    for (const atoms of byPart.values())
      if (atoms.reduce((n, a) => n + a.z - a.charge, 0) <= 0) return { aside: `a part with no electrons (${partFormula(atoms)})`, kind: "no electrons" };
  }
  if (!keep.has("radicals")) {
    const unpaired = facts.atoms.filter((a) => a.radicals > 0);
    if (unpaired.length) return { aside: `a radical: unpaired electrons on ${described(unpaired)}`, kind: "radical" };
  }
  return { as: "drawn" };
}
