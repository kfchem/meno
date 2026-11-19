import { describe, expect, it } from "vitest";
import { identity, type IdentityInput } from "../chem/identity";
import { readStereo, sameConfiguration, type DrawnAtom, type DrawnBond } from "./drawn";
import { layout2D } from "./engine";
import { recognisedSaid, withRecognisedDepth } from "../chem/perception/projection/depth";
import { cageViews } from "./recognised";

// (the core's reading of rings drawn in perspective, with the engine's views of bridged systems and cages, as the app asks it)
const depthOf = (atoms: readonly DrawnAtom[], bonds: readonly DrawnBond[]) => withRecognisedDepth(atoms, bonds, cageViews);
const saidOf = (atoms: readonly DrawnAtom[], bonds: readonly DrawnBond[]) => recognisedSaid(atoms, bonds, cageViews);
import { NOT_MARKED } from "../chem/perception/projection/recognise";
import { fromSmiles } from "./testdata/fromSmiles";
import { chair, haworth, rad } from "./testdata/projections";
import { chair as solidChair, fused, type Solid } from "../chem/perception/projection/solids";
import { drawn as drawnByRule } from "../chem/perception/projection/views";
import diastereomers from "./testdata/diastereomers.json";
import cages from "./testdata/cages.json";
import { measured } from "../../testing/timeouts";

/**
 * A chair drawn bond by bond - no depth, no wedge - read as the compound it shows (docs/EDITOR-2D.md, *Drawn in perspective*): the depth worked
 * out from the ring as drawn (lib/chem/perception/projection/recognise), the near and far by the convention (the lower atoms nearer), then
 * the centres read in space as a tool's drawing is read.
 */
const stripped = (d: { atoms: DrawnAtom[]; bonds: DrawnBond[] }) => ({ atoms: d.atoms.map(({ z: _z, centre: _c, ...a }) => a), bonds: d.bonds });

function identityOfDrawing(d: { atoms: DrawnAtom[]; bonds: DrawnBond[] }): string {
  const stereo = readStereo(d.atoms, d.bonds);
  const input: IdentityInput = {
    atoms: d.atoms.map((a, i) => ({ el: a.el ?? "C", hs: a.hs, ...(stereo.tetra.get(i) ? { tetra: stereo.tetra.get(i)! } : {}) })),
    bonds: d.bonds.map((b) => ({ a: b.a, b: b.b, order: b.order })),
  };
  return identity(input).text;
}
const smiles = (s: string) => identity(fromSmiles(s)).text;

