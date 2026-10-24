/**
 * Enumerate, by substituents (docs/WORKFLOWS-FOUNDATION.md, *Enumerate:
 * structures made from a drawing, by rule*, *Substituent swap*): one
 * structure drawn, atoms of it chosen on the step - positions, numbered by
 * the template's own atom order - and one list of groups, read as an R
 * group's list is (`readOption`). Each position's hydrogen is replaced by a
 * group: one position at a time, or every position together, each
 * combination in a fixed order and numbered by its place in it.
 *
 * A position is an R group put where its hydrogen is - at a heavy atom, an
 * R atom drawn out where the canvas would draw a new bond from it
 * (`calculateNewBondPosition`); a drawn H, the H itself - and then drawn
 * out as R groups are (`joined`): one join, one numbering, one identity,
 * for both ways.
 */
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { identity } from "../../../../lib/chem/identity";
import type { StyleChoice } from "../../../../lib/chem/style";
import { isMetal } from "../../../../lib/layout/perceive";
import type { LineRead } from "../../../../lib/options";
import { isElementSymbol } from "../../../../lib/roles/molblock";
import { identityInputOf } from "../chem/identityOf";
import { undrawnHydrogens } from "../chem/drawing";
import type { Model, SeriesCore, WorkflowStep } from "../store/types";
import { calculateNewBondPosition } from "../utils/geometry";
import { changedAt, rewedged, wedgesHeld } from "./stereoKept";
import { joined, MOST_COMBINATIONS, readOption, type Enumerated, type Made, type OptionProblem, type OptionRead } from "./enumerate";

/** How the positions are combined: one position given a group in each product, or every position in each. */
export type Combine = "one" | "together";

/** A position chosen on the template: its atom, its place in the template's atoms, how it is named (C4: its element and number), and whether it is a drawn H. */
export type Position = { id: number; place: number; name: string; drawnH: boolean };

/** The ids a step's positions option holds: written as numbers apart ("12 15"), in any order. */
export function positionIds(text: string): number[] {
  return [...new Set(text.split(/[\s,]+/).filter(Boolean).map(Number).filter(Number.isInteger))];
}

/** An option as it is said in a product's choices: its label, its SMILES, or its element. */
const said = (o: OptionRead) => (o.as === "element" ? o.formula : o.label);

/** Whether an option is a plain hydrogen: "H" - which leaves a position as it is drawn. */
const isPlainH = (o: OptionRead) => o.as === "element" && o.el === "H" && !o.charge && !o.isotope;

/** What substituents with no positions say: as the step runs, and on its card. */
export const NO_POSITIONS = "No positions chosen: choose atoms on the drawing";

/** The groups typed on the step, one to a line, each read - and what could not be, by its line. */
export function readGroups(text: string): { groups: (OptionRead | OptionProblem)[]; problems: string[] } {
  const groups: (OptionRead | OptionProblem)[] = [];
  const problems: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.normalize("NFKC").trim();
    if (!line) continue;
    const read = readOption(line);
    groups.push(read);
    if ("problem" in read) problems.push(`Group ${groups.length} ("${line}"): ${read.problem}`);
  }
  if (!groups.length) problems.push("No groups yet: type one to a line");
  return { groups, problems };
}

/** What each line of the groups was read as, line for line, as the step shows beside them: the group's formula ("OTBS · C6H15OSi" where it reads as other than typed), or why not. */
export function groupsReadAs(text: string): LineRead[] {
  return text.split(/\r?\n/).map((raw): LineRead => {
    const line = raw.normalize("NFKC").trim();
    if (!line) return { said: "" };
    const read = readOption(line);
    if ("problem" in read) return { said: read.problem, problem: true };
    return { said: read.as === "label" && read.label !== line ? `${read.label} · ${read.formula}` : read.formula };
  });
}

/**
 * The positions `ids` names on `template`, in the template's atom order -
 * and what stops the step: none chosen, an atom no longer in the drawing,
 * one inside a label or an R, one with no hydrogen or whose hydrogens are
 * all drawn, and a drawn H that is not plain (an isotope, charged, with an
 * unpaired electron, mapped, bridging, on another H or on a metal).
 */
