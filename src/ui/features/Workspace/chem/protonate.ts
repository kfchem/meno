/**
 * A molecule in 3D without its hydrogens given them as the chemist chooses
 * how it is protonated (docs/WORKSPACE.md, *How it is protonated*): its
 * sites and their forms (lib/chem/protonation), shown on a card
 * (ProtonationCard); the bonds and charges the forms chosen draw, and the
 * hydrogens they leave room for added where the atoms' geometry puts them,
 * by the plugin that draws a molecule as a formula ("add_hydrogens") - or,
 * for a PDB entry's ligand whose orders the CCD gave, kept as the CCD
 * defines it, the CCD's own hydrogens put on its atoms
 * (lib/chem/ccdHydrogens). Either way as one undo step, and only where
 * every atom then has the hydrogens its form gives it: else nothing is
 * changed, and why is said.
 */
import { create } from "zustand";
import { chargeText } from "../../../../lib/chem/molecule";
import { chemWorker } from "../../../../lib/roles/worker";
import { componentsNamed } from "../../../../lib/net/components";
import { hydrogensFromComponent, type GivenHydrogen, type ResidueAtom } from "../../../../lib/chem/ccdHydrogens";
import { chargesFor, countsInValence, hydrogensRooms, protonated, protonationSites, startingForms, type Chosen, type OrdersBy, type ProtonAtom, type ProtonBond, type Site, valenceSums } from "../../../../lib/chem/protonation";
import { AROMATIC_BOND, kekulized } from "../../../../lib/chem/kekulize";
import { knownOf } from "../../../../lib/io/writers";
import type { EditorStore } from "../store";
import type { Molecule3D } from "../store/types";
import { blockOf, partOf, withHydrogens } from "../utils/completeness";
import { canAddHydrogens } from "./bondOrders";

/** What is asked of the plugin, and how long it may take, in ms. */
const ADD_MS = 30_000;

/** An atom outside every site that the chemist may charge: its place in the part, its name, the charges it can take, and its own now. */
export type OtherAtom = { atom: number; label: string; charges: number[]; now: number };

/**
 * How a part of a molecule (`atoms`: all of it; a PDB entry's ligand) can
 * be protonated, as its card shows it: the part on its own (`part`, its
 * atoms in the order of `atoms`, its bonds among them - aromatic ones, a
 * file's bond type 4, drawn as single and double, `aromatic`; as the
 * molecule has them, `given`), or why it cannot be (`why`), its sites, its
 * atoms' names, where its orders came from and the forms the card starts
 * at, the other atoms that can be charged, and whether the CCD's own
 * hydrogens can be given it (a PDB entry's ligand whose orders the CCD
 * gave).
 */
export type Protonation = {
  id: number;
  atoms: number[];
  part: { atoms: ProtonAtom[]; bonds: ProtonBond[] };
  given: ProtonBond[];
  aromatic: boolean;
  why?: string;
  sites: Site[];
  labels: string[];
  by: OrdersBy;
  start: (number | null)[];
  others: OtherAtom[];
  dictionary: boolean;
};

/** Where a part's bond orders came from: a PDB entry's ligand's by its residues, else the molecule's own. */
export function ordersByOf(m: Molecule3D, atoms: readonly number[]): OrdersBy {
  const bp = m.biopolymer;
  return (bp && m.ligandOrders?.[bp.residueOf[atoms[0]]]) || m.bondOrders;
}

