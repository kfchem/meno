import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { principalTurn, turnAfter, turnOnto, turnOver } from "./align3d";

/** Points on the page, and the same points stood up in 3D by the turn `q` undone. */
function stoodUp(page: [number, number][], q: THREE.Quaternion) {
  const back = q.clone().invert();
  return page.flatMap(([x, y]) => new THREE.Vector3(x, y, 0).applyQuaternion(back).toArray());
}

describe("turnOnto", () => {
  const page: [number, number][] = [[0, 0], [1.5, 0.2], [2.4, 1.4], [1.1, 2.6], [-0.6, 1.9], [3.3, -0.8]];

  it("finds the turn that lays flat points back on the page, wherever they were", () => {
    for (const axis of [new THREE.Vector3(1, 2, 3), new THREE.Vector3(0, 1, 0), new THREE.Vector3(-2, 0.5, 1)]) {
      const q = new THREE.Quaternion().setFromAxisAngle(axis.normalize(), 2.1);
      const from = stoodUp(page, q);
      const t = new THREE.Quaternion(...turnOnto(from, page.flat()));
      for (let i = 0; i < page.length; i++) {
        const p = new THREE.Vector3(from[3 * i], from[3 * i + 1], from[3 * i + 2]).applyQuaternion(t);
        expect(p.x).toBeCloseTo(page[i][0], 6);
        expect(p.y).toBeCloseTo(page[i][1], 6);
        expect(p.z).toBeCloseTo(0, 6);
      }
    }
  });

  it("lays a puckered set as near the page's points as a turn can, the same turn each time", () => {
    const from = stoodUp(page, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0.7));
    // (lifted off the page, alternately up and down)
    for (let i = 0; i < page.length; i++) from[3 * i + 2] += i % 2 ? 0.4 : -0.4;
    const t = turnOnto(from, page.flat());
    expect(turnOnto(from, page.flat())).toEqual(t);
    const q = new THREE.Quaternion(...t);
    let err = 0;
    for (let i = 0; i < page.length; i++) {
      const p = new THREE.Vector3(from[3 * i], from[3 * i + 1], from[3 * i + 2]).applyQuaternion(q);
      err += (p.x - page[i][0]) ** 2 + (p.y - page[i][1]) ** 2;
    }
    expect(Math.sqrt(err / page.length)).toBeLessThan(0.45);
  });

  it("leaves one point, or none, as it is", () => {
    expect(turnOnto([1, 2, 3], [0, 0])).toEqual([0, 0, 0, 1]);
  });
});

describe("turnOver", () => {
  // (methanol, as a file gave it)
  const methanol = [-0.3706, -0.0212, -0.0012, 0.945, -0.3921, -0.3697, -0.4924, -0.1322, 1.0791, -1.0808, -0.6737, -0.5145, -0.5536, 1.0154, -0.2947, 1.5524, 0.2038, 0.101];
  const moved = (xyz: number[], q: THREE.Quaternion, by: THREE.Vector3) =>
    Array.from({ length: xyz.length / 3 }, (_, i) => new THREE.Vector3(xyz[3 * i], xyz[3 * i + 1], xyz[3 * i + 2]).applyQuaternion(q).add(by).toArray()).flat();

  it("finds the turn that lays a molecule a program turned and moved back over it as it went in", () => {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0.3, -1, 0.6).normalize(), 2.7);
    // (as Gaussian gives it: turned to its principal axes, its centre moved)
    const out = moved(methanol, q, new THREE.Vector3(0.2, -0.1, 0.05));
    const t = new THREE.Quaternion(...turnOver(out, methanol));
    // (turned about their centres, the two lie on each other: each atom as far from the centre, in the same direction)
    const centre = (xyz: number[]) => [0, 1, 2].map((a) => xyz.filter((_, k) => k % 3 === a).reduce((s, v) => s + v, 0) / (xyz.length / 3));
    const [co, cm] = [centre(out), centre(methanol)];
    for (let i = 0; i < methanol.length / 3; i++) {
      const p = new THREE.Vector3(out[3 * i] - co[0], out[3 * i + 1] - co[1], out[3 * i + 2] - co[2]).applyQuaternion(t);
      expect(p.x).toBeCloseTo(methanol[3 * i] - cm[0], 6);
      expect(p.y).toBeCloseTo(methanol[3 * i + 1] - cm[1], 6);
      expect(p.z).toBeCloseTo(methanol[3 * i + 2] - cm[2], 6);
    }
  });

  it("leaves a molecule that went in and came back as it was as it is", () => {
    const [x, y, z, w] = turnOver(methanol, methanol);
    expect([x, y, z]).toEqual([expect.closeTo(0, 9), expect.closeTo(0, 9), expect.closeTo(0, 9)]);
    expect(w).toBeCloseTo(1, 9);
    expect(turnOver([1, 2, 3], [0, 0, 0])).toEqual([0, 0, 0, 1]);
  });
});

