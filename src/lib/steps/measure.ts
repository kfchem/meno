/**
 * *Measure* (docs/WORKFLOWS-FOUNDATION.md, *Meno's own nodes*, Structures):
 * each entry the same, with a property for each measurement asked for -
 * a distance between two atoms, an angle at the middle of three, or the
 * dihedral of four - the atoms numbered from 1 in the entry's numbering.
 *
 * - Distances in ångströms; angles from 0 to 180 degrees; dihedrals from
 *   -180 to 180 degrees, signed as IUPAC defines the torsion angle: positive
 *   where, looking along the bond from the second atom to the third, the
 *   bond to the first turns clockwise, less than 180 degrees, to cover the
 *   bond to the fourth (IUPAC Gold Book, "torsion angle", doi:10.1351/goldbook.T06406).
 * - Each value says the geometry it was measured at. For an entry with
 *   frames, a list: one value per frame.
 * - An entry with no 3D places (drawn, or none) gets each measurement as not
 *   applicable, with the reason; an atom number it has not, as failed. None
 *   is left out.
 */
import { geometryKey, type Entry, type Property } from "../entry";

type V = [number, number, number];
const at = (xyz: readonly number[], i: number): V => [xyz[3 * i], xyz[3 * i + 1], xyz[3 * i + 2]];
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V) => Math.sqrt(dot(a, a));
const DEG = 180 / Math.PI;

/** The distance between two points (Å). */
export function distance(a: V, b: V): number {
  return norm(sub(a, b));
}

/** The angle a-b-c at b, in degrees, 0 to 180. */
export function angle(a: V, b: V, c: V): number {
  const u = sub(a, b);
  const v = sub(c, b);
  return Math.atan2(norm(cross(u, v)), dot(u, v)) * DEG;
}

/** The dihedral a-b-c-d, in degrees, -180 to 180, signed as IUPAC's torsion angle (see above). */
export function dihedral(a: V, b: V, c: V, d: V): number {
  const b1 = sub(b, a);
  const b2 = sub(c, b);
  const b3 = sub(d, c);
  const n1 = cross(b1, b2);
  const n2 = cross(b2, b3);
  return Math.atan2(norm(b2) * dot(b1, n2), dot(n1, n2)) * DEG;
}

/** A measurement's name, as its property is called: `distance 3-7`, `angle 1-2-3`, `dihedral 1-2-3-4`. */
export function measurementName(atoms: readonly number[]): string {
  return `${["distance", "angle", "dihedral"][atoms.length - 2]} ${atoms.join("-")}`;
}

function valueAt(xyz: readonly number[], atoms: readonly number[]): number {
  const p = atoms.map((n) => at(xyz, n - 1));
  return atoms.length === 2 ? distance(p[0], p[1]) : atoms.length === 3 ? angle(p[0], p[1], p[2]) : dihedral(p[0], p[1], p[2], p[3]);
}

/** The entry with each measurement (two, three or four atom numbers, from 1) as a property. */
export function measured(e: Entry, measurements: readonly (readonly number[])[], by?: Property["by"]): Entry {
  const n = e.structure.atoms.length;
  const properties = { ...e.properties };
  for (const atoms of measurements) {
    const name = measurementName(atoms);
    const unit = atoms.length === 2 ? ("Å" as const) : ("°" as const);
    const wrong =
      atoms.length < 2 || atoms.length > 4
        ? `A measurement takes two, three or four atoms, not ${atoms.length}.`
        : atoms.find((a) => !Number.isInteger(a) || a < 1 || a > n) !== undefined
          ? `The entry has no atom ${atoms.find((a) => !Number.isInteger(a) || a < 1 || a > n)}: its atoms are 1 to ${n}.`
          : new Set(atoms).size !== atoms.length
            ? `An atom is named twice in ${atoms.join("-")}.`
            : null;
    if (wrong) {
      properties[wrong.startsWith("A measurement") ? `measurement ${atoms.join("-")}` : name] = { value: "", unit, status: { failed: wrong }, by };
      continue;
    }
    const g = e.geometry;
    if (g.kind === "3d") properties[name] = { value: valueAt(g.xyz, atoms), unit, at: { geometry: geometryKey(g.xyz) }, status: "computed", by };
    else if (g.kind === "frames") properties[name] = { value: { list: g.frames.map((f) => valueAt(f, atoms)) }, unit, status: "computed", by };
    else properties[name] = { value: "", unit, status: { notApplicable: g.kind === "2d" ? "The entry is drawn, not in 3D." : "The entry has no places." }, by };
  }
  return { ...e, properties };
}
