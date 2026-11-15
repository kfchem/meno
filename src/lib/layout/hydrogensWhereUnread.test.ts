import { describe, expect, it } from "vitest";
import { hydrogensWhereUnread, readStereo, wedgesForFlat, type DrawnAtom, type DrawnBond } from "./drawn";
import { readSmiles } from "../chem/smiles";
import { kekuleOrders } from "../chem/kekulize";
import { implicitHydrogens } from "../chem/molecule";
import { layout2D } from "./engine";
import type { LayoutInput } from "./perceive";
import { measured } from "../../testing/timeouts";

// The H the layout draws for a centre its wedge does not say, or says only in a form a drawing of Meno's own is not to show (drawn.ts
// `hydrogensWhereUnread`): drawn in the widest gap round the centre, clear of every other atom and bond, and wedged instead.

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

describe("wedgesForFlat: the wedges and H's a drawing in perspective is written with for a reader of wedges alone", () => {
  it("puts the H a flat reader gets as far out as the drawing's bonds are long, at any scale", () => {
    // (tetrodotoxin drawn as a solid, as above: its wedges and H for a flat reader, the drawing as it is and twice as large)
    const s = readSmiles("C([C@@]1([C@H]2[C@@H]3[C@H](N=C(N[C@@]34[C@@H]([C@@H]1O[C@]([C@H]4O)(O2)O)O)N)O)O)O");
    const orders = kekuleOrders(s.atoms, s.bonds);
    const sum = s.atoms.map(() => 0);
    s.bonds.forEach((b, i) => ([sum[b.a1], sum[b.a2]] = [sum[b.a1] + orders[i], sum[b.a2] + orders[i]]));
    const drawn = drawing({
      atoms: s.atoms.map((a, i) => ({ el: a.el, hs: a.hs ?? implicitHydrogens(a.el, sum[i]), ...(a.tetra ? { tetra: a.tetra } : {}) })),
      bonds: s.bonds.map((b, i) => ({ a: b.a1, b: b.a2, order: orders[i] })),
    });
    const atoms = drawn.atoms.map((a, i) => ({ ...a, el: s.atoms[i]?.el ?? "H" }));
    const once = wedgesForFlat(atoms, drawn.bonds);
    const twice = wedgesForFlat(
      atoms.map((a) => ({ ...a, x: 2 * a.x, y: 2 * a.y, ...(a.z != null ? { z: 2 * a.z } : {}) })),
      drawn.bonds,
    );
    expect(once.hydrogens.length).toBeGreaterThan(0);
    expect(twice.hydrogens.map((h) => h.on)).toEqual(once.hydrogens.map((h) => h.on));
    once.hydrogens.forEach((h, i) => {
      const c = atoms[h.on];
      const far = (p: { x: number; y: number }, k: number) => Math.hypot(p.x - k * c.x, p.y - k * c.y);
      expect(far(twice.hydrogens[i].at, 2)).toBeCloseTo(2 * far(h.at, 1), 6);
    });
  }, measured(3_800));
});

describe("hydrogensWhereUnread: a centre of three bonds whose wedge is in line with another", () => {
  const at = (deg: number, r = 1) => ({ x: r * Math.cos((deg * Math.PI) / 180), y: r * Math.sin((deg * Math.PI) / 180) });
  // (a centre with its H left out and three bonds - to 1 at 0 degrees, wedged, to 2 at `b` and to 3 at 100 - and, where given, a
  // bond of another molecule, 4-5, lying below it)
  const centre = (b: number, below: "atom" | "bond" | "arc" | null = null) => {
    const atoms: DrawnAtom[] = [{ x: 0, y: 0, hs: 1 }, { ...at(0), hs: 3 }, { ...at(b), hs: 3, el: "O" }, { ...at(100), hs: 3, el: "N" }];
    const bonds: DrawnBond[] = [1, 2, 3].map((n) => ({ a: 0, b: n, order: 1 }));
    // (another molecule below it: an atom in the gap's middle; a long bond across the gap, its atoms far off; atoms all along the
    // gap a bond and a half out, which only a short H clears)
    if (below === "atom") {
      atoms.push({ x: 0, y: -1.1, hs: 3 }, { x: 0.9, y: -1.6, hs: 3 });
      bonds.push({ a: 4, b: 5, order: 1 });
    }
    if (below === "bond") {
      atoms.push({ x: -3, y: -1, hs: 3 }, { x: 3, y: -1, hs: 3 });
      bonds.push({ a: 4, b: 5, order: 1 });
    }
    if (below === "arc") for (let d = -170; d <= -10; d += 10) atoms.push({ ...at(d, 1.5), hs: 0, el: "Ar" });
    const wedged = bonds.map((x, i) => (i === 0 ? { ...x, wedge: { narrow: 0, stereo: "up" as const } } : x));
    const shown = readStereo(atoms, wedged).tetra;
    return { atoms, bonds, shown, placed: { wedges: [{ from: 0, to: 1, stereo: "up" as const }], hydrogens: [] } };
  };
  const deg = (p: { x: number; y: number }) => Math.round((Math.atan2(p.y, p.x) * 180) / Math.PI);

  it("draws its H in the widest gap and wedges it instead, though the wedge read: in line within 10 degrees (ST-1.2.4)", () => {
    for (const b of [180, 172]) {
      const c = centre(b);
      expect(c.shown.has(0), `${b}`).toBe(true);
      const out = hydrogensWhereUnread(c.atoms, c.bonds, c.shown, c.placed, 1);
      expect(out.hydrogens.map((h) => h.on), `${b}`).toEqual([0]);
      expect(out.wedges, `${b}`).toEqual([{ from: 0, to: -1, stereo: expect.any(String) }]);
      // (in the widest gap, below: between 180 and 360)
      expect(deg(out.hydrogens[0].at), `${b}`).toBeLessThan(0);
    }
  });

  it("leaves it as placed where the wedge is 11 degrees or more off the line", () => {
    const c = centre(169);
    expect(hydrogensWhereUnread(c.atoms, c.bonds, c.shown, c.placed, 1)).toEqual(c.placed);
  });

  it("stands the H clear of another atom and bond in its gap: turned from the gap's middle", () => {
    const c = centre(180, "atom");
    const out = hydrogensWhereUnread(c.atoms, c.bonds, c.shown, c.placed, 1);
    const h = out.hydrogens[0].at;
    expect(deg(h)).not.toBe(-90);
    expect(Math.hypot(h.x - 0, h.y + 1.1)).toBeGreaterThanOrEqual(0.75);
  });

  it("stands the H clear of a bond across its gap, its atoms far off: 0.4 of a bond from it", () => {
    const c = centre(180, "bond");
    const h = hydrogensWhereUnread(c.atoms, c.bonds, c.shown, c.placed, 1).hydrogens[0].at;
    expect(Math.abs(h.y + 1)).toBeGreaterThanOrEqual(0.4 - 1e-9);
  });

  it("draws the H shorter where only a shorter one is clear: three quarters of a bond from atoms all round its gap", () => {
    const c = centre(180, "arc");
    const h = hydrogensWhereUnread(c.atoms, c.bonds, c.shown, c.placed, 1).hydrogens[0].at;
    expect(Math.hypot(h.x, h.y)).toBeLessThan(1);
    for (const a of c.atoms.slice(4)) expect(Math.hypot(a.x - h.x, a.y - h.y)).toBeGreaterThanOrEqual(0.75 - 1e-9);
  });
});

