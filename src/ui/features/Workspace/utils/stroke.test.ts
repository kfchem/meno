import { describe, expect, it } from "vitest";
import {
  advanceStroke,
  finishStroke,
  holdStroke,
  NEW_ATOM,
  startStroke,
  strokeTarget,
} from "./stroke";

const L = 1;
// one carbon, and a second to the left of it
const methyl = {
  atoms: [
    { id: 1, x: 0, y: 0 },
    { id: 2, x: -1, y: 0 },
  ],
  bonds: [{ a: 1, b: 2 }],
};

describe("a bond stroke", () => {
  it("points 120 degrees from the bond already there", () => {
    const s = startStroke("bond", 1);
    const t = strokeTarget(methyl, s, { x: 0.4, y: 0.9 }, L)!;
    expect(t.end.x).toBeCloseTo(0.5, 6);
    expect(t.end.y).toBeCloseTo(Math.sqrt(3) / 2, 6);
    expect(t.trigonalTo).toBeDefined();
    // released: one bond, to a new atom there
    expect(finishStroke(methyl, s, { x: 0.4, y: 0.9 }, L)).toHaveLength(1);
  });

  it("goes exactly where the pointer is after a pause", () => {
    const s = holdStroke(methyl, startStroke("bond", 1), { x: 0.3, y: 0.3 }, L);
    expect(strokeTarget(methyl, s, { x: 0.7, y: 0.2 }, L)!.end).toEqual({
      x: 0.7,
      y: 0.2,
    });
  });

  it("closes onto the atom the pointer is on, however far away", () => {
    // an atom two bonds off, the pointer on it: a long bond closes the ring
    const far = {
      atoms: [...methyl.atoms, { id: 3, x: 1.2, y: 1.5 }],
      bonds: methyl.bonds,
    };
    const t = strokeTarget(far, startStroke("bond", 1), { x: 1.25, y: 1.45 }, L)!;
    expect(t.atomId).toBe(3);
    expect(t.end).toEqual({ x: 1.2, y: 1.5 });
  });

  it("closes onto an atom within reach", () => {
    const three = {
      atoms: [...methyl.atoms, { id: 3, x: 0.5, y: 0.9 }],
      bonds: methyl.bonds,
    };
    const t = strokeTarget(three, startStroke("bond", 1), { x: 0.4, y: 0.9 }, L)!;
    expect(t.atomId).toBe(3);
    expect(t.end).toEqual({ x: 0.5, y: 0.9 });
  });
});