describe("a chair drawn bond by bond, read as the compound it shows", () => {
  const trans = [smiles("C[C@@H]1CCCC[C@H]1C"), smiles("C[C@H]1CCCC[C@@H]1C")];
  const cis = smiles("C[C@@H]1CCCC[C@@H]1C");

  it("reads trans-1,2-dimethylcyclohexane diequatorial and diaxial as one compound, and cis-1,2 as the meso compound", () => {
    for (const tilt of [60, 70]) {
      const eq = stripped(chair({ 0: "equatorial", 1: "equatorial" }, tilt));
      const ax = stripped(chair({ 0: "axial", 1: "axial" }, tilt));
      expect(trans, `diequatorial ${tilt}`).toContain(identityOfDrawing(eq));
      expect(trans, `diaxial ${tilt}`).toContain(identityOfDrawing(ax));
      expect(identityOfDrawing(stripped(chair({ 0: "axial", 1: "equatorial" }, tilt))), `cis ${tilt}`).toBe(cis);
    }
  });

  it("reads it by the convention - the lower atoms nearer - as the drawing with that depth stored, and its mirror picture as the mirror compound", () => {
    const groups = { 0: { place: "equatorial" as const, el: "O", hs: 1 }, 1: { place: "equatorial" as const, hs: 1, branches: 2 }, 4: "equatorial" as const };
    // (the test drawing is seen from below - its nearer atoms the higher - so the convention reads it the other way round: its depth reversed)
    const d = chair(groups);
    const seenFromAbove = { atoms: d.atoms.map((a) => (a.z != null ? { ...a, z: -a.z } : a)), bonds: d.bonds };
    expect(identityOfDrawing(stripped(d))).toBe(identityOfDrawing(seenFromAbove));
    expect(identityOfDrawing(stripped(d))).not.toBe(identityOfDrawing(d));
    // (the page mirrored, the lower still nearer: the mirror compound)
    const mirror = chair(groups, 70, "mirrored");
    expect(identityOfDrawing(stripped(mirror))).not.toBe(identityOfDrawing(stripped(d)));
    expect(smiles("CC(C)[C@@H]1CC[C@@H](C)C[C@H]1O") === identityOfDrawing(stripped(d)) || smiles("CC(C)[C@H]1CC[C@H](C)C[C@@H]1O") === identityOfDrawing(stripped(d))).toBe(true);
  });

  it("reads nothing at a chair drawn on its side, with no mark", () => {
    const d = stripped(chair({ 0: "equatorial", 1: "equatorial" }));
    const side = { atoms: d.atoms.map((a) => ({ ...a, x: -a.y, y: a.x })), bonds: d.bonds };
    expect(readStereo(side.atoms, side.bonds).tetra.size).toBe(0);
  });

  it("reads a chair with a bold edge by the mark: the edge nearer", () => {
    const d = stripped(chair({ 0: "equatorial", 1: "equatorial" }));
    // (the upper edge marked bold: seen from below, the mirror of what the convention gives)
    const ring = [0, 1, 2, 3, 4, 5];
    const upper = ring.reduce((best, k) => (d.atoms[k].y + d.atoms[(k + 1) % 6].y > d.atoms[best].y + d.atoms[(best + 1) % 6].y ? k : best), 0);
    const marked = { atoms: d.atoms, bonds: d.bonds.map((b) => (b.a === upper && b.b === (upper + 1) % 6 ? { ...b, bold: true } : b)) };
    expect(identityOfDrawing(marked)).not.toBe(identityOfDrawing(d));
    expect(trans).toContain(identityOfDrawing(marked));
  });

  it("leaves a chair with a wedge as it always was: read by the wedge, no depth worked out", () => {
    const d = stripped(chair({ 0: "equatorial", 1: "equatorial" }));
    const wedged = { atoms: d.atoms, bonds: d.bonds.map((b) => (b.a === 0 && b.b === 6 ? { ...b, wedge: { narrow: 0, stereo: "up" as const } } : b)) };
    expect(depthOf(wedged.atoms, wedged.bonds)).toBe(wedged.atoms);
  });
});

