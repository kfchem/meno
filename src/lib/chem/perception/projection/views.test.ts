import { describe, expect, it } from "vitest";
import { boat, chair, cross, dot, envelope, flipped, fused, halfChair, haworth, newman, sub, unit, type Solid, type V3 } from "./solids";
import { CHAIR_ELEVATION_DEG, CHAIR_GENTLE_DEG, CHAIR_SEAT_DEG, CHAIR_STEEP_DEG, CHAIR_TURN_DEG, drawn, fromAbove, HAWORTH_ELEVATION_DEG, project, seen, seenFree, standardView } from "./views";

const close = (a: number, b: number, digits = 4) => expect(a).toBeCloseTo(b, digits);
const order = (s: { z: number }[]) => s.map((p, k) => [p.z, k] as const).sort((a, b) => b[0] - a[0]).map(([, k]) => k);
const R = (2 * Math.SQRT2) / 3;
const H = 1 / 6;

describe("the chair's standard view: its depth, and what `seen` shows", () => {
  it("is seen from 15 degrees over the mean plane (the look owner's choice, no basis claimed), turned atan(sqrt(3)/5) = 19.107 degrees from the line through two opposite atoms: the head 10.893 from the page's right", () => {
    expect(CHAIR_ELEVATION_DEG).toBe(15);
    close(CHAIR_TURN_DEG, 30 - 19.1066, 3);
    close(Math.atan(Math.sqrt(3) / 5) * (180 / Math.PI), 19.1066, 3);
  });

  it("stands the six atoms across the page at -3, -2, -1, 1, 2 and 3 (in units of R cos(70.893)): x = R cos(60 k + turn)", () => {
    const p = seen(chair(), standardView(chair(), 0));
    const u = R * Math.cos((70.8934 * Math.PI) / 180);
    expect(p.map((q) => Math.round(q.x / u))).toEqual([3, 1, -2, -3, -1, 2]);
    p.forEach((q, k) => close(q.x, R * Math.cos(((60 * k + CHAIR_TURN_DEG) * Math.PI) / 180), 9));
    // (the ring's axis up the page: a bond's depth is the ring's own, never the page's horizontal)
    expect(standardView(chair(), 0).up[2]).toBeCloseTo(Math.cos((15 * Math.PI) / 180), 12);
  });

  it("form 0 has its head up at the right: the six points as written out (page y = sin 15 R sin(60 k + turn) + cos 15 z, depth = -cos 15 R sin(60 k + turn) + sin 15 z)", () => {
    const p = seen(chair(), standardView(chair(), 0));
    const want = [
      [0.9258, 0.2071, -0.129],
      [0.3086, 0.0696, -0.9037],
      [-0.6172, 0.3454, -0.6453],
      [-0.9258, -0.2071, 0.129],
      [-0.3086, -0.0696, 0.9037],
      [0.6172, -0.3454, 0.6453],
    ];
    p.forEach((q, k) => [q.x, q.y, q.z].forEach((v, i) => close(v, want[k][i])));
    // (the same by the formulas)
    const [s, c, t] = [Math.sin((15 * Math.PI) / 180), Math.cos((15 * Math.PI) / 180), CHAIR_TURN_DEG * (Math.PI / 180)];
    p.forEach((q, k) => {
      const a = (k * Math.PI) / 3 + t;
      const z = k % 2 === 0 ? H : -H;
      close(q.y, s * R * Math.sin(a) + c * z, 9);
      close(q.z, -c * R * Math.sin(a) + s * z, 9);
    });
    // (the lower edge the nearer - Brecher 2006, ST-3.1: the nearer atoms of a mostly-horizontal ring lower in the drawing: depth order, nearest first, as listed)
    expect(order(p)).toEqual([4, 5, 3, 0, 2, 1]);
    // (the two lowest of the six: the foot, and the near right)
    const lowest = [...p.keys()].sort((a, b) => p[a].y - p[b].y).slice(0, 2).sort();
    expect(lowest).toEqual([3, 5]);
    expect(p[5].z).toBeGreaterThan(p[2].z);
  });

  it("form 1 is the other textbook chair, each the other's mirror picture: the same six points with x turned about, atoms 1 and 5, 2 and 4 swapped (the chair's own mirror plane through atoms 0 and 3)", () => {
    const a = seen(chair(), standardView(chair(), 0));
    const b = seen(chair(), standardView(chair(), 1));
    const want = [
      [-0.9258, 0.2071, -0.129],
      [-0.6172, -0.3454, 0.6453],
      [0.3086, -0.0696, 0.9037],
      [0.9258, -0.2071, 0.129],
      [0.6172, 0.3454, -0.6453],
      [-0.3086, 0.0696, -0.9037],
    ];
    b.forEach((q, k) => [q.x, q.y, q.z].forEach((v, i) => close(v, want[k][i])));
    const swapped = [0, 5, 4, 3, 2, 1];
    a.forEach((p, k) => {
      const q = b[swapped[k]];
      close(q.x, -p.x, 9);
      close(q.y, p.y, 9);
      close(q.z, p.z, 9);
    });
  });

  it("sees the ring flip as the other chair: the form-0 picture's mirror as a set, atom 0 now the low end at the right (turned the other way)", () => {
    const f = flipped(chair());
    const a = seen(chair(), standardView(chair(), 0));
    const b = seen(f, standardView(f, 0));
    for (const p of a) expect(b.some((q) => Math.abs(q.x + p.x) < 1e-9 && Math.abs(q.y - p.y) < 1e-9 && Math.abs(q.z - p.z) < 1e-9)).toBe(true);
    expect(b[0].y).toBeLessThan(b[3].y);
    expect(b[0].x).toBeGreaterThan(0);
    expect(standardView(f, 0).right[1]).toBeGreaterThan(0);
    expect(standardView(chair(), 0).right[1]).toBeLessThan(0);
  });

  it("is a rotation: its three rows are unit and at right angles, right-handed", () => {
    for (const v of [standardView(chair(), 0), standardView(chair(), 1), standardView(flipped(chair()), 0), standardView(flipped(chair()), 1), fromAbove(40, 70)]) {
      const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
      for (const r of [v.right, v.up, v.toward]) close(dot(r, r), 1, 12);
      close(dot(v.right, v.up), 0, 12);
      close(dot(v.right, v.toward), 0, 12);
      close(dot(v.up, v.toward), 0, 12);
      // (right-handed: right x up = toward)
      const x = [v.right[1] * v.up[2] - v.right[2] * v.up[1], v.right[2] * v.up[0] - v.right[0] * v.up[2], v.right[0] * v.up[1] - v.right[1] * v.up[0]];
      x.forEach((c, i) => close(c, v.toward[i], 12));
    }
  });

  it("sees the boat, half-chair and envelope as the chair is seen", () => {
    for (const s of [boat(), halfChair(), envelope()]) expect(standardView(s)).toEqual(standardView(chair()));
  });
});

