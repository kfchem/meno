import { describe, expect, it } from "vitest";
import { chair, fused, type Solid } from "./solids";
import { fromAbove, project, seen, standardView } from "./views";
import { recogniseChair, recogniseChairs, recogniseHaworth, NOT_MARKED, NOT_ONE_SHAPE, type Recognised } from "./recognise";
import { drawn as drawnByRule } from "./views";
import { haworth } from "./solids";

/** A seeded generator, so the corpus is the same every run. */
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}

/** The chair as a textbook draws it, turned in the page by `turn` degrees, each atom moved by up to `jitter` bond lengths, scaled: its places and the depths they had. */
function drawn(view = standardView(chair()), turn = 0, jitter = 0, rand = seeded(1), scale = 40) {
  const s = seen(chair(), view);
  const c = Math.cos((turn * Math.PI) / 180);
  const n = Math.sin((turn * Math.PI) / 180);
  const places = s.map((p) => ({ x: scale * (c * p.x - n * p.y) + scale * jitter * (rand() - 0.5) * 2, y: scale * (n * p.x + c * p.y) + scale * jitter * (rand() - 0.5) * 2 }));
  return { places, z: s.map((p) => scale * p.z) };
}

/** The chair as the textbook draws it (projection/views `drawn`, `form` 0 or 1: the two textbook chairs), turned, jittered and scaled as `drawn` above does the true view. */
function conventional(turn = 0, jitter = 0, rand = seeded(1), scale = 40, form: 0 | 1 = 0) {
  const base = drawnByRule(chair(), form)!.atoms;
  const c = Math.cos((turn * Math.PI) / 180);
  const n = Math.sin((turn * Math.PI) / 180);
  const places = base.map((p) => ({ x: scale * (c * p.x - n * p.y) + scale * jitter * (rand() - 0.5) * 2, y: scale * (n * p.x + c * p.y) + scale * jitter * (rand() - 0.5) * 2 }));
  return { places, z: base.map((p) => scale * p.z) };
}

/** Whether the depths read are the ones the solid had (up to the one scale), or - for a mirror picture - their reverse. */
const agrees = (got: number[], want: number[]) => {
  const dotp = got.reduce((s, v, i) => s + v * want[i], 0);
  const norm = Math.hypot(...got) * Math.hypot(...want);
  return dotp / norm > 0.9;
};

describe("the chair as the textbook draws it", () => {
  it("is the textbook chair (projection/views `drawn`): in both forms every bond one long, the lower atoms the nearer - what the recognition fits a drawing to", () => {
    for (const form of [0, 1]) {
      const d = drawnByRule(chair(), form)!.atoms;
      for (let k = 0; k < 6; k++) expect(Math.hypot(d[(k + 1) % 6].x - d[k].x, d[(k + 1) % 6].y - d[k].y)).toBeCloseTo(1, 9);
      // (the lower three nearer, on the whole)
      const byY = [...d.keys()].sort((a, b) => d[a].y - d[b].y);
      expect(byY.slice(0, 3).reduce((s, k) => s + d[k].z, 0)).toBeGreaterThan(byY.slice(3).reduce((s, k) => s + d[k].z, 0));
    }
  });

  it("is read as the solid it draws, turned and scaled, both textbook chairs, from every atom and both ways round, and never as another", () => {
    const rand = seeded(11);
    let read = 0;
    let all = 0;
    for (const form of [0, 1] as const) {
      for (const turn of [-15, -8, 0, 8, 15]) {
        for (let k = 0; k < 6; k++) {
          const d = conventional(turn, 0.03, rand, 15 + 50 * rand(), form);
          const from = Math.floor(rand() * 6);
          const flip = rand() < 0.5;
          const order = [...Array(6)].map((_, i) => (((flip ? from - i : from + i) % 6) + 6) % 6);
          const got = recogniseChair(order.map((i) => d.places[i]));
          all++;
          if (got.kind === "depth") {
            read++;
            expect(got.by).toBe("convention");
            expect(agrees(got.z, order.map((i) => d.z[i])), `${form} ${turn} ${k}`).toBe(true);
          } else expect(got.kind, `${form} ${turn} ${k}`).toBe("unread");
        }
      }
    }
    expect(read / all).toBeGreaterThan(0.95);
  });
});

