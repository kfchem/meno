import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { STYLE_3D } from "../../../../lib/chem/style3d";
import type { Carried3D, Molecule3D } from "../store/types";
import { solidOf, turnedTogether, WORLD_PER_ANGSTROM } from "./molecule3d";
import { bodiesOf, restyled3d } from "./restyle3d";
import { writtenOf } from "./written";

// (a carbon pair, 1.5 Å apart: its sphere reaches (0.75 + 0.354) Å from its centre in the primary look)
const ethane = (id: number, at: Molecule3D["at"]): Molecule3D => ({
  id,
  atoms: [
    { el: "C", x: 10, y: 5, z: 1 },
    { el: "C", x: 11.5, y: 5, z: 1 },
  ],
  bonds: [{ a1: 0, a2: 1, order: 1 }],
  at,
});
const reach = solidOf(ethane(0, { x: 0, y: 0 }), STYLE_3D).reach.primary;
// (ACS 1996's bond, 14.4 pt, over RSC's, 12.2 pt: the page's middles come in as the bonds print shorter)
const ACS = 14.4;
const RSC = 12.2;
const k = ACS / RSC;
const about = { x: 3, y: -2 };

describe("molecules in 3D as a change of style puts them", () => {
  it("moves a lone molecule's middle about the point, so that it stays where it was in pt, and keeps the rest", () => {
    const m = { ...ethane(1, { x: 10, y: 4, z: 2.5 }), look: "secondary" as const, frames: [[0, 0, 0, 1.5, 0, 0]] };
    const [out] = restyled3d([m], k, about, STYLE_3D);
    expect(out.at.x).toBeCloseTo(about.x + (10 - about.x) * k, 12);
    expect(out.at.y).toBeCloseTo(about.y + (4 - about.y) * k, 12);
    // (in pt, about the point: as far as it was in the old style)
    expect(((out.at.x - about.x) / k) * ACS).toBeCloseTo((10 - about.x) * ACS, 9);
    expect({ ...out, at: undefined }).toEqual({ ...m, at: undefined });
    expect(out.at.z).toBe(2.5);
    expect(out.atoms).toBe(m.atoms);
  });

  it("gives back the very molecules where k is 1", () => {
    const ms = [ethane(1, { x: 0, y: 0 }), ethane(2, { x: 40, y: 0 })];
    expect(restyled3d(ms, 1, about, STYLE_3D)).toBe(ms);
  });

  it("moves molecules that touch as one body: the offsets among them kept, and what is written of them in ångströms", () => {
    // (a pair put together, touching; a third far off, on its own)
    const pair = [ethane(1, { x: 0, y: 0 }), ethane(2, { x: 1.5 * reach, y: 0.5 * reach })];
    const far = ethane(3, { x: 60, y: 30 });
    const out = restyled3d([...pair, far], k, about, STYLE_3D);
    expect(out[1].at.x - out[0].at.x).toBeCloseTo(pair[1].at.x - pair[0].at.x, 12);
    expect(out[1].at.y - out[0].at.y).toBeCloseTo(pair[1].at.y - pair[0].at.y, 12);
    // (its middle, the middle of the pair's box, where k puts it)
    const middle = { x: (pair[0].at.x + pair[1].at.x) / 2, y: (pair[0].at.y + pair[1].at.y) / 2 };
    expect((out[0].at.x + out[1].at.x) / 2).toBeCloseTo(about.x + (middle.x - about.x) * k, 12);
    expect((out[0].at.y + out[1].at.y) / 2).toBeCloseTo(about.y + (middle.y - about.y) * k, 12);
    expect(out[2].at.x).toBeCloseTo(about.x + (60 - about.x) * k, 12);
    const written = (ms: readonly Carried3D[]) => writtenOf(ms, STYLE_3D).atoms;
    const [a, b] = [written(pair), written(out.slice(0, 2))];
    const gap = (w: typeof a) => Math.hypot(w[0].x - w[2].x, w[0].y - w[2].y, w[0].z - w[2].z);
    expect(gap(b)).toBeCloseTo(gap(a), 9);
    // (apart, the distance between the pair and the third follows the page)
    const apart = (ms: readonly Molecule3D[]) => Math.hypot(ms[2].at.x - ms[0].at.x, ms[2].at.y - ms[0].at.y) / WORLD_PER_ANGSTROM;
    expect(apart(out)).not.toBeCloseTo(apart([...pair, far]), 3);
  });

  it("keeps ones turned together that touch as they were turned: their heights, turns and offsets", () => {
    const ms = [ethane(1, { x: 0, y: 0 }), ethane(2, { x: 1.8 * reach, y: 0 })];
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0.4, 0).normalize(), 0.9);
    const turned = turnedTogether(ms.map((m) => ({ id: m.id, at: m.at, standing: reach })), q);
    const carried: Carried3D[] = ms.map((m, i) => ({ ...m, at: turned[i].at, turn: turned[i].turn, frame: 0 }));
    const out = restyled3d(carried, 1 / k, about, STYLE_3D);
    expect(out.map((m) => m.at.z)).toEqual(carried.map((m) => m.at.z));
    expect(out.map((m) => m.turn)).toEqual(carried.map((m) => m.turn));
    expect(out[1].at.x - out[0].at.x).toBeCloseTo(carried[1].at.x - carried[0].at.x, 12);
    expect(out[1].at.y - out[0].at.y).toBeCloseTo(carried[1].at.y - carried[0].at.y, 12);
  });

  it("comes back to where it was, a style changed and changed back, to 1e-9", () => {
    const ms = [ethane(1, { x: -20, y: 7 }), ethane(2, { x: -20 + 1.2 * reach, y: 7 }), ethane(3, { x: 25, y: -11, z: 4 }), ethane(4, { x: 0.3, y: 40 })];
    const back = restyled3d(restyled3d(ms, k, about, STYLE_3D), 1 / k, about, STYLE_3D);
    back.forEach((m, i) => {
      expect(m.at.x).toBeCloseTo(ms[i].at.x, 9);
      expect(m.at.y).toBeCloseTo(ms[i].at.y, 9);
      expect(m.at.z).toBe(ms[i].at.z);
    });
  });
});

describe("bodies of spheres", () => {
  it("joins spheres that touch, and those that touch one that does; not those near on the page but apart in height", () => {
    const s = (x: number, y: number, z: number, r = 1) => ({ x, y, z, r });
    expect(bodiesOf([s(0, 0, 1), s(2, 0, 1), s(4, 0, 1), s(7, 0, 1), s(0, 0, 4)])).toEqual([0, 0, 0, 3, 4]);
  });
});
