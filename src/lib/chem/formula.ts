import type { GroupStructure, StructureBond } from "./ligands";
import type { SmilesAtom } from "./smiles";

/**
 * A formula's parts - groups and elements, each as often as its count - and
 * the valences its elements take: what a simple formula is read by
 * (./condensed), and an anion - BF4, PF6, ClO4, CO3 - whether a salt's
 * (NaBH4, K2CO3) or a complex's counter-anion ([Rh(cod)2]BF4, ./ligands).
 */

/** The valence each element of such a formula has first. */
export const VALENCE: Record<string, number> = {
  H: 1, Li: 1, Na: 1, K: 1, Rb: 1, Cs: 1, F: 1, Cl: 1, Br: 1, I: 1,
  Be: 2, Mg: 2, Ca: 2, Sr: 2, Ba: 2, O: 2, S: 2, Se: 2, Te: 2,
  B: 3, Al: 3, Ga: 3, In: 3, N: 3, P: 3, As: 3, Sb: 3, Bi: 3,
  C: 4, Si: 4, Ge: 4, Sn: 4, Pb: 4,
};

/** The valences beyond it an element below the second row takes in an anion: P(V) in PF6, Cl(VII) in ClO4. */
const HIGHER: Record<string, number[]> = {
  P: [5], As: [5], Sb: [5], Bi: [5], S: [4, 6], Se: [4, 6], Te: [4, 6], Cl: [3, 5, 7], Br: [3, 5, 7], I: [3, 5, 7],
};

/** Its outer electrons, by its group: a centre with as many bonds has no lone pair left. */
const OUTER: Record<string, number> = Object.fromEntries(
  ["H Li Na K Rb Cs", "Be Mg Ca Sr Ba", "B Al Ga In", "C Si Ge Sn Pb", "N P As Sb Bi", "O S Se Te", "F Cl Br I"].flatMap((g, i) =>
    g.split(" ").map((el) => [el, i + 1]),
  ),
);

/** The second row's, which have no more than an octet: four bonds. */
const SECOND_ROW = new Set(["B", "C", "N", "O"]);

/** The halogens, bound by one bond in an anion. */
const HALOGENS = new Set(["F", "Cl", "Br", "I"]);

export type Part = { kind: "element"; el: string } | { kind: "group"; label: string; s: GroupStructure };

/** Deuterium as a part of a formula: one atom, hydrogen of mass 2, bound by its one bond. */
const DEUTERIUM: GroupStructure = { atoms: [{ el: "H", isotope: 2, hs: 0 }], bonds: [], attach: [0] };

/** The label of the group a formula names at `i`, or undefined. */
export type GroupAt = (text: string, i: number) => string | undefined;

/**
 * A formula's parts, each as often as its count, or null where it is not
 * read through into groups (found by `groupAt`; a group as long as an
 * element's symbol is the group; a group's in parentheses, OAc in B(OAc)3,
 * too) and the elements above. A hyphen between two parts is read past
 * (Fmoc-OSu).
 */
export function partsOf(text: string, groupAt: GroupAt, groupOf: (label: string) => GroupStructure | null): Part[] | null {
  const out: Part[] = [];
  let i = 0;
  while (i < text.length) {
    if (text[i] === "-" && out.length && i + 1 < text.length) {
      i++;
      continue;
    }
    let found: Part[] | null = null;
    if (text[i] === "(") {
      const j = text.indexOf(")", i);
      const inner = j > i ? text.slice(i + 1, j) : null;
      const one = inner ? groupOf(inner) : null;
      found = one?.attach.length === 1 ? [{ kind: "group", label: inner!, s: one }] : inner ? partsOf(inner, groupAt, groupOf) : null;
      if (!found) return null;
      i = j + 1;
    } else {
      const group = groupAt(text, i);
      const el = [text.slice(i, i + 2), text[i]].find((e) => e in VALENCE && text.startsWith(e, i));
      // (deuterium, D - not the start of Dy, Db or Ds - wherever an H could stand: an atom of its own, written [2H] (CDCl3, D2O))
      if (text[i] === "D" && !/[a-z]/.test(text[i + 1] ?? "") && !group) {
        found = [{ kind: "group", label: "D", s: DEUTERIUM }];
        i += 1;
      } else if (group && group.length >= (el?.length ?? 0)) {
        const s = groupOf(group);
        if (!s || s.attach.length !== 1) return null;
        found = [{ kind: "group", label: group, s }];
        i += group.length;
      } else if (el) {
        found = [{ kind: "element", el }];
        i += el.length;
      } else return null;
    }
    const count = /^\d+/.exec(text.slice(i));
    const n = count ? Number(count[0]) : 1;
    if (count) i += count[0].length;
    for (let k = 0; k < n; k++) out.push(...found);
  }
  return out;
}

