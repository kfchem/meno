import type { WrittenAtom, WrittenMolecule } from "../../../../lib/io/writers";
import type { Carried3D } from "../store/types";
import type { Style3D } from "../../../../lib/chem/style3d";
import { currentStyle3D } from "../style3d";
import { heightOf, lookOf, solidOf, WORLD_PER_ANGSTROM } from "./molecule3d";

/** A molecule in 3D's atoms' places in one of its frames, where its file had them, in ångströms: x, y, z of each. */
function frameXyz(m: Carried3D, frame = 0): number[] {
  const n = m.atoms.length;
  const first = m.atoms.flatMap((a) => [a.x, a.y, a.z]);
  const frames = [first, ...(m.frames ?? []).filter((f) => f.length === 3 * n)];
  return frames[Math.min(Math.max(0, Math.round(frame)), frames.length - 1)] ?? first;
}

/** `v` turned by the quaternion `q` (x, y, z, w), in full precision. */
function turned([qx, qy, qz, qw]: readonly number[], [vx, vy, vz]: readonly number[]): [number, number, number] {
  // t = 2 (q × v); v' = v + w t + q × t
  const tx = 2 * (qy * vz - qz * vy);
  const ty = 2 * (qz * vx - qx * vz);
  const tz = 2 * (qx * vy - qy * vx);
  return [vx + qw * tx + (qy * tz - qz * ty), vy + qw * ty + (qz * tx - qx * tz), vz + qw * tz + (qx * ty - qy * tx)];
}

/** A file's name without its extension: what a molecule read from it is called. */
const stem = (name: string) => name.replace(/\.[^.]*$/, "");

/**
 * Molecules in 3D as one molecule a writer is given (lib/io/writers
 * `WrittenMolecule`), in ångströms, each in the frame it shows: one, where
 * its file had it; several, one system, as they stand on the page - each
 * turned and placed as it is seen, its file's ångströms kept - so that a
 * complex put together on the page is written as it was put together.
 * Called by the name of the file each came from.
 */
export function writtenOf(molecules: readonly Carried3D[], style: Style3D = currentStyle3D()): WrittenMolecule {
  const atoms: WrittenAtom[] = [];
  const bonds: WrittenMolecule["bonds"] = [];
  const k = WORLD_PER_ANGSTROM;
  for (const m of molecules) {
    const xyz = frameXyz(m, m.frame);
    const n = m.atoms.length;
    let place = (i: number): [number, number, number] => [xyz[3 * i], xyz[3 * i + 1], xyz[3 * i + 2]];
    if (molecules.length > 1) {
      // (as it stands: about its centre, turned, where on the page and how high - in ångströms)
      const c = [0, 0, 0];
      for (let i = 0; i < n; i++) for (let j = 0; j < 3; j++) c[j] += xyz[3 * i + j] / n;
      const height = heightOf(m, solidOf({ ...m, id: 0 }, style), lookOf(m)) / k;
      const q = m.turn ?? [0, 0, 0, 1];
      place = (i) => {
        const [x, y, z] = turned(q, [xyz[3 * i] - c[0], xyz[3 * i + 1] - c[1], xyz[3 * i + 2] - c[2]]);
        return [m.at.x / k + x, m.at.y / k + y, height + z];
      };
    }
    const first = atoms.length;
    m.atoms.forEach((a, i) => {
      const [x, y, z] = place(i);
      atoms.push({
        el: a.el,
        x,
        y,
        z,
        ...(a.charge ? { charge: a.charge } : {}),
        ...(a.isotope ? { isotope: a.isotope } : {}),
        ...(a.radical ? { radical: a.radical } : {}),
      });
    });
    for (const b of m.bonds) bonds.push({ a1: first + b.a1, a2: first + b.a2, order: b.order });
  }
  const names = molecules.map((m) => (m.name ? stem(m.name) : "")).filter(Boolean);
  return { atoms, bonds, ...(names.length ? { name: [...new Set(names)].join(" + ") } : {}) };
}

/**
 * A molecule in 3D's formula, its atoms counted - its hydrogens are atoms of
 * its own - in Hill order: C, H, then the rest alphabetically; all of them
 * alphabetically where there is no carbon.
 */
export function formulaOf(atoms: readonly { el: string }[]): string {
  const count = new Map<string, number>();
  for (const a of atoms) count.set(a.el, (count.get(a.el) ?? 0) + 1);
  const others = [...count.keys()].filter((e) => e !== "C" && e !== "H").sort();
  const order = count.has("C") ? ["C", ...(count.has("H") ? ["H"] : []), ...others] : [...count.keys()].sort();
  return order.map((e) => `${e}${count.get(e)! > 1 ? count.get(e) : ""}`).join("");
}

/**
 * The molecules in 3D on the page as Export names them, where it asks which
 * to write: each by the file it came from and its formula - numbered, where
 * two would read alike.
 */
export function offeredNames(molecules: readonly { name?: string; atoms: readonly { el: string }[] }[]): string[] {
  const names = molecules.map((m, i) => `${m.name ?? `Molecule ${i + 1}`} - ${formulaOf(m.atoms)}`);
  return names.map((n, i) => (names.filter((o) => o === n).length > 1 ? `${n} (${i + 1})` : n));
}
