/**
 * A set as a table in the column (docs/WORKFLOWS-FOUNDATION.md, *What a set
 * shows*: more than 50 entries open as a table in the column, and any of
 * them can be put on the page from there): one row per entry, in the
 * step's order - its compound and conformer, its name, its energy with
 * what worked it out, and its energy above its compound's lowest - sorted
 * by any of them; and an entry as a molecule of its own, to put on the page.
 */
import { calcLine, type CalcInfo } from "../../../../lib/calc/output";
import type { Result } from "../../../../lib/calc/results";
import { factor } from "../../../../lib/units";
import type { Molecule3D } from "../store/types";
import { compoundLetter, frameXyz, framesOf } from "./entries";

/** One entry of a set, as its table shows it. */
export type TableRow = {
  /** Its place in the set, in the step's order, from 0. */
  at: number;
  /** In a conformer set: its compound's letter, and its number among that compound's conformers. */
  compound?: string;
  number?: number;
  name?: string;
  /** Its energy, in hartrees, where it has one - and what worked it out, in the words of what did. */
  energy?: number;
  from: string;
  /** In a conformer set: its energy above its compound's lowest, in kcal/mol - only among energies worked out the same way. */
  above?: number;
  /** How many forms of it a conformer search found alike, where it said. */
  degeneracy?: number;
  /** The molecule it is a frame of, and which. */
  molecule: Molecule3D;
  frame: number;
};

/** What worked a molecule's energies out, in the words of what did: its calculation's line, or the plugin's that made it; none where nothing says. */
export function energiesFrom(m: Pick<Molecule3D, "calc" | "made">): string {
  if (m.calc) return calcLine(m.calc);
  return m.made?.energies ?? "";
}

const KCAL_PER_HARTREE = factor("Eh", "kcal/mol");

/** A set's molecules as its table's rows: a frame each - one, its last, for a path to it - in the step's order. */
export function tableRows(molecules: readonly Molecule3D[], holds: "molecules" | "conformers"): TableRow[] {
  const rows: TableRow[] = [];
  molecules.forEach((m, i) => {
    const n = framesOf(m);
    const energies = m.energies?.length === n ? m.energies : undefined;
    const degeneracies = m.degeneracies?.length === n ? m.degeneracies : undefined;
    const from = energiesFrom(m);
    // (above its compound's lowest: a conformer set's molecule is one compound, its energies all worked out alike)
    const lowest = holds === "conformers" && energies ? Math.min(...energies) : undefined;
    for (let f = m.path ? n - 1 : 0; f < n; f++) {
      rows.push({
        at: rows.length,
        ...(holds === "conformers" ? { compound: compoundLetter(i), number: m.numbers?.[f] ?? f + 1 } : {}),
        ...(m.name ? { name: m.name } : {}),
        ...(energies ? { energy: energies[f] } : {}),
        from,
        ...(lowest != null && energies ? { above: (energies[f] - lowest) * KCAL_PER_HARTREE } : {}),
        ...(degeneracies ? { degeneracy: degeneracies[f] } : {}),
        molecule: m,
        frame: f,
      });
    }
  });
  return rows;
}

/** What a table is sorted by. */
export type SortKey = "at" | "compound" | "number" | "name" | "energy" | "above" | "degeneracy";

/** Rows sorted by `key`, up or down; ties, and rows with none, in the set's order - those with none always last. */
export function sortRows(rows: readonly TableRow[], key: SortKey, down = false): TableRow[] {
  const sign = down ? -1 : 1;
  return [...rows].sort((a, b) => {
    const p = a[key];
    const q = b[key];
    if (p == null || q == null) return p == null && q == null ? a.at - b.at : p == null ? 1 : -1;
    const c = typeof p === "number" && typeof q === "number" ? p - q : String(p).localeCompare(String(q), undefined, { numeric: true });
    return sign * c || a.at - b.at;
  });
}

/**
 * An entry as a molecule of its own, to put on the page: its frame's
 * geometry, its energy and what worked it out, its name - one geometry, no
 * conformer set: what it was a share of is not with it.
 */
export function rowMolecule(row: TableRow): Omit<Molecule3D, "id" | "at"> {
  const m = row.molecule;
  const xyz = frameXyz(m, row.frame);
  return {
    atoms: m.atoms.map((a, k) => ({ ...a, x: xyz[3 * k], y: xyz[3 * k + 1], z: xyz[3 * k + 2] })),
    bonds: m.bonds,
    ...(row.energy != null ? { energies: [row.energy] } : {}),
    ...(m.calc ? { calc: calcOfFrame(m.calc, row.frame, framesOf(m)) } : {}),
    ...(m.made ? { made: m.made } : {}),
    ...(m.name ? { name: m.name } : {}),
    ...(m.drawnFrom ? { drawnFrom: m.drawnFrom } : {}),
    ...(m.drawnAs ? { drawnAs: m.drawnAs } : {}),
    ...(m.stereo ? { stereo: m.stereo } : {}),
    ...(m.centres?.length ? { centres: m.centres } : {}),
  };
}

/**
 * What a molecule's calculation says, of one of its frames taken alone:
 * what each frame has, that frame's; what is of the molecule as it ended -
 * its atoms', its pairs', the whole's - only with its last frame, which it
 * is of; and no lists, whose rows name frames of the molecule it came from.
 */
function calcOfFrame(calc: CalcInfo, frame: number, frames: number): CalcInfo {
  if (frames === 1 || !calc.results) return calc;
  const last = frame === frames - 1;
  const results = calc.results.flatMap((r): Result[] => (r.on === "frames" ? [{ ...r, values: [r.values[frame]] }] : r.on === "list" || !last ? [] : [r]));
  return { ...calc, results };
}
