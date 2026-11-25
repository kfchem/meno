/**
 * The still-picture script's answers, each worked out by hand in its test's
 * comment from coordinates typed here: an invented small structure, nothing
 * from a file.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { drawManifest, drawnBounds, stillSvg, turnByAtoms } from "./still";

const turned = (places: number[], turn: ReturnType<typeof turnByAtoms>, i: number) =>
  new THREE.Vector3(places[3 * i], places[3 * i + 1], places[3 * i + 2]).applyQuaternion(new THREE.Quaternion(...turn));
const xyz = (rows: string[]) => `${rows.length}\ncomment\n${rows.join("\n")}\n`;

/** Each ball of an SVG by the colour of its element (the gradient's middle stop), and every line by its stroke. */
function parts(svg: string) {
  const colour = new Map<string, string>();
  for (const g of svg.matchAll(/<radialGradient id="([^"]+)"[^>]*>.*?offset="0.6" stop-color="([^"]+)"/g)) colour.set(g[1], g[2]);
  const balls = [...svg.matchAll(/<circle cx="([-\d.e]+)" cy="([-\d.e]+)" r="([-\d.e]+)" fill="url\(#([^)]+)\)"/g)].map((m) => ({ x: +m[1], y: +m[2], r: +m[3], colour: colour.get(m[4]) }));
  const lines = [...svg.matchAll(/<line x1="([-\d.e]+)" y1="([-\d.e]+)" x2="([-\d.e]+)" y2="([-\d.e]+)" stroke="([^"]+)"/g)].map((m) => ({ x1: +m[1], y1: +m[2], x2: +m[3], y2: +m[4], stroke: m[5] }));
  // (a stick is drawn in the style's bond colour, black; a measure's dashes in the measure's own)
  return { balls, sticks: lines.filter((l) => l.stroke === "#000000"), dashes: lines.filter((l) => l.stroke !== "#000000") };
}

describe("the view by atoms", () => {
  it("three atoms: their plane faces the eye, the first two left to right", () => {
    // A (1,1,1), B (1,3,1), C (1,1,4): A to B is along the file's y, C is 3 off it along z.
    // x' = A to B = (0,1,0); n = x' cross (C - A) = (0,1,0) cross (0,0,3) = (3,0,0), so n = (1,0,0);
    // y' = n cross x' = (1,0,0) cross (0,1,0) = (0,0,1). A point v goes to (v.x', v.y', v.n):
    // A -> (1,1,1), B -> (3,1,1), C -> (1,4,1): one depth (1), B 2 to the right of A at A's height (1).
    const places = [1, 1, 1, 1, 3, 1, 1, 1, 4];
    const turn = turnByAtoms(places, [0, 1, 2]);
    const [a, b, c] = [0, 1, 2].map((i) => turned(places, turn, i));
    expect([a.z, b.z, c.z]).toEqual([expect.closeTo(1, 6), expect.closeTo(1, 6), expect.closeTo(1, 6)]);
    expect(b.x - a.x).toBeCloseTo(2, 6);
    expect(b.y - a.y).toBeCloseTo(0, 6);
    expect(c.y - a.y).toBeCloseTo(3, 6);
  });

  it("three atoms, aslant: still one depth, the pair level and its length kept", () => {
    // A (0,0,0), B (1,1,0), C (0,1,1): |AB| = sqrt 2; AB.AC = 1, |AC| = sqrt 2, so C is at 60 degrees from AB:
    // C's height over AB is sqrt 2 * sin 60 = sqrt 6 / 2; all three in the plane, so depth 0 for each.
    const places = [0, 0, 0, 1, 1, 0, 0, 1, 1];
    const turn = turnByAtoms(places, [0, 1, 2]);
    const [a, b, c] = [0, 1, 2].map((i) => turned(places, turn, i));
    expect(b.x - a.x).toBeCloseTo(Math.SQRT2, 6);
    expect(b.y - a.y).toBeCloseTo(0, 6);
    expect(Math.abs(a.z) + Math.abs(b.z) + Math.abs(c.z)).toBeCloseTo(0, 6);
    expect(c.y).toBeCloseTo(Math.sqrt(6) / 2, 6);
  });

  it("two atoms: the pair lies left to right, the rest spread up and down", () => {
    // A (0,0,0), B (0,0,2) along the file's z; D (5,0,1), E (-5,0,1) spread along the file's x, across the pair.
    // x' = (0,0,1): A -> 0, B -> 2, so B is 2 right of A at one height.
    // The spread across it is all along file x (variance 50 against 0 along y), so y' = (1,0,0) and z' = x' cross y' = (0,1,0):
    // D -> (1, 5, 0) and E -> (1, -5, 0): D above, E below by 5, in the screen's plane (depth 0).
    const places = [0, 0, 0, 0, 0, 2, 5, 0, 1, -5, 0, 1];
    const turn = turnByAtoms(places, [0, 1]);
    const [a, b, d, e] = [0, 1, 2, 3].map((i) => turned(places, turn, i));
    expect(b.x - a.x).toBeCloseTo(2, 6);
    expect(b.y - a.y).toBeCloseTo(0, 6);
    expect(d.y).toBeCloseTo(5, 6);
    expect(e.y).toBeCloseTo(-5, 6);
    expect(d.z).toBeCloseTo(0, 6);
    expect(e.z).toBeCloseTo(0, 6);
  });

  it("in the picture: the second atom right of the first, on one height; the third above", () => {
    // O (0,0,0), N (0,2,0), C (0,0,3), as above: O -> (0,0), N -> (2,0), C -> (0,3), the page's y up, which an SVG draws as smaller y.
    const svg = stillSvg({ name: "v", xyz: "", view: [1, 2, 3] }, xyz(["O 0 0 0", "N 0 2 0", "C 0 0 3"]));
    const { balls } = parts(svg);
    const at = (c: string) => balls.find((b) => b.colour?.toUpperCase() === c)!;
    const [o, n, c] = [at("#FF0D0D"), at("#3050F8"), at("#909090")];
    expect(n.y).toBeCloseTo(o.y, 6);
    expect(n.x).toBeGreaterThan(o.x);
    expect(c.x).toBeCloseTo(o.x, 6);
    expect(c.y).toBeLessThan(o.y);
  });
});