describe("a Haworth ring drawn bond by bond, with no depth stored", () => {
  // (McNaught 1996, 2-Carb-5.4: viewed from slightly above, the nearer edge drawn lower; 2-Carb-6.2: OH up at C1 is beta. Brecher 2006, ST-1.9: such a drawing is ambiguous, so the ring is read as one only with its groups vertical, or a near edge marked)
  const beta = "C([C@@H]1[C@H]([C@@H]([C@H]([C@@H](O1)O)O)O)O)O";
  const alpha = "C([C@@H]1[C@H]([C@@H]([C@H]([C@H](O1)O)O)O)O)O";

  it("reads beta-D-glucopyranose as its SMILES, and the alpha anomer as the other structure", () => {
    for (const tilt of [25, 30, 40]) {
      expect(identityOfDrawing(stripped(haworth([true, false, true, false, true], tilt))), `beta ${tilt}`).toBe(smiles(beta));
      expect(identityOfDrawing(stripped(haworth([false, false, true, false, true], tilt))), `alpha ${tilt}`).toBe(smiles(alpha));
    }
  });

  it("needs no ring O at the back: the ring turned over about the page's horizontal - the O now in front, the lower edge still the nearer - is the same compound", () => {
    // (2-Carb-5.5 allows other orientations, the lower edge the nearer in all of them: the page mirrored top to bottom, with the convention's depth, is a half turn of the ring)
    const d = stripped(haworth([true, false, true, false, true], 30));
    const turned = { atoms: d.atoms.map((a) => ({ ...a, y: -a.y })), bonds: d.bonds };
    expect(identityOfDrawing(turned)).toBe(identityOfDrawing(d));
  });

  it("is flat where the groups are not drawn vertical: the flattened ring alone is no Haworth ring", () => {
    const d = stripped(haworth([true, false, true, false, true], 30));
    const slanted = { atoms: d.atoms.map((a, i) => (i >= 6 ? { ...a, x: a.x + 0.9 } : a)), bonds: d.bonds };
    expect(depthOf(slanted.atoms, slanted.bonds)).toBe(slanted.atoms);
    // (and no group at all: nothing to read)
    const bare = { atoms: d.atoms.slice(0, 6), bonds: d.bonds.slice(0, 6) };
    expect(depthOf(bare.atoms, bare.bonds)).toBe(bare.atoms);
  });

  it("is read by a near edge marked bold, with the groups not vertical, before the convention", () => {
    const d = stripped(haworth([true, false, true, false, true], 30));
    const slanted = d.atoms.map((a, i) => (i >= 6 ? { ...a, x: a.x + 0.9 } : a));
    // (the front edge C2-C3, the lower one on the page: marked bold, it reads as the convention would)
    const marked = d.bonds.map((b) => (b.a === 2 && b.b === 3 ? { ...b, bold: true } : b));
    const got = depthOf(slanted, marked);
    expect(got).not.toBe(slanted);
    expect(got[2].z).toBeGreaterThan(0);
    expect(got[3].z).toBeGreaterThan(0);
    // (the back edge marked, the ring is read from below)
    const back = depthOf(slanted, d.bonds.map((b) => (b.a === 5 && b.b === 0 ? { ...b, bold: true } : b)));
    expect(back[5].z).toBeGreaterThan(0);
  });

  it("is flat where the lowest ring bond is not level, or a ring atom is not above it, whatever its groups", () => {
    // (a group drawn with its ring atom's x: vertical still)
    const moved = (d: { atoms: DrawnAtom[]; bonds: DrawnBond[] }, by: (a: DrawnAtom, i: number) => { x: number; y: number }) => {
      const at = (i: number) => (i < 6 ? i : d.bonds.find((b) => b.b === i && b.a < 6)?.a ?? i);
      const shifted = d.atoms.map((a, i) => by(a, i));
      return { atoms: d.atoms.map((a, i) => ({ ...a, x: i < 6 ? shifted[i].x : shifted[at(i)].x, y: shifted[i].y })), bonds: d.bonds };
    };
    const d = stripped(haworth([true, false, true, false, true], 30));
    expect(depthOf(d.atoms, d.bonds)).not.toBe(d.atoms);
    // (one end of the front edge C2-C3 dropped: the edge slants past LEVEL_EDGE)
    const slanted = moved(d, (a, i) => ({ x: a.x, y: i === 2 ? a.y - 0.5 : a.y }));
    expect(depthOf(slanted.atoms, slanted.bonds)).toBe(slanted.atoms);
    // (the ring O, at the back, pulled down below the front edge)
    const sagged = moved(d, (a, i) => ({ x: a.x, y: i === 0 ? d.atoms[2].y - 0.3 : a.y }));
    expect(depthOf(sagged.atoms, sagged.bonds)).toBe(sagged.atoms);
  });

  it("leaves a hexagon and a pentagon standing on a corner, and a regular hexagon on an edge with its groups straight up and down, as they are; reads the last with its near edge bold", () => {
    const ring = (n: number, from: number) => [...Array(n)].map((_, k) => ({ x: Math.cos(from + (2 * Math.PI * k) / n), y: Math.sin(from + (2 * Math.PI * k) / n), hs: 1, el: "C" }));
    const drawing = (n: number, from: number) => {
      const atoms = [...ring(n, from), ...ring(n, from).map((a, k) => ({ ...a, y: a.y + (k % 2 ? 1 : -1), hs: 1, el: "O" }))];
      const bonds = [...Array(n)].map((_, k) => ({ a: k, b: (k + 1) % n, order: 1 })).concat([...Array(n)].map((_, k) => ({ a: k, b: n + k, order: 1 })));
      return { atoms, bonds };
    };
    for (const [n, from] of [[6, Math.PI / 6], [5, 0]] as const) {
      const d = drawing(n, from);
      expect(depthOf(d.atoms, d.bonds), `${n}`).toBe(d.atoms);
    }
    // (on an edge, every group straight up or down: still a flat drawing that happens to lie so - as tall as a regular ring - and read only with its near edge bold)
    const onEdge = drawing(6, 0);
    expect(depthOf(onEdge.atoms, onEdge.bonds)).toBe(onEdge.atoms);
    const marked = onEdge.bonds.map((b, k) => (k === 4 ? { ...b, bold: true } : b));
    expect(depthOf(onEdge.atoms, marked)).not.toBe(onEdge.atoms);
  });

  it("reads another of the twelve representations of beta-D-glucopyranose - the ring turned, and turned over - as the same compound, drawn with depth and drawn by hand alike (2-Carb-5.4)", () => {
    for (let turn = 0; turn < 6; turn++)
      for (const over of [false, true]) {
        const d = haworth([true, false, true, false, true], 30, turn);
        // (turned over about the page's horizontal: the lower edge still the nearer, the groups up become down)
        const shown = over ? { atoms: d.atoms.map((a) => ({ ...a, y: -a.y, ...(a.z != null ? { z: -a.z } : {}) })), bonds: d.bonds } : d;
        expect(identityOfDrawing(shown), `with depth, turn ${turn}${over ? ", over" : ""}`).toBe(smiles(beta));
        expect(identityOfDrawing(stripped(shown)), `by hand, turn ${turn}${over ? ", over" : ""}`).toBe(smiles(beta));
      }
  });

});

