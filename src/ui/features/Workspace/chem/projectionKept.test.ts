import { describe, expect, it } from "vitest";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { MENO } from "../../../../lib/chem/style";
import { chair, haworth, newman } from "../../../../lib/layout/testdata/projections";
import type { DrawnAtom, DrawnBond } from "../../../../lib/layout/drawn";
import type { Model } from "../store/types";
import { laidOut } from "./cleanUp";
import { identityOfDrawn } from "./identityOf";
import { forFlatReaders } from "./drawing";
import { projectionsKept } from "./projectionKept";

/**
 * Clean-up leaves a ring system drawn in perspective where it is, and lays what is flat on it out onto it (the maintainer's ruling,
 * 2026-11-13): a chair's or a Haworth ring's atoms keep their places, their depth and their being stereocentres; its groups are laid out
 * by the engine from where the drawing has them; the structure is the same compound.
 */
const modelOf = (d: { atoms: DrawnAtom[]; bonds: DrawnBond[] }): Model => ({
  atoms: d.atoms.map((a, i) => ({ id: i + 1, el: a.el ?? "C", x: a.x * NOMINAL_BOND_LENGTH, y: a.y * NOMINAL_BOND_LENGTH, r: 0.9, ...(a.z != null ? { z: a.z * NOMINAL_BOND_LENGTH } : {}), ...(a.centre ? { stereoCentre: true as const } : {}) })) as Model["atoms"],
  bonds: d.bonds.map((b, k) => ({ id: 100 + k, a: b.a + 1, b: b.b + 1, order: b.order as 1 | 2 | 3 })),
});

const drawings: Record<string, { model: Model; ring: number[] }> = {
  "a chair of menthol": { model: modelOf(chair({ 0: { place: "equatorial", el: "O", hs: 1 }, 1: { place: "equatorial", hs: 1, branches: 2 }, 4: "equatorial" })), ring: [1, 2, 3, 4, 5, 6] },
  "a chair of cis-1,2-dimethylcyclohexane": { model: modelOf(chair({ 0: "axial", 1: "equatorial" })), ring: [1, 2, 3, 4, 5, 6] },
  "beta-D-glucopyranose in Haworth's ring": { model: modelOf(haworth([true, false, true, false, true])), ring: [1, 2, 3, 4, 5, 6] },
};

describe("Clean-up of a drawing in perspective", () => {
  it("leaves the ring system where it is, depth and stereocentres and all, and the structure the same compound", async () => {
    for (const [name, { model, ring }] of Object.entries(drawings)) {
      const laid = await laidOut(model, MENO);
      for (const id of ring) {
        const [was, now] = [model.atoms.find((a) => a.id === id)!, laid.atoms.find((a) => a.id === id)!];
        expect([now.x, now.y, now.z, !!now.stereoCentre], `${name} atom ${id}`).toEqual([was.x, was.y, was.z, !!was.stereoCentre]);
      }
      expect(identityOfDrawn(laid).text, name).toBe(identityOfDrawn(model).text);
      // (no wedge drawn, no H added: the perspective says it)
      expect(laid.atoms.length, name).toBe(model.atoms.length);
      expect(laid.bonds.filter((b) => b.stereo === "up" || b.stereo === "down"), name).toEqual([]);
    }
  });

  it("lays each group's first atom the way the drawing has it from the ring, a bond long from it", async () => {
    const { model } = drawings["a chair of menthol"];
    const laid = await laidOut(model, MENO);
    // (the groups' first atoms: the ring's atoms 1, 2 and 5 carry atoms 7 (O), 8 (the isopropyl C) and 11 - the order the drawing gives)
    for (const b of model.bonds.filter((b) => b.a <= 6 && b.b > 6)) {
      const [ring, group] = [model.atoms.find((a) => a.id === b.a)!, model.atoms.find((a) => a.id === b.b)!];
      const now = laid.atoms.find((a) => a.id === b.b)!;
      const [was, nowDir] = [Math.atan2(group.y - ring.y, group.x - ring.x), Math.atan2(now.y - ring.y, now.x - ring.x)];
      expect(Math.abs(Math.atan2(Math.sin(was - nowDir), Math.cos(was - nowDir)))).toBeLessThan(1e-6);
      expect(Math.hypot(now.x - ring.x, now.y - ring.y)).toBeCloseTo(NOMINAL_BOND_LENGTH, 6);
    }
  });

  it("is still a Clean-up of the rest: the isopropyl's methyls are laid out by the engine, a bond long from their carbon, apart", async () => {
    const { model } = drawings["a chair of menthol"];
    const laid = await laidOut(model, MENO);
    const at = (id: number) => laid.atoms.find((a) => a.id === id)!;
    const [c, m1, m2] = [at(8), at(9), at(10)];
    expect(Math.hypot(m1.x - c.x, m1.y - c.y)).toBeCloseTo(NOMINAL_BOND_LENGTH, 4);
    expect(Math.hypot(m2.x - c.x, m2.y - c.y)).toBeCloseTo(NOMINAL_BOND_LENGTH, 4);
    expect(Math.hypot(m1.x - m2.x, m1.y - m2.y)).toBeGreaterThan(NOMINAL_BOND_LENGTH * 0.9);
    // (and turned with the group onto the ring's atom: they go on away from it, never back across it)
    const ring2 = at(2);
    for (const m of [m1, m2]) expect(Math.hypot(m.x - ring2.x, m.y - ring2.y)).toBeGreaterThan(NOMINAL_BOND_LENGTH * 1.5);
  });

  it("leaves an H drawn on a centre of the projection where it is, and a wedge drawn on a group of it as it was", async () => {
    // (menthol's chair with an H atom beside C1, and a wedge up on the bond from C1 to its O: both as drawn)
    const { model } = drawings["a chair of menthol"];
    const c1 = model.atoms.find((a) => a.id === 1)!;
    const withH: Model = {
      atoms: [...model.atoms, { id: 99, el: "H", x: c1.x - 12, y: c1.y + 9, r: 0.9 } as Model["atoms"][number]],
      bonds: [...model.bonds, { id: 199, a: 1, b: 99, order: 1 }],
    };
    const laid = await laidOut(withH, MENO);
    expect(laid.atoms.find((a) => a.id === 99)).toMatchObject({ x: c1.x - 12, y: c1.y + 9 });
    expect(laid.bonds.find((b) => b.id === 199)?.stereo ?? "none").toBe("none");
  });
});

