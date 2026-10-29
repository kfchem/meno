/**
 * A typed string read as a structure: one reader for each place one is
 * typed, so that a group, a label or a SMILES means the same in all of them
 * (docs/EDITOR-2D.md, *Quick Add*). Each place says what it
 * takes (`Where`), and what the text reads as there comes back as
 * readings - the first what the place takes it as, the rest what else it
 * could be, never passed over: "NBS" is N-bromosuccinimide and, as a
 * SMILES, a chain of N, B and S.
 *
 * - `"group"`: an R group or a substituent (workflow/enumerate,
 *   workflow/substituents) - an element's atom, a group by the label
 *   grammar and the dictionary, or a SMILES with its "*".
 * - `"molecule"`: a whole molecule, from Quick Add - a SMILES, or a
 *   molecule the dictionary draws whole (a reagent, a formula read by rule,
 *   a neutral ligand as THF).
 *
 * A label typed on an atom is read by the same reader (utils/labelTyping),
 * and stays a label there: nothing here draws it out.
 */
import { abbreviationOf, abbreviationStructure, smilesGroup, structureProblem } from "../../../../lib/chem/abbreviations";
import { kekuleOrders } from "../../../../lib/chem/kekulize";
import type { GroupStructure } from "../../../../lib/chem/ligands";
import { structureFormula } from "../../../../lib/chem/ligands";
import { readSmiles, type Smiles } from "../../../../lib/chem/smiles";
import { keptLabel } from "../../../../lib/chem/smartLabel";
import { isElementSymbol } from "../../../../lib/roles/molblock";
import { labelReading, readLabel } from "../utils/labelTyping";

/** Where a string is typed, and so what it may be: an R group or substituent, or a whole molecule. */
export type Where = "group" | "molecule";

/**
 * What a string reads as: an element's atom; or a structure - a label's,
 * by the dictionary and the label grammar, or a SMILES - with its formula,
 * and, for a molecule the dictionary has, its name. A group's structure is
 * attached where its "*" was; a molecule's by none of its atoms.
 */
export type Reading =
  | { typed: string; as: "element"; el: string; charge?: number; isotope?: number; formula: string }
  | { typed: string; as: "label" | "smiles"; label: string; group: GroupStructure; formula: string; name?: string };

/** What a string reads as where it is typed, the first what that place takes it as; or, where it reads as nothing there, why. */
export type Resolved = { readings: Reading[]; problem?: string };

/** `typed` read where it is typed: its readings, the place's own first, or why there are none. */
export function resolve(typed: string, where: Where): Resolved {
  return where === "group" ? asGroup(typed) : asMolecule(typed);
}

/** A group's formula, its bond out counted as a bond (structureFormula counts no star): CH3 for Me. */
function groupFormula(g: GroupStructure): string {
  const star = g.atoms.length;
  return structureFormula({ ...g, atoms: [...g.atoms, { el: "*" }], bonds: [...g.bonds, { a1: g.attach[0], a2: star, order: 1 }] });
}

/**
 * An R group or a substituent, read: as a SMILES where it has a "*" -
 * exactly one, bonded by one single bond to the atom the group is attached
 * by, read as a chemist's own abbreviation is (`structureProblem`) - and
 * otherwise as a label typed on the canvas is: given its case by smart
 * labels (`otbs` is OTBS), then an element's symbol as that atom (Cl, H),
 * and else a group by the dictionary, its label grammar and the chemist's
 * own abbreviations (`abbreviationStructure`). A string without a "*" is
 * never read as a SMILES. Or why it cannot be an R group: it reads as
 * nothing, or as a group attached by none of its atoms or by more than one,
 * a ligand that lends a pair, or a pi system.
 */
function asGroup(typed: string): Resolved {
  const text = typed.normalize("NFKC").trim();
  const no = (problem: string): Resolved => ({ readings: [], problem });
  if (text.includes("*")) {
    const problem = structureProblem(text);
    if (problem) return no(problem);
    const read = readSmiles(text);
    const star = read.atoms.findIndex((a) => a.el === "*");
    if (read.bonds.find((b) => b.a1 === star || b.a2 === star)!.order !== 1) return no('The "*" is bonded by one single bond to the atom the group is attached by.');
    const group = smilesGroup(text);
    return { readings: [{ typed, as: "smiles", label: text, group, formula: groupFormula(group) }] };
  }
  const label = keptLabel(text, labelReading);
  const read = readLabel(label, isElementSymbol);
  // (an element's symbol that is a group's name too - Ac, Pr, Ts - is the group, as on the canvas)
  const named = read.kind === "element" && isElementSymbol(label) && abbreviationOf(label);
  if (read.kind === "element" && !named) {
    const formula = `${read.isotope ? `${read.isotope}` : ""}${read.el}${read.charge ? (read.charge > 0 ? "+" : "-").repeat(Math.abs(read.charge)) : ""}`;
    return { readings: [{ typed, as: "element", el: read.el, ...(read.charge ? { charge: read.charge } : {}), ...(read.isotope ? { isotope: read.isotope } : {}), formula }] };
  }
  const group = read.kind === "charge" ? null : abbreviationStructure(label);
  if (!group) return no(`"${text}" is not a group, an element or a SMILES with "*"`);
  if (!group.attach.length) return no(`${label} is a whole molecule, not a group: it is attached by none of its atoms`);
  if (group.attach.length > 1) return no(`${label} is attached by ${group.attach.length} atoms: an R group is attached by one`);
  if (group.lends?.[0]) return no(`${label} is a ligand, bound by a pair it lends: an R group is bonded by one single bond`);
  if (group.haptic?.length) return no(`${label} is bound through a pi system: an R group is bonded by one single bond`);
  return { readings: [{ typed, as: "label", label, group, formula: groupFormula(group) }] };
}

