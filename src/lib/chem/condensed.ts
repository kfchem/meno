import { anionOf, partsOf, VALENCE, type Part } from "./formula";
import { structureFormula, type GroupStructure, type StructureBond } from "./ligands";
import type { SmilesAtom } from "./smiles";

/**
 * Simple formulas, read by rule as the molecules they are: Et3N, i-Pr2NEt,
 * n-BuLi, MeMgBr, Bu3SnH, TMSCl, TBSOTf, Ac2O, (Boc)2O, CH2Cl2, MeOH, NaOMe,
 * LiCl. A formula is read into groups (Me, TMS, OTf, CN, as Meno's
 * abbreviations have them) and elements, each with its count; and it is a
 * molecule where its parts make one whole, as written:
 *
 * - one element with a valence of two or more - the centre - and as many
 *   groups and univalent elements as that valence (Et3N, MeMgBr, CH2Cl2), or
 * - two groups or univalent elements and nothing else (n-BuLi, TMSCl, HCl).
 *
 * Its hydrogens are the centre's, or the other part's. Sodium, potassium,
 * rubidium and caesium are bound as ions, and lithium as one to anything
 * but carbon: NaOMe is Na⁺ and MeO⁻, and n-BuLi has its C-Li bond. A label
 * with a free valence (OMe, NMe2, CH2Br) makes no molecule, and is no such
 * formula: it stays the group it is.
 *
 * Or it is a salt: alkali metals, each a cation, and what is left an anion
 * of as many charges, as ./formula reads one - NaBH4, LiAlH4, NaBH(OAc)3,
 * NaIO4, NaClO2, K2CO3, NaHCO3, K3PO4.
 */

/** Bound as ions: these always, lithium to anything but carbon. */
const IONIC = new Set(["Na", "K", "Rb", "Cs"]);

/**
 * A simple formula as the molecule it is, and its molecular formula as its
 * name - or null for a label that is no such formula. `labels` are the
 * groups' labels, longest first; `groupOf` gives each one's structure.
 */
export function condensedStructure(
  label: string,
  labels: readonly string[],
  groupOf: (label: string) => GroupStructure | null,
): (GroupStructure & { name: string }) | null {
  const parts = partsOf(label, (text, i) => labels.find((l) => text.startsWith(l, i)), groupOf);
  if (!parts || parts.length < 2) return null;
  return moleculeOf(parts) ?? saltOf(parts);
}

/**
 * An anion written alone, its charge last - PF6-, BF4-, SbF6-, AlCl4-,
 * ClO4- - as `anionOf` reads one in a salt (NaBF4), or null.
 */
export function anionStructure(
  label: string,
  labels: readonly string[],
  groupOf: (label: string) => GroupStructure | null,
): (GroupStructure & { name: string }) | null {
  const m = /^(.+?)[-\u2212]$/.exec(label);
  const parts = m && partsOf(m[1], (text, i) => labels.find((l) => text.startsWith(l, i)), groupOf);
  if (!parts || parts.length < 2) return null;
  const ion = anionOf(parts, 1);
  return ion && { ...ion, name: label };
}

/** Parts as one molecule: a centre and its valence's parts, or two univalent parts. */
function moleculeOf(parts: Part[]): (GroupStructure & { name: string }) | null {
  const valence = (p: Part) => (p.kind === "element" ? VALENCE[p.el] : 1);
  const centres = parts.filter((p) => valence(p) > 1);
  const others = parts.filter((p) => valence(p) === 1);
  if (centres.length > 1) return null;
  if (centres.length === 1 ? others.length !== valence(centres[0]) : others.length !== 2) return null;

  const atoms: SmilesAtom[] = [];
  const bonds: StructureBond[] = [];
  /** Adds a part's atoms: the index of the one it is bound by. */
  const add = (p: Part): number => {
    if (p.kind === "element") {
      atoms.push({ el: p.el, hs: 0 });
      return atoms.length - 1;
    }
    const at = atoms.length;
    atoms.push(...p.s.atoms.map((a) => ({ ...a })));
    bonds.push(...p.s.bonds.map((b) => ({ ...b, a1: b.a1 + at, a2: b.a2 + at })));
    return p.s.attach[0] + at;
  };
  const isH = (p: Part) => p.kind === "element" && p.el === "H";
  const isMetal = (p: Part) => p.kind === "element" && (IONIC.has(p.el) || p.el === "Li");
  // the hub: the centre, or of two, the one that is not H (H2 and a hydride's H stay atoms)
  const [hub, ...rest] =
    centres.length === 1 ? [centres[0], ...others] : isH(others[0]) && !isMetal(others[1]) ? [others[1], others[0]] : others;
  const at = add(hub);
  for (const p of rest) {
    if (isH(p) && !isMetal(hub) && !(isH(hub) && rest.length === 1)) {
      // its hydrogens: the hub's own
      if (hub.kind === "element") atoms[at].hs = (atoms[at].hs ?? 0) + 1;
      continue;
    }
    const to = add(p);
    // an ion pair: the metal's charge and its partner's
    const [metal, other] = isMetal(p) ? [to, at] : isMetal(hub) ? [at, to] : [-1, -1];
    if (metal >= 0 && (IONIC.has(atoms[metal].el) || atoms[other].el !== "C")) {
      atoms[metal].charge = (atoms[metal].charge ?? 0) + 1;
      atoms[other].charge = (atoms[other].charge ?? 0) - 1;
    } else bonds.push({ a1: at, a2: to, order: 1 });
  }
  const s: GroupStructure = { atoms, bonds, attach: [] };
  return { ...s, name: structureFormula(s) };
}

/** Parts as a salt: its alkali metals, and the anion the rest makes. */
function saltOf(parts: Part[]): (GroupStructure & { name: string }) | null {
  const isMetal = (p: Part): p is Extract<Part, { kind: "element" }> => p.kind === "element" && (IONIC.has(p.el) || p.el === "Li");
  const metals = parts.filter(isMetal);
  const ion = metals.length ? anionOf(parts.filter((p) => !isMetal(p)), metals.length) : null;
  if (!ion) return null;
  const atoms: SmilesAtom[] = [...metals.map((p) => ({ el: p.el, hs: 0, charge: 1 })), ...ion.atoms];
  const bonds = ion.bonds.map((b) => ({ ...b, a1: b.a1 + metals.length, a2: b.a2 + metals.length }));
  const s: GroupStructure = { atoms, bonds, attach: [] };
  return { ...s, name: structureFormula(s) };
}