/** How the part of a molecule `atom` is in - all of it, or a PDB entry's ligand - can be protonated; none where it cannot be given hydrogens (chem/bondOrders `canAddHydrogens`). */
export function protonationOf(m: Molecule3D, atom: number | null): Protonation | null {
  const atoms = partOf(m, atom);
  if (!atoms || !canAddHydrogens(m, atoms)) return null;
  const at = new Map(atoms.map((a, k) => [a, k]));
  const partAtoms = atoms.map((i) => ({ el: m.atoms[i].el, ...(m.atoms[i].charge ? { charge: m.atoms[i].charge } : {}), ...(m.atoms[i].radical ? { radical: m.atoms[i].radical } : {}) }));
  const given = m.bonds.flatMap((b) => (at.has(b.a1) && at.has(b.a2) ? [{ a1: at.get(b.a1)!, a2: at.get(b.a2)!, order: b.order }] : []));
  // (aromatic bonds as single and double - its nitrogens' hydrogens as few as Hückel's rule leaves, which of them the file does not say: lib/chem/kekulize)
  const aromatic = given.some((b) => b.order === AROMATIC_BOND);
  const orders = aromatic ? kekulized(partAtoms, given).orders : null;
  const part = { atoms: partAtoms, bonds: orders ? given.map((b, k) => ({ ...b, order: orders[k] })) : given };
  const unkekulized = aromatic
    ? [...new Set(given.flatMap((b) => (b.order === AROMATIC_BOND ? [b.a1, b.a2] : [])))].filter((k) => partAtoms[k].el === "C" && !part.bonds.some((b) => (b.a1 === k || b.a2 === k) && b.order === 2))
    : [];
  // (an entry's atoms by their names in it; any other's by element and number: N3)
  const labels = atoms.map((i) => m.biopolymer?.names[i] || `${m.atoms[i].el}${i + 1}`);
  const sites = protonationSites(part.atoms, part.bonds, (k) => labels[k]);
  const by = ordersByOf(m, atoms);
  const inSite = new Set(sites.flatMap((s) => s.atoms));
  const sum = valenceSums(part.atoms, part.bonds);
  const others = part.atoms.flatMap((a, k) => {
    // (its own charge among them, whatever its bonds: what it has now is always one to keep)
    const now = a.charge ?? 0;
    const can = inSite.has(k) ? [] : chargesFor(a, Math.round(sum[k]));
    const charges = can.length && !can.includes(now) ? [...can, now].sort((p, q) => p - q) : can;
    return charges.length > 1 ? [{ atom: k, label: labels[k], charges, now }] : [];
  });
  return {
    id: m.id,
    atoms,
    part,
    given,
    aromatic,
    ...(unkekulized.length ? { why: `${unkekulized.map((k) => labels[k]).join(", ")} cannot be drawn with single and double bonds as ${unkekulized.length === 1 ? "its aromatic bonds are" : "their aromatic bonds are"}: nothing can be added.` } : {}),
    sites,
    labels,
    by,
    start: startingForms(by, sites, aromatic),
    others,
    dictionary: !!m.biopolymer && by === "dictionary",
  };
}

/** A site as its row names it: what it is, and the atoms whose hydrogens it moves - "Carboxyl O4, O5", "Thiazole nitrogen N3". */
export const siteName = (p: Protonation, s: Site) => `${s.title} ${s.changing.map((k) => p.labels[k]).join(", ")}`;

/** A form as its choice says it: what it is, its charge, where its hydrogens are - "Imidazole - H on N3". */
export const formName = (f: Site["forms"][number]) => `${f.name}${f.charge ? ` (${chargeText(f.charge)})` : ""} - ${f.where}`;

/** The charge and spin multiplicity a part would have, protonated as chosen - or why it cannot be. */
export function protonatedSpecies(p: Protonation, chosen: Chosen): { charge: number; multiplicity: number } | { why: string } {
  if (p.why) return { why: p.why };
  const r = protonated(p.part.atoms, p.part.bonds, p.sites, chosen);
  if ("why" in r) return r;
  const atoms = p.part.atoms.map((a, k) => ({ el: a.el, x: 0, y: 0, z: 0, ...(r.charges[k] ? { charge: r.charges[k] } : {}), ...(a.radical ? { radical: a.radical } : {}) }));
  const hydrogens = r.hydrogens.flatMap((h) => Array.from({ length: h }, () => ({ el: "H", x: 0, y: 0, z: 0 })));
  const known = knownOf({ atoms: [...atoms, ...hydrogens], bonds: [] });
  return { charge: Number(known.charge), multiplicity: Number(known.multiplicity) };
}

