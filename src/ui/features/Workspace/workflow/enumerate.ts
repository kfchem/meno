/**
 * Enumerate, by R groups (docs/WORKFLOWS-FOUNDATION.md, *Enumerate:
 * structures made from a drawing, by rule*, *R groups*): one structure
 * drawn, its R atoms numbered (R1, R2 and so on), and for each number a
 * list of groups typed on the step; every combination of the lists made,
 * in a fixed order - R1 outermost - each R atom drawn out as the canvas
 * draws out an abbreviation (document `expandAbbreviation`, one function
 * for both), and numbered by its place in that order.
 *
 * Nothing is made from what cannot be read, or would not mean what it
 * says: each reason that stops the step is said before it runs, naming the
 * line or the atom. Where two combinations give the same structure, by
 * Meno's identity (lib/chem/identity `identity`), the first by number is
 * made and each later one set aside, saying which it is the same as.
 */
import { abbreviationOf, abbreviationStructure, smilesGroup, structureProblem } from "../../../../lib/chem/abbreviations";
import { identity } from "../../../../lib/chem/identity";
import type { GroupStructure } from "../../../../lib/chem/ligands";
import { structureFormula } from "../../../../lib/chem/ligands";
import { readSmiles } from "../../../../lib/chem/smiles";
import { keptLabel } from "../../../../lib/chem/smartLabel";
import type { StyleChoice } from "../../../../lib/chem/style";
import { isElementSymbol } from "../../../../lib/roles/molblock";
import type { LineRead } from "../../../../lib/options";
import { emptyWorkspaceDocument, expandAbbreviation, setAtomChemistry } from "../document";
import { identityInputOf } from "../chem/identityOf";
import { degrees, narrowEnd } from "../chem/drawing";
import type { Model, SeriesCore } from "../store/types";
import { labelReading, readLabel } from "../utils/labelTyping";
import { changedAt, wedgesHeld } from "./stereoKept";

/** The most combinations Enumerate makes in one run (the specification's limit, *What stops the step before it runs*). */
export const MOST_COMBINATIONS = 10_000;

/** What a typed line was read as: an element's atom, or a group - a label's, or a SMILES with its "*" - with its formula. */
export type OptionRead =
  | { typed: string; as: "element"; el: string; charge?: number; isotope?: number; formula: string }
  | { typed: string; as: "label" | "smiles"; label: string; group: GroupStructure; formula: string };

/** A line that could not be read, or reads as something an R group cannot be: why, in words. */
export type OptionProblem = { typed: string; problem: string };

/** A group's formula, its bond out counted as a bond (structureFormula counts no star): CH3 for Me. */
function groupFormula(g: GroupStructure): string {
  const star = g.atoms.length;
  return structureFormula({ ...g, atoms: [...g.atoms, { el: "*" }], bonds: [...g.bonds, { a1: g.attach[0], a2: star, order: 1 }] });
}

/**
 * A line of a list, read: as a SMILES where it has a "*" - exactly one,
 * bonded by one single bond to the atom the group is attached by, read as
 * a chemist's own abbreviation is (`structureProblem`) - and otherwise as
 * a label typed on the canvas is: given its case by smart labels (`otbs`
 * is OTBS), then an element's symbol as that atom (Cl, H), and else a
 * group by the dictionary, its label grammar and the chemist's own
 * abbreviations (`abbreviationStructure`). A line without a "*" is never
 * read as a SMILES. Or why it cannot be an R group: it reads as nothing, or
 * as a group attached by none of its atoms or by more than one, a ligand
 * that lends a pair, or a pi system.
 */
export function readOption(typed: string): OptionRead | OptionProblem {
  const text = typed.normalize("NFKC").trim();
  if (text.includes("*")) {
    const problem = structureProblem(text);
    if (problem) return { typed, problem };
    const read = readSmiles(text);
    const star = read.atoms.findIndex((a) => a.el === "*");
    if (read.bonds.find((b) => b.a1 === star || b.a2 === star)!.order !== 1) return { typed, problem: 'The "*" is bonded by one single bond to the atom the group is attached by.' };
    const group = smilesGroup(text);
    return { typed, as: "smiles", label: text, group, formula: groupFormula(group) };
  }
  const label = keptLabel(text, labelReading);
  const read = readLabel(label, isElementSymbol);
  // (an element's symbol that is a group's name too - Ac, Pr, Ts - is the group, as on the canvas)
  const named = read.kind === "element" && isElementSymbol(label) && abbreviationOf(label);
  if (read.kind === "element" && !named) {
    const formula = `${read.isotope ? `${read.isotope}` : ""}${read.el}${read.charge ? (read.charge > 0 ? "+" : "-").repeat(Math.abs(read.charge)) : ""}`;
    return { typed, as: "element", el: read.el, ...(read.charge ? { charge: read.charge } : {}), ...(read.isotope ? { isotope: read.isotope } : {}), formula };
  }
  const group = read.kind === "charge" ? null : abbreviationStructure(label);
  if (!group) return { typed, problem: `"${text}" is not an element, a group Meno knows, or a SMILES with a "*"` };
  if (!group.attach.length) return { typed, problem: `${label} is a whole molecule, not a group: it is attached by none of its atoms` };
  if (group.attach.length > 1) return { typed, problem: `${label} is attached by ${group.attach.length} atoms: an R group is attached by one` };
  if (group.lends?.[0]) return { typed, problem: `${label} is a ligand, bound by a pair it lends: an R group is bonded by one single bond` };
  if (group.haptic?.length) return { typed, problem: `${label} is bound through a pi system: an R group is bonded by one single bond` };
  return { typed, as: "label", label, group, formula: groupFormula(group) };
}

