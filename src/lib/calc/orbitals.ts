/**
 * A calculation's orbitals, in the one general form every reader gives them
 * in (output.ts `ReaderOutput.orbitals`): each one's spin, energy in
 * hartrees, occupation and symmetry as its program gives them, in the
 * program's order, and, where its reader can work it out, its surface as a
 * promise. Meno lists them itself (docs/WORKSPACE.md, *Orbitals*): which is
 * the HOMO and which the LUMO, each named from them; their energies in
 * electronvolts; the list opening on the LUMO, about the frontier; and the
 * HOMO-LUMO gap. A reader names none of it.
 */
import { askOf, type Ask } from "./results";
import { ELECTRONVOLT_J, HARTREE_J } from "../units";

/** One orbital as a reader gives it: of both spins (a restricted calculation's), or of one; its energy in hartrees; how many electrons are in it; its symmetry as the program prints it. */
export type Orbital = { spin: "both" | "alpha" | "beta"; energy: number | null; occupation: number | null; symmetry?: string | null; surface?: Ask };

/** The electronvolts in a hartree, from their joules (lib/units). */
const EV_PER_HARTREE = HARTREE_J / ELECTRONVOLT_J;
/** How many orbitals a reader may give, all spins together. */
const ORBITALS_MOST = 100_000;
/** How many rows a list may have (results' cap): a list of more keeps those about its frontier. */
const ROWS_MOST = 5000;
/** How far an occupation may be from a whole number and still be one: as printed to six places. */
const WHOLE_WITHIN = 1e-6;

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const SPINS = ["both", "alpha", "beta"] as const;

/** The orbitals a reader gave, each as the form says; none where any is not, or there are none. */
export function orbitalsOf(v: unknown): Orbital[] | undefined {
  if (!Array.isArray(v) || !v.length || v.length > ORBITALS_MOST) return undefined;
  const out: Orbital[] = [];
  for (const x of v) {
    const o = x as Record<string, unknown> | null;
    if (!o || !(SPINS as readonly unknown[]).includes(o.spin)) return undefined;
    const energy = o.energy == null ? null : isNum(o.energy) ? o.energy : undefined;
    const occupation = o.occupation == null ? null : isNum(o.occupation) && o.occupation >= 0 && o.occupation <= 2 ? o.occupation : undefined;
    if (energy === undefined || occupation === undefined) return undefined;
    const symmetry = typeof o.symmetry === "string" && o.symmetry.trim() ? o.symmetry.trim().slice(0, 24) : null;
    const surface = askOf(o.surface);
    out.push({ spin: o.spin as Orbital["spin"], energy, occupation, ...(symmetry ? { symmetry } : {}), ...(surface ? { surface } : {}) });
  }
  // (of both spins, or of each apart: never the two ways at once)
  const both = out.some((o) => o.spin === "both");
  return both && out.some((o) => o.spin !== "both") ? undefined : out;
}

/**
 * The HOMO of one spin's orbitals, in their order: the last whose
 * occupation is at least half full - one electron of a restricted
 * calculation's two, half of one spin's one - where every occupation is a
 * whole number and every energy is given. None otherwise: natural orbitals,
 * fractional and with no energies, have no frontier by name.
 */
export function homoOf(orbitals: readonly Orbital[]): number | undefined {
  if (!orbitals.length || !orbitals.every((o) => o.energy != null && o.occupation != null && Math.abs(o.occupation - Math.round(o.occupation)) <= WHOLE_WITHIN))
    return undefined;
  const half = orbitals[0].spin === "both" ? 1 : 0.5;
  let homo: number | undefined;
  orbitals.forEach((o, i) => {
    if (o.occupation! >= half) homo = i;
  });
  return homo;
}

/** An orbital's name from its place and the HOMO's: "HOMO", "HOMO−2", "LUMO", "LUMO+1". */
export function orbitalName(i: number, homo: number): string {
  if (i <= homo) return i === homo ? "HOMO" : `HOMO−${homo - i}`;
  return i === homo + 1 ? "LUMO" : `LUMO+${i - homo - 1}`;
}

/**
 * Orbitals as Meno lists them: a list for each spin - one, of a restricted
 * calculation's - from the highest down, each named from the HOMO and
 * opening on the LUMO (the HOMO where none is given); its energies in
 * electronvolts, and its symmetries where any is given; and, of a
 * restricted calculation with a LUMO, the HOMO-LUMO gap. Where no HOMO can
 * be named, each is listed by its number with its occupation. Results in
 * the general form, read as any reader's are (results `readResults`).
 */
export function orbitalResults(orbitals: readonly Orbital[]): unknown[] {
  const spins = (["both", "alpha", "beta"] as const).map((s) => orbitals.filter((o) => o.spin === s)).filter((l) => l.length);
  const out: unknown[] = [];
  for (const list of spins) {
    const homo = homoOf(list);
    const named = homo != null;
    // (no more than a list holds: those about the frontier, where there are more)
    let first = 0;
    let last = list.length - 1;
    if (list.length > ROWS_MOST) {
      first = named ? Math.max(0, homo - ROWS_MOST / 2 + 1) : 0;
      last = Math.min(list.length - 1, first + ROWS_MOST - 1);
      first = Math.max(0, last - ROWS_MOST + 1);
    }
    const symmetry = list.some((o) => o.symmetry);
    const columns = [
      named ? { label: "Orbital" } : { label: "Orbital", quantity: "number", digits: 0 },
      ...(symmetry ? [{ label: "Symmetry", quantity: "symmetry" }] : []),
      { label: "Energy", unit: "eV", digits: 3 },
      ...(named ? [] : [{ label: "Occupation", quantity: "number", digits: 4 }]),
    ];
    const rows = [];
    for (let i = last; i >= first; i--) {
      const o = list[i];
      rows.push({
        cells: [named ? orbitalName(i, homo) : i + 1, ...(symmetry ? [o.symmetry ?? null] : []), o.energy == null ? null : o.energy * EV_PER_HARTREE, ...(named ? [] : [o.occupation])],
        ...(o.surface ? { surface: o.surface } : {}),
      });
    }
    const one = spins.length === 1;
    const spin = list[0].spin;
    out.push({
      id: one ? "orbitals" : `orbitals.${spin === "beta" ? "b" : "a"}`,
      on: "list",
      group: "Orbitals",
      label: one ? "Molecular orbitals" : spin === "beta" ? "β orbitals" : "α orbitals",
      columns,
      rows,
      // (opening on the frontier: the LUMO, the HOMO under it - the HOMO where no LUMO is given)
      ...(named ? { focus: homo + 1 <= last ? last - homo - 1 : last - homo } : {}),
    });
    if (one && named && spin === "both" && homo + 1 < list.length) {
      out.push({
        id: "homo-lumo-gap",
        on: "molecule",
        group: "Orbitals",
        label: "HOMO–LUMO gap",
        value: (list[homo + 1].energy! - list[homo].energy!) * EV_PER_HARTREE,
        unit: "eV",
        digits: 2,
      });
    }
  }
  return out;
}