describe("hydrogensWhereUnread: where in the gap the H stands, each rule's own case", () => {
  const at = (deg: number, r = 1) => ({ x: r * Math.cos((deg * Math.PI) / 180), y: r * Math.sin((deg * Math.PI) / 180) });
  /** The H's direction, in whole degrees, and its length, in bonds, at a centre of three bonds - to 1 at 0 degrees, wedged, to 2 at 180 and to 3 at 100, the first two `r` long - with atoms (and bonds between them) of another molecule round it. */
  const placedH = (extra: { x: number; y: number }[], extraBonds: [number, number][] = [], r = 1) => {
    const atoms: DrawnAtom[] = [{ x: 0, y: 0, hs: 1 }, { ...at(0, r), hs: 3 }, { ...at(180, r), hs: 3, el: "O" }, { ...at(100), hs: 3, el: "N" }, ...extra.map((p) => ({ ...p, hs: 3 }))];
    const bonds: DrawnBond[] = [...[1, 2, 3].map((n) => ({ a: 0, b: n, order: 1 })), ...extraBonds.map(([a, b]) => ({ a, b, order: 1 }))];
    const shown = readStereo(atoms, bonds.map((x, i) => (i === 0 ? { ...x, wedge: { narrow: 0, stereo: "up" as const } } : x))).tetra;
    const h = hydrogensWhereUnread(atoms, bonds, shown, { wedges: [{ from: 0, to: 1, stereo: "up" }], hydrogens: [] }, 1).hydrogens[0].at;
    return [Math.round((Math.atan2(h.y, h.x) * 180) / Math.PI), +Math.hypot(h.x, h.y).toFixed(3)];
  };

  it("keeps a bond's length where turning finds it clear - three quarters of a bond from an atom in the gap - and draws it shorter only where no turn does", () => {
    // (an atom 1.6 bonds below the centre: at a bond's length the H is clear of it turned 35 degrees; never shortened then)
    expect(placedH([{ x: 0, y: -1.6 }])).toEqual([-55, 1]);
    // (atoms all round the gap 1.7 bonds out: no turn is clear at a bond's length, and it is drawn 0.85 of one)
    const arc: { x: number; y: number }[] = [];
    for (let d = -170; d <= -10; d += 10) arc.push(at(d, 1.7));
    expect(placedH(arc)).toEqual([-85, 0.85]);
  });

  it("keeps 0.4 of a bond from another's bond across its gap: shorter and turned where the bond is near", () => {
    expect(placedH([{ x: -3, y: -0.9 }, { x: 3, y: -0.9 }], [[4, 5]])).toEqual([-50, 0.6]);
  });

  it("turns, where the gap's middle is crowded, no nearer than 25 degrees to its own bonds", () => {
    // (atoms 1 bond out from -140 to -40 degrees: the H goes as far as it may towards the bond at 0 degrees, and stops 25 short)
    const block: { x: number; y: number }[] = [];
    for (let d = -140; d <= -40; d += 10) block.push(at(d));
    expect(placedH(block)).toEqual([-25, 0.6]);
  });

  it("stands clear of the other atoms and bonds, its own centre's bonds not among them: they do not push it off", () => {
    // (the centre's two bonds in line 1.8 bonds long, an atom of another molecule down and to the left: the H turns away from that
    //  atom to -40 degrees, which its own bond at 0 degrees, counted, would push to -45)
    expect(placedH([{ x: -0.49, y: -0.49 }], [], 1.8)).toEqual([-40, 1]);
  });
});
