/**
 * A label bonded to a metal that names a ligand only in a complex - Cp,
 * allyl, CO, =CHPh - written out as that ligand, the way it is bound: a pi
 * system through all its atoms, to a star at its centre (a multi-centre
 * bond), a neutral donor by a coordination bond - not as the group the
 * label names elsewhere (Cp as a group is cyclopentadienyl bound by one
 * carbon). One structure for every place a drawing is written out: a file
 * (molWriter), and the plugin asked about it (etaBound), so that a file
 * Meno wrote reads back as it was drawn.
 */
import { NOMINAL_BOND_LENGTH } from "./acs";
import { placedStructure } from "./abbreviationPlace";
import { ligandStructure, namedLigand } from "./ligands";
import type { AbbreviationStructure } from "./molecule";

/**
 * The ligand `label` names, as bound in a complex, laid off toward its
 * metal (`toMetal`, from the label); null where it names none bound so. A
 * ligand that binds as an anion (Cp, through its ring) is written neutral,
 * as a label on a metal is drawn: the plugin counts the ring's charge.
 */
export function boundLigandStructure(label: string, toMetal: { x: number; y: number }): AbbreviationStructure | null {
  const named = namedLigand(label.trim(), true);
  if (!named?.ligand.inComplex) return null;
  const { anionic, double, ...s } = ligandStructure(named.ligand, named.descriptor);
  const net = s.atoms.reduce((q, x) => q + (x.charge ?? 0), 0);
  const atoms = net ? s.atoms.map(({ charge: _charge, ...atom }) => atom) : s.atoms;
  const pi = new Set((s.haptic ?? []).map((h) => h.star));
  const lends = s.attach.map((at, k) => !anionic[k] && !double[k] && !pi.has(at));
  return placedStructure({ ...s, atoms, ...(lends.some(Boolean) ? { lends } : {}) }, toMetal, NOMINAL_BOND_LENGTH);
}