export function positionsOf(template: Model, ids: readonly number[]): { positions: Position[]; problems: string[] } {
  const problems: string[] = [];
  if (!ids.length) return { positions: [], problems: [NO_POSITIONS] };
  const place = new Map(template.atoms.map((a, i) => [a.id, i]));
  const gone = ids.filter((id) => !place.has(id)).length;
  if (gone) problems.push(gone === 1 ? "A position's atom is no longer in the drawing" : `${gone} positions' atoms are no longer in the drawing`);
  const hs = undrawnHydrogens(template);
  const around = (id: number) => template.bonds.filter((b) => b.a === id || b.b === id);
  const atom = new Map(template.atoms.map((a) => [a.id, a]));
  const positions = ids
    .filter((id) => place.has(id))
    .sort((p, q) => place.get(p)! - place.get(q)!)
    .map((id) => {
      const a = atom.get(id)!;
      return { id, place: place.get(id)!, name: `${a.el}${place.get(id)! + 1}`, drawnH: a.el === "H" };
    });
  positions.forEach((p, k) => {
    const a = atom.get(p.id)!;
    const at = `Position ${k + 1} (${p.name})`;
    if (a.el === "R" || a.el === "R#") problems.push(`${at} is an R group: enumerate it by R groups`);
    else if (!isElementSymbol(a.el) || a.abbrev) problems.push(`${at} is a label: expand ${a.el} to choose in it`);
    else if (a.el === "H") {
      const bonds = around(p.id);
      const on = bonds.length === 1 ? atom.get(bonds[0].a === p.id ? bonds[0].b : bonds[0].a) : undefined;
      if (a.charge || a.isotope || a.radical || a.map || bonds.length !== 1 || bonds[0].order !== 1 || !on || on.el === "H" || isMetal(on.el)) problems.push(`${at} is not a plain hydrogen: only a plain H is replaced`);
    } else if (!(hs.get(p.id) ?? 0)) {
      const drawn = around(p.id).some((b) => atom.get(b.a === p.id ? b.b : b.a)?.el === "H");
      problems.push(drawn ? `${at}: its hydrogens are drawn - choose the H` : `${at} has no hydrogen`);
    }
  });
  return { positions, problems };
}

/** The drawing's usual bond length: the middle one of its bonds' (the canvas's own where it has none). */
function bondLength(model: Model): number {
  const at = new Map(model.atoms.map((a) => [a.id, a]));
  const ls = model.bonds
    .map((b) => Math.hypot(at.get(b.a)!.x - at.get(b.b)!.x, at.get(b.a)!.y - at.get(b.b)!.y))
    .filter((l) => l > 1e-6)
    .sort((p, q) => p - q);
  return ls.length ? ls[Math.floor(ls.length / 2)] : NOMINAL_BOND_LENGTH;
}

/**
 * `template` with an R atom numbered k+1 at each position given in `given`:
 * a drawn H made that R in place - its bond and any wedge on it kept - and
 * at a heavy atom a new R atom where the canvas would draw a new bond from
 * it with no pointer to follow (its widest gap), after the template's
 * atoms, in the positions' order.
 */
function withRs(template: Model, positions: readonly Position[], given: readonly number[]): { model: Model; rs: Map<number, number> } {
  const L = bondLength(template);
  let next = Math.max(0, ...template.atoms.map((a) => a.id), ...template.bonds.map((b) => b.id)) + 1;
  const atoms = template.atoms.map((a) => ({ ...a }));
  const bonds = [...template.bonds];
  const rs = new Map<number, number>();
  for (const k of given) {
    const p = positions[k];
    if (p.drawnH) {
      const i = atoms.findIndex((a) => a.id === p.id);
      atoms[i] = { ...atoms[i], el: "R#", rgroups: [k + 1] };
      rs.set(k, p.id);
      continue;
    }
    const base = atoms.find((a) => a.id === p.id)!;
    const near = bonds.flatMap((b) => (b.a === p.id ? [b.b] : b.b === p.id ? [b.a] : [])).map((id) => atoms.find((a) => a.id === id)!);
    const spot = calculateNewBondPosition(base, near, atoms, base, L);
    const id = next++;
    atoms.push({ id, x: spot.x, y: spot.y, el: "R#", rgroups: [k + 1] } as Model["atoms"][number]);
    bonds.push({ id: next++, a: p.id, b: id, order: 1 } as Model["bonds"][number]);
    rs.set(k, id);
  }
  return { model: { ...template, atoms, bonds }, rs };
}

