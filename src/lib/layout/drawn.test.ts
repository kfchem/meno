import { describe, expect, it } from "vitest";
import { readStereo, sameConfiguration, unsureStereo, wedgesForFlat, type DrawnAtom, type DrawnBond } from "./drawn";
import { readSmiles } from "../chem/smiles";
import { kekuleOrders } from "../chem/kekulize";
import { implicitHydrogens } from "../chem/molecule";
import { layout2D } from "./engine";
import type { LayoutInput } from "./perceive";
import cages from "./testdata/cages.json";

const at = (deg: number, r = 1) => ({ x: r * Math.cos((deg * Math.PI) / 180), y: r * Math.sin((deg * Math.PI) / 180) });

/** A carbon at the origin with neighbours drawn at these angles, lifted as given (+1 wedge, -1 hashes). */
function centre(angles: number[], lifts: number[], hs = 0) {
  const atoms: DrawnAtom[] = [{ x: 0, y: 0, hs }, ...angles.map((a) => ({ ...at(a), hs: 0 }))];
  const bonds: DrawnBond[] = angles.map((_, i) => ({
    a: 0,
    b: i + 1,
    order: 1,
    ...(lifts[i] ? { wedge: { narrow: 0, stereo: lifts[i] > 0 ? ("up" as const) : ("down" as const) } } : {}),
  }));
  return readStereo(atoms, bonds).tetra.get(0);
}

/** A layout of `input` as the engine draws it, taken down as a drawing: its H atoms, wedges and depths. */
function drawing(input: LayoutInput) {
  const out = layout2D(input);
  const atoms: DrawnAtom[] = input.atoms.map((a, i) => ({
    x: out.x[i],
    y: out.y[i],
    hs: a.hs ?? 0,
    ...(out.depth[i] != null ? { z: out.depth[i]! } : {}),
    ...(out.solid[i] && a.tetra ? { centre: true } : {}),
  }));
  const bonds: DrawnBond[] = input.bonds.map(({ a, b, order }) => ({ a, b, order }));
  const hydrogen = new Map<number, number>();
  for (const h of out.hydrogens) {
    atoms.push({ ...h.at, hs: 0 });
    atoms[h.on] = { ...atoms[h.on], hs: atoms[h.on].hs - 1 };
    bonds.push({ a: h.on, b: atoms.length - 1, order: 1 });
    hydrogen.set(atoms.length - 1, h.on);
  }
  for (const w of out.wedges) {
    const to = w.to === -1 ? [...hydrogen].find(([, on]) => on === w.from)![0] : w.to;
    const bond = bonds.find((b) => (b.a === w.from && b.b === to) || (b.b === w.from && b.a === to))!;
    bond.wedge = { narrow: w.from, stereo: w.stereo };
  }
  return { atoms, bonds, out, hydrogen };
}