/** A line that starts an R number's list - R1:, r1: - and what follows on it. */
const HEAD = /^R(\d+)\s*:\s*(.*)$/iu;

/**
 * The options a line holds: one, or several apart by commas or semicolons
 * ("Me, Et; Cl"), each as typed, trimmed - a comma between two digits, a
 * locant's, kept within its option (2,4-(MeO)2C6H3). An option empty
 * between two of them is one, "" (said, not passed over); one after the
 * last, ending the line, is none.
 */
export function optionsOn(line: string): string[] {
  const out: string[] = [];
  let from = 0;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === ";" || (ch === "," && !(/[\d'\u2032]/u.test(line[i - 1] ?? "") && /\d/u.test(line[i + 1] ?? "")))) {
      out.push(line.slice(from, i).trim());
      from = i + 1;
    }
  }
  const last = line.slice(from).trim();
  if (last || !out.length) out.push(last);
  return out.length === 1 && !out[0] ? [] : out;
}

/** What makes two options of a list the same option, as typed and read: a label's, an element's or a SMILES's reading. */
const sameAs = (o: OptionRead) => (o.as === "element" ? o.formula : o.label);

/**
 * The step's text read as lists, by R number: a line `R1:` - or `r1:`,
 * with or without its groups after it - starts R1's list or adds to it, and
 * each group on a line, one or several apart by commas or semicolons
 * (`optionsOn`), is one more option of the last R number started. Blank
 * lines are passed over. Said, each: a group before any R number, an empty
 * one, one given twice in one R's list (never dropped as if it were not),
 * an R number with no option in it, and an option that does not read.
 */
export function readLists(text: string): Lists {
  const lists = new Map<number, (OptionRead | OptionProblem)[]>();
  const problems: string[] = [];
  let at: number | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.normalize("NFKC").trim();
    if (!line) continue;
    const head = HEAD.exec(line);
    if (head) {
      at = Number.parseInt(head[1], 10);
      if (!lists.has(at)) lists.set(at, []);
    } else if (at == null) {
      problems.push(`"${line}" comes before any R number: start each list with its number, as "R1:"`);
      continue;
    }
    const list = lists.get(at)!;
    for (const typed of optionsOn(head ? head[2] : line)) {
      if (!typed) {
        problems.push(`R${at} has an empty option in "${line}"`);
        continue;
      }
      const read = readOption(typed);
      const twice = !("problem" in read) && list.some((o) => !("problem" in o) && sameAs(o) === sameAs(read));
      if (twice) problems.push(`R${at} lists ${sameAs(read as OptionRead)} twice`);
      else list.push(read);
    }
  }
  for (const [n, options] of lists) {
    if (!options.length) problems.push(`R${n} has no options`);
    options.forEach((o, k) => {
      if ("problem" in o) problems.push(`R${n}, option ${k + 1} ("${o.typed.trim()}"): ${o.problem}`);
    });
  }
  return { lists, problems };
}

/**
 * What each line of the step's text was read as, line for line, as the
 * step shows it beside the lines (`LinesOption.readAs`), as `readLists`
 * reads them: an R number's start, each option's reading and formula
 * ("OTBS · C6H15OSi"; several apart by commas), or why one cannot be read
 * or is not wanted there - blank for a blank line.
 */