describe("what is kept of a projection", () => {
  const atom = (x: number, y: number, z?: number) => ({ x, y, ...(z != null ? { z } : {}) });
  /** A cyclohexane ring (atoms 0 to 5) with a depth, and a methyl on atom 0 (6) - or a bridge across to atom 3 through atom 6. */
  const ring = (bridge: boolean) => ({
    input: {
      atoms: [...Array(7)].map(() => ({ el: "C", hs: 2 })),
      bonds: [...[0, 1, 2, 3, 4, 5].map((i) => ({ a: i, b: (i + 1) % 6, order: 1 })), { a: 0, b: 6, order: 1 }, ...(bridge ? [{ a: 6, b: 3, order: 1 }] : [])],
    },
    was: [atom(0, 0, 1), atom(1, 0.5, -1), atom(2, 0, 1), atom(3, 0.5, -1), atom(2, -0.5, 1), atom(1, -0.5, -1), atom(0, 1.2)],
  });
  const at = (i: number) => ({ x: i * 0.1, y: 5 });

  it("is a ring system with depth that the engine lays flat - and none where it is laid with depth, or has none", () => {
    const { input, was } = ring(false);
    expect([...projectionsKept(input, was, () => true, at, 1).projected].sort()).toEqual([0, 1, 2, 3, 4, 5]);
    expect(projectionsKept(input, was, () => false, at, 1).projected.size).toBe(0);
    expect(projectionsKept(input, was.map(({ z: _z, ...p }) => p), () => true, at, 1).projected.size).toBe(0);
  });

  it("keeps a piece joined to projections by more than one bond as drawn: a linker between two chairs", () => {
    // (rings 0-5 and 7-12, each with a depth, a CH2 (6) between atoms 0 and 7: joined to both, kept where the drawing has it)
    const one = ring(false);
    const atoms = [...one.input.atoms, ...[...Array(6)].map(() => ({ el: "C", hs: 2 }))];
    const bonds = [...one.input.bonds.filter((b) => b.b !== 6 && b.a !== 6), ...[0, 1, 2, 3, 4, 5].map((i) => ({ a: 7 + i, b: 7 + ((i + 1) % 6), order: 1 })), { a: 0, b: 6, order: 1 }, { a: 6, b: 7, order: 1 }];
    const was = [...one.was, ...one.was.slice(0, 6).map((p) => ({ ...p, x: p.x + 4 }))];
    const kept = projectionsKept({ atoms, bonds }, was, () => true, at, 1);
    expect([...kept.projected].sort((p, q) => p - q)).toEqual([0, 1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12]);
    expect(kept.places.get(6)).toEqual({ x: was[6].x, y: was[6].y });
  });

  it("lays a piece joined by one bond a bond long from the ring the way the drawing has it", () => {
    const { input, was } = ring(false);
    const kept = projectionsKept(input, was, () => true, at, 1);
    expect(kept.places.get(6)!.x).toBeCloseTo(0);
    expect(kept.places.get(6)!.y).toBeCloseTo(1);
  });

  it("is nothing for a Newman projection's atoms: they are not a ring system", () => {
    const d = newman({ methyl: 90, bromine: 210 }, { methyl: 270, bromine: 150 });
    const input = { atoms: d.atoms.map((a) => ({ el: a.el ?? "C", hs: a.hs })), bonds: d.bonds.map(({ a, b, order }) => ({ a, b, order })) };
    expect(projectionsKept(input, d.atoms, () => true, (i) => ({ x: i, y: 0 }), 1).projected.size).toBe(0);
  });
});