describe("a chain stroke", () => {
  it("runs on a honeycomb turned to the bond its atom has, and takes back what it is led back over", () => {
    let s = startStroke("chain", 1, methyl, undefined, L);
    // off to the right, four bond lengths, a little at a time
    for (let x = 0.1; x <= 4; x += 0.05) s = advanceStroke(methyl, s, { x, y: 0.1 }, L);
    expect(s.nodes.length).toBeGreaterThanOrEqual(3);
    let prev = { x: 0, y: 0 };
    for (const n of s.nodes) {
      expect(Math.hypot(n.x - prev.x, n.y - prev.y)).toBeCloseTo(1, 6);
      prev = n;
    }
    // every bond 120 degrees from the methyl's
    const first = s.nodes[0];
    const methylWay = Math.atan2(methyl.atoms[1].y, methyl.atoms[1].x);
    const angle = Math.abs(Math.atan2(Math.sin(Math.atan2(first.y, first.x) - methylWay), Math.cos(Math.atan2(first.y, first.x) - methylWay)));
    expect(angle).toBeCloseTo((2 * Math.PI) / 3, 6);
    // led back to its start: nothing
    for (let x = 4; x >= 0.05; x -= 0.05) s = advanceStroke(methyl, s, { x, y: 0.1 }, L);
    expect(finishStroke(methyl, s, { x: 0.05, y: 0.1 }, L)).toEqual([]);
  });

  it("starts on empty space from a new atom, across at 30 degrees", () => {
    let s = startStroke("chain", NEW_ATOM, methyl, { x: 10, y: 10 }, L);
    for (let x = 10.05; x <= 12.2; x += 0.05) s = advanceStroke(methyl, s, { x, y: 10.2 }, L);
    expect(s.nodes.length).toBeGreaterThanOrEqual(2);
    expect(Math.atan2(s.nodes[0].y - 10, s.nodes[0].x - 10)).toBeCloseTo(Math.PI / 6, 6);
  });

  it("goes onto an atom already there where the honeycomb meets it", () => {
    // the methyl's carbon is a point of the honeycomb: led to it, the walk takes that atom
    let s = startStroke("chain", 1, methyl, undefined, L);
    for (let t = 0.05; t <= 1; t += 0.05) s = advanceStroke(methyl, s, { x: -t, y: 0.02 }, L);
    expect(s.nodes.some((n) => n.atomId === 2)).toBe(true);
  });

  it("goes onto an atom already there only where the ring that closes lies along the honeycomb, or where it closes none", () => {
    // the hexagon round the methyl's bond: from its carbon up and round
    const h = Math.sqrt(3) / 2;
    const way = [
      { x: 0.5, y: h },
      { x: 0, y: 2 * h },
      { x: -1, y: 2 * h },
      { x: -1.5, y: h },
    ];
    const lead = (model: typeof methyl, to: number) => {
      let s = startStroke("chain", 1, model, undefined, L);
      let at = { x: 0, y: 0 };
      for (const p of way.slice(0, to)) {
        for (let t = 0.05; t <= 1.001; t += 0.05) s = advanceStroke(model, s, { x: at.x + (p.x - at.x) * t, y: at.y + (p.y - at.y) * t }, L);
        at = p;
      }
      return s;
    };
    // an atom bonded to the methyl's other carbon along the honeycomb, where
    // the chain's fourth point falls: taken, closing its hexagon
    const six = { atoms: [...methyl.atoms, { id: 3, x: -1.5, y: h }], bonds: [...methyl.bonds, { a: 2, b: 3 }] };
    expect(lead(six, 4).nodes.some((n) => n.atomId === 3)).toBe(true);
    // one where its third falls, bonded off the honeycomb: it would close a
    // ring of five - not taken, an atom of the chain's own
    const five = { atoms: [...methyl.atoms, { id: 3, x: -1, y: 2 * h }], bonds: [...methyl.bonds, { a: 2, b: 3 }] };
    const s = lead(five, 3);
    expect(s.nodes.length).toBe(3);
    expect(s.nodes.some((n) => n.atomId === 3)).toBe(false);
    // and one bonded to nothing of the chain's: taken, closing no ring
    const apart = { atoms: [...methyl.atoms, { id: 3, x: -1, y: 2 * h }], bonds: methyl.bonds };
    expect(lead(apart, 3).nodes.some((n) => n.atomId === 3)).toBe(true);
  });
});

describe("a chain stroke beside a large drawing", () => {
  it("takes no longer a step for the drawing's 28 000 atoms: it is gone over once, not at every step", () => {
    // (a thousand chains of 28 atoms, well away from where the stroke is drawn)
    const atoms: { id: number; x: number; y: number }[] = [];
    const bonds: { a: number; b: number }[] = [];
    for (let m = 0; m < 1000; m++)
      for (let k = 0; k < 28; k++) {
        const id = m * 28 + k + 1;
        atoms.push({ id, x: 100 + (m % 40) * 30 + k * 0.87, y: 100 + Math.floor(m / 40) * 3 + (k % 2) * 0.5 });
        if (k) bonds.push({ a: id - 1, b: id });
      }
    const drawing = { atoms, bonds };
    const cpu = () => process.cpuUsage().user / 1000;
    const t0 = cpu();
    let s = startStroke("chain", NEW_ATOM, drawing, { x: 0, y: 0 }, L);
    for (let x = 0.05; x <= 2.5; x += 0.05) s = advanceStroke(drawing, s, { x, y: 0.2 }, L);
    const spent = cpu() - t0;
    expect(s.nodes.length).toBeGreaterThanOrEqual(2);
    // (gone over once: about 70 ms of CPU; gone over at every step, about 950)
    expect(spent).toBeLessThan(350);
  });
});