describe("a dashed distance", () => {
  const two = xyz(["O 0 0 0", "O 2 0 0"]);

  it("two atoms 2 angstroms apart: a dashed line between their places, written 2.000 Å", () => {
    // Meno writes a distance with three decimals and the unit (utils/measure3d: toFixed(3), then " Å"): 2.000 Å.
    const svg = stillSvg({ name: "d", xyz: "", distances: [[1, 2]] }, two);
    expect(svg).toContain(">2.000 Å<");
    const { balls, dashes } = parts(svg);
    const [left, right] = [...balls].sort((p, q) => p.x - q.x);
    expect(dashes.length).toBeGreaterThan(2);
    for (const l of dashes) {
      expect(l.y1).toBeCloseTo(left.y, 6);
      expect(l.y2).toBeCloseTo(left.y, 6);
      expect(Math.min(l.x1, l.x2)).toBeGreaterThanOrEqual(left.x);
      expect(Math.max(l.x1, l.x2)).toBeLessThanOrEqual(right.x);
    }
    // (the dashes cover most of the way between the balls' edges)
    const covered = dashes.reduce((s, l) => s + Math.abs(l.x2 - l.x1), 0);
    expect(covered).toBeGreaterThan(0.5 * (right.x - left.x - left.r - right.r));
  });

  it("a pair asked to lose its stick: none between them, the dashed line still there", () => {
    // Two carbons 1.5 angstroms apart are bonded by distance: a solid stick, until asked to leave it out.
    const cc = xyz(["C 0 0 0", "C 1.5 0 0"]);
    const bonded = parts(stillSvg({ name: "b", xyz: "", distances: [[1, 2]] }, cc));
    expect(bonded.sticks.length).toBeGreaterThan(0);
    const svg = stillSvg({ name: "b", xyz: "", distances: [[1, 2]], noStick: [[2, 1]] }, cc);
    const lost = parts(svg);
    expect(lost.sticks).toHaveLength(0);
    expect(lost.dashes.length).toBeGreaterThan(2);
    expect(svg).toContain(">1.500 Å<");
  });
});