describe("Clean-up of a ring in perspective drawn with no depth, recognised as one (docs/EDITOR-2D.md, *Drawn in perspective*)", () => {
  // (the drawings above with their depth taken away, drawn bond by bond: a chair, and a Haworth ring with its groups vertical)
  const bare = (m: Model): Model => ({ ...m, atoms: m.atoms.map(({ z: _z, stereoCentre: _c, ...a }) => a) });

  it("leaves the ring where it is, stores no depth for it, and the structure is the same compound - with its configuration read", async () => {
    for (const [name, { model, ring }] of Object.entries(drawings)) {
      const drawn = bare(model);
      const laid = await laidOut(drawn, MENO);
      for (const id of ring) {
        const [was, now] = [drawn.atoms.find((a) => a.id === id)!, laid.atoms.find((a) => a.id === id)!];
        expect([now.x, now.y, now.z, !!now.stereoCentre], `${name} atom ${id}`).toEqual([was.x, was.y, undefined, false]);
      }
      expect(identityOfDrawn(laid).text, name).toBe(identityOfDrawn(drawn).text);
      // (and that is the compound drawn with depth, read as the convention has it - the lower atoms nearer; the test chairs are drawn seen
      // from below, so their depth reversed: the configuration read, not lost)
      const fromAbove: Model = name.includes("chair") ? { ...model, atoms: model.atoms.map((a) => (a.z != null ? { ...a, z: -a.z } : a)) } : model;
      expect(identityOfDrawn(laid).text, name).toBe(identityOfDrawn(fromAbove).text);
      expect(identityOfDrawn(laid).text, name).toContain("@");
      expect(laid.bonds.filter((b) => b.stereo === "up" || b.stereo === "down"), name).toEqual([]);
    }
  });

  it("tells 3D and a file the configuration read, with wedges, never the shape drawn: a reader of wedges alone reads the same compound", () => {
    for (const [name, { model }] of Object.entries(drawings)) {
      const drawn = bare(model);
      const told = forFlatReaders(drawn);
      expect(told.bonds.some((b) => b.stereo === "up" || b.stereo === "down"), name).toBe(true);
      // (as a reader that knows only wedges takes it: no depth, the places flat)
      // (the drawing had no depth: nothing to take away)
      const wedgesOnly: Model = { atoms: told.atoms.map((a) => ({ r: 0.9, ...a })) as Model["atoms"], bonds: told.bonds as Model["bonds"] };
      expect(wedgesOnly.atoms.every((a) => a.z == null), name).toBe(true);
      expect(identityOfDrawn(wedgesOnly).text, name).toBe(identityOfDrawn(drawn).text);
    }
  });

  it("leaves a ring taken for one in perspective but not read where it is too - stood on its side, no mark - storing no depth", async () => {
    const drawn = bare(drawings["a chair of cis-1,2-dimethylcyclohexane"].model);
    const side: Model = { ...drawn, atoms: drawn.atoms.map((a) => ({ ...a, x: -a.y, y: a.x })) };
    const laid = await laidOut(side, MENO);
    for (const id of [1, 2, 3, 4, 5, 6]) {
      const [was, now] = [side.atoms.find((a) => a.id === id)!, laid.atoms.find((a) => a.id === id)!];
      expect([now.x, now.y, now.z], `atom ${id}`).toEqual([was.x, was.y, undefined]);
    }
  });

  it("lays a ring drawn flat out as ever: a regular hexagon is no projection", async () => {
    const hexagon: Model = {
      atoms: [...[...Array(6)].map((_, k) => ({ id: k + 1, el: "C", x: Math.cos((k * Math.PI) / 3) + 0.2 * (k % 2), y: Math.sin((k * Math.PI) / 3), r: 0.9 })), { id: 7, el: "O", x: 2.3, y: 0, r: 0.9 }],
      bonds: [...[...Array(6)].map((_, k) => ({ id: 100 + k, a: k + 1, b: ((k + 1) % 6) + 1, order: 1 as const })), { id: 106, a: 1, b: 7, order: 1 as const }],
    };
    const laid = await laidOut(hexagon, MENO);
    // (laid out by the engine: its bonds the style's length, which the drawing's were not)
    const [a, b] = [laid.atoms.find((x) => x.id === 1)!, laid.atoms.find((x) => x.id === 2)!];
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeCloseTo(NOMINAL_BOND_LENGTH, 3);
  });
});