describe("the Haworth ring's standard view (McNaught 1996, 2-Carb-5.4)", () => {
  it("is from slightly above - 30 degrees by eye - the edge closer to the viewer drawn below the more distant one", () => {
    expect(HAWORTH_ELEVATION_DEG).toBe(30);
    const p = seen(haworth(6), standardView(haworth(6)));
    // (the near edge, atoms 2 and 3 - the front - is lower than the far edge, atoms 5 and 0)
    expect(Math.max(p[2].y, p[3].y)).toBeLessThan(Math.min(p[5].y, p[0].y));
    expect(Math.min(p[2].z, p[3].z)).toBeGreaterThan(Math.max(p[5].z, p[0].z));
  });

  it("has the pyranose's six points as written out: the ring O at the back right, C1 at the right-hand end, C4 at the left", () => {
    const p = seen(haworth(6), standardView(haworth(6)));
    const want = [
      [0.5, 0.433, -0.75],
      [1, 0, 0],
      [0.5, -0.433, 0.75],
      [-0.5, -0.433, 0.75],
      [-1, 0, 0],
      [-0.5, 0.433, -0.75],
    ];
    p.forEach((q, k) => [q.x, q.y, q.z].forEach((v, i) => close(v, want[k][i])));
    // (C1 the right-hand end: the largest x; the oxygen behind: the least depth among those at the right)
    expect(Math.max(...p.map((q) => q.x))).toBe(p[1].x);
    expect(p[0].z).toBeLessThan(p[2].z);
  });

  it("has the furanose's O behind and C1 at the right", () => {
    const p = seen(haworth(5), standardView(haworth(5)));
    expect(order(p)[order(p).length - 1]).toBe(0);
    expect(p[1].x).toBeGreaterThan(p[2].x);
    expect(p[1].x).toBeGreaterThan(0);
    expect(p[0].y).toBeGreaterThan(Math.max(...p.slice(1).map((q) => q.y)));
  });

  it("draws the groups exactly vertical on the page - the projection of the normal - up above the atom and down below it", () => {
    const view = standardView(haworth(6));
    for (const { free, seen: d } of seenFree(haworth(6), view)) {
      expect(d.x).toBe(0);
      expect(Math.sign(d.y)).toBe(free.face);
      close(Math.abs(d.y), Math.cos((HAWORTH_ELEVATION_DEG * Math.PI) / 180), 9);
    }
  });
});