/** Whether the chemist's choice is where the card started for a part the CCD's hydrogens can be given: each site's form as the CCD defines it, no atom charged otherwise. */
export const keptAsDictionary = (p: Protonation, chosen: Chosen) => p.dictionary && !chosen.charges.size && p.start.every((f, k) => f != null && f === chosen.forms[k]);

/** Whether a molecule's part is no longer as its card was shown it: an atom's element, charge or unpaired electrons, or a bond among its atoms or its order, changed - an undo while the card was open, say. */
function changedSince(m: Molecule3D, p: Protonation): boolean {
  if (p.atoms.some((i) => i >= m.atoms.length)) return true;
  const changedAtom = p.atoms.some((i, k) => {
    const [a, was] = [m.atoms[i], p.part.atoms[k]];
    return a.el !== was.el || (a.charge ?? 0) !== (was.charge ?? 0) || (a.radical ?? null) !== (was.radical ?? null);
  });
  if (changedAtom) return true;
  const at = new Map(p.atoms.map((a, k) => [a, k]));
  const said = (a1: number, a2: number, order: number) => `${Math.min(a1, a2)},${Math.max(a1, a2)}:${order}`;
  const now = m.bonds.flatMap((b) => (at.has(b.a1) && at.has(b.a2) ? [said(at.get(b.a1)!, at.get(b.a2)!, b.order)] : [])).sort();
  const was = p.given.map((b) => said(b.a1, b.a2, b.order)).sort();
  return now.join(" ") !== was.join(" ");
}

const CHANGED = "The molecule changed while this was open: nothing was added. Ask for its hydrogens again.";

/** Why a molecule of other frames is given no hydrogens: each frame would want its own. */
const framesWhy = (m: Molecule3D) => `It has ${(m.frames?.length ?? 0) + 1} frames, and hydrogens are put on one geometry: nothing was added.`;

/** The molecule as it is now, its part as the card was shown it - else it changed while the card was open, or was given other frames: nothing is added. */
function moleculeNow(store: EditorStore, p: Protonation): Molecule3D {
  const m = store.getState().molecules3d.find((x) => x.id === p.id);
  if (m?.frames?.length && !changedSince(m, p)) throw new Error(framesWhy(m));
  if (!m || changedSince(m, p) || !canAddHydrogens(m, p.atoms)) throw new Error(CHANGED);
  return m;
}

/** How far, in ångströms, an atom may have gone and still be where it was: well under any digit a file writes. */
const STILL = 1e-4;

/** Whether any of `atoms` is not where it was in `was`: moved while the plugin put hydrogens where the atoms were. */
const movedSince = (was: Molecule3D, m: Molecule3D, atoms: readonly number[]) =>
  atoms.some((i) => Math.abs(m.atoms[i].x - was.atoms[i].x) > STILL || Math.abs(m.atoms[i].y - was.atoms[i].y) > STILL || Math.abs(m.atoms[i].z - was.atoms[i].z) > STILL);

/** How many hydrogens each of a part's atoms carries in a molecule: those bonded to it. */
function hydrogensOn(m: Molecule3D, atoms: readonly number[]): number[] {
  const at = new Map(atoms.map((a, k) => [a, k]));
  const count = atoms.map(() => 0);
  for (const b of m.bonds) {
    if (at.has(b.a1) && m.atoms[b.a2]?.el === "H") count[at.get(b.a1)!]++;
    else if (at.has(b.a2) && m.atoms[b.a1]?.el === "H") count[at.get(b.a2)!]++;
  }
  return count;
}