export function listsReadAs(text: string): LineRead[] {
  const seen = new Map<number, string[]>();
  let at: number | null = null;
  return text.split(/\r?\n/).map((raw): LineRead => {
    const line = raw.normalize("NFKC").trim();
    if (!line) return { said: "" };
    const head = HEAD.exec(line);
    if (head) at = Number.parseInt(head[1], 10);
    else if (at == null) return { said: "Start with an R number, as R1: Me, Et", problem: true };
    const options = optionsOn(head ? head[2] : line);
    if (!options.length) return { said: `R${at}` };
    const had = seen.get(at!) ?? [];
    seen.set(at!, had);
    const said: string[] = [];
    for (const typed of options) {
      if (!typed) return { said: "An empty option between two commas", problem: true };
      const read = readOption(typed);
      if ("problem" in read) return { said: read.problem, problem: true };
      if (had.includes(sameAs(read))) return { said: `${sameAs(read)} is in R${at}'s list already`, problem: true };
      had.push(sameAs(read));
      // (the group's formula; and its label, where it reads as other than typed: otbs as OTBS)
      said.push(read.as === "label" && read.label !== typed ? `${read.label} \u00b7 ${read.formula}` : read.formula);
    }
    return { said: said.join(", ") };
  });
}

/** The lists typed on the step, by R number, each line read - and what could not be, by its R number and line. */
export type Lists = { lists: Map<number, (OptionRead | OptionProblem)[]>; problems: string[] };

/**
 * A template's R atoms, by number, each number's atoms by id in the
 * template's order - and what about the template stops the step: an R with
 * no number or more than one, an R atom bonded by anything but one single
 * bond, a wedge whose narrow end is at an R atom, and wedges that cannot be
 * read.
 */
export function templateRs(template: Model): { rs: Map<number, number[]>; problems: string[] } {
  const rs = new Map<number, number[]>();
  const problems: string[] = [];
  const degree = degrees(template.bonds);
  for (const a of template.atoms) {
    if (a.el === "R") {
      problems.push("An R has no number: number each, as R1, R2");
      continue;
    }
    if (a.el !== "R#") continue;
    const ns = a.rgroups ?? [];
    if (ns.length !== 1) {
      problems.push(ns.length ? `R${ns.join(",")} has more than one number: draw one R for each` : "An R has no number: number each, as R1, R2");
      continue;
    }
    const n = ns[0];
    const bonds = template.bonds.filter((b) => b.a === a.id || b.b === a.id);
    if (bonds.length !== 1) problems.push(`An R${n} is bonded by ${bonds.length} bonds: an R group is bonded by one single bond`);
    else if (bonds[0].order !== 1 || bonds[0].endpoints?.length) problems.push(`An R${n} is bonded by a ${bonds[0].order === 2 ? "double" : bonds[0].order === 3 ? "triple" : "haptic"} bond: an R group is bonded by one single bond`);
    for (const b of bonds) {
      if ((b.stereo === "up" || b.stereo === "down") && narrowEnd(b, degree) === a.id) problems.push(`A wedge starts at an R${n}: it would say nothing of the group put there`);
    }
    rs.set(n, [...(rs.get(n) ?? []), a.id]);
  }
  const unread = identityInputOf(template).unread;
  for (const id of unread) problems.push(`The wedges at ${template.atoms.find((a) => a.id === id)!.el} do not say a configuration (drawn crossed, or on an atom with a lone pair)`);
  return { rs, problems };
}