/**
 * A whole molecule, read: as a SMILES, where it is one (`smilesMolecule`),
 * and as a molecule the dictionary draws whole - a reagent (DMF, Et3N,
 * NBS), a complex's formula (PdCl2), or a ligand bound only by pairs it
 * lends (THF, py) - typed as written or in small letters (dmf, et3n), as a
 * label is given its case on the canvas (smart labels): a formula in
 * capitals (ET3N) is not, its elements' case being what it says. Named by
 * the dictionary's name where it has one; a complex's formula and a
 * formula read by rule, by their label alone.
 * The SMILES first, where the text is both (NBS, BrCN): what the field is
 * for. A group (Me, CN, NO) is no molecule - nor an element's symbol alone,
 * but as a SMILES. None where neither reads: the plugin that reads SMILES
 * may still read it, as it did before anything here.
 */
function asMolecule(typed: string): Resolved {
  const text = typed.normalize("NFKC").trim();
  const readings: Reading[] = [];
  if (!text) return { readings };
  const smiles = smilesMolecule(text);
  if (smiles) readings.push({ typed, as: "smiles", label: text, group: smiles, formula: structureFormula(smiles) });
  const label = keptLabel(text, labelReading);
  const named = abbreviationOf(label);
  const whole = named && (named.kind === "reagent" || named.kind === "complex" || named.kind === "ligand") ? abbreviationStructure(label) : null;
  const lendsAll = whole && whole.attach.length > 0 && !whole.haptic?.length && whole.attach.every((_, k) => whole.lends?.[k]);
  if (named && whole && (!whole.attach.length || lendsAll)) {
    const formula = structureFormula({ ...whole, attach: [] });
    // (a formula read by rule is named by its formula, and a complex's by its parts - "palladium, 2 Cl": its label says more)
    const name = named.kind !== "complex" && named.name !== formula ? named.name : undefined;
    readings.push({ typed, as: "label", label, group: { ...whole, attach: [] }, formula, ...(name ? { name } : {}) });
  }
  return { readings };
}

/**
 * `text` as a whole molecule's SMILES: read, with no "*", and its aromatic
 * atoms each in a ring of them, given their double bonds back (Kekulé, as a
 * SMILES pasted is) - or null where it is none: "BnBr" has an aromatic
 * nitrogen outside any ring, and is a label.
 */
function smilesMolecule(text: string): GroupStructure | null {
  let read: Smiles;
  try {
    read = readSmiles(text);
  } catch {
    return null;
  }
  if (!read.atoms.length || read.atoms.some((a) => a.el === "*")) return null;
  // (an aromatic atom is in a ring of aromatic bonds: two of them at least)
  const aromaticBonds = read.atoms.map(() => 0);
  for (const b of read.bonds) {
    if (b.order !== 4) continue;
    aromaticBonds[b.a1]++;
    aromaticBonds[b.a2]++;
  }
  if (read.atoms.some((a, i) => a.aromatic && aromaticBonds[i] < 2)) return null;
  const orders = kekuleOrders(read.atoms, read.bonds);
  // (and each of its carbons takes a double bond there: c1cccc1 has none for one)
  const doubled = read.atoms.map(() => false);
  read.bonds.forEach((b, i) => {
    if (b.order === 4 && orders[i] === 2) doubled[b.a1] = doubled[b.a2] = true;
  });
  if (read.atoms.some((a, i) => a.aromatic && a.el === "C" && !a.charge && !doubled[i])) return null;
  return {
    atoms: read.atoms.map(({ aromatic: _aromatic, cls: _cls, ...atom }) => atom),
    bonds: read.bonds.map((b, i) => ({ a1: b.a1, a2: b.a2, order: orders[i] })),
    attach: [],
  };
}

/**
 * Whether two plain formulas hold the same atoms, in any order: PdCl2 and
 * Cl2Pd. Anything else - a group's label (Et3N), a charge - is not one.
 */
export function sameFormula(a: string, b: string): boolean {
  const counts = (f: string) => {
    if (!/^([A-Z][a-z]?\d*)+$/.test(f)) return null;
    const by = new Map<string, number>();
    for (const [, el, n] of f.matchAll(/([A-Z][a-z]?)(\d*)/g)) by.set(el, (by.get(el) ?? 0) + (n ? Number(n) : 1));
    return by;
  };
  const x = counts(a), y = counts(b);
  return x != null && y != null && x.size === y.size && [...x].every(([el, n]) => y.get(el) === n);
}