describe("turnAfter", () => {
  it("is the one turn that makes the first, then the other", () => {
    const first = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.8);
    const then = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 1).normalize(), -1.3);
    const both = new THREE.Quaternion(...turnAfter([then.x, then.y, then.z, then.w], [first.x, first.y, first.z, first.w]));
    const p = new THREE.Vector3(0.4, -1.2, 2);
    const a = p.clone().applyQuaternion(first).applyQuaternion(then);
    const b = p.clone().applyQuaternion(both);
    expect(b.distanceTo(a)).toBeLessThan(1e-12);
  });
});

describe("principalTurn", () => {
  /** Points turned by `turn` about their centre, as the canvas shows them. */
  const seen = (xyz: number[], turn: [number, number, number, number]) => {
    const q = new THREE.Quaternion(...turn);
    const n = xyz.length / 3;
    const c = [0, 1, 2].map((k) => xyz.filter((_, i) => i % 3 === k).reduce((a, b) => a + b, 0) / n);
    return Array.from({ length: n }, (_, i) => new THREE.Vector3(xyz[3 * i] - c[0], xyz[3 * i + 1] - c[1], xyz[3 * i + 2] - c[2]).applyQuaternion(q));
  };

  it("shows a linear molecule side-on - HCN laid along the view, not end-on as one ball", () => {
    // (H-C≡N along z, as a calculation's output may give it: end-on to the canvas)
    const hcn = [0, 0, -1.066, 0, 0, 0, 0, 0, 1.153];
    const p = seen(hcn, principalTurn(hcn)!);
    expect(Math.max(...p.map((v) => v.x)) - Math.min(...p.map((v) => v.x))).toBeCloseTo(2.219, 3);
    for (const v of p) {
      expect(v.y).toBeCloseTo(0, 6);
      expect(v.z).toBeCloseTo(0, 6);
    }
  });

  it("shows a planar molecule face-on, its longest extent across", () => {
    // (a ring of six in the xz plane - edge-on to the canvas - and stretched along z)
    const ring = Array.from({ length: 6 }, (_, k) => [1.4 * Math.cos((k * Math.PI) / 3), 0, 2 * Math.sin((k * Math.PI) / 3)]).flat();
    const p = seen(ring, principalTurn(ring)!);
    for (const v of p) expect(v.z).toBeCloseTo(0, 6);
    const across = Math.max(...p.map((v) => v.x)) - Math.min(...p.map((v) => v.x));
    const up = Math.max(...p.map((v) => v.y)) - Math.min(...p.map((v) => v.y));
    expect(across).toBeGreaterThan(up);
  });

  it("turns nothing of one atom, or of atoms all in one place", () => {
    expect(principalTurn([1, 2, 3])).toBeUndefined();
    expect(principalTurn([1, 2, 3, 1, 2, 3])).toBeUndefined();
  });
});