describe("a chair recognised where the drawing gives no depth", () => {
  it("reads the textbook chair, both ways round, as the solid it is: the lower atoms nearer", () => {
    for (const form of [0, 1]) {
      const d = drawn(standardView(chair(), form));
      const got = recogniseChair(d.places);
      expect(got.kind, `form ${form}`).toBe("depth");
      if (got.kind === "depth") {
        expect(got.by).toBe("convention");
        expect(agrees(got.z, d.z), `form ${form}`).toBe(true);
      }
    }
  });

  it("is never another depth than the solid had, over every chair view of the corpus - and reads most of them", () => {
    const rand = seeded(7);
    let read = 0;
    let all = 0;
    for (const form of [0, 1]) {
      for (const elevation of [18, 25, 32]) {
        for (const turn of [-15, -5, 0, 5, 15]) {
          for (let k = 0; k < 4; k++) {
            const view = fromAbove(elevation, form === 1 ? 180 : 0);
            const d = drawn(view, turn, 0.03, rand, 20 + 40 * rand());
            // (the ring's atoms listed from another atom, the other way round, as a drawing's atoms may be)
            const from = Math.floor(rand() * 6);
            const flip = rand() < 0.5;
            const order = [...Array(6)].map((_, i) => (((flip ? from - i : from + i) % 6) + 6) % 6);
            const got: Recognised = recogniseChair(order.map((i) => d.places[i]));
            all++;
            if (got.kind === "depth") {
              read++;
              expect(agrees(got.z, order.map((i) => d.z[i])), `${form} ${elevation} ${turn} ${k}`).toBe(true);
            } else expect(["flat", "unread"], `${form} ${elevation} ${turn}`).toContain(got.kind);
          }
        }
      }
    }
    expect(read / all).toBeGreaterThan(0.8);
  });

  it("reads the mirror picture as the mirror solid: the page mirrored keeps the lower nearer", () => {
    const d = drawn();
    const mirrored = d.places.map((p) => ({ x: -p.x, y: p.y }));
    const got = recogniseChair(mirrored);
    expect(got.kind).toBe("depth");
    // (the depths are the solid's reflected across the page's vertical: each atom's depth as it was, at the mirrored place)
    if (got.kind === "depth") expect(agrees(got.z, d.z)).toBe(true);
  });

  it("is flat for an ordinary drawing: a regular hexagon, a distorted one", () => {
    const hexagon = [...Array(6)].map((_, k) => ({ x: Math.cos((k * Math.PI) / 3), y: Math.sin((k * Math.PI) / 3) }));
    expect(recogniseChair(hexagon)).toEqual({ kind: "flat" });
    expect(recogniseChair(hexagon.map((p, i) => ({ x: p.x * (1 + 0.2 * (i % 2)), y: p.y })))).toEqual({ kind: "flat" });
  });

  it("is unread, and says so, where a chair is drawn on its side with no mark", () => {
    const d = drawn();
    const onItsSide = d.places.map((p) => ({ x: -p.y, y: p.x }));
    const got = recogniseChair(onItsSide);
    expect(got).toEqual({ kind: "unread", why: NOT_MARKED });
  });

  it("is read by a mark where there is one, before the convention: a bold bond on the upper edge is read as seen from below", () => {
    const d = drawn();
    // (the upper edge: the ring bond whose atoms are highest on the page)
    const bond = [0, 1, 2, 3, 4, 5].reduce((best, k) => (d.places[k].y + d.places[(k + 1) % 6].y > d.places[best].y + d.places[(best + 1) % 6].y ? k : best), 0);
    const byConvention = recogniseChair(d.places);
    const marked = recogniseChair(d.places, [bond]);
    expect(marked.kind).toBe("depth");
    if (marked.kind === "depth" && byConvention.kind === "depth") {
      expect(marked.by).toBe("mark");
      // (the mark wins: the upper edge nearer, the mirror of what the convention alone gives)
      expect(marked.z.map((v, i) => v * byConvention.z[i]).reduce((s, v) => s + v, 0)).toBeLessThan(0);
      expect(marked.z[bond] > 0 && marked.z[(bond + 1) % 6] > 0).toBe(true);
    }
    // (the lower edge marked: it agrees with the convention)
    const lower = [0, 1, 2, 3, 4, 5].reduce((best, k) => (d.places[k].y + d.places[(k + 1) % 6].y < d.places[best].y + d.places[(best + 1) % 6].y ? k : best), 0);
    const agreeing = recogniseChair(d.places, [lower]);
    if (agreeing.kind === "depth" && byConvention.kind === "depth") expect(agrees(agreeing.z, byConvention.z)).toBe(true);
  });

  it("is unread where the marks say both edges nearer, and a mark settles a chair on its side", () => {
    const d = drawn();
    expect(recogniseChair(d.places, [0, 3]).kind).toBe("unread");
    const onItsSide = d.places.map((p) => ({ x: -p.y, y: p.x }));
    // (the edge nearest the viewer, by the solid's own depths)
    const front = [0, 1, 2, 3, 4, 5].reduce((best, k) => (Math.abs(d.z[k] + d.z[(k + 1) % 6]) > Math.abs(d.z[best] + d.z[(best + 1) % 6]) ? k : best), 0);
    expect(recogniseChair(onItsSide, [front]).kind).toBe("depth");
  });

  it("reads depth with the sign the solid had: the projection's own near and far, whatever the fit's", () => {
    const d = drawn();
    const got = recogniseChair(d.places);
    // (a view from above: nearer atoms lower on the page)
    if (got.kind === "depth") {
      const lowest = d.places.reduce((best, p, i) => (p.y < d.places[best].y ? i : best), 0);
      expect(got.z[lowest]).toBeGreaterThan(0);
    }
    expect(project(standardView(chair()), chair().atoms[0]).z).toBeDefined();
  });
});

