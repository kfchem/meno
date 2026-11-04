import type { CoordinateStructure } from "../../../../lib/io/coordinates";
import { quotedEnergies } from "../../../../lib/io/kinds";
import type { QuotedEnergyDecl } from "../../../../lib/plugins/manifest";
import { factor } from "../../../../lib/units";
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
export function coordinateMolecules(chosen: readonly { structure: CoordinateStructure; name: string }[], source: string, quoted: readonly QuotedEnergyDecl[] = quotedEnergies()): Omit<Molecule3D, "id" | "at">[] {
  return chosen.map(({ structure: s, name }) => {
    const noted = energyNoted(s.notes, quoted);
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

/** The names of a geometry's electronic energy a note may give before its bracket, if any: E (E_SCF, Etot, E_tot, E_el, E_elec), Energy, and the electronic, total, SCF, final or final single-point energy. */
const ELECTRONIC_NAME = /^(?:e|e_?scf|e_?tot|etot|e_?el|e_?elec|(?:(?:electronic|total|scf|final|final\s+single[\s-]point)\s+)?energy)$/i;

/**
 * Words that say a bracket after an energy's name is no method but another
 * quantity - a correction, a part, a sum (E(ZPE), E(corr), E(solv), E(gCP),
 * E(vdW), E(BSSE)) - in
 * any case, each a whole word of it.
 */
const NOT_A_METHOD = new Set(["zpe", "zpve", "zero", "thermal", "corr", "correction", "corrected", "disp", "dispersion", "solv", "solvation", "vib", "rot", "trans", "int", "rel", "free", "gibbs", "enthalpy", "incl", "with", "gcp", "cp", "nl", "vdw", "srb", "xc", "coul", "exch", "kin", "nuc", "rep", "bsse"]);

/**
 * Whether a bracket after an energy's name says what kind of electronic
 * energy it is, and nothing else: a unit in hartrees; or one method, its
 * basis after a "/" where given - letters, digits and "-", one bracket
 * within (RB3LYP/6-31G(d), CCSD(T), B3LYP-D3(BJ)/def2-TZVP) - with no space
 * and no "+", and no word of another quantity (`NOT_A_METHOD`); never a
 * dispersion correction alone (D3, D4), nor a lone T, G, H or S. Where it
 * may be anything else, it is not one: a false refusal costs an energy not
 * shown, a false taking an energy that is wrong.
 */
function bracketSays(inner: string): boolean {
  const t = inner.trim();
  if (HARTREES.test(t)) return true;
  if (!/^[A-Za-z0-9-]+(?:\([A-Za-z0-9-]+\)[A-Za-z0-9-]*)?(?:\/[A-Za-z0-9-]+(?:\([A-Za-z0-9-]+\)[A-Za-z0-9-]*)?)?$/.test(t)) return false;
  if (!/[A-Za-z]/.test(t) || /^[TGHS]$/i.test(t) || /^D[34](?:\([A-Za-z0-9-]+\))?$/i.test(t)) return false;
  return !t.split(/[^A-Za-z0-9]+/).some((w) => NOT_A_METHOD.has(w.toLowerCase()));
}

/** Whether a note's name, before its "=" or ":", is of a geometry's electronic energy, as a calculation states it (`ELECTRONIC_NAME`, `bracketSays`) - and, where it is, whether its bracket gives its unit in hartrees. */
function electronicName(name: string): { unit: boolean } | null {
  const m = /^([A-Za-z_][A-Za-z_\s-]*?)\s*(?:\((.*)\))?$/i.exec(name.trim());
  if (!m || !ELECTRONIC_NAME.test(m[1].trim())) return null;
  if (m[2] == null) return { unit: false };
  return bracketSays(m[2]) ? { unit: HARTREES.test(m[2].trim()) } : null;
}

/** A value as a note gives it: with a decimal point, or a power of ten. */
const VALUE = String.raw`[-+]?(?:\d+\.\d*(?:[eE][-+]?\d+)?|\d+[eE][-+]?\d+)`;

/** One unit's number in hartrees, from Meno's units table (a manifest names the hartree in words). */
const TO_HARTREE: Record<QuotedEnergyDecl["unit"], number> = { hartree: 1, eV: factor("eV", "Eh"), "kcal/mol": factor("kcal/mol", "Eh"), "kJ/mol": factor("kJ/mol", "Eh") };

/** The energy a note gives as a program's line a plugin added declares it (`quoted`), and what it is called; none where none of them is the note. */
function quotedIn(note: string, quoted: readonly QuotedEnergyDecl[]): { energy: number; name: string } | null {
  for (const q of quoted) {
    let m: RegExpExecArray | null;
    try {
      m = new RegExp(q.pattern, "i").exec(note);
    } catch {
      continue;
    }
    const v = Number(m?.groups?.value?.replace(/[dD]/, "e"));
    if (!m || !Number.isFinite(v)) continue;
    const method = m.groups?.method?.trim();
    return { energy: v * TO_HARTREE[q.unit], name: method ? `${q.name}(${method})` : q.name };
  }
  return null;
}

/**
 * The electronic energy a structure's notes give it in hartrees, and what
 * they name it (its method with it: "E(MP2)"): that of a note that is a
 * program's line a plugin added declares (`quoted`: lib/plugins/manifest
 * `quotedEnergies`), or that names one (`electronicName`) - "E =
 * -154.987654 Hartree", "E(RB3LYP) = -154.98 A.U.", "SCF energy (a.u.) =
 * -154.98", "Total energy: -154.98 Eh" - where they give one, or give it
 * alike. Its unit in hartrees, after its value or in its bracket; none said,
 * hartrees only of a method's energy as an output states it (E(RB3LYP)).
 * None where they give none; and none, saying why, where two differ (an MP2
 * energy and an HF one): never one chosen of them, nor another quantity - a
 * zero-point energy, a free energy, a correction - in its place.
 */
export function energyNoted(notes: readonly string[], quoted: readonly QuotedEnergyDecl[] = quotedEnergies()): { energy: number; name: string } | { why: string } | null {
  const found: { energy: number; name: string }[] = [];
  for (const n of notes) {
    // (a program's own line, as its plugin declares it)
    const own = quotedIn(n, quoted);
    if (own) {
      found.push(own);
      continue;
    }
    for (const m of n.matchAll(new RegExp(String.raw`([^=:,;]*?)\s*[=:]\s*(${VALUE})\s*(hartrees?|a\.\s*u\.|au|eh)?(?![a-z])`, "gi"))) {
      // (a name run on from the last - "... Eh and E(HF)" - taken without its joining word: two energies, both seen)
      const name = m[1].trim().replace(/^(?:and|or|&|\/)\s+/i, "").replace(/^\/\s*/, "");
      const named = electronicName(name);
      if (!named) continue;
      const method = /\(/.test(name) && !named.unit;
      if (!(m[3] || named.unit || method)) continue;
      found.push({ energy: Number(m[2]), name });
    }
  }
  if (!found.length) return null;
  if (found.every((f) => f.energy === found[0].energy)) return found[0];
  return { why: `its notes give ${found.map((f) => `${f.name} = ${f.energy}`).join(" and ")}, which differ` };
}

/** The electronic energy a structure's notes give it in hartrees (`energyNoted`); none where they give none, or two that differ. */
export function energyOf(notes: readonly string[], quoted: readonly QuotedEnergyDecl[] = quotedEnergies()): number | undefined {
  const e = energyNoted(notes, quoted);
  return e && "energy" in e ? e.energy : undefined;
}