describe("the frame", () => {
  it("fitted to what is drawn: centred, equal margins, 6% of the longer side; no page note", () => {
    // O (0,0,0), N (2,0,0), a dashed 2.000 Å between: content is wider than tall, so the margin is 0.06 of its width on all four sides.
    const svg = stillSvg({ name: "c", xyz: "", distances: [[1, 2]] }, xyz(["O 0 0 0", "N 2 0 0"]));
    const [x0, y0, x1, y1] = drawnBounds(svg);
    const [vx, vy, vw, vh] = /viewBox="([^"]+)"/.exec(svg)![1].split(" ").map(Number);
    const px = Number(/ width="([^"]+)"/.exec(svg)![1]) / vw;
    expect((x0 - vx) * px).toBeCloseTo((vx + vw - x1) * px, 0);
    expect((y0 - vy) * px).toBeCloseTo((vy + vh - y1) * px, 0);
    expect(x0 - vx).toBeCloseTo(0.06 * (x1 - x0), 6);
    expect(y0 - vy).toBeCloseTo(0.06 * (x1 - x0), 6);
    expect(svg).not.toContain("Bond orders");
    expect(svg).not.toContain("No H in file");
  });

  it("the manifest's own frame is used as given", () => {
    const svg = stillSvg({ name: "c", xyz: "", box: [-5, -4, 10, 8] }, xyz(["O 0 0 0", "N 2 0 0"]));
    expect(svg).toContain('viewBox="-5 -4 10 8"');
  });
});

describe("errors", () => {
  it("an atom number out of range names the figure and the number", () => {
    expect(() => stillSvg({ name: "ts1", xyz: "", distances: [[1, 7]] }, xyz(["O 0 0 0", "O 2 0 0"]))).toThrow(/figure "ts1".*atom number 7/);
    expect(() => stillSvg({ name: "ts2", xyz: "", view: [0, 1] }, xyz(["O 0 0 0", "O 2 0 0"]))).toThrow(/figure "ts2".*atom number 0/);
    expect(() => stillSvg({ name: "ts3", xyz: "", noStick: [[1, 3]] }, xyz(["O 0 0 0", "O 2 0 0"]))).toThrow(/figure "ts3".*atom number 3/);
  });

  it("a frame the file lacks names the figure and the number", () => {
    expect(() => stillSvg({ name: "f", xyz: "", frame: 2 }, xyz(["O 0 0 0", "O 2 0 0"]))).toThrow(/figure "f".*frame 2/);
  });

  it("a missing file names the figure; the manifest's paths are relative to it", () => {
    const dir = mkdtempSync(join(tmpdir(), "still-"));
    mkdirSync(join(dir, "in"));
    writeFileSync(join(dir, "in", "a.xyz"), xyz(["O 0 0 0", "O 2 0 0"]));
    writeFileSync(join(dir, "ok.json"), JSON.stringify({ out: "pics", figures: [{ name: "a", xyz: "in/a.xyz", distances: [[1, 2]] }] }));
    const done = drawManifest(join(dir, "ok.json"));
    expect(done.out).toBe(join(dir, "pics"));
    expect(done.drawn[0].svg).toContain(">2.000 Å<");
    writeFileSync(join(dir, "bad.json"), JSON.stringify({ out: "pics", figures: [{ name: "gone", xyz: "in/none.xyz" }] }));
    expect(() => drawManifest(join(dir, "bad.json"))).toThrow(/figure "gone".*in\/none\.xyz/);
  });
});

describe("frames", () => {
  it("the second frame is the one drawn where asked", () => {
    // Frame 1 has the pair 2 apart, frame 2 has them 3 apart: written 3.000 Å.
    const two = "2\nf1\nO 0 0 0\nO 2 0 0\n2\nf2\nO 0 0 0\nO 3 0 0\n";
    expect(stillSvg({ name: "m", xyz: "", distances: [[1, 2]], frame: 2 }, two)).toContain(">3.000 Å<");
    expect(stillSvg({ name: "m", xyz: "", distances: [[1, 2]] }, two)).toContain(">2.000 Å<");
  });
});