describe("chairs fused, recognised as one solid", () => {
  const bondIndex = (s: Solid, a: number, b: number) => s.bonds.findIndex(([x, y]) => x === a && y === b);
  /** A solid of chairs as projection/views draws it: its places, the depths it had, and its rings in order round each (the first chair, then each ring fused on). */
  function system(s: Solid, form = 0) {
    const d = drawnByRule(s, form)!;
    const rings: number[][] = [[0, 1, 2, 3, 4, 5]];
    // (each ring fused on: its bond's first atom, its second, then the four the fusion adds - x2, y, z, x1 - as solids.fused builds them)
    for (let n = 6; n < s.atoms.length; n += 4) {
      // (solids.fused adds the bonds j - x2, x2 - y, y - z, z - x1, x1 - i, with x1 = n, x2 = n + 1, y = n + 2, z = n + 3)
      const i = s.bonds.find(([a, b]) => a === n && b < n)![1];
      const j = s.bonds.find(([a, b]) => b === n + 1 && a < n)![0];
      rings.push([i, j, n + 1, n + 2, n + 3, n]);
    }
    // (the depths about their middle, as the recognition gives them)
    const middle = d.atoms.reduce((m, p) => m + p.z, 0) / d.atoms.length;
    return { places: d.atoms.map((p) => ({ x: 40 * p.x, y: 40 * p.y })), z: d.atoms.map((p) => 40 * (p.z - middle)), rings };
  }
  const c = chair();
  const decalin = fused(c, 0, "chair", "trans");

  it("reads trans- and cis-decalin and the tricycles as the solids they draw, in both forms", () => {
    for (const [name, s] of [
      ["trans-decalin", decalin],
      ["cis-decalin", fused(c, 0, "chair", { cis: 1 })],
      ["cis-decalin, the other face", fused(c, 0, "chair", { cis: -1 })],
      ["perhydrophenanthrene", fused(decalin, bondIndex(decalin, 7, 8), "chair", "trans")],
      ["perhydroanthracene", fused(decalin, bondIndex(decalin, 8, 9), "chair", "trans")],
    ] as const) {
      for (const form of [0, 1]) {
        const d = system(s, form);
        const got = recogniseChairs(d.places, d.rings);
        expect(got.kind, `${name} ${form}`).toBe("depth");
        if (got.kind === "depth") expect(agrees(got.z, d.z), `${name} ${form}`).toBe(true);
      }
    }
  });

  it("reads a drawing between trans- and cis-decalin as the nearer of the two, or not at all: never as the farther", () => {
    const trans = system(decalin);
    for (const face of [1, -1] as const) {
      const cis = system(fused(c, 0, "chair", { cis: face }));
      for (let w = 0; w <= 1.0001; w += 0.05) {
        const places = trans.places.map((p, i) => ({ x: (1 - w) * p.x + w * cis.places[i].x, y: (1 - w) * p.y + w * cis.places[i].y }));
        const got = recogniseChairs(places, trans.rings);
        if (got.kind !== "depth") continue;
        // (each drawn by the same rule from the same first ring: the nearer is the one whose depths it reads)
        expect(agrees(got.z, (w < 0.5 ? trans : cis).z), `face ${face}, ${w.toFixed(2)} of the way`).toBe(true);
      }
      expect(recogniseChairs(trans.places, trans.rings).kind).toBe("depth");
      expect(recogniseChairs(cis.places, trans.rings).kind).toBe("depth");
    }
  });

  it("is unread where a ring of the system is drawn flat, or rings share one atom only", () => {
    const d = system(decalin);
    // (the second ring redrawn as a regular hexagon on the shared bond: a chair fused to a flat ring)
    const [p, q] = [d.places[d.rings[1][0]], d.places[d.rings[1][1]]];
    const [mx, my, ux, uy] = [(p.x + q.x) / 2, (p.y + q.y) / 2, q.x - p.x, q.y - p.y];
    const away = Math.sign((mx - d.places[2].x) * -uy + (my - d.places[2].y) * ux) || 1;
    const centre = { x: mx - (away * uy * Math.sqrt(3)) / 2, y: my + (away * ux * Math.sqrt(3)) / 2 };
    const flat = d.places.slice();
    d.rings[1].forEach((i, k) => {
      if (k < 2) return;
      const a = Math.atan2(p.y - centre.y, p.x - centre.x) + ((Math.PI / 3) * k * (Math.sign((q.x - centre.x) * (p.y - centre.y) - (q.y - centre.y) * (p.x - centre.x)) || 1));
      flat[i] = { x: centre.x + Math.hypot(ux, uy) * Math.cos(a), y: centre.y + Math.hypot(ux, uy) * Math.sin(a) };
    });
    expect(recogniseChairs(flat, d.rings).kind).not.toBe("depth");
    // (two chairs on one atom: a spiro join is not read here)
    const one = drawnByRule(c, 0)!.atoms.map((p) => ({ x: 40 * p.x, y: 40 * p.y }));
    const other = one.map((p) => ({ x: 2 * one[0].x - p.x, y: 2 * one[0].y - p.y }));
    const spiro = [...one, ...other.slice(1)];
    expect(recogniseChairs(spiro, [[0, 1, 2, 3, 4, 5], [0, 6, 7, 8, 9, 10]])).toEqual({ kind: "unread", why: NOT_ONE_SHAPE });
  });

  it("is unread where the rings that are level disagree on near and far, and read by a bold bond on either ring", () => {
    const d = system(decalin);
    const byConvention = recogniseChairs(d.places, d.rings);
    // (a bold bond on the second ring's upper edge: the mark wins, for the whole system)
    const r = d.rings[1];
    const k = [0, 1, 2, 3, 4, 5].reduce((best, j) => (d.places[r[j]].y + d.places[r[(j + 1) % 6]].y > d.places[r[best]].y + d.places[r[(best + 1) % 6]].y ? j : best), 0);
    const marked = recogniseChairs(d.places, d.rings, [[r[k], r[(k + 1) % 6]]]);
    expect(marked.kind).toBe("depth");
    if (marked.kind === "depth" && byConvention.kind === "depth") {
      expect(marked.by).toBe("mark");
      expect(agrees(marked.z, byConvention.z.map((v) => -v))).toBe(true);
    }
  });
});

