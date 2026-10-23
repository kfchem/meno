import type { CoordinateStructure } from "../../../../lib/io/coordinates";
import { bondsByDistance } from "../../../../utils/structureParsers";
import type { Molecule3D } from "../store/types";

/**
 * Structures read from coordinates in a text (lib/io/coordinates), chosen
 * and named, as molecules in 3D: bonded by distance, their orders unknown
 * until they are found, as an XYZ file's are; each called by its name, where
 * it came from kept (`source`: the PDF's or the file's name), and what was
 * said of it - its charge and multiplicity, its notes - shown with it; the
 * charge and multiplicity it gives, as what the molecule was given; its
 * energy, where a note gives one in hartrees, as its energy.
 */
export function coordinateMolecules(chosen: readonly { structure: CoordinateStructure; name: string }[], source: string): Omit<Molecule3D, "id" | "at">[] {
  return chosen.map(({ structure: s, name }) => {
    const said = [
      ...(s.charge != null && s.multiplicity != null ? [{ label: "Charge, multiplicity", text: `${s.charge} ${s.multiplicity}` }] : []),
      ...s.notes.map((text) => ({ label: "Note", text })),
    ];
    return {
      atoms: s.atoms.map((a) => ({ el: a.el, x: a.x, y: a.y, z: a.z })),
      bonds: bondsByDistance(s.atoms),
      bondsFrom: "distance" as const,
      bondOrders: "unknown" as const,
      title: name,
      name: source,
      ...(energyOf(s.notes) != null ? { energies: [energyOf(s.notes)!] } : {}),
      ...(said.length ? { said } : {}),
      // (the charge and multiplicity the text gives it, as what it was given - each step told them, not what its atoms say: workflow/run speciesKept)
      ...(Number.isInteger(s.charge) || (Number.isInteger(s.multiplicity) && s.multiplicity! > 0)
        ? { calc: { readers: [], ...(Number.isInteger(s.charge) ? { charge: s.charge! } : {}), ...(Number.isInteger(s.multiplicity) && s.multiplicity! > 0 ? { multiplicity: s.multiplicity! } : {}) } }
        : {}),
    };
  });
}

/** An energy a note gives in hartrees - "E = -154.987654 Hartree", "E(RB3LYP) = -154.98 A.U." - the first; none, in other units or none. */
export function energyOf(notes: readonly string[]): number | undefined {
  for (const n of notes) {
    const m = /=\s*([-+]?\d+\.\d+)\s*(hartrees?|a\.\s*u\.|au|eh)?(?![a-z])/i.exec(n);
    if (m?.[2]) return Number(m[1]);
  }
  return undefined;
}
