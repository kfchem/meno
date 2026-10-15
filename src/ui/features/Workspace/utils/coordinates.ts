import type { CoordinateStructure } from "../../../../lib/io/coordinates";
import { bondsByDistance } from "../../../../utils/structureParsers";
import type { Molecule3D } from "../store/types";

/**
 * Structures read from coordinates in a text (lib/io/coordinates), chosen
 * and named, as molecules in 3D: bonded by distance, their orders unknown
 * until they are found, as an XYZ file's are; each called by its name, where
 * it came from kept (`source`: the PDF's or the file's name), and what was
 * said of it - its charge and multiplicity, its energies - shown with it.
 */
export function coordinateMolecules(chosen: readonly { structure: CoordinateStructure; name: string }[], source: string): Omit<Molecule3D, "id" | "at">[] {
  return chosen.map(({ structure: s, name }) => {
    const said = [
      ...(s.charge != null && s.multiplicity != null ? [{ label: "Charge, multiplicity", text: `${s.charge} ${s.multiplicity}` }] : []),
      ...s.notes.map((text) => ({ label: "Said", text })),
    ];
    return {
      atoms: s.atoms.map((a) => ({ el: a.el, x: a.x, y: a.y, z: a.z })),
      bonds: bondsByDistance(s.atoms),
      bondsFrom: "distance" as const,
      bondOrders: "unknown" as const,
      title: name,
      name: source,
      ...(said.length ? { made: { how: said } } : {}),
    };
  });
}
