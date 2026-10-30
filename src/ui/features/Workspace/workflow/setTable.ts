/**
 * A set as a table in the column (docs/WORKFLOWS-FOUNDATION.md, *What a set
 * shows*: more than 50 entries open as a table in the column, and any of
 * them can be put on the page from there): one row per entry, in the
 * step's order - its compound and conformer, its name, its energy with
 * what worked it out, and its energy above its compound's lowest - sorted
 * by any of them; and an entry as a molecule of its own, to put on the page.
 */
import { levelOf, type CalcInfo } from "../../../../lib/calc/output";
import type { Result } from "../../../../lib/calc/results";
import { factor } from "../../../../lib/units";
import type { Molecule3D } from "../store/types";
import { calcFrame, compoundLetter, frameMarks, frameXyz, framesOf, marksOf } from "./entries";
import { FAILURE_WORDS } from "./failures";

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
  /** In a conformer set: its energy above its compound's lowest, in kcal/mol - only among energies worked out the same way, and none where the set holds only a part of the compound's conformers (`partOf`). */
  above?: number;
  /** How many forms of it a conformer search found alike, where it said. */
  degeneracy?: number;
  /** Where it did not finish - it failed, or its marks did not read - in words, shown in its row: its energy no result, and no "above" of it. */
  failed?: string;
  /** The molecule it is a frame of, and which. */
  molecule: Molecule3D;
  frame: number;
};

/**
 * What worked a molecule's energies out, in the words of what did: its
 * calculation's program, with its version, and level - not its job or its
 * state, which are not how - or the plugin's that made it; "" where nothing
 * says. One rule for the set's table (*From*) and its summary's chart,
 * which sets energies against one another only where this is the same:
 * two versions of a program are two, as provenance.
 */
export function energiesFrom(m: Pick<Molecule3D, "calc" | "energies" | "made">): string {
  const c = m.energies?.length && (m.calc?.program || m.calc?.method) ? m.calc : undefined;
  if (!c) return m.made?.energies ?? "";
  return [[c.program, c.version].filter(Boolean).join(" "), levelOf(c)].filter(Boolean).join(" \u00b7 ");
}

const KCAL_PER_HARTREE = factor("Eh", "kcal/mol");
/** What a row says whose file's marks of which frames failed did not read. */
export const MARKS_NOT_READ = "marks not read";

/**
 * What the table's *above* column says of what it is over: the lowest of
 * those that finished, and how many it did not count - "above the lowest of
 * 8 that finished; 2 not counted". None where every row finished.
 */
export function aboveSaid(rows: readonly TableRow[]): string | null {
  const left = rows.filter((r) => r.failed && r.energy != null).length;
  if (!left) return null;
  const counted = rows.filter((r) => r.above != null).length;
  return `above the lowest of ${counted} that finished; ${left} not counted`;
}

