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
    const noted = energyNoted(s.notes);
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
      // (its energy, with what its notes name it - "E(MP2)" - as what its energies are; or none, and why, where they give two that differ)
      ...(noted && "energy" in noted ? { energies: [noted.energy], made: { how: [], energies: noted.name } } : {}),
      ...(said.length || (noted && "why" in noted) ? { said: [...said, ...(noted && "why" in noted ? [{ label: "Energy", text: `none taken: ${noted.why}` }] : [])] } : {}),
      // (the charge and multiplicity the text gives it, as what it was given - each step told them, not what its atoms say: workflow/run speciesKept)
      ...(Number.isInteger(s.charge) || (Number.isInteger(s.multiplicity) && s.multiplicity! > 0)
        ? { calc: { readers: [], ...(Number.isInteger(s.charge) ? { charge: s.charge! } : {}), ...(Number.isInteger(s.multiplicity) && s.multiplicity! > 0 ? { multiplicity: s.multiplicity! } : {}) } }
        : {}),
    };
  });
}

/** A unit of energy in hartrees, as a note says it after its value, or in brackets after its name ("SCF energy (a.u.)"). */
const HARTREES = /^(?:hartrees?|a\.\s*u\.|au|eh)$/i;

/**
 * Whether a note's name, before its "=", is of a geometry's electronic
 * energy, as a calculation states it: E, E(B3LYP), "SCF Done: E(RB3LYP)";
 * Energy, and the electronic, total, SCF or final single-point energy -
 * with a bracket after it (its method, or its unit). Nothing else: a
 * zero-point energy, a thermal correction, an enthalpy, a free energy and
 * a sum of any of them are other quantities, never taken for it.
 */
const ELECTRONIC = /^(?:scf\s+done:?\s*)?(?:e|(?:(?:electronic|total|scf|final\s+single[\s-]point)\s+)?energy)(?:\s*\([^()]*\))?$/i;

/**
 * The electronic energy a structure's notes give it in hartrees, and what
 * they name it (its method with it: "E(MP2)"): that of a note naming one
 * (`ELECTRONIC`) - "E = -154.987654 Hartree", "E(RB3LYP) = -154.98 A.U.",
 * "SCF energy (a.u.) = -154.98" - where they give one, or give it alike.
 * None where they give none, or only in other units; and none, saying why,
 * where two differ (an MP2 energy and an HF one): never one chosen of them,
 * nor another quantity - a zero-point energy, a free energy - in its place.
 */
export function energyNoted(notes: readonly string[]): { energy: number; name: string } | { why: string } | null {
  const found: { energy: number; name: string }[] = [];
  for (const n of notes) {
    for (const m of n.matchAll(/([^=,;]*?)\s*=\s*([-+]?\d+\.\d+)\s*(hartrees?|a\.\s*u\.|au|eh)?(?![a-z])/gi)) {
      const name = m[1].trim();
      const unit = /\(([^()]*)\)\s*$/.exec(name)?.[1].trim();
      if (!ELECTRONIC.test(name) || !(m[3] || (unit && HARTREES.test(unit)))) continue;
      found.push({ energy: Number(m[2]), name: name.replace(/^scf\s+done:?\s*/i, "") });
    }
  }
  if (!found.length) return null;
  if (found.every((f) => f.energy === found[0].energy)) return found[0];
  return { why: `its notes give ${found.map((f) => `${f.name} = ${f.energy}`).join(" and ")}, which differ` };
}

/** The electronic energy a structure's notes give it in hartrees (`energyNoted`); none where they give none, or two that differ. */
export function energyOf(notes: readonly string[]): number | undefined {
  const e = energyNoted(notes);
  return e && "energy" in e ? e.energy : undefined;
}