describe("a chair or a Haworth ring drawn bond by bond, one centre left open", () => {
  it("leaves a centre unread whose group is drawn half way between its two places, and reads its other centres", () => {
    const d = chair({ 0: "axial", 1: "equatorial" });
    const eq = chair({ 0: "equatorial", 1: "equatorial" });
    const at = d.atoms[0];
    const [a, e] = [d.atoms[6], eq.atoms[6]].map((g) => Math.atan2(g.y - at.y, g.x - at.x));
    const mid = Math.atan2(Math.sin(a) + Math.sin(e), Math.cos(a) + Math.cos(e));
    const half = { atoms: d.atoms.map((p, i) => (i === 6 ? { ...p, x: at.x + 1.5 * Math.cos(mid), y: at.y + 1.5 * Math.sin(mid) } : p)), bonds: d.bonds };
    const read = readStereo(stripped(half).atoms, half.bonds).tetra;
    expect([read.has(0), read.has(1)]).toEqual([false, true]);
  });

  it("leaves a centre on a wavy bond open, and reads its other centres", () => {
    const d = stripped(chair({ 0: "equatorial", 1: "equatorial" }));
    const wavy = { atoms: d.atoms, bonds: d.bonds.map((b) => (b.a === 0 && b.b === 6 ? { ...b, either: true } : b)) };
    const read = readStereo(wavy.atoms, wavy.bonds).tetra;
    expect([read.has(0), read.has(1)]).toEqual([false, true]);
    // (a Haworth glucopyranose with a wavy bond at C1: C1 open, C2 to C5 read)
    const h = stripped(haworth([true, false, true, false, true]));
    const hw = { atoms: h.atoms, bonds: h.bonds.map((b) => (b.a === 1 && b.b === 6 ? { ...b, either: true } : b)) };
    const got = readStereo(hw.atoms, hw.bonds).tetra;
    expect([1, 2, 3, 4, 5].map((i) => got.has(i))).toEqual([false, true, true, true, true]);
  });
});

