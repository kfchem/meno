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
import { chemWorker } from "../../../../lib/roles/worker";
import { componentsNamed } from "../../../../lib/net/components";
import { hydrogensFromComponent, type GivenHydrogen, type ResidueAtom } from "../../../../lib/chem/ccdHydrogens";
import { chargesFor, hydrogensRoom, protonated, protonationSites, startingForms, type Chosen, type OrdersBy, type ProtonAtom, type ProtonBond, type Site } from "../../../../lib/chem/protonation";
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
 * atoms in the order of `atoms`, its bonds among them), its sites, its
 * atoms' names, where its orders came from and the forms the card starts
 * at, the other atoms that can be charged, and whether the CCD's own
 * hydrogens can be given it (a PDB entry's ligand whose orders the CCD
 * gave).
 */
export type Protonation = {
  id: number;
  atoms: number[];
  part: { atoms: ProtonAtom[]; bonds: ProtonBond[] };
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
  const part = {
    atoms: atoms.map((i) => ({ el: m.atoms[i].el, ...(m.atoms[i].charge ? { charge: m.atoms[i].charge } : {}), ...(m.atoms[i].radical ? { radical: m.atoms[i].radical } : {}) })),
    bonds: m.bonds.flatMap((b) => (at.has(b.a1) && at.has(b.a2) ? [{ a1: at.get(b.a1)!, a2: at.get(b.a2)!, order: b.order }] : [])),
  };
  // (an entry's atoms by their names in it; any other's by element and number: N3)
  const labels = atoms.map((i) => m.biopolymer?.names[i] || `${m.atoms[i].el}${i + 1}`);
  const sites = protonationSites(part.atoms, part.bonds, (k) => labels[k]);
  const by = ordersByOf(m, atoms);
  const inSite = new Set(sites.flatMap((s) => s.atoms));
  const sum = new Float64Array(atoms.length);
  for (const b of part.bonds) {
    sum[b.a1] += b.order === 4 ? 1.5 : b.order;
    sum[b.a2] += b.order === 4 ? 1.5 : b.order;
  }
  const others = part.atoms.flatMap((a, k) => {
    const charges = inSite.has(k) ? [] : chargesFor(a, Math.round(sum[k]));
    return charges.length > 1 ? [{ atom: k, label: labels[k], charges, now: a.charge ?? 0 }] : [];
  });
  return { id: m.id, atoms, part, sites, labels, by, start: startingForms(by, sites), others, dictionary: !!m.biopolymer && by === "dictionary" };
}

/** The charge and spin multiplicity a part would have, protonated as chosen - or why it cannot be. */
export function protonatedSpecies(p: Protonation, chosen: Chosen): { charge: number; multiplicity: number } | { why: string } {
  const r = protonated(p.part.atoms, p.part.bonds, p.sites, chosen);
  if ("why" in r) return r;
  const atoms = p.part.atoms.map((a, k) => ({ el: a.el, x: 0, y: 0, z: 0, ...(r.charges[k] ? { charge: r.charges[k] } : {}), ...(a.radical ? { radical: a.radical } : {}) }));
  const hydrogens = r.hydrogens.flatMap((h) => Array.from({ length: h }, () => ({ el: "H", x: 0, y: 0, z: 0 })));
  const known = knownOf({ atoms: [...atoms, ...hydrogens], bonds: [] });
  return { charge: Number(known.charge), multiplicity: Number(known.multiplicity) };
}

/** Whether the chemist's choice is where the card started for a part the CCD's hydrogens can be given: each site's form as the CCD defines it, no atom charged otherwise. */
export const keptAsDictionary = (p: Protonation, chosen: Chosen) => p.dictionary && !chosen.charges.size && p.start.every((f, k) => f != null && f === chosen.forms[k]);

/** The molecule as it is now, the part's atoms the same - else it changed while the card was open: nothing is added. */
function moleculeNow(store: EditorStore, p: Protonation): Molecule3D {
  const m = store.getState().molecules3d.find((x) => x.id === p.id);
  if (!m || p.atoms.some((i) => i >= m.atoms.length || m.atoms[i].el !== p.part.atoms[p.atoms.indexOf(i)].el) || !canAddHydrogens(m, p.atoms))
    throw new Error("The molecule changed meanwhile: nothing was added.");
  return m;
}

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
  const answer = await chem.request("add_hydrogens", { molblock: block.molblock }, ADD_MS);
  const m = moleculeNow(store, p);
  const next = withHydrogens(drawn(m), block.atoms, answer.molblock);
  if (!next) throw new Error("The hydrogens could not be put on this molecule: nothing was added.");
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
    const linked = new Set(
      inResidue.flatMap((i, k) => (m.bonds.some((b) => (b.a1 === i && bp.residueOf[b.a2] !== r) || (b.a2 === i && bp.residueOf[b.a1] !== r)) ? [k] : [])),
    );
    const placed = hydrogensFromComponent(atoms, linked, component);
    if ("why" in placed) throw new Error(`${placed.why} Nothing was added.`);
    given.push(...placed.map((h) => ({ ...h, on: inResidue[h.on] })));
  }
  // (each atom's hydrogens those its bonds - to atoms whose valence counts - and its charge leave room for)
  const placedOn = [...new Set([...p.atoms, ...residueAtoms.flat()])];
  const labelOf = (i: number) => bp.names[i] || `${m.atoms[i].el}${i + 1}`;
  const want = placedOn.map((i) => hydrogensRoom(m.atoms, m.bonds, i));
  const have = placedOn.map((i) => given.filter((h) => h.on === i).length);
  const off = want.flatMap((w, k) => (have[k] !== w ? [labelOf(placedOn[k])] : []));
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