describe("a Haworth ring recognised from its places and its groups", () => {
  // (a regular ring seen from `sine` above: its front edge level and lowest - the solid's own order, ring O first)
  const ring = (n: 5 | 6 = 6, sine = 2 / 3, wide = 1) => haworth(n).atoms.map((p) => ({ x: 30 * wide * p[0], y: 30 * sine * p[1] }));
  const up = [{ x: 0, y: 30 }, { x: 0, y: -30 }, { x: 0, y: 30 }];
  const lowerNearer = (r: { x: number; y: number }[], z: number[]) => r.every((p, i) => r.every((q, j) => !(p.y < q.y - 1e-9) || z[i] > z[j]));

  it("reads a ring by what the texts' figures share - its lowest bond level, every other atom above it, the groups straight up and down - the lower atoms nearer", () => {
    // (the tool's own ring, six and five; one drawn flatter; a furanose drawn wide, as McNaught's is, 2.5 level bonds across; a pyranose taller, as his is)
    const cases: [string, { x: number; y: number }[]][] = [
      ["six, sine 2/3", ring(6)],
      ["five, sine 2/3", ring(5)],
      ["six, flatter", ring(6, 0.35)],
      ["five, wide", ring(5, 2 / 3, 2.5 / 1.618)],
      ["six, taller", ring(6, 0.8)],
    ];
    for (const [name, r] of cases) {
      const got = recogniseHaworth(r, up);
      expect(got.kind, name).toBe("depth");
      expect(lowerNearer(r, (got as { z: number[] }).z), name).toBe(true);
    }
    // (its groups at any length: long ones, and the short ones drawn into the ring's picture)
    expect(recogniseHaworth(ring(6), [{ x: 0, y: 90 }, { x: 0, y: -12 }]).kind).toBe("depth");
  });

  it("is flat where the lowest ring bond is not level, where a ring atom is not above it, or where a group is not straight up or down", () => {
    const turned = (r: { x: number; y: number }[], deg: number) => r.map((p) => ({ x: p.x * Math.cos((deg * Math.PI) / 180) - p.y * Math.sin((deg * Math.PI) / 180), y: p.x * Math.sin((deg * Math.PI) / 180) + p.y * Math.cos((deg * Math.PI) / 180) }));
    expect(recogniseHaworth(turned(ring(6), 8), up).kind).toBe("depth");
    expect(recogniseHaworth(turned(ring(6), 15), up)).toEqual({ kind: "flat" });
    // (an ordinary hexagon standing on a corner: its lowest bond slants)
    const corner = [...Array(6)].map((_, k) => ({ x: 30 * Math.cos(((60 * k + 30) * Math.PI) / 180), y: 30 * Math.sin(((60 * k + 30) * Math.PI) / 180) }));
    expect(recogniseHaworth(corner, up)).toEqual({ kind: "flat" });
    // (a side atom pulled down level with the front edge)
    const sagged = ring(6).map((p, k) => (k === 1 ? { ...p, y: ring(6)[2].y } : p));
    expect(recogniseHaworth(sagged, up)).toEqual({ kind: "flat" });
    expect(recogniseHaworth(ring(6), [{ x: 20, y: 20 }])).toEqual({ kind: "flat" });
  });

  it("is flat for a regular hexagon or pentagon standing on an edge, its groups vertical - a flat drawing that happens to lie so - and read once its near edge is bold", () => {
    // (the regular ring is the ring seen from straight above: sine 1)
    for (const n of [6, 5] as const) {
      expect(recogniseHaworth(ring(n, 1), up), `${n}`).toEqual({ kind: "flat" });
      expect(recogniseHaworth(ring(n, 1), up, [2]).kind, `${n} marked`).toBe("depth");
      // (just under the bound - seen from a hair under 60 degrees up - read; just over it, flat)
      expect(recogniseHaworth(ring(n, 0.86), up).kind, `${n} at 0.86`).toBe("depth");
      expect(recogniseHaworth(ring(n, 0.9), up), `${n} at 0.9`).toEqual({ kind: "flat" });
    }
  });

  it("is flat when no group is drawn, unless a bold ring bond marks the near edge", () => {
    const exact = ring(6);
    expect(recogniseHaworth(exact, [])).toEqual({ kind: "flat" });
    expect(recogniseHaworth(exact, [], [2]).kind).toBe("depth");
  });
});