/** A set's molecules as its table's rows: a frame each - one, its last, for a path to it - in the step's order. */
export function tableRows(molecules: readonly Molecule3D[], holds: "molecules" | "conformers"): TableRow[] {
  const rows: TableRow[] = [];
  molecules.forEach((m, i) => {
    const n = framesOf(m);
    const energies = m.energies?.length === n ? m.energies : undefined;
    const degeneracies = m.degeneracies?.length === n ? m.degeneracies : undefined;
    const from = energiesFrom(m);
    // (above its compound's lowest: a conformer set's molecule is one compound, its energies all worked out alike)
    // (none of only a part of a compound's conformers: its lowest may not be among them)
    // (and of those that finished alone: one that failed, or whose marks did not read, is no compound's lowest, and has none above it)
    const unfinished = (f: number) => (m.marksUnread ? MARKS_NOT_READ : m.failed?.length === n && m.failed[f] ? FAILURE_WORDS[m.failed[f]!.kind] : undefined);
    const done = energies?.filter((_, f) => !unfinished(f)) ?? [];
    const lowest = holds === "conformers" && energies && !m.partOf && done.length ? Math.min(...done) : undefined;
    for (let f = m.path ? n - 1 : 0; f < n; f++) {
      const failed = unfinished(f);
      rows.push({
        at: rows.length,
        ...(holds === "conformers" ? { compound: compoundLetter(i), number: m.numbers?.[f] ?? f + 1 } : {}),
        ...(m.name ? { name: m.name } : {}),
        ...(energies ? { energy: energies[f] } : {}),
        from,
        ...(lowest != null && energies && !failed ? { above: (energies[f] - lowest) * KCAL_PER_HARTREE } : {}),
        ...(failed ? { failed } : {}),
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
 * The rows chosen once `row` is clicked, as in a list - each by its place
 * in the set (`at`): it alone; with ⌘ or Ctrl (`add`), it added or taken
 * away; with Shift (`range`), those between it and the one clicked before
 * (`anchor`) as they are sorted (`sorted`), added to those chosen with ⌘ or
 * Ctrl too - and the row the next Shift-click goes from.
 */
export function chooseRows(
  sorted: readonly Pick<TableRow, "at">[],
  chosen: ReadonlySet<number>,
  anchor: number | null,
  row: number,
  how: { add?: boolean; range?: boolean } = {},
): { chosen: Set<number>; anchor: number } {
  if (how.range && anchor != null) {
    const a = sorted.findIndex((r) => r.at === anchor);
    const b = sorted.findIndex((r) => r.at === row);
    const [lo, hi] = a < 0 ? [b, b] : [Math.min(a, b), Math.max(a, b)];
    return { chosen: new Set([...(how.add ? chosen : []), ...sorted.slice(lo, hi + 1).map((r) => r.at)]), anchor };
  }
  if (!how.add) return { chosen: new Set([row]), anchor: row };
  const next = new Set(chosen);
  if (next.has(row)) next.delete(row);
  else next.add(row);
  return { chosen: next, anchor: row };
}

/**
 * The rows chosen, put on the page, in the set's order - whichever way the
 * table is sorted: those of one molecule of the set together, as one
 * molecule of those frames (`framesMolecule`) - a compound's conformers
 * one compound still, counted as it is.
 */
export function chosenMolecules(rows: readonly TableRow[], chosen: ReadonlySet<number>): Omit<Molecule3D, "id" | "at">[] {
  const of = new Map<Molecule3D, number[]>();
  for (const r of [...rows].sort((a, b) => a.at - b.at)) if (chosen.has(r.at)) of.set(r.molecule, [...(of.get(r.molecule) ?? []), r.frame]);
  return [...of].map(([m, frames]) => framesMolecule(m, frames));
}

/** An entry as a molecule of its own, to put on the page (`framesMolecule`, of its one frame). */
export function rowMolecule(row: TableRow): Omit<Molecule3D, "id" | "at"> {
  return framesMolecule(row.molecule, [row.frame]);
}

/**
 * Some of a molecule's frames as a molecule of their own: their geometries,
 * the first its atoms'; each one's energy, number among its compound's
 * conformers, and degeneracy, where it had them; and what worked them out,
 * its name, its stereo. Of a conformer set, a conformer set still - one
 * compound - its shares kept where all its frames are, and where some are
 * left out, only a part of it (`partOf`): its shares, which were of all of
 * them, not kept, nor worked out anew of these alone. Not a path: what it
 * led to is not with it.
 */
export function framesMolecule(m: Molecule3D, frames: readonly number[]): Omit<Molecule3D, "id" | "at"> {
  const n = framesOf(m);
  const each = <T>(values: readonly T[] | undefined) => (values?.length === n ? frames.map((f) => values[f]) : undefined);
  const xyz = frameXyz(m, frames[0]);
  const energies = each(m.energies);
  const numbers = each(m.numbers) ?? (m.conformerSet ? frames.map((f) => f + 1) : undefined);
  const degeneracies = each(m.degeneracies);
  const part = m.partOf || frames.length < n;
  return {
    atoms: m.atoms.map((a, k) => ({ ...a, x: xyz[3 * k], y: xyz[3 * k + 1], z: xyz[3 * k + 2] })),
    bonds: m.bonds,
    ...(frames.length > 1 ? { frames: frames.slice(1).map((f) => [...frameXyz(m, f)]) } : {}),
    ...(m.bondsFrom ? { bondsFrom: m.bondsFrom } : {}),
    ...(energies ? { energies } : {}),
    ...(numbers ? { numbers } : {}),
    ...(degeneracies ? { degeneracies } : {}),
    ...(m.conformerSet ? { conformerSet: true } : {}),
    ...((m.conformerSet && part) || m.partOf ? { partOf: true as const } : {}),
    ...(m.conformerSet && !part && each(m.shares) ? { shares: each(m.shares) } : {}),
    ...(m.calc ? { calc: calcOfFrames(m.calc, frames, n, calcFrame(m, n)) } : {}),
    ...(m.made ? { made: m.made } : {}),
    ...(m.name ? { name: m.name } : {}),
    ...(m.drawnFrom ? { drawnFrom: m.drawnFrom } : {}),
    ...(m.drawnAs ? { drawnAs: m.drawnAs } : {}),
    ...(m.stereo ? { stereo: m.stereo } : {}),
    ...(m.centres?.length ? { centres: m.centres } : {}),
    // (each frame's marks: why it failed, its imaginary frequencies, and whether its marks did not read)
    ...marksOf(frames.map((f) => frameMarks(m, f, n))),
    // (where a run ended converged at each frame taken: its own, of its geometry still)
    ...(each(m.converged)?.some(Boolean) ? { converged: each(m.converged) } : {}),
  };
}

/**
 * What a molecule's calculation says, of some of its frames taken alone:
 * what each frame has, those frames'; what is of the one geometry it is of
 * (`at`: its last, a path search's point refined, a reaction path's start;
 * entries `calcFrame`) - its atoms', its pairs', the whole's, its imaginary
 * frequencies - only with that frame; and no lists, whose rows name frames
 * of the molecule it came from.
 */
function calcOfFrames(calc: CalcInfo, frames: readonly number[], n: number, at: number): CalcInfo {
  if (n === 1 && frames.length === 1) return calc;
  const held = frames.includes(at);
  const results = calc.results?.flatMap((r): Result[] => (r.on === "frames" ? [{ ...r, values: frames.map((f) => r.values[f]) }] : r.on === "list" || !held ? [] : [r]));
  const { imaginary: _imaginary, ...without } = calc;
  return { ...(held ? calc : without), ...(results ? { results } : {}) };
}