describe("readStereo", () => {
  // what RDKit reads each of these as (neighbours F, Cl, Br, I or H, in order)
  it("reads a centre from its wedge, as RDKit does", () => {
    expect(centre([-30, 90, 210, 30], [0, 0, 0, 1])?.volume).toBe(-1); // R
    expect(centre([-30, 90, 210, 30], [0, 0, 0, -1])?.volume).toBe(1);
    expect(centre([0, 120, 240], [1, 0, 0], 1)).toEqual({ neighbours: [1, 2, 3, -1], volume: 1 }); // R
  });

  it("reads three bonds in the page within 180 degrees of each other as RDKit does", () => {
    // (read from the angles alone, two of them and the wedge say one thing
    // and the other two the opposite)
    expect(centre([0, -40, -128, 116], [0, 0, 0, 1])?.volume).toBe(1); // S
  });

  it("reads nothing at a centre with no wedge, or one with two H", () => {
    expect(centre([-30, 90, 210, 30], [0, 0, 0, 0])).toBeUndefined();
    expect(centre([0, 120], [1, 0], 2)).toBeUndefined();
  });

  it("reads a double bond's groups on the sides they are drawn on", () => {
    // 2-butene: C0-C1=C2-C3, trans, then cis
    const trans = [at(210), { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1 + Math.cos(Math.PI / 6), y: Math.sin(Math.PI / 6) }];
    const bonds: DrawnBond[] = [
      { a: 0, b: 1, order: 1 },
      { a: 1, b: 2, order: 2 },
      { a: 2, b: 3, order: 1 },
    ];
    const hs = (ps: { x: number; y: number }[]) => ps.map((p) => ({ ...p, hs: 1 }));
    expect(readStereo(hs(trans), bonds).cisTrans.get(1)).toEqual({ refs: [0, 3], cis: false });
    const cis = [...trans.slice(0, 3), { x: trans[3].x, y: -trans[3].y }];
    expect(readStereo(hs(cis), bonds).cisTrans.get(1)).toEqual({ refs: [0, 3], cis: true });
  });

  it("reads nothing of a double bond cumulated with another, however it is drawn bent: an azide's N=N, an allene's C=C", () => {
    // phenyl azide's N(-)=N(+)=N-C, its N(+) drawn off the line: the N=N
    // to the ring's N has the other N on one end and the ring on the other
    const azide: DrawnAtom[] = [
      { x: -2.6, y: 0.6, el: "N", hs: 0 },
      { x: -1.7, y: 0.2, el: "N", hs: 0 },
      { x: -0.9, y: 0.7, el: "N", hs: 0 },
      { x: 0, y: 0, hs: 0 },
    ];
    const bonds: DrawnBond[] = [
      { a: 0, b: 1, order: 2 },
      { a: 1, b: 2, order: 2 },
      { a: 2, b: 3, order: 1 },
    ];
    expect(readStereo(azide, bonds).cisTrans.size).toBe(0);
    // a tetrasubstituted allene's two C=C, its middle C bent
    const allene: DrawnAtom[] = [{ ...at(150), hs: 3 }, { x: 0, y: 0, hs: 1 }, { x: 0.9, y: 0.4, hs: 0 }, { x: 1.8, y: 0, hs: 1 }, { x: 2.6, y: 0.6, hs: 3 }];
    const its: DrawnBond[] = [
      { a: 0, b: 1, order: 1 },
      { a: 1, b: 2, order: 2 },
      { a: 2, b: 3, order: 2 },
      { a: 3, b: 4, order: 1 },
    ];
    expect(readStereo(allene, its).cisTrans.size).toBe(0);
  });

  it("reads nothing of a double bond in a ring of seven or fewer, but one in a larger ring", () => {
    // a ring of n atoms, its bond 0=1 double, drawn as a regular polygon
    const ring = (n: number) => {
      const atoms = Array.from({ length: n }, (_, i) => ({ ...at((360 * i) / n), hs: 1 }));
      const bonds: DrawnBond[] = atoms.map((_, i) => ({ a: i, b: (i + 1) % n, order: i === 0 ? 2 : 1 }));
      return readStereo(atoms, bonds).cisTrans;
    };
    expect(ring(6).size).toBe(0);
    expect(ring(7).size).toBe(0);
    expect(ring(8).size).toBe(1);
  });

  it("reads back every centre the engine draws, cages in perspective among them", () => {
    for (const [name, g] of Object.entries(cages)) {
      const input = g as LayoutInput;
      const { atoms, bonds, out, hydrogen } = drawing(input);
      expect(out.solid.some(Boolean), name).toBe(true);
      const read = readStereo(atoms, bonds);
      input.atoms.forEach((a, i) => {
        if (!a.tetra) return;
        const t = read.tetra.get(i);
        expect(t, `${name} ${i}`).toBeDefined();
        expect(sameConfiguration(a.tetra, t!, (n) => (hydrogen.has(n) ? -1 : n)), `${name} ${i}`).toBe(true);
      });
    }
    // (the whole engine on each of the molecules, cages among them: about a
    // second alone, a few times that on a machine busy with the rest of the
    // tests)
  }, 30_000);

  it("reads every centre in a cage for sure, not by a hair", () => {
    // each bond out of a cage turned a little either way reads the same:
    // it is drawn along the corner it is in, not somewhere between the two
    for (const [name, g] of Object.entries(cages)) {
      const input = g as LayoutInput;
      const { atoms, bonds, out } = drawing(input);
      const read = readStereo(atoms, bonds);
      for (const [c, t] of read.tetra) {
        if (atoms[c].z == null) continue;
        for (const n of t.neighbours) {
          if (n < 0 || atoms[n].z != null) continue;
          for (const deg of [-15, 15]) {
            const r = (deg * Math.PI) / 180;
            const v = { x: atoms[n].x - atoms[c].x, y: atoms[n].y - atoms[c].y };
            const turned = atoms.map((a, i) =>
              i === n
                ? { ...a, x: atoms[c].x + v.x * Math.cos(r) - v.y * Math.sin(r), y: atoms[c].y + v.x * Math.sin(r) + v.y * Math.cos(r) }
                : a,
            );
            const u = readStereo(turned, bonds).tetra.get(c);
            expect(u && sameConfiguration(t, u), `${name}: centre ${c}, its bond to ${n} turned ${deg}`).toBe(true);
          }
        }
      }
      expect(out.solid.some(Boolean), name).toBe(true);
    }
    // (the whole engine on each of the cages: about a second alone, a few times
    // that on a machine busy with the rest of the tests)
  }, 30_000);

  it("says a perspective centre to a flat reader on a bond no other centre's wedge is on", () => {
    // tetrodotoxin drawn as a solid, its C4 wedged on its bond to C4a, which
    // its shape shows: C4a's wedge for a flat reader went on the same bond
    // and took C4's away
    const s = readSmiles("C([C@@]1([C@H]2[C@@H]3[C@H](N=C(N[C@@]34[C@@H]([C@@H]1O[C@]([C@H]4O)(O2)O)O)N)O)O)O");
    const orders = kekuleOrders(s.atoms, s.bonds);
    const sum = s.atoms.map(() => 0);
    s.bonds.forEach((b, i) => ([sum[b.a1], sum[b.a2]] = [sum[b.a1] + orders[i], sum[b.a2] + orders[i]]));
    const drawn = drawing({
      atoms: s.atoms.map((a, i) => ({ el: a.el, hs: a.hs ?? implicitHydrogens(a.el, sum[i]), ...(a.tetra ? { tetra: a.tetra } : {}) })),
      bonds: s.bonds.map((b, i) => ({ a: b.a1, b: b.a2, order: orders[i] })),
    });
    // (each atom what it is, as a drawing has it)
    const atoms = drawn.atoms.map((a, i) => ({ ...a, el: s.atoms[i]?.el ?? "H" }));
    const { bonds } = drawn;
    const wedged = new Set(bonds.flatMap((b) => (b.wedge ? [[b.a, b.b].sort((p, q) => p - q).join(",")] : [])));
    for (const w of wedgesForFlat(atoms, bonds).wedges) {
      if (w.to >= 0) expect(wedged.has([w.from, w.to].sort((p, q) => p - q).join(",")), `${w.from}-${w.to}`).toBe(false);
    }
    // (the whole engine on tetrodotoxin's cage: under half a second alone,
    // a few times that on a machine busy with the rest of the tests)
  }, 30_000);

  it("reads a centre with a wedge by its wedge, whatever depth it is drawn at", () => {
    // an atom of a ring laid across another's face, behind it - gibberellic
    // acid's 3-epimer's C3: its depth is a layer, not a place in space, and
    // taken as one it tipped the bond to the ring in front up towards the
    // viewer and turned the centre
    const atoms: DrawnAtom[] = [
      { x: 0, y: 0, hs: 1, z: -1 },
      { x: -0.21, y: 0.98, hs: 0, z: 0 },
      { x: -0.87, y: -0.5, hs: 0, z: -1 },
      { x: 0.91, y: -0.4, el: "O", hs: 1 },
    ];
    const bonds: DrawnBond[] = [
      { a: 0, b: 1, order: 1 },
      { a: 0, b: 2, order: 1 },
      { a: 0, b: 3, order: 1, wedge: { narrow: 0, stereo: "down" } },
    ];
    const flat = readStereo(atoms.map(({ z: _z, ...a }) => a), bonds).tetra.get(0);
    expect(flat).toBeDefined();
    expect(readStereo(atoms, bonds).tetra.get(0)).toEqual(flat);
  });

  it("reads a cage's bridgehead drawn all but flat from the cage as a whole", () => {
    // camphor's skeleton with only its bridgehead C4 given, either way: the
    // textbook chair draws that centre's three bonds into the cage all but
    // in one plane on the page, which way round they go a matter of a hair
    const bonded: [number, number, number?][] = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [0, 6], [6, 3], [1, 7, 2], [0, 8], [6, 9], [6, 10]];
    const order = new Array(11).fill(0);
    for (const [a, b, o] of bonded) [order[a], order[b]] = [order[a] + (o ?? 1), order[b] + (o ?? 1)];
    for (const volume of [1, -1] as const) {
      const input: LayoutInput = {
        atoms: Array.from({ length: 11 }, (_, i) =>
          i === 7 ? { el: "O", hs: 0 } : { el: "C", hs: 4 - order[i], ...(i === 3 ? { tetra: { neighbours: [2, 4, 6, -1], volume } } : {}) },
        ),
        bonds: bonded.map(([a, b, o]) => ({ a, b, order: o ?? 1 })),
      };
      const { atoms, bonds, out } = drawing(input);
      expect(out.solid[3]).toBe(true);
      const t = readStereo(atoms, bonds).tetra.get(3);
      expect(t && sameConfiguration(input.atoms[3].tetra!, t), `volume ${volume}`).toBe(true);
    }
  });

  it("turns a centre in a cage when its substituent is drawn the other way", () => {
    // cocaine's C3, which carries the benzoate: as the bond to its O is
    // drawn round the carbon, it is read on one side of the cage or the
    // other - where it is drawn, the way it was
    const input = cages.Cocaine as LayoutInput;
    const { atoms, bonds } = drawing(input);
    const bonded = (i: number) => input.bonds.flatMap((b) => (b.a === i ? [b.b] : b.b === i ? [b.a] : []));
    const c = input.atoms.findIndex(
      (a, i) => a.tetra && atoms[i].z != null && bonded(i).some((n) => input.atoms[n].el === "O"),
    );
    const o = bonded(c).find((n) => input.atoms[n].el === "O")!;
    const before = readStereo(atoms, bonds).tetra.get(c)!;
    const r = Math.hypot(atoms[o].x - atoms[c].x, atoms[o].y - atoms[c].y);
    const readings = new Set<boolean>();
    for (let deg = 0; deg < 360; deg += 10) {
      const p = at(deg, r);
      const moved = atoms.map((a, i) => (i === o ? { ...a, x: atoms[c].x + p.x, y: atoms[c].y + p.y } : a));
      const t = readStereo(moved, bonds).tetra.get(c);
      if (t) readings.add(sameConfiguration(before, t));
    }
    expect(readings).toEqual(new Set([true, false]));
  });
});