describe("the Newman pair's view", () => {
  it("is along the line of sight: both atoms at the centre, the front one nearer", () => {
    const n = newman("staggered");
    const p = seen(n, standardView(n));
    expect(p.map((q) => [q.x, q.y])).toEqual([[0, 0], [0, 0]]);
    expect(p[0].z).toBeGreaterThan(p[1].z);
  });

  it("shows the front atom's bonds from the centre at 90, 210 and 330 degrees and the back atom's at 30, 150 and 270", () => {
    const n = newman("staggered");
    const pages = (atom: number) =>
      seenFree(n, standardView(n))
        .filter((f) => f.free.at === atom)
        .map((f) => Math.round((((Math.atan2(f.seen.y, f.seen.x) * 180) / Math.PI) % 360) + 360) % 360);
    expect(pages(0)).toEqual([90, 210, 330]);
    expect(pages(1)).toEqual([30, 150, 270]);
  });

  it("projects a point by the rows, depth nearer larger", () => {
    const v = standardView(newman("eclipsed"));
    expect(project(v, [1, 2, 3])).toEqual({ x: 1, y: 2, z: 3 });
  });
});

// ---- the chair as the textbook draws it -------------------------------------------------------------------------------------------------------------

const bondIndex = (s: Solid, a: number, b: number) => s.bonds.findIndex(([x, y]) => x === a && y === b);
/** The systems the rule is held to: the single chair, its flip, trans- and both cis-decalins on two bonds, and the two tricycles. */
function systems(): [string, Solid][] {
  const c = chair();
  const decalin = fused(c, 0, "chair", "trans");
  return [
    ["chair", c],
    ["flipped chair", flipped(c)],
    ["trans-decalin", decalin],
    ["cis-decalin, face 1", fused(c, 0, "chair", { cis: 1 })],
    ["cis-decalin, face -1", fused(c, 0, "chair", { cis: -1 })],
    ["cis-decalin on another bond", fused(c, 3, "chair", { cis: 1 })],
    ["perhydrophenanthrene", fused(decalin, bondIndex(decalin, 7, 8), "chair", "trans")],
    ["perhydroanthracene", fused(decalin, bondIndex(decalin, 8, 9), "chair", "trans")],
    ["trans, cis, cis", fused(fused(c, 0, "chair", "trans"), bondIndex(decalin, 7, 8), "chair", { cis: -1 })],
  ];
}
const angleOf = (x: number, y: number) => (((Math.atan2(y, x) * 180) / Math.PI) % 180 + 180) % 180;
/** The drawn bond from atom a to atom b. */
const bondDrawn = (d: NonNullable<ReturnType<typeof drawn>>, a: number, b: number) => [d.atoms[b].x - d.atoms[a].x, d.atoms[b].y - d.atoms[a].y] as const;

