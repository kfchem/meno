/**
 * Where a run ended converged (docs/WORKFLOWS.md, *The entry record*,
 * `converged`): an optimisation to its end, an optimisation to a saddle
 * point to its end, or a path's highest point refined - as the program
 * said it, of the geometry it ended at, by that geometry's key. Set only by
 * the run that converged (programs `workedOf`); carried on by what keeps
 * the geometry - a Frequencies job, a single point - while it is that
 * geometry still; of no other geometry, so that what moves the atoms
 * leaves none. A failed run has none: one started from its geometry starts
 * from a geometry no run converged at. A *Barrier* takes a start and a
 * saddle point only where each says so. One that ran with atoms held where
 * they stood (`held`, from 0) says so in how, as it is no stationary point:
 * the steps that take one refuse it. So does one that held a distance or a
 * dihedral exactly at its value (`rows`, the rows of a *Restraints* table it
 * held, docs/WORKFLOWS.md, *Restraints wired in*), "with restraints held",
 * with any atoms it held besides: stationary only on the surface those
 * constraints leave, whose energy and frequencies are of no stationary
 * point of the molecule, even where a row happens to sit where the molecule
 * would rest - Meno cannot know that without its gradient.
 */
import { geometryKey, type Restraint } from "../../../../lib/entry";
import { REFINED_SAID } from "../../../../lib/calc/paths";
import { restraintSaid } from "../../../../lib/steps/restraints";

/** How a run ended converged, as the property says it: the last is a path search's words for its point refined (lib/calc/paths `REFINED_SAID`). */
export const CONVERGED_HOW = [
  "optimisation",
  "saddle point optimisation",
  REFINED_SAID,
  "optimisation with atoms held",
  "saddle point optimisation with atoms held",
  "optimisation with restraints held",
  "saddle point optimisation with restraints held",
] as const;
export type ConvergedHow = (typeof CONVERGED_HOW)[number];

/** That a run ended converged, and the geometry it ended at, by its key (lib/entry `geometryKey`); the atoms it held where they stood, and the distances and dihedrals it held exactly, where it held any. */
export type Converged = { how: ConvergedHow; geometry: string; held?: number[]; rows?: Restraint[] };

/** A run's ending converged at `xyz`, as `how` says: the atoms it held (`held`) and the rows it held exactly (`rows`) with it, where any. */
export const convergedAt = (how: ConvergedHow, xyz: readonly number[], held?: readonly number[], rows?: readonly Restraint[]): Converged => ({
  how,
  geometry: geometryKey(xyz),
  ...(held?.length ? { held: [...held] } : {}),
  ...(rows?.length ? { rows: rows.map((r) => ({ ...r, atoms: [...r.atoms] })) } : {}),
});

/** Whether a run converged holding anything - atoms where they stood (`held`), or a distance or dihedral exactly (`rows`): no stationary point, its energy and frequencies of none. */
export const heldAt = (c: Converged | undefined): boolean => !!c?.held?.length || !!c?.rows?.length;

/** A row held exactly, as said where it is refused: "distance 1-2 held at 1.5 Å", "torsion 1-2-3-4 held at -60°". */
const rowHeldSaid = (r: Restraint) => `${restraintSaid(r)} held at ${r.value}${r.kind === "distance" ? " \u00c5" : "\u00b0"}`;

/** Why a step that takes a stationary point refuses an entry optimised holding anything (`heldAt`): what, atoms from 1, and what to do; none where it was not. */
export function heldWhy(c: Converged | undefined): string | null {
  const held = c?.held ?? [];
  const rows = c?.rows ?? [];
  if (!held.length && !rows.length) return null;
  const atoms = held.length ? `${held.length === 1 ? "atom" : "atoms"} ${held.map((a) => a + 1).join(", ")} held where ${held.length === 1 ? "it" : "they"} stood` : null;
  const one = held.length + rows.length === 1;
  return `Optimised with ${[...rows.map(rowHeldSaid), ...(atoms ? [atoms] : [])].join(" and ")}: no stationary point - optimise it free of ${one ? "it" : "them"} first`;
}

/** Rows held exactly as a file gives them, read back: each a distance of two atoms or a dihedral of four, from 0, each once, at a value, exact, with no strength; null where any is not, or there are none. */
function rowsIn(v: unknown): Restraint[] | null {
  if (!Array.isArray(v) || !v.length) return null;
  const rows: Restraint[] = [];
  for (const x of v) {
    const r = x as { kind?: unknown; atoms?: unknown; value?: unknown; strength?: unknown; exact?: unknown } | null;
    const count = r?.kind === "distance" ? 2 : r?.kind === "dihedral" ? 4 : 0;
    const atoms = r?.atoms;
    if (!r || !count || r.exact !== true || r.strength !== undefined || typeof r.value !== "number" || !Number.isFinite(r.value)) return null;
    if (!Array.isArray(atoms) || atoms.length !== count || !atoms.every((a) => Number.isInteger(a) && a >= 0) || new Set(atoms).size !== count) return null;
    rows.push({ kind: r.kind as "distance" | "dihedral", atoms: [...(atoms as number[])], value: r.value, exact: true });
  }
  return rows;
}

/** An entry's record that a run ended converged at its geometry: none where it has none, where the record is of another geometry, or where it failed. */
export function convergedOf(e: { converged?: Converged; xyz: readonly number[]; failed?: unknown }): Converged | undefined {
  return e.converged && !e.failed && e.converged.geometry === geometryKey(e.xyz) ? e.converged : undefined;
}

/** A record as a file gives it, read back: how, one of `CONVERGED_HOW`, and a geometry's key; null where it does not read. */
export function convergedIn(v: unknown): Converged | null {
  const c = v as { how?: unknown; geometry?: unknown } | null;
  if (!c || typeof c !== "object" || typeof c.geometry !== "string" || !c.geometry) return null;
  if (!(CONVERGED_HOW as readonly unknown[]).includes(c.how)) return null;
  // (atoms held, rows held exactly: said by how it converged, and listed - atoms each from 0, at least one; rows as `rowsIn`
  //  reads them - or the record is none: never one of a run that held anything read back as a free one's, nor the other way
  //  round. "with atoms held": atoms alone; "with restraints held": rows, and any atoms held besides)
  const held = (c as { held?: unknown }).held;
  const given = (c as { rows?: unknown }).rows;
  const atoms = Array.isArray(held) && held.length > 0 && held.every((a) => Number.isInteger(a) && a >= 0) ? (held as number[]) : null;
  const rows = rowsIn(given);
  const how = c.how as string;
  const atomsSaid = how.endsWith("with atoms held");
  const rowsSaid = how.endsWith("with restraints held");
  if (held !== undefined && !atoms) return null;
  if (given !== undefined && !rows) return null;
  if (atomsSaid ? !atoms || rows : rowsSaid ? !rows : atoms || rows) return null;
  return { how: c.how as ConvergedHow, geometry: c.geometry, ...(atoms ? { held: [...atoms] } : {}), ...(rows ? { rows } : {}) };
}