/** Why the hydrogens a part was given are not those it should have, by the atoms whose are not: none where they all are. */
function mismatch(p: Protonation, have: readonly number[], want: readonly number[]): string | null {
  const off = want.flatMap((w, k) => (have[k] !== w ? [p.labels[k]] : []));
  return off.length ? `${off.join(", ")} would not have the hydrogens chosen for ${off.length === 1 ? "it" : "them"}: nothing was added.` : null;
}

/**
 * A part protonated as chosen, as one undo step: its bonds' orders and its
 * atoms' charges as the forms chosen draw them, and the hydrogens they
 * leave room for added by the plugin where its atoms' geometry puts them.
 * Throws, changing nothing, where they cannot be drawn together, or the
 * plugin's hydrogens are not those chosen.
 */
export async function addHydrogensAsChosen(store: EditorStore, p: Protonation, chosen: Chosen): Promise<void> {
  if (p.why) throw new Error(p.why);
  const r = protonated(p.part.atoms, p.part.bonds, p.sites, chosen);
  if ("why" in r) throw new Error(r.why);
  const chem = await chemWorker("drawing");
  const drawn = (m: Molecule3D): Molecule3D => {
    const at = new Map(p.atoms.map((a, k) => [a, k]));
    const orderOf = new Map(p.part.bonds.map((b, k) => [`${p.atoms[b.a1]},${p.atoms[b.a2]}`, r.orders[k]]));
    return {
      ...m,
      atoms: m.atoms.map((a, i) => {
        const j = at.get(i);
        if (j == null || r.charges[j] === (a.charge ?? 0)) return a;
        const { charge: _was, ...rest } = a;
        return r.charges[j] ? { ...rest, charge: r.charges[j] } : rest;
      }),
      bonds: m.bonds.map((b) => {
        const order = orderOf.get(`${b.a1},${b.a2}`) ?? orderOf.get(`${b.a2},${b.a1}`);
        return order == null || order === b.order ? b : { ...b, order };
      }),
    };
  };
  const before = drawn(moleculeNow(store, p));
  const block = blockOf(before, p.atoms);
  // (each atom's hydrogens as chosen, in the block's order - the part's)
  const answer = await chem.request("add_hydrogens", { molblock: block.molblock, hydrogens: block.atoms.map((i) => r.hydrogens[p.atoms.indexOf(i)]) }, ADD_MS);
  const m = moleculeNow(store, p);
  // (its hydrogens put where its atoms were as they were sent: one moved meanwhile would have them in the wrong place)
  if (movedSince(before, m, p.atoms)) throw new Error(CHANGED);
  const next = withHydrogens(drawn(m), block.atoms, answer.molblock);
  if (!next) throw new Error("The hydrogens placed did not come back on this molecule's atoms: nothing was added.");
  const why = mismatch(p, hydrogensOn(next, p.atoms), r.hydrogens);
  if (why) throw new Error(why);
  store.getState().changeMolecule3d("add hydrogens", p.id, () => ({ ...next, hydrogensAdded: [...(m.hydrogensAdded ?? []), { by: "chosen", atoms: p.atoms }] }));
}

/**
 * A PDB entry's ligand given the hydrogens the CCD defines for it, as one
 * undo step: each of its residues' component's hydrogens put on its atoms
 * (lib/chem/ccdHydrogens), named as the CCD names them. Throws, changing
 * nothing, where a component cannot be had, its atoms are not all there,
 * or its hydrogens do not fit the ligand's bonds as they are drawn - each
 * atom's valence met by its bonds and its hydrogens (lib/chem/protonation
 * `hydrogensRoom`).
 */