describe("the chair as the textbook draws it (ruled: a convention of one drawn length, not a view)", () => {
  it("draws the seat at -15, the steep bond at 60 and the gentle one at 15 degrees (by eye from two figures, the look owner's: no basis claimed)", () => {
    expect([CHAIR_SEAT_DEG, CHAIR_STEEP_DEG, CHAIR_GENTLE_DEG]).toEqual([-15, 60, 15]);
  });

  it("places the single chair as calculated, head at the right, bond 1: the head, the far-right, far-left, the foot, near-left and near-right", () => {
    const d = drawn(chair())!;
    // (derived: from the head, atom 0, the bonds are the gentle one back toward the far right (15 degrees, rising toward the head: here falling to the left, 195), then the seat
    // (165), the steep bond (240), and the same three reversed; the sum of the six places is then taken off, the ring being centred)
    const [c15, s15, c60, s60] = [Math.cos(Math.PI / 12), Math.sin(Math.PI / 12), 0.5, Math.sqrt(3) / 2];
    const path = [
      [0, 0],
      [-c15, -s15],
      [-2 * c15, 0],
      [-2 * c15 - c60, -s60],
      [-c15 - c60, s15 - s60],
      [-c60, -s60],
    ];
    const centre = [path.reduce((t, q) => t + q[0], 0) / 6, path.reduce((t, q) => t + q[1], 0) / 6];
    const want = path.map((q) => [q[0] - centre[0], q[1] - centre[1]]);
    // (the head at (1.216, 0.433) and the foot at (-1.216, -0.433), as the textbook has them)
    close(want[0][0], 1.216, 3);
    close(want[0][1], 0.433, 3);
    d.atoms.forEach((p, k) => {
      close(p.x, want[k][0], 3);
      close(p.y, want[k][1], 3);
    });
    // (the steep bond at the head goes to the near seat line, the gentle one to the far line; at the foot the other way round)
    close(Math.hypot(...bondDrawn(d, 0, 5)), 1, 9);
    expect(angleOf(...bondDrawn(d, 0, 5))).toBeCloseTo(60, 6);
    expect(angleOf(...bondDrawn(d, 0, 1))).toBeCloseTo(15, 6);
    expect(angleOf(...bondDrawn(d, 3, 4))).toBeCloseTo(15, 6);
    expect(angleOf(...bondDrawn(d, 2, 3))).toBeCloseTo(60, 6);
    // (the seat lines: -15, the far one 1-2 and the near one 4-5)
    expect(angleOf(...bondDrawn(d, 1, 2))).toBeCloseTo(165, 6);
    expect(angleOf(...bondDrawn(d, 4, 5))).toBeCloseTo(165, 6);
    // (the ring is centred on the page's origin)
    close(d.atoms.reduce((sum, p) => sum + p.x, 0), 0, 9);
    close(d.atoms.reduce((sum, p) => sum + p.y, 0), 0, 9);
  });

  it("gives each atom the depth the true view gives it, the lower edge the nearer", () => {
    const d = drawn(chair())!;
    const p = seen(chair(), standardView(chair(), 0));
    d.atoms.forEach((q, k) => close(q.z, p[k].z, 9));
    expect(order(d.atoms)).toEqual([4, 5, 3, 0, 2, 1]);
    // (the two near atoms 4 and 5 are on the lower of the two seat lines)
    expect(Math.max(d.atoms[4].y, d.atoms[5].y)).toBeLessThan(Math.min(d.atoms[1].y, d.atoms[2].y));
  });

  it("draws every bond one long along its direction's image - the ring-closing ones too - in every system: bonds parallel in space parallel on the page, the four directions four lines", () => {
    for (const [name, s] of systems()) {
      const d = drawn(s)!;
      expect(d, name).not.toBeNull();
      const lines: { v: V3; angle: number }[] = [];
      for (const [a, b] of s.bonds) {
        const [x, y] = bondDrawn(d, a, b);
        close(Math.hypot(x, y), 1, 9);
        const v = unit(sub(s.atoms[b], s.atoms[a]));
        const known = lines.find((l) => Math.abs(Math.abs(dot(l.v, v)) - 1) < 1e-6);
        if (known) {
          // (the same direction in space: the same line on the page)
          expect(Math.abs(angleOf(x, y) - known.angle) < 1e-6 || Math.abs(Math.abs(angleOf(x, y) - known.angle) - 180) < 1e-6, name).toBe(true);
        } else lines.push({ v, angle: angleOf(x, y) });
      }
      // (the ring's three directions, and the vertical where a cis fusion takes an axial bond into the new ring: the fused systems stay on the four, each its own line)
      expect([3, 4], name).toContain(lines.length);
      expect(new Set(lines.map((l) => Math.round(l.angle))).size, name).toBe(lines.length);
    }
  });

  it("draws a cis fusion's new ring along two of the slanted directions and the vertical, a trans fusion's along the slanted ones only", () => {
    const c = chair();
    const trans = fused(c, 0, "chair", "trans");
    const cis = fused(c, 0, "chair", { cis: 1 });
    const lines = (s: Solid, from: number) => new Set(s.bonds.slice(from).map(([a, b]) => Math.round(angleOf(...bondDrawn(drawn(s)!, a, b)))));
    // (the new ring's five new bonds are the last five)
    expect(lines(trans, 6).has(90)).toBe(false);
    expect(lines(cis, 6).has(90)).toBe(true);
    expect(lines(cis, 6).size).toBe(3);
  });

  it("draws form 1 as the mirror picture - every angle mirrored, depth from the mirrored view: the single chair's places with x turned about, atoms 1 and 5, 2 and 4 swapped", () => {
    const a = drawn(chair(), 0)!;
    const b = drawn(chair(), 1)!;
    const swapped = [0, 5, 4, 3, 2, 1];
    a.atoms.forEach((p, k) => {
      close(b.atoms[swapped[k]].x, -p.x, 9);
      close(b.atoms[swapped[k]].y, p.y, 9);
      close(b.atoms[swapped[k]].z, p.z, 9);
    });
    // (the lower edge the nearer in form 1 too)
    expect(order(b.atoms)).toEqual([2, 1, 3, 0, 4, 5]);
    expect(new Set(drawn(chair(), 1)!.atoms.map((p) => Math.round(p.x * 1000) / 1000)).size).toBe(6);
  });

  it("draws the ring flip as the other chair by the same rule: the mirror of the form-0 places as a set, atom 0 the low end at the right", () => {
    const f = flipped(chair());
    const a = drawn(chair())!;
    const b = drawn(f)!;
    for (const p of a.atoms) expect(b.atoms.some((q) => Math.abs(q.x + p.x) < 1e-9 && Math.abs(q.y - p.y) < 1e-9 && Math.abs(q.z - p.z) < 1e-9)).toBe(true);
    close(b.atoms[0].x, 1.216, 3);
    close(b.atoms[0].y, -0.433, 3);
  });

  it("answers null for what is not on the four directions - the boat, half-chair, envelope, a five-ring fused on, the Haworth ring and the Newman pair - which are `seen`", () => {
    for (const s of [boat(), halfChair(), envelope(), haworth(6), haworth(5), newman("staggered"), fused(chair(), 0, "envelope", "trans")]) expect(drawn(s)).toBeNull();
  });

  describe("the free positions", () => {
    it("draws an axial bond vertical (up over an atom above the mean plane, down below it) and an equatorial one parallel to the ring bonds one removed", () => {
      const s = chair();
      const d = drawn(s)!;
      for (const { free, x, y } of d.free) {
        if (free.kind === "axial") {
          close(x, 0, 12);
          expect(Math.sign(y)).toBe(free.face);
        }
      }
      // (atom 0's equatorial parallel to the bonds 1-2 and 4-5, pointing away from the ring: opposite to 1 -> 2)
      const eq = d.free.find((f) => f.free.at === 0 && f.free.kind === "equatorial")!;
      const [bx, by] = bondDrawn(d, 1, 2);
      close(eq.x, -bx, 9);
      close(eq.y, -by, 9);
      const [cx, cy] = bondDrawn(d, 4, 5);
      close(Math.abs(eq.x * cy - eq.y * cx), 0, 9);
      // (every equatorial of every atom is parallel to the ring bond between the atoms one removed on each side)
      for (const f of d.free.filter((q) => q.free.kind === "equatorial")) {
        const k = f.free.at;
        const [rx, ry] = bondDrawn(d, (k + 1) % 6, (k + 2) % 6);
        close(f.x, -rx, 9);
        close(f.y, -ry, 9);
      }
      expect(d.free).toHaveLength(12);
    });

    it("gives each free direction the depth the true view gives it", () => {
      const s = chair();
      const d = drawn(s)!;
      const view = standardView(s, 0);
      for (const f of d.free) close(f.z, dot(view.toward, f.free.direction), 9);
    });
  });
});