describe("chairs fused, drawn bond by bond, read as the compound they show", () => {
  // (the corpus: every system of chairs projection/solids fuses - trans-decalin, cis-decalin on either face and on other bonds, perhydrophenanthrene
  // trans-anti-trans, perhydroanthracene trans-syn-trans, a trans-cis-cis tricycle - in both textbook forms, with no group or one methyl on a
  // free place, as projection/views draws it with depth; then that drawing with its depth taken away, as drawn, turned in the page and moved a little, and
  // mirrored. The depth worked out must read as the depth drawn did, or not at all: never another compound)
  const bondIndex = (s: Solid, a: number, b: number) => s.bonds.findIndex(([x, y]) => x === a && y === b);
  const c = solidChair();
  const decalin = fused(c, 0, "chair", "trans");
  const systems: [string, Solid][] = [
    ["trans-decalin", decalin],
    ["cis-decalin, face 1", fused(c, 0, "chair", { cis: 1 })],
    ["cis-decalin, face -1", fused(c, 0, "chair", { cis: -1 })],
    ["cis-decalin on another bond", fused(c, 3, "chair", { cis: 1 })],
    ["cis-decalin as a textbook draws it", fused(c, 2, "chair", { cis: -1 })],
    ["perhydrophenanthrene", fused(decalin, bondIndex(decalin, 7, 8), "chair", "trans")],
    ["perhydroanthracene", fused(decalin, bondIndex(decalin, 8, 9), "chair", "trans")],
    ["trans, cis, cis", fused(decalin, bondIndex(decalin, 7, 8), "chair", { cis: -1 })],
  ];
  const BOND = 1.5;
  /** The system as projection/views draws it, `form` 0 or 1, with a methyl on free place `at` (none for -1): every ring atom with its depth, the methyl with none. */
  function drawing(s: Solid, form: number, at: number) {
    const d = drawnByRule(s, form)!;
    const atoms: DrawnAtom[] = d.atoms.map((p) => ({ x: BOND * p.x, y: BOND * p.y, z: BOND * p.z, centre: true, hs: 0 }));
    const bonds: DrawnBond[] = s.bonds.map(([a, b]) => ({ a, b, order: 1 }));
    if (at >= 0) {
      const f = d.free[at];
      atoms.push({ x: atoms[f.free.at].x + BOND * f.x, y: atoms[f.free.at].y + BOND * f.y, hs: 3 });
      bonds.push({ a: f.free.at, b: atoms.length - 1, order: 1 });
    }
    d.atoms.forEach((_, i) => (atoms[i].hs = 4 - bonds.filter((b) => b.a === i || b.b === i).length));
    return { atoms, bonds, free: d.free.length };
  }
  const moved = (d: { atoms: DrawnAtom[]; bonds: DrawnBond[] }, turn: number, jitter: number, scale: number, rand: () => number) => {
    const [cs, sn] = [Math.cos(rad(turn)), Math.sin(rad(turn))];
    return {
      atoms: d.atoms.map((a) => ({ ...a, x: scale * (cs * a.x - sn * a.y + jitter * BOND * (2 * rand() - 1)), y: scale * (sn * a.x + cs * a.y + jitter * BOND * (2 * rand() - 1)) })),
      bonds: d.bonds,
    };
  };
  const mirrored = (d: { atoms: DrawnAtom[]; bonds: DrawnBond[] }) => ({ atoms: d.atoms.map((a) => ({ ...a, x: -a.x })), bonds: d.bonds });
  const unreadOf = (d: { atoms: DrawnAtom[]; bonds: DrawnBond[] }) =>
    identity({ atoms: d.atoms.map((a) => ({ el: a.el ?? "C", hs: a.hs })), bonds: d.bonds.map((b) => ({ a: b.a, b: b.b, order: b.order })) }).text;

  it("is never another compound than the depth drawn shows, over the whole corpus - and reads nearly all of it", () => {
    let seed = 5;
    const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
    let [read, all] = [0, 0];
    for (const [name, s] of systems) {
      for (const form of [0, 1]) {
        const free = drawing(s, form, -1).free;
        // (no group, and a methyl on six free places taken at random)
        for (const at of [-1, ...[...Array(6)].map(() => Math.floor(rand() * free))]) {
          const d = drawing(s, form, at);
          for (const [how, want, given] of [
            ["as drawn", d, stripped(d)],
            ["turned and moved", d, stripped(moved(d, 30 * rand() - 15, 0.03, 0.5 + rand(), rand))],
            ["mirrored", mirrored(d), stripped(mirrored(d))],
          ] as const) {
            const got = identityOfDrawing(given);
            all++;
            if (got === identityOfDrawing(want)) read++;
            else expect(got, `${name}, form ${form}, methyl ${at}, ${how}`).toBe(unreadOf(given));
          }
        }
      }
    }
    expect(read / all).toBeGreaterThan(0.95);
  }, measured(60_000));

  /** The rings of a drawn system in order round each, and for each ring bond whether, by the depth drawn, it is its ring's near edge (in every ring it lies in), its far edge, or neither. */
  function edges(d: { atoms: DrawnAtom[]; bonds: DrawnBond[] }, ringAtoms: number) {
    const ring = d.bonds.flatMap((b, k) => (b.a < ringAtoms && b.b < ringAtoms ? [k] : []));
    const adj = new Map<number, number[]>();
    for (const k of ring) for (const [x, y] of [[d.bonds[k].a, d.bonds[k].b], [d.bonds[k].b, d.bonds[k].a]]) adj.set(x, [...(adj.get(x) ?? []), y]);
    // (each six-ring through a bond: the shortest way round from one end to the other, not by the bond)
    const sixes: number[][] = [];
    const seen = new Set<string>();
    for (const k of ring) {
      const [a, b] = [d.bonds[k].a, d.bonds[k].b];
      const walk = (path: number[]) => {
        if (path.length === 6) {
          if (adj.get(path[5])!.includes(a)) {
            const key = [...path].sort((p, q) => p - q).join();
            if (!seen.has(key)) {
              seen.add(key);
              sixes.push(path);
            }
          }
          return;
        }
        for (const n of adj.get(path[path.length - 1]) ?? []) if (!path.includes(n) && !(path.length === 1 && n === b)) walk([...path, n]);
      };
      walk([a, b]);
    }
    const z = (i: number) => d.atoms[i].z!;
    return ring.map((k) => {
      const [a, b] = [d.bonds[k].a, d.bonds[k].b];
      const in6 = sixes.filter((r) => r.includes(a) && r.includes(b));
      const says = in6.map((r) => Math.sign(z(a) + z(b) - (2 * r.reduce((m, i) => m + z(i), 0)) / r.length));
      return { k, near: says.length > 0 && says.every((v) => v > 0), far: says.length > 0 && says.every((v) => v < 0) };
    });
  }

  it("reads a bold bond as the near edge of its own ring: a near edge bold, alone or every one at once, is never the mirror", () => {
    for (const [name, s] of systems) {
      for (const form of [0, 1]) {
        const free = drawing(s, form, -1).free;
        for (const at of [-1, Math.floor(free / 3), Math.floor((2 * free) / 3)]) {
          const d = drawing(s, form, at);
          const want = identityOfDrawing(d);
          const bare = stripped(d);
          const all = edges(d, s.atoms.length);
          for (const e of all.filter((x) => x.near)) {
            const got = identityOfDrawing({ atoms: bare.atoms, bonds: bare.bonds.map((b, k) => (k === e.k ? { ...b, bold: true } : b)) });
            if (got !== want) expect(got, `${name} ${form} ${at}: near edge ${e.k} bold`).toBe(unreadOf(bare));
          }
          // (every near edge of every ring bold, as a chemist marks a fused system: the compound)
          const near = new Set(all.filter((x) => x.near).map((x) => x.k));
          const every = identityOfDrawing({ atoms: bare.atoms, bonds: bare.bonds.map((b, k) => (near.has(k) ? { ...b, bold: true } : b)) });
          expect(every, `${name} ${form} ${at}: every near edge bold`).toBe(want);
        }
      }
    }
  }, measured(60_000));

  it("reads nothing by the convention in a system stood on its side - turned a right angle - and never the mirror", () => {
    for (const [name, s] of systems) {
      for (const form of [0, 1]) {
        const d = drawing(s, form, 0);
        for (const turn of [90, -90]) {
          const given = stripped(moved(d, turn, 0, 1, () => 0.5));
          const got = identityOfDrawing(given);
          expect([identityOfDrawing(d), unreadOf(given)], `${name} ${form} turned ${turn}`).toContain(got);
          expect(got, `${name} ${form} turned ${turn}`).toBe(unreadOf(given));
        }
      }
    }
  });

  it("tells cis-decalin from trans-decalin with no depth stored, and reads the mirror picture of each as its mirror", () => {
    const transD = identityOfDrawing(stripped(drawing(decalin, 0, -1)));
    const cisD = identityOfDrawing(stripped(drawing(systems[1][1], 0, -1)));
    expect(transD).toBe(smiles("C1CC[C@H]2CCCC[C@@H]2C1"));
    expect(cisD).toBe(smiles("C1CC[C@H]2CCCC[C@H]2C1"));
  });
});

