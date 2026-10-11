/**
 * Chemical components as the wwPDB's Chemical Component Dictionary defines
 * them (CC0): each residue name a PDB entry uses - an amino acid, a
 * nucleotide, a ligand, an ion - with its atoms by name, its bonds' orders
 * and its atoms' formal charges. Read from the component's mmCIF file
 * (./cif) by the PDBx/mmCIF dictionary's definitions: `_chem_comp_atom`
 * (`atom_id`, `type_symbol`, `charge`: "the formal charge assignment
 * normally found in chemical diagrams", 0 unless given) and
 * `_chem_comp_bond` (`atom_id_1`, `atom_id_2`, `value_order`: sing, doub,
 * trip, quad, arom, delo, pi or poly; sing unless given). Pure: the files
 * are fetched by the app, once each, and kept (src-tauri/src/ccd.rs,
 * lib/net/components.ts).
 */
import { categoryRows, readCif } from "./cif";

export type ComponentAtom = { name: string; element: string; charge: number };
/** A bond between two atoms by name: its order, null where it is none of single, double and triple (an aromatic bond, a delocalised one...). */
export type ComponentBond = { a: string; b: string; order: 1 | 2 | 3 | null };
export type Component = { id: string; atoms: ComponentAtom[]; bonds: ComponentBond[] };

/** An element symbol as Meno writes it: CL, as the dictionary writes it, is Cl. */
const elementOf = (symbol: string) => symbol.charAt(0).toUpperCase() + symbol.slice(1).toLowerCase();

const ORDERS: Record<string, 1 | 2 | 3> = { sing: 1, doub: 2, trip: 3 };

/** A component from its mmCIF file; null where the file holds none - no component id, or atoms without names or elements. */
export function readComponent(text: string): Component | null {
  const block = readCif(text)[0];
  if (!block) return null;
  const id = block.items.get("_chem_comp.id") ?? block.name;
  if (!id) return null;
  const atoms: ComponentAtom[] = [];
  for (const row of categoryRows(block, "_chem_comp_atom")) {
    const name = row.atom_id;
    const symbol = row.type_symbol;
    if (!name || !symbol) return null;
    const charge = row.charge == null ? 0 : Number(row.charge);
    atoms.push({ name, element: elementOf(symbol), charge: Number.isInteger(charge) ? charge : 0 });
  }
  const bonds: ComponentBond[] = [];
  for (const row of categoryRows(block, "_chem_comp_bond")) {
    if (!row.atom_id_1 || !row.atom_id_2) return null;
    // (the vocabulary written in capitals in the dictionary's files: SING)
    const order = row.value_order == null ? 1 : (ORDERS[row.value_order.toLowerCase()] ?? null);
    bonds.push({ a: row.atom_id_1, b: row.atom_id_2, order });
  }
  return { id, atoms, bonds };
}

/** Whether a residue name can be a component's id: one to five capital letters and digits, as the dictionary's are. */
export const isComponentId = (name: string) => /^[A-Z0-9]{1,5}$/.test(name);
