/**
 * Each frame's energy in an XYZ file, as the programs of the plugins added write it on its comment lines (docs/FILE-IO.md).
 * Meno knows no program's way of writing it: each plugin whose program writes XYZ files declares, in its manifest, a pattern
 * with the unit of the number it finds (`xyzEnergies`, docs/PLUGINS.md). With no such plugin added, an XYZ file gives its
 * geometry alone.
 */
import type { XyzEnergyDecl } from "../lib/plugins/manifest";
import { factor } from "../lib/units";

/** One unit's number in hartrees, from Meno's units table (a manifest names the hartree in words). */
const TO_HARTREE: Record<XyzEnergyDecl["unit"], number> = {
  hartree: 1,
  eV: factor("eV", "Eh"),
  "kcal/mol": factor("kcal/mol", "Eh"),
  "kJ/mol": factor("kJ/mol", "Eh"),
};

/** A pattern of a plugin, ready: what it finds on a comment line, in hartrees, or nothing. */
export type EnergyWay = (comment: string) => number | undefined;

/** The ways the declarations give: each a compiled pattern and its unit's factor. A pattern that will not compile is no way. */
export function waysOf(decls: readonly XyzEnergyDecl[]): EnergyWay[] {
  const ways: EnergyWay[] = [];
  for (const d of decls) {
    let re: RegExp;
    try {
      re = new RegExp(d.pattern, "i");
    } catch {
      continue;
    }
    const factor = TO_HARTREE[d.unit] ?? 1;
    ways.push((comment) => {
      const m = comment.match(re);
      const v = m?.[1] === undefined ? NaN : parseFloat(m[1]);
      return Number.isFinite(v) ? v * factor : undefined;
    });
  }
  return ways;
}

/**
 * Each frame's energy, in hartrees, by the ways given: of more than one frame, and found on every one. Where two ways find different
 * numbers on a line, nothing is taken, and nothing is said; nor where a frame has none.
 */
export function energiesOf(comments: string[], ways: readonly EnergyWay[]): number[] | undefined {
  if (comments.length < 2 || !ways.length) return undefined;
  const found: number[] = [];
  for (const c of comments) {
    const values = ways.map((w) => w(c)).filter((v): v is number => v !== undefined);
    if (!values.length) return undefined;
    if (values.some((v) => Math.abs(v - values[0]) > 1e-12 * Math.max(1, Math.abs(values[0])))) return undefined;
    found.push(values[0]);
  }
  return found;
}
