/**
 * XYZ files written (docs/FILE-IO.md, *XYZ*). The format has no official
 * specification; this follows the common definition: a line with the number
 * of atoms, a comment line, then one line for each atom - its element's
 * symbol and its x, y and z in ångströms. A file of several frames repeats
 * that block, one after another. The atoms are written in the order the
 * molecule has them - never reordered - hydrogens included.
 */

/** One frame of a file: its atoms in ångströms, in their order, and the one comment line it has. */
export type XyzFrame = { atoms: readonly { el: string; x: number; y: number; z: number }[]; comment: string };

/**
 * How Meno writes an energy on a frame's comment line, and reads it back
 * (`xyzEnergies`): "E = -76.1234567890 Eh", in hartrees. A pattern its own
 * writing is found by, as a program's would be by the plugin that declares
 * it - Meno's own, which needs no plugin.
 */
export const MENO_XYZ_ENERGY = { id: "meno", pattern: "\\bE = (-?\\d+(?:\\.\\d+)?(?:[eE][-+]?\\d+)?) Eh\\b", unit: "hartree" as const };

/** The comment a frame gets: its name, then - where there are several frames - which it is of how many, then its energy in hartrees, where it is known; on one line. */
export function xyzComment(name: string, frame?: { i: number; of: number }, energy?: number): string {
  const parts = [name.replace(/[\r\n]+/g, " ").trim()];
  if (frame && frame.of > 1) parts.push(`frame ${frame.i + 1}/${frame.of}`);
  if (energy != null && Number.isFinite(energy)) parts.push(`E = ${energy.toFixed(10)} Eh`);
  return parts.filter(Boolean).join(" ");
}

/** A coordinate, in ångströms, to eight decimals, a minus sign never on a zero. */
const coordinate = (v: number): string => {
  const s = v.toFixed(8);
  return /^-0\.0+$/.test(s) ? s.slice(1) : s;
};

/** Frames as an XYZ file: for each, its atom count, its comment, and an atom a line - symbol, x, y, z. Throws where a frame has no atoms. */
export function writeXyz(frames: readonly XyzFrame[]): string {
  if (!frames.length || frames.some((f) => !f.atoms.length)) throw new Error("An XYZ file needs atoms: there are none to write.");
  return frames
    .map((f) => [String(f.atoms.length), f.comment, ...f.atoms.map((a) => `${a.el.padEnd(2)} ${coordinate(a.x).padStart(14)} ${coordinate(a.y).padStart(14)} ${coordinate(a.z).padStart(14)}`)].join("\n") + "\n")
    .join("");
}

/**
 * What an XYZ file does not hold of molecules to be written, in plain
 * words: it holds each atom's element and position only, so their charges,
 * radicals, isotopes and bonds are not written - each said, with how many,
 * where there are any; null where there is nothing it leaves out. The
 * format's own limit, said rather than kept silent (2026-10-22).
 */
export function xyzLeavesOut(molecules: readonly { atoms: readonly { charge?: number; radical?: unknown; isotope?: number }[]; bonds: readonly unknown[] }[]): string | null {
  const atoms = molecules.flatMap((m) => m.atoms);
  const count = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;
  const charges = atoms.filter((a) => a.charge).length;
  const radicals = atoms.filter((a) => a.radical).length;
  const isotopes = atoms.filter((a) => a.isotope).length;
  const bonds = molecules.reduce((n, m) => n + m.bonds.length, 0);
  const parts = [
    ...(charges ? [count(charges, "atom's charge", "atoms' charges")] : []),
    ...(radicals ? [count(radicals, "atom's radical", "atoms' radicals")] : []),
    ...(isotopes ? [count(isotopes, "atom's isotope", "atoms' isotopes")] : []),
    ...(bonds ? [count(bonds, "bond", "bonds")] : []),
  ];
  if (!parts.length) return null;
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  return `An XYZ file holds elements and positions only: ${list} ${parts.length === 1 && !list.endsWith("s") ? "is" : "are"} not written.`;
}