/** How many combinations, said: "3 positions × 4 groups", "4 groups on 3 positions together". */
function sized(positions: number, groups: number, combine: Combine): { count: number; said: string } {
  const p = `${positions} position${positions === 1 ? "" : "s"}`;
  const g = `${groups} group${groups === 1 ? "" : "s"}`;
  return combine === "one" ? { count: positions * groups, said: `${p} × ${g}` } : { count: groups ** positions, said: `${g} on ${p} together` };
}

/** A count written with its thousands apart: 312,500,000. */
const thousands = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/**
 * Every combination of `text`'s groups at the positions `ids` names on
 * `template`, in order, its number its place from 1 - one position at a
 * time (the first position's groups first, each list in its own order), or
 * all together (the first position outermost) - made or set aside, the
 * first of each structure made, each later one aside as *Same as n*. `H`
 * leaves a position as drawn; one at a time it would only remake the
 * drawing, and stops the step. Or, before anything is made, every reason it
 * cannot run.
 */
export function substituted(template: Model, ids: readonly number[], text: string, combine: Combine, style?: StyleChoice): Enumerated {
  const { groups, problems } = readGroups(text);
  const { positions, problems: chosen } = positionsOf(template, ids);
  problems.push(...chosen);
  if (template.atoms.some((a) => a.el === "R" || a.el === "R#")) problems.push("The drawing has R groups: enumerate them by R groups first");
  for (const id of identityInputOf(template).unread) problems.push(`The wedges at ${template.atoms.find((a) => a.id === id)!.el} do not say a configuration (drawn crossed, or on an atom with a lone pair)`);
  const options = groups as OptionRead[];
  if (combine === "one" && options.some((o) => !("problem" in o) && isPlainH(o))) problems.push("H, one position at a time, only remakes the drawing: take it out, or combine the positions together");
  if (problems.length) return { ok: false, problems };
  const { count, said: size } = sized(positions.length, options.length, combine);
  if (count > MOST_COMBINATIONS) return { ok: false, problems: [`${size} make ${thousands(count)} combinations; Enumerate makes at most ${thousands(MOST_COMBINATIONS)}`] };

  const name = (k: number) => `Position ${k + 1} (${positions[k].name})`;
  const atomName = (id: number) => {
    const i = template.atoms.findIndex((a) => a.id === id);
    return `${template.atoms[i].el}${i + 1}`;
  };
  // (each product's configurations read back and held to the template's - docs/WORKFLOWS-FOUNDATION.md, *Configurations kept*)
  const product = (choice: readonly (OptionRead | null)[]): { drawn: Model; changed: number[] } => {
    // (H, and a position not given one, left as drawn)
    const given = choice.flatMap((o, k) => (o && !isPlainH(o) ? [k] : []));
    const { model, rs: at } = withRs(template, positions, given);
    let drawn = wedgesHeld(template, joined(model, given.map((k) => [k + 1, [at.get(k)!], choice[k]!] as const), style));
    // (a heavy atom's undrawn H taken: the group in its place among the centre's neighbours)
    const took = new Map(given.filter((k) => !positions[k].drawnH).map((k) => [positions[k].id, at.get(k)!]));
    for (const c of changedAt(template, drawn, took)) {
      if (!took.has(c)) continue;
      const again = rewedged(template, drawn, c, took);
      if (again) drawn = again;
    }
    return { drawn, changed: changedAt(template, drawn, took) };
  };
  const combinations: { choice: (OptionRead | null)[]; how: string }[] = [];
  if (combine === "one") {
    positions.forEach((_, k) => {
      for (const o of options) combinations.push({ choice: positions.map((_, j) => (j === k ? o : null)), how: `${name(k)} = ${said(o)}` });
    });
  } else {
    const choice = positions.map(() => 0);
    for (let n = 0; n < count; n++) {
      combinations.push({ choice: choice.map((c) => options[c]), how: choice.map((c, k) => `${name(k)} = ${said(options[c])}`).join(", ") });
      // (the next: the last position turns fastest, the first outermost)
      for (let k = choice.length - 1; k >= 0; k--) {
        choice[k]++;
        if (choice[k] < options.length) break;
        choice[k] = 0;
      }
    }
  }

  const made: Made[] = [];
  const aside: (Made & { why: string })[] = [];
  const seen = new Map<string, number>();
  let missed = 0;
  const refused: string[] = [];
  combinations.forEach(({ choice, how }, i) => {
    const number = i + 1;
    const { drawn: drawnNow, changed } = product(choice);
    // (a product that would say another configuration than its template's: never made - the step stops, naming it)
    if (changed.length) return void refused.push(`${how}: would change the configuration at ${changed.map(atomName).join(", ")}`);
    const found = identity(identityInputOf(drawnNow).input);
    if (!found.complete) missed++;
    const first = seen.get(found.text);
    if (first != null) aside.push({ number, drawn: drawnNow, how, why: `Same as ${first}` });
    else {
      seen.set(found.text, number);
      made.push({ number, drawn: drawnNow, how });
    }
  });
  if (refused.length) {
    const shown = refused.slice(0, 5);
    return { ok: false, problems: [...shown, ...(refused.length > shown.length ? [`and ${refused.length - shown.length} more like them`] : [])] };
  }
  // (the core every product shares: the template's atoms, but a drawn H chosen - its place a group's attach atom where it is given one - each position by the atom its group is bonded to)
  const place = new Map(template.atoms.map((a, i) => [a.id, i]));
  const isH = new Set(positions.filter((p) => p.drawnH).map((p) => p.id));
  const onAtom = (p: Position) => {
    if (!p.drawnH) return p.place;
    const b = template.bonds.find((x) => x.a === p.id || x.b === p.id)!;
    return place.get(b.a === p.id ? b.b : b.a)!;
  };
  const core: SeriesCore = {
    atoms: template.atoms.flatMap((a, i) => (isH.has(a.id) ? [] : [i])),
    bonds: template.bonds.flatMap((b): [number, number][] => (isH.has(b.a) || isH.has(b.b) ? [] : [[place.get(b.a)!, place.get(b.b)!]])),
    attach: Object.fromEntries(positions.map((p, k) => [`P${k + 1}`, [onAtom(p)]])),
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

/**
 * The marks of the positions chosen on the drawing, each numbered as the
 * step numbers it (by the drawing's own atom order): those of each Enumerate
 * step by substituents among `shown` - selected, open, or being chosen for -
 * and only those, so the drawing stays the parent otherwise. Each at its
 * atom, by its key.
 */
export function positionMarks(model: Model, steps: readonly WorkflowStep[], shown: ReadonlySet<number>): { key: string; x: number; y: number; n: number }[] {
  const place = new Map(model.atoms.map((a, i) => [a.id, i]));
  return steps.flatMap((s) => {
    if (s.kind !== "enumerate" || s.options?.way !== "substituents" || !shown.has(s.id)) return [];
    const ids = positionIds(String(s.options.positions ?? "")).filter((id) => place.has(id));
    ids.sort((p, q) => place.get(p)! - place.get(q)!);
    return ids.map((id, k) => ({ key: `${s.id}:${id}`, ...markPlace(model, id), n: k + 1 }));
  });
}

/** Where a position's mark goes: half a bond out from its atom, toward where its group goes - a heavy atom's new bond, a drawn H's own - so it is clear of the drawing's bonds. */
function markPlace(model: Model, id: number): { x: number; y: number } {
  const a = model.atoms.find((x) => x.id === id)!;
  const near = model.bonds.flatMap((b) => (b.a === id ? [b.b] : b.b === id ? [b.a] : [])).map((n) => model.atoms.find((x) => x.id === n)!);
  const L = bondLength(model);
  // (a drawn H: on along its bond, beyond it)
  const spot = a.el === "H" && near.length === 1 ? { x: 2 * a.x - near[0].x, y: 2 * a.y - near[0].y } : calculateNewBondPosition(a, near, model.atoms, a, L);
  return { x: a.x + (spot.x - a.x) * 0.5, y: a.y + (spot.y - a.y) * 0.5 };
}