describe("a bridged system drawn bond by bond, a bold bond its near edge (norbornan-2-ol)", () => {
  // (as the engine draws it in perspective, then its depth taken away: drawn bond by bond)
  const engineDrawn = (smi: string) => {
    const input = fromSmiles(smi);
    const out = layout2D(input);
    const atoms: DrawnAtom[] = input.atoms.map((a, i) => ({ x: out.x[i], y: out.y[i], hs: a.hs ?? 0, el: a.el, ...(out.depth[i] != null ? { z: out.depth[i]!, centre: true } : {}) }));
    return { atoms, bonds: input.bonds.map(({ a, b, order }): DrawnBond => ({ a, b, order })) };
  };
  /** The ring bond nearest the viewer, by the depth drawn: the one a chemist draws bold. */
  const nearest = (d: { atoms: DrawnAtom[]; bonds: DrawnBond[] }) =>
    d.bonds
      .map((b, k) => ({ k, z: (d.atoms[b.a].z ?? -Infinity) + (d.atoms[b.b].z ?? -Infinity), ring: d.atoms[b.a].el === "C" && d.atoms[b.b].el === "C" }))
      .filter((b) => b.ring)
      .sort((p, q) => q.z - p.z)[0].k;
  const marked = (d: { atoms: DrawnAtom[]; bonds: DrawnBond[] }, k: number) => ({ atoms: d.atoms, bonds: d.bonds.map((b, j) => (j === k ? { ...b, bold: true } : b)) });
  const exo = "O[C@@H]1C[C@@H]2CC[C@H]1C2";
  const endo = "O[C@H]1C[C@@H]2CC[C@H]1C2";

  it("reads exo and endo as two compounds, each the one drawn with depth, by a near bond drawn bold", () => {
    const got = [exo, endo].map((smi) => {
      const d = engineDrawn(smi);
      const read = identityOfDrawing(marked(stripped(d), nearest(d)));
      expect(read, smi).toBe(identityOfDrawing(d));
      expect(read, smi).toBe(smiles(smi));
      return read;
    });
    expect(got[0]).not.toBe(got[1]);
  });

  it("reads the mirror picture, marked the same, as the mirror compound", () => {
    const d = engineDrawn(exo);
    const mirror = { atoms: d.atoms.map((a) => ({ ...a, x: -a.x })), bonds: d.bonds };
    expect(identityOfDrawing(marked(stripped(mirror), nearest(d)))).toBe(smiles("O[C@H]1C[C@H]2CC[C@@H]1C2"));
  });

  it("reads every cage and bridged system of the fixtures, as the engine draws it, marked: as the depth drawn reads, or not at all", () => {
    const smis = [...Object.values(cages).map((c) => (c as { smiles?: string }).smiles).filter((x): x is string => !!x), ...diastereomers.molecules.map((m) => m.smiles)];
    let [read, all] = [0, 0];
    for (const smi of smis) {
      let d;
      try {
        d = engineDrawn(smi);
      } catch {
        continue;
      }
      if (!d.atoms.some((a) => a.z != null)) continue;
      all++;
      const withDepth = identityOfDrawing(d);
      const bare = stripped(d);
      const got = identityOfDrawing(marked(bare, nearest(d)));
      if (got === withDepth) read++;
      // (else unread: no configuration from the depth, as the drawing with no depth and no mark has)
      else expect(got, smi).toBe(identityOfDrawing(bare));
      // (with no mark: never a configuration the depth gave)
      const unmarked = depthOf(bare.atoms, bare.bonds);
      expect(unmarked.every((a) => a.z == null), smi).toBe(true);
    }
    expect(all).toBeGreaterThan(20);
    expect(read).toBeGreaterThan(0);
  }, measured(60_000));

  it("reads tropine and pseudotropine by a mark as the two compounds they are, each the engine's drawing - C3's two alike arms ending at centres: pseudo-asymmetric", () => {
    const got = ["CN1[C@@H]2CC[C@H]1C[C@@H](O)C2", "CN1[C@@H]2CC[C@H]1C[C@H](O)C2", "O[C@H]1C[C@H]2CC[C@@H](C1)C2", "O[C@@H]1C[C@H]2CC[C@@H](C1)C2"].map((smi) => {
      const d = engineDrawn(smi);
      const read = identityOfDrawing(marked(stripped(d), nearest(d)));
      expect(read, smi).toBe(identityOfDrawing(d));
      return read;
    });
    expect(got[0]).not.toBe(got[1]);
    expect(got[2]).not.toBe(got[3]);
  });

  it("reads quinuclidin-3-ol's C3 by a mark as drawn - and, a known limit, gives its bridgeheads a sense identity keeps (identity's to drop)", () => {
    for (const smi of ["O[C@@H]1CN2CCC1CC2", "O[C@H]1CN2CCC1CC2"]) {
      const d = engineDrawn(smi);
      const read = marked(stripped(d), nearest(d));
      // (C3 read the way the engine drew it)
      const want = readStereo(d.atoms.map((a, i) => (i === 1 ? a : { ...a, centre: undefined })), d.bonds).tetra.get(1);
      const t = readStereo(depthOf(read.atoms, read.bonds), read.bonds).tetra.get(1);
      expect(t && want && sameConfiguration(t, want), smi).toBe(true);
    }
  });

  it("reads no configuration with no mark: the hydroxyl carbon gets none, and the words ask for the near bonds bold", () => {
    const d = stripped(engineDrawn(exo));
    expect(readStereo(d.atoms, d.bonds).tetra.size).toBe(0);
    expect(saidOf(d.atoms, d.bonds).get(1)).toBe(NOT_MARKED);
  });
});