/** How many combinations lists of these lengths make, and how to say so: "5 lists of 50", "lists of 3, 2 and 4". */
function sized(lengths: readonly number[]): { count: number; said: string } {
  const count = lengths.reduce((n, l) => n * l, 1);
  const same = lengths.every((l) => l === lengths[0]);
  const list = (xs: readonly number[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}` : `${xs[0]}`);
  const said = lengths.length === 1 ? `a list of ${lengths[0]}` : same ? `${lengths.length} lists of ${lengths[0]}` : `lists of ${list(lengths)}`;
  return { count, said };
}

/** A count written with its thousands apart: 312,500,000. */
const thousands = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** One combination made: its number (its place in the order, from 1), its structure, and the choices in words: "R1 = Me, R2 = OMe". */
export type Made = { number: number; drawn: Model; how: string };

/** What Enumerate gives: the structures made, those set aside - each with why - and what it says of the whole; or why it cannot run. */
export type Enumerated =
  | { ok: true; made: Made[]; aside: (Made & { why: string })[]; said: string[]; core: SeriesCore }
  | { ok: false; problems: string[] };

/**
 * Every combination of `text`'s lists on `template`, in order - R1
 * outermost, each list in its own order - its number its place from 1,
 * made or set aside: the first of each structure made, each later one aside
 * as *Same as n*. Each R atom is drawn out where it is: its group's attach
 * atom takes its place, number and bond, the group's other atoms come
 * after the template's - R1's first, an R number on several atoms in their
 * order in the template - and every other atom, bond and wedge is as
 * drawn. Or, before anything is made, every reason it cannot run.
 */
export function enumerated(template: Model, text: string, style?: StyleChoice): Enumerated {
  const { lists, problems } = readLists(text);
  const { rs, problems: drawn } = templateRs(template);
  problems.push(...drawn);
  for (const n of rs.keys()) if (!lists.has(n)) problems.push(`R${n} is in the drawing but has no list`);
  for (const n of lists.keys()) if (!rs.has(n)) problems.push(`R${n} has a list but is not in the drawing`);
  if (!rs.size && !problems.length) problems.push("The drawing has no R group: draw R1, R2 where the groups go");
  const numbers = [...rs.keys()].sort((p, q) => p - q);
  if (problems.length) return { ok: false, problems };
  const options = numbers.map((n) => lists.get(n)! as OptionRead[]);
  const { count, said } = sized(options.map((o) => o.length));
  if (count > MOST_COMBINATIONS) return { ok: false, problems: [`${said} make ${thousands(count)} combinations; Enumerate makes at most ${thousands(MOST_COMBINATIONS)}`] };

  const made: Made[] = [];
  const aside: (Made & { why: string })[] = [];
  const seen = new Map<string, number>();
  let missed = 0;
  const choice = options.map(() => 0);
  const refused: string[] = [];
  const atomName = (id: number) => {
    const i = template.atoms.findIndex((a) => a.id === id);
    return `${template.atoms[i].el}${i + 1}`;
  };
  for (let number = 1; number <= count; number++) {
    // (each wedge narrow where it was, and the product's configurations read back and held to the template's: stereoKept)
    const drawnNow = wedgesHeld(template, joined(template, numbers.map((n, k) => [n, rs.get(n)!, options[k][choice[k]]] as const), style));
    const how = numbers.map((n, k) => `R${n} = ${label(options[k][choice[k]])}`).join(", ");
    const changed = changedAt(template, drawnNow, new Map());
    if (changed.length) refused.push(`${how}: would change the configuration at ${changed.map(atomName).join(", ")}`);
    else {
      const found = identity(identityInputOf(drawnNow).input);
      if (!found.complete) missed++;
      const first = seen.get(found.text);
      if (first != null) aside.push({ number, drawn: drawnNow, how, why: `Same as ${first}` });
      else {
        seen.set(found.text, number);
        made.push({ number, drawn: drawnNow, how });
      }
    }
    // (the next combination: the last list turns fastest, R1 outermost)
    for (let k = choice.length - 1; k >= 0; k--) {
      choice[k]++;
      if (choice[k] < options[k].length) break;
      choice[k] = 0;
    }
  }
  // (a product that would say another configuration than its template's: never made - the step stops, naming it)
  if (refused.length) {
    const shown = refused.slice(0, 5);
    return { ok: false, problems: [...shown, ...(refused.length > shown.length ? [`and ${refused.length - shown.length} more like them`] : [])] };
  }
  // (the core every product shares, by its atoms' places: the template's first in each, each R's place its group's attach atom)
  const place = new Map(template.atoms.map((a, i) => [a.id, i]));
  const isR = new Set([...rs.values()].flat());
  const core: SeriesCore = {
    atoms: template.atoms.flatMap((a, i) => (isR.has(a.id) ? [] : [i])),
    bonds: template.bonds.flatMap((b): [number, number][] => (isR.has(b.a) || isR.has(b.b) ? [] : [[place.get(b.a)!, place.get(b.b)!]])),
    attach: Object.fromEntries(numbers.map((n) => [`R${n}`, rs.get(n)!.map((id) => place.get(id)!)])),
  };
  return {
    ok: true,
    core,
    made,
    aside,
    said: [
      `${made.length} made${aside.length ? ` · ${aside.length} aside` : ""}`,
      "Duplicates judged by Meno's identity: constitution and configurations as drawn, aromatic rings as one form",
      ...(missed ? [`Duplicates may be missed among ${missed}: the canonical search ran out of steps`] : []),
    ],
  };
}

/** An option as it is said in a combination's choices: its label, its SMILES, or its element. */
const label = (o: OptionRead) => (o.as === "element" ? o.formula : o.label);

/**
 * `template` with each R atom given its option: an element's atom in its
 * place, or its group drawn out there as the canvas draws an abbreviation
 * out (`expandAbbreviation`) - R1's atoms first, each number's in the
 * template's order, so that the groups' atoms come in that order after the
 * template's.
 */
export function joined(template: Model, choices: readonly (readonly [number, readonly number[], OptionRead])[], style?: StyleChoice): Model {
  let doc = { ...emptyWorkspaceDocument(style), model: template, nextId: Math.max(0, ...template.atoms.map((a) => a.id), ...template.bonds.map((b) => b.id)) + 1 };
  for (const [, atoms, option] of choices) {
    for (const id of atoms) {
      doc =
        option.as === "element"
          ? setAtomChemistry(doc, id, { el: option.el, ...(option.charge ? { charge: option.charge } : {}), ...(option.isotope ? { isotope: option.isotope } : {}) })
          : expandAbbreviation(doc, id, option.group);
    }
  }
  return doc.model;
}
