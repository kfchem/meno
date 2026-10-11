/**
 * A molecule in 3D's bond orders and hydrogens, where its file leaves them
 * out (docs/WORKSPACE.md, *Hydrogens and bond orders*), asked of the plugin
 * that draws a molecule in 3D as a formula (the "drawing" role: RDKit's) -
 * the same request the formula's bond orders are found by (`drawing_of`,
 * `perceive`), and two of its own: orders given from a SMILES, hydrogens
 * added where the atoms' geometry puts them.
 *
 * Found from its shape, the orders are learnt of the molecule rather than
 * done to it: no undo step of their own, and only where the plugin is at
 * hand already - nothing is set up because a file was opened. Given from a
 * SMILES or from the wwPDB's Chemical Component Dictionary, or hydrogens
 * added, they are the chemist's edits, and undone.
 */
import { useEffect, useRef } from "react";
import { chemAtHand, chemWorker } from "../../../../lib/roles/worker";
import type { ChemClient } from "../../../../lib/roles/client";
import { useEditor, useEditorStore, type EditorStore } from "../store";
import type { Molecule3D } from "../store/types";
import { blockOf, bondsAmong, hasHydrogens, ligandGroups, MOST_PERCEIVED, partOf, stillUnknown, withComponents, withHydrogens, withOrders, withPartOrders } from "../utils/completeness";
import { ordersFromGeometry } from "../../../../lib/chem/ordersFromGeometry";
import { componentsNamed } from "../../../../lib/net/components";
import { isWater } from "../../../../lib/chem/biopolymer";

/** What is asked of the plugin, and how long it may take, in ms. */
const ORDERS_MS = 30_000;

/**
 * A molecule's bond orders found from where its atoms stand, as its first
 * frame has them: its ligands' still unknown, for a PDB entry, each alone;
 * else all of it - where it has hydrogens (the plugin's method works from
 * them) and not too many atoms. What is found is learnt of
 * the molecule; what is not stays unknown, and it says so.
 */
export async function perceiveOrders(store: EditorStore, m: Molecule3D, chem: ChemClient): Promise<void> {
  // (a ligand's given from a SMILES, or found before, stay as they are)
  const open = new Set(stillUnknown(m));
  const parts = m.biopolymer ? ligandGroups(m).filter((g) => open.has(g[0])) : [m.atoms.map((_, i) => i)];
  // (none it could be asked of: nothing learnt - unknown, as it was)
  const asked = (atoms: number[]) => atoms.length <= MOST_PERCEIVED && hasHydrogens(m, atoms);
  if (!open.size || !parts.some(asked)) return;
  const found: { atoms: number[]; molblock: string }[] = [];
  const unknown: number[] = [];
  for (const atoms of parts) {
    if (!asked(atoms)) {
      unknown.push(...atoms);
      continue;
    }
    const block = blockOf(m, atoms);
    try {
      const r = await chem.request("drawing_of", { molblock: block.molblock, perceive: true }, ORDERS_MS);
      if (r.perceived) found.push({ atoms: block.atoms, molblock: r.molblock });
      else unknown.push(...atoms);
    } catch {
      unknown.push(...atoms);
    }
  }
  store.getState().learnMolecule3d(m.id, (cur) => {
    let next = cur;
    const left = [...unknown];
    // (heavy atoms back, in their order: drawing_of leaves the hydrogens out -
    // an answer of other atoms is none)
    for (const f of found) {
      const given = withOrders(next, f.atoms, f.molblock, true);
      if (given) next = given;
      else left.push(...f.atoms);
    }
    const { unknownOrders: _was, ...rest } = next;
    if (!left.length) return { ...rest, bondOrders: "perceived" };
    // (a PDB entry's ligands: those still unknown, by their atoms)
    return cur.biopolymer ? { ...rest, bondOrders: "unknown", unknownOrders: left.sort((p, q) => p - q) } : { ...rest, bondOrders: "unknown" };
  });
}

/**
 * Each molecule in 3D whose bond orders are unknown, its orders sought
 * once - as it comes into the workspace, opened or pasted - where the
 * plugin is at hand.
 */
export function useBondOrders() {
  const store = useEditorStore();
  const molecules = useEditor((s) => s.molecules3d);
  // (each molecule once, by its atoms: an edit of it makes it another)
  const asked = useRef(new WeakSet<object>());
  useEffect(() => {
    const wanted = molecules.filter((m) => m.bondOrders === "unknown" && !asked.current.has(m.atoms));
    if (!wanted.length) return;
    for (const m of wanted) asked.current.add(m.atoms);
    void (async () => {
      if (!(await chemAtHand("drawing").catch(() => false))) return;
      const chem = await chemWorker("drawing").catch(() => null);
      if (!chem) return;
      for (const m of wanted) await perceiveOrders(store, m, chem);
    })();
  }, [molecules, store]);
}

/**
 * The bond orders of a molecule's ligand - the one `atom` is part of, for
 * a PDB entry; else all of it - given from a SMILES of it, as one undo
 * step. Throws where the plugin cannot have them, or the SMILES is not the
 * ligand's.
 */