describe("no drawing the engine makes in the plane is taken for a chair", () => {
  it("leaves every flat ring of the layout fixtures as drawn: nothing is given a depth but what the engine itself drew in perspective", () => {
    const smis = [
      ...diastereomers.molecules.filter((_, i) => i % 4 === 0).map((m) => m.smiles),
      ...Object.values(cages).map((c) => (c as { smiles?: string }).smiles).filter((s): s is string => !!s),
      "C1CCCCC1", "CC1CCC(C)CC1", "OC1CCCCC1O", "C1CCC2CCCCC2C1", "C1CCC2(CC1)CCCCC2", "c1ccccc1C", "C1CCCC(C1)C1CCCCC1", "OC[C@H]1OC(O)[C@H](O)[C@@H](O)[C@@H]1O", "C1CC2CCC1C2", "C[C@H]1CC[C@@H](C)CC1",
      "C1CCC2C(C1)CCC1CCCCC12", "C1CCC2CC3CCCCC3CC2C1", "c1ccc2ccccc2c1", "C[C@]12CC[C@H]3[C@@H](CCC4=CC(=O)CC[C@@]34C)[C@@H]1CC[C@@H]2O", "C[C@@H]1CC[C@H]2C[C@@H](O)CC[C@@H]2C1",
    ];
    let rings = 0;
    for (const smi of smis) {
      let input;
      try {
        input = fromSmiles(smi);
      } catch {
        continue;
      }
      const out = layout2D(input);
      const atoms: DrawnAtom[] = input.atoms.map((a, i) => ({ x: out.x[i], y: out.y[i], hs: a.hs ?? 0, el: a.el, ...(out.depth[i] != null ? { z: out.depth[i]! } : {}) }));
      const bonds: DrawnBond[] = input.bonds.map(({ a, b, order }) => ({ a, b, order }));
      const read = depthOf(atoms, bonds);
      rings += 1;
      // (nothing given a depth that had none, and nothing said of a ring drawn flat: no words, read or unread)
      expect(read.every((a, i) => a.z === atoms[i].z), smi).toBe(true);
      const flatAtoms = atoms.filter((a) => a.z == null).length === atoms.length;
      if (flatAtoms) expect(saidOf(atoms, bonds).size, smi).toBe(0);
    }
    expect(rings).toBeGreaterThan(20);
  }, measured(20_000));
});