export async function addHydrogensFromDictionary(store: EditorStore, p: Protonation): Promise<void> {
  const m0 = moleculeNow(store, p);
  const bp0 = m0.biopolymer;
  if (!bp0) throw new Error("Only a PDB entry's ligands are in the CCD.");
  const residues = [...new Set(p.atoms.map((i) => bp0.residueOf[i]))];
  const looked = await componentsNamed(residues.map((r) => bp0.residues[r].name));
  if (!looked) throw new Error("The CCD was not looked up: nothing was added.");
  const m = moleculeNow(store, p);
  const bp = m.biopolymer!;
  const given: GivenHydrogen[] = [];
  // (each residue's atoms all - those of it a broken ligand's part leaves out too: missing from the part, they are said to be)
  const residueAtoms = residues.map((r) => m.atoms.flatMap((_, i) => (bp.residueOf[i] === r ? [i] : [])));
  for (const [k, r] of residues.entries()) {
    const name = bp.residues[r].name;
    const component = looked.components.get(name);
    if (!component) throw new Error(`${name} is not in the CCD: nothing was added.`);
    const inResidue = residueAtoms[k];
    const atoms: ResidueAtom[] = inResidue.map((i) => ({ name: bp.names[i], el: m.atoms[i].el, x: m.atoms[i].x, y: m.atoms[i].y, z: m.atoms[i].z }));
    // (its atoms bonded to another residue's, and where those are - not to a metal's: such a bond is the metal's, in place of no hydrogen)
    const linked = new Map<number, { x: number; y: number; z: number }[]>();
    inResidue.forEach((i, k) => {
      const to = m.bonds
        .flatMap((b) => (b.a1 === i && bp.residueOf[b.a2] !== r ? [b.a2] : b.a2 === i && bp.residueOf[b.a1] !== r ? [b.a1] : []))
        .filter((j) => m.atoms[j].el !== "H" && countsInValence(m.atoms[j].el));
      if (to.length) linked.set(k, to.map((j) => m.atoms[j]));
    });
    const placed = hydrogensFromComponent(atoms, linked, component);
    if ("why" in placed) throw new Error(`${placed.why} Nothing was added.`);
    given.push(...placed.map((h) => ({ ...h, on: inResidue[h.on] })));
  }
  // (each atom's hydrogens those its bonds - to atoms whose valence counts - and its charge leave room for)
  const placedOn = [...new Set([...p.atoms, ...residueAtoms.flat()])];
  const labelOf = (i: number) => bp.names[i] || `${m.atoms[i].el}${i + 1}`;
  // (an atom on a metal: its bond to it in place of a hydrogen, or not - either, as the CCD has it)
  const want = placedOn.map((i) => hydrogensRooms(m.atoms, m.bonds, i));
  const have = placedOn.map((i) => given.filter((h) => h.on === i).length);
  const off = want.flatMap((w, k) => (!w.includes(have[k]) ? [labelOf(placedOn[k])] : []));
  if (off.length) throw new Error(`The CCD's hydrogens do not fit ${off.join(", ")} as ${off.length === 1 ? "its bonds are" : "their bonds are"} drawn: nothing was added.`);
  const n = m.atoms.length;
  store.getState().changeMolecule3d("add hydrogens", p.id, () => ({
    ...m,
    atoms: [...m.atoms, ...given.map((h) => ({ el: "H", x: h.x, y: h.y, z: h.z }))],
    bonds: [...m.bonds, ...given.map((h, k) => ({ a1: h.on, a2: n + k, order: 1 }))],
    ...(m.drawnFrom ? { drawnFrom: [...m.drawnFrom, ...given.map(() => null)] } : {}),
    biopolymer: { ...bp, names: [...bp.names, ...given.map((h) => h.name)], residueOf: [...bp.residueOf, ...given.map((h) => bp.residueOf[h.on])] },
    hydrogensAdded: [...(m.hydrogensAdded ?? []), { by: "dictionary", atoms: p.atoms }],
  }));
}

/** The atoms the protonation card points at - a site's, as the pointer is over its row - lit on their molecule. */
export const useProtonationMark = create<{ marked: { id: number; atoms: number[] } | null; mark: (marked: { id: number; atoms: number[] } | null) => void }>((set) => ({
  marked: null,
  mark: (marked) => set({ marked }),
}));
