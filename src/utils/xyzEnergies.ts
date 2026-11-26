/**
 * Each frame's energy in an XYZ file, as the programs of the plugins added write it on its comment lines (docs/FILE-IO.md).
 * Meno knows no program's way of writing it: each plugin whose program writes XYZ files declares, in its manifest, a pattern
 * with the unit of the number it finds (`xyzEnergies`, docs/PLUGINS.md). With no such plugin added, an XYZ file gives its
 * geometry alone - but for Meno's own form, which needs none (lib/chem/xyzWriter `MENO_XYZ_ENERGY`).
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
 * Each frame's energy, in hartrees, by the ways given, of a file of one frame or more: each frame keeps what its line gives -
 * NaN, none, where its line gives none, or where two ways find different numbers on it - so that the frames that have one keep
 * theirs (what needs every frame's, shares, is then not worked out). None at all where no frame has one.
 */
export function energiesOf(comments: string[], ways: readonly EnergyWay[]): number[] | undefined {
  if (!comments.length || !ways.length) return undefined;
  const found = comments.map((c) => {
    const values = ways.map((w) => w(c)).filter((v): v is number => v !== undefined);
    if (!values.length) return NaN;
    return values.some((v) => Math.abs(v - values[0]) > 1e-12 * Math.max(1, Math.abs(values[0]))) ? NaN : values[0];
  });
  return found.some(Number.isFinite) ? found : undefined;
}