/** The longest group `groupOf` knows from `i` on: for a formula read without a list of labels. */
export const longestGroup =
  (groupOf: (label: string) => GroupStructure | null): GroupAt =>
  (text, i) => {
    for (let j = text.length; j > i; j--) if (groupOf(text.slice(i, j))) return text.slice(i, j);
    return undefined;
  };

/**
 * An anion of `charge` read from its parts, or null. It has one centre - an
 * element written once, not O or H - and round it oxygens, hydrogens, and
 * halogens and groups bound by one bond (F, Ph, OAc, CN):
 *
 * - with no oxygen, an ate anion of one charge: a centre with no lone pair
 *   left at a valence of its own takes one part more, and the charge on
 *   itself (BF4, PF6, SbF6, AlCl4, BPh4; BH4, AlH4, BH3CN, its hydrogens its
 *   own);
 * - with oxygens, an oxoanion: they are bound to the centre by double bonds
 *   but one for each charge, which carries it, and one for each hydrogen,
 *   which is theirs (ClO4, IO4, ClO2, CF3SO2, CO3, HCO3, PO4) - as many
 *   bonds in all as a valence of the centre's own.
 *
 * A second-row centre has no more than four bonds: no CF5, and no NO3 so.
 */
export function anionOf(parts: readonly Part[], charge: number): GroupStructure | null {
  const is = (el: string) => (p: Part) => p.kind === "element" && p.el === el;
  const elements = parts.flatMap((p) => (p.kind === "element" ? [p.el] : []));
  const once = [...new Set(elements)].filter((el) => el !== "O" && el !== "H" && elements.filter((e) => e === el).length === 1);
  for (const centre of once) {
    const rest = parts.filter((p) => !is(centre)(p));
    const others = rest.filter((p) => !is("O")(p) && !is("H")(p));
    if (others.some((p) => p.kind === "element" && !HALOGENS.has(p.el))) continue;
    const m = rest.filter(is("O")).length;
    const h = rest.filter(is("H")).length;
    const valences = [VALENCE[centre], ...(HIGHER[centre] ?? [])];
    let own: SmilesAtom;
    let oxygens: { charge: number; hs: number; order: number }[] = [];
    if (m === 0) {
      const v = valences.find((x) => others.length + h === x + 1 && OUTER[centre] === x);
      if (charge !== 1 || v == null || (SECOND_ROW.has(centre) && v + 1 > 4)) continue;
      own = { el: centre, hs: h, charge: -1 };
    } else {
      if (charge + h > m || !valences.includes(others.length + 2 * m - charge - h)) continue;
      own = { el: centre, hs: 0 };
      oxygens = Array.from({ length: m }, (_, k) =>
        k < charge ? { charge: -1, hs: 0, order: 1 } : k < charge + h ? { charge: 0, hs: 1, order: 1 } : { charge: 0, hs: 0, order: 2 },
      );
    }
    const atoms: SmilesAtom[] = [own];
    const bonds: StructureBond[] = [];
    for (const p of others) {
      const at = atoms.length;
      if (p.kind === "element") {
        atoms.push({ el: p.el, hs: 0 });
        bonds.push({ a1: 0, a2: at, order: 1 });
      } else {
        atoms.push(...p.s.atoms.map((a) => ({ ...a })));
        bonds.push(...p.s.bonds.map((b) => ({ ...b, a1: b.a1 + at, a2: b.a2 + at })), { a1: 0, a2: p.s.attach[0] + at, order: 1 });
      }
    }
    for (const o of oxygens) {
      atoms.push({ el: "O", hs: o.hs, ...(o.charge ? { charge: o.charge } : {}) });
      bonds.push({ a1: 0, a2: atoms.length - 1, order: o.order });
    }
    return { atoms, bonds, attach: [] };
  }
  return null;
}
