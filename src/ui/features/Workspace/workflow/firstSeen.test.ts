import { describe, expect, it } from "vitest";
import * as THREE from "three";
import type { Molecule3D, Turn3D } from "../store/types";
import { firstSeen, seenAs, viewKeptOrFirst } from "./run";
import type { SetEntry } from "./entries";

// Invented geometries: a bent three-atom molecule (an O-H 0.96 A, an H-O-H angle of 104.5 degrees) lying in the x-z plane,
// so that seen down z, unturned, its three atoms fall on one line.
const ANGLE = (104.5 * Math.PI) / 180;
const bentInXz: [number, number, number][] = [
  [0, 0, 0],
  [0.96, 0, 0],
  [0.96 * Math.cos(ANGLE), 0, 0.96 * Math.sin(ANGLE)],
];
const molecule = (xyz: readonly (readonly number[])[], more: Partial<Molecule3D> = {}) =>
  ({ atoms: xyz.map(([x, y, z], i) => ({ el: i ? "H" : "O", x, y, z })), bonds: [], ...more }) as unknown as Molecule3D;

/** Where each atom is seen on the page, turned by `turn`: across, up and towards the viewer, about the molecule's middle. */
function seen(xyz: readonly (readonly number[])[], turn: Turn3D | undefined): number[][] {
  const q = turn ? new THREE.Quaternion(...turn) : new THREE.Quaternion();
  const c = [0, 1, 2].map((k) => xyz.reduce((s, p) => s + p[k], 0) / xyz.length);
  return xyz.map((p) => new THREE.Vector3(p[0] - c[0], p[1] - c[1], p[2] - c[2]).applyQuaternion(q).toArray());
}
/** The angle at the first atom between the other two, as seen on the page (across and up alone). */
const seenAngle = (p: number[][]) => {
  const a = [p[1][0] - p[0][0], p[1][1] - p[0][1]];
  const b = [p[2][0] - p[0][0], p[2][1] - p[0][1]];
  return (Math.acos((a[0] * b[0] + a[1] * b[1]) / (Math.hypot(...a) * Math.hypot(...b))) * 180) / Math.PI;
};

describe("a molecule a step gave, first seen", () => {
  it("is seen face-on where it is planar: a bent three-atom molecule bent, at its own angle - not on one line, as unturned", () => {
    expect(seenAngle(seen(bentInXz, undefined))).toBeCloseTo(180, 6);
    const turn = firstSeen(molecule(bentInXz));
    expect(seenAngle(seen(bentInXz, turn))).toBeCloseTo(104.5, 6);
    // (face-on: nothing towards the viewer)
    for (const p of seen(bentInXz, turn)) expect(Math.abs(p[2])).toBeLessThan(1e-9);
  });

  it("is seen the same way whatever way the same geometry came, in every card", () => {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.7, -1.9, 2.4));
    const moved = bentInXz.map(([x, y, z]) => new THREE.Vector3(x, y, z).applyQuaternion(q).add(new THREE.Vector3(5, -3, 2)).toArray());
    const a = seen(bentInXz, firstSeen(molecule(bentInXz)));
    const b = seen(moved, firstSeen(molecule(moved)));
    for (let i = 0; i < a.length; i++) for (let k = 0; k < 3; k++) expect(b[i][k]).toBeCloseTo(a[i][k], 6);
  });

  it("changes no coordinate: only the view is turned", () => {
    const m = molecule(bentInXz);
    const before = JSON.stringify(m);
    firstSeen(m);
    expect(JSON.stringify(m)).toBe(before);
  });

  it("is seen in the frame it is first shown at: a path at its end", () => {
    const line: [number, number, number][] = [[0, 0, 0], [0.96, 0, 0], [-0.96, 0, 0]];
    const path = molecule(line, { frames: [bentInXz.flat()], path: true } as Partial<Molecule3D>);
    expect(seenAngle(seen(bentInXz, firstSeen(path)))).toBeCloseTo(104.5, 6);
  });

  it("keeps the turn a step's results are given where there is one, and is first seen only where there is none", () => {
    const given: Turn3D = [0, 0, Math.sin(0.3), Math.cos(0.3)];
    const ms = [molecule(bentInXz), molecule(bentInXz)];
    const turns = seenAs(ms, [given, undefined]);
    expect(turns[0]).toEqual(given);
    expect(turns[1]).toEqual(firstSeen(ms[1]));
    expect(seenAs(ms)).toEqual([firstSeen(ms[0]), firstSeen(ms[1])]);
  });

  it("leaves one a step passed through seen as its source, turned or not, and first sees only one it moved or made", () => {
    const passed = molecule(bentInXz);
    const moved = molecule(bentInXz.map(([x, y, z]) => [x + 0.1, y, z]));
    const entry = { atoms: passed.atoms, xyz: bentInXz.flat(), from: 7 } as unknown as SetEntry;
    const turned: Turn3D = [0, 0, Math.sin(0.3), Math.cos(0.3)];
    expect(viewKeptOrFirst([passed, moved], [entry], () => turned)).toEqual([turned, firstSeen(moved)]);
    expect(viewKeptOrFirst([passed, moved], [entry], () => undefined)).toEqual([undefined, firstSeen(moved)]);
  });
});