describe("sameConfiguration", () => {
  it("counts the swaps between two orders of the neighbours", () => {
    const t = { neighbours: [1, 2, 3, 4], volume: 1 as const };
    expect(sameConfiguration(t, { neighbours: [2, 1, 3, 4], volume: -1 })).toBe(true);
    expect(sameConfiguration(t, { neighbours: [2, 3, 1, 4], volume: 1 })).toBe(true);
    expect(sameConfiguration(t, { neighbours: [2, 3, 1, 4], volume: -1 })).toBe(false);
    expect(sameConfiguration(t, { neighbours: [1, 2, 3, 5], volume: 1 })).toBe(false);
  });
});

describe("what a drawing says of its stereochemistry only by luck", () => {
  const at = (deg: number, r = 1) => ({ x: r * Math.cos((deg * Math.PI) / 180), y: r * Math.sin((deg * Math.PI) / 180), hs: 0 });
  it("is a wedged centre whose other bonds lie in a line, not one whose bonds are spread", () => {
    const centre = { x: 0, y: 0, hs: 1 };
    const tee = [centre, at(-90), at(0), at(180)];
    const bonds = [
      { a: 0, b: 1, order: 1, wedge: { narrow: 0, stereo: "up" as const } },
      { a: 0, b: 2, order: 1 },
      { a: 0, b: 3, order: 1 },
    ];
    expect(unsureStereo(tee, bonds).atoms).toEqual([0]);
    const spread = [centre, at(-90), at(30), at(150)];
    expect(unsureStereo(spread, bonds).atoms).toEqual([]);
  });

  it("is a centre with all four bonds in one half of the page", () => {
    const fan = [{ x: 0, y: 0, hs: 0 }, at(-20), at(30), at(80), at(130)];
    const bonds = [
      { a: 0, b: 1, order: 1, wedge: { narrow: 0, stereo: "up" as const } },
      { a: 0, b: 2, order: 1 },
      { a: 0, b: 3, order: 1 },
      { a: 0, b: 4, order: 1 },
    ];
    expect(unsureStereo(fan, bonds).atoms).toEqual([0]);
  });

  it("is a double bond with a group almost in line with it, not one exactly in line or well off it", () => {
    const pts = (deg: number) => [
      { x: 0, y: 0, hs: 1 },
      { x: 1, y: 0, hs: 1 },
      { x: -0.5, y: 0.87, hs: 3 },
      { x: 1 + Math.cos((deg * Math.PI) / 180), y: Math.sin((deg * Math.PI) / 180), hs: 3 },
    ];
    const bonds = [
      { a: 0, b: 1, order: 2 },
      { a: 0, b: 2, order: 1 },
      { a: 1, b: 3, order: 1 },
    ];
    expect(unsureStereo(pts(5), bonds).bonds).toEqual([0]);
    expect(unsureStereo(pts(0), bonds).bonds).toEqual([]);
    expect(unsureStereo(pts(60), bonds).bonds).toEqual([]);
  });
});