describe("the drawing read back as the solid is (the nearer wins)", () => {
  /** What today's reading makes of a drawing: at an atom with two ring bonds, the two free directions worked out from the ring bonds as drawn (page x, y and depth), the group read as the one its drawn direction lies nearer. Returns the least margin in degrees, and what is wrong. */
  function readBack(s: Solid, form: number) {
    const d = drawn(s, form)!;
    const half = Math.acos(-1 / 3) / 2;
    let margin = 180;
    const wrong: string[] = [];
    const norm = (v: V3): V3 => unit(v);
    const ang = (v: readonly number[]) => (Math.atan2(v[1], v[0]) * 180) / Math.PI;
    const gap = (a: number, b: number) => {
      const x = Math.abs(a - b) % 360;
      return Math.min(x, 360 - x);
    };
    s.atoms.forEach((_, k) => {
      const near = s.bonds.flatMap(([a, b]) => (a === k ? [b] : b === k ? [a] : []));
      const groups = d.free.filter((f) => f.free.at === k && (f.free.kind === "axial" || f.free.kind === "equatorial"));
      if (near.length !== 2 || groups.length !== 2) return;
      const page = near.map((n): V3 => [bondDrawn(d, k, n)[0], bondDrawn(d, k, n)[1], d.atoms[n].z - d.atoms[k].z]);
      const space = near.map((n) => unit(sub(s.atoms[n], s.atoms[k])));
      const [u1, u2] = [norm(page[0]), norm(page[1])];
      const mid = unit([-(u1[0] + u2[0]), -(u1[1] + u2[1]), -(u1[2] + u2[2])]);
      const across = unit(cross(u1, u2));
      const free = [1, -1].map((sign): V3 => [mid[0] * Math.cos(half) + sign * across[0] * Math.sin(half), mid[1] * Math.cos(half) + sign * across[1] * Math.sin(half), mid[2] * Math.cos(half) + sign * across[2] * Math.sin(half)]);
      for (const g of groups) {
        const drawnAt = ang([g.x, g.y]);
        const gaps = free.map((f) => gap(drawnAt, ang(f)));
        const pick = gaps[1] < gaps[0] ? 1 : 0;
        const read = Math.sign(dot(cross(page[0], page[1]), free[pick]));
        const truth = Math.sign(dot(cross(space[0], space[1]), g.free.direction));
        if (read !== truth) wrong.push(`atom ${k} ${g.free.kind}`);
        margin = Math.min(margin, Math.abs(gaps[0] - gaps[1]) / 2);
      }
    });
    return { margin, wrong };
  }

  it("reads every group of the single chair back as the solid has it, in each form and in the flip: at least 40 degrees from the line between its two free directions", () => {
    for (const s of [chair(), flipped(chair())]) {
      for (const form of [0, 1]) {
        const r = readBack(s, form);
        expect(r.wrong).toEqual([]);
        expect(r.margin).toBeGreaterThan(40);
      }
    }
  });

  it("reads every group of the decalins and the tricycles back as the solid has it: more than 22 degrees from that line (the least, 22.49, in cis-decalin)", () => {
    for (const [name, s] of systems()) {
      for (const form of [0, 1]) {
        const r = readBack(s, form);
        expect(r.wrong, name).toEqual([]);
        expect(r.margin, name).toBeGreaterThan(22);
      }
    }
  });
});