export async function ordersFromSmiles(store: EditorStore, id: number, atom: number | null, smiles: string): Promise<void> {
  const m = store.getState().molecules3d.find((x) => x.id === id);
  const atoms = m && partOf(m, atom);
  if (!m || !atoms) throw new Error("Point at the ligand whose bond orders these are.");
  const chem = await chemWorker("drawing");
  const block = blockOf(m, atoms);
  const r = await chem.request("orders_from_smiles", { molblock: block.molblock, smiles: smiles.trim() }, ORDERS_MS);
  store.getState().changeMolecule3d("bond orders", id, (cur) => {
    const next = withOrders(cur, block.atoms, r.molblock);
    if (!next) return cur;
    const left = (cur.biopolymer ? stillUnknown(cur) : []).filter((i) => !block.atoms.includes(i));
    const { unknownOrders: _was, ...rest } = next;
    // (all of it given, or every ligand's: known now)
    return left.length ? { ...rest, bondOrders: "unknown", unknownOrders: left } : { ...rest, bondOrders: "assigned" };
  });
}

/**
 * The bond orders of a molecule's ligand - the one `atom` is part of, for
 * a PDB entry; else all of it - estimated from its atoms' distances and
 * shape (lib/chem/ordersFromGeometry), as one undo step. Throws, changing
 * nothing, where they cannot all be told so: they stay unknown, and say so.
 */
export function estimateOrders(store: EditorStore, id: number, atom: number | null): void {
  const m = store.getState().molecules3d.find((x) => x.id === id);
  const atoms = m && partOf(m, atom);
  if (!m || !atoms) throw new Error("Point at the ligand whose bond orders these are.");
  const r = ordersFromGeometry(
    atoms.map((i) => m.atoms[i]),
    bondsAmong(m, atoms),
  );
  if (!r.decided) throw new Error("Some of these bond orders cannot be told from the distances: give them from a SMILES.");
  store.getState().changeMolecule3d("bond orders", id, (cur) => {
    const next = withPartOrders(cur, atoms, r.orders, r.charges);
    const left = (cur.biopolymer ? stillUnknown(cur) : []).filter((i) => !atoms.includes(i));
    const { unknownOrders: _was, ...rest } = next;
    return left.length ? { ...rest, bondOrders: "unknown", unknownOrders: left } : { ...rest, bondOrders: "estimated" };
  });
}

/** The hydrogens a molecule's ligand - or all of it - leaves out, added where its atoms' geometry puts them, as one undo step. */
export async function addHydrogens(store: EditorStore, id: number, atom: number | null): Promise<void> {
  const m = store.getState().molecules3d.find((x) => x.id === id);
  const atoms = m && partOf(m, atom);
  if (!m || !atoms) throw new Error("Point at the ligand to add hydrogens to.");
  const chem = await chemWorker("drawing");
  const block = blockOf(m, atoms);
  const r = await chem.request("add_hydrogens", { molblock: block.molblock }, ORDERS_MS);
  store.getState().changeMolecule3d("add hydrogens", id, (cur) => withHydrogens(cur, block.atoms, r.molblock) ?? cur);
}

/** Whether a part of a molecule (`atoms`) can be given its bond orders from a SMILES: they are unknown there. */
export function canGiveOrders(m: Molecule3D, atoms: readonly number[] | null): boolean {
  return !!atoms?.length && stillUnknown(m).includes(atoms[0]);
}

/** Whether a part of a molecule (`atoms`) can be given its hydrogens: its bond orders known, it has none yet, and the molecule has one frame. */
export function canAddHydrogens(m: Molecule3D, atoms: readonly number[] | null): boolean {
  if (!atoms?.length || m.frames?.length || hasHydrogens(m, atoms)) return false;
  return !stillUnknown(m).includes(atoms[0]);
}

/**
 * A PDB entry's residues - its chains' and its ligands' - given their bond
 * orders and charges from the wwPDB's Chemical Component Dictionary, as
 * one undo step: each component fetched once, asking first the first time
 * (lib/net/components). Null where the chemist said no to the network; else how
 * many residues were given, of how many it has, and the names the
 * dictionary has no component for.
 */
export async function ordersFromDictionary(store: EditorStore, id: number): Promise<{ given: number; of: number; absent: string[] } | null> {
  const m = store.getState().molecules3d.find((x) => x.id === id);
  if (!m?.biopolymer) throw new Error("Only a PDB entry's residues are in the dictionary.");
  const residues = m.biopolymer.residues.filter((r) => !isWater(r));
  const looked = await componentsNamed(residues.map((r) => r.name));
  if (!looked) return null;
  let given = 0;
  store.getState().changeMolecule3d("bond orders", id, (cur) => {
    const r = withComponents(cur, looked.components);
    if (!r?.given.length) return cur;
    given = r.given.length;
    return r.molecule;
  });
  return { given, of: residues.length, absent: looked.absent };
}

/** Whether a molecule's bond orders can be given from the dictionary: a PDB entry whose ligands' are unknown, or its chains' not given from it. */
export function canAskDictionary(m: Molecule3D): boolean {
  if (!m.biopolymer?.residues.some((r) => !isWater(r))) return false;
  return stillUnknown(m).length > 0 || m.chainOrders !== "dictionary";
}
