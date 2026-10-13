import { describe, expect, it } from "vitest";
import { axialOut, cageCore, drawnAsChairOrBoat, keepsConfigurations, projectCage, putBackTurned, solidOf, type Vec3 } from "./cage";
import { readSmiles } from "../chem/smiles";
import { kekuleOrders } from "../chem/kekulize";
import { implicitHydrogens } from "../chem/molecule";
import { layout2D } from "./engine";
import { perceive, type LayoutInput } from "./perceive";

/** Carbons joined by the bonds given. */
const carbons = (n: number, bonds: [number, number, number?][]): LayoutInput => ({
  atoms: Array.from({ length: n }, () => ({ el: "C" })),
  bonds: bonds.map(([a, b, order]) => ({ a, b, order: order ?? 1 })),
});

// norbornane (0-6, the bridge 6 between 0 and 3) with a benzene ring fused on its side 1-2
const norbornane: [number, number][] = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [0, 6], [6, 3]];
const benzoNorbornene = carbons(11, [...norbornane, [1, 7, 2], [7, 8], [8, 9, 2], [9, 10], [10, 2, 2]]);

describe("a cage within a ring system", () => {
  it("is the rings bridged to one another, without the rings fused to them", () => {
    const mol = perceive(benzoNorbornene);
    const core = cageCore(mol, mol.systems[0])!;
    expect(core.atoms.sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("is none in a cage as a whole, or in rings only fused", () => {
    const cage = perceive(carbons(7, norbornane));
    expect(cageCore(cage, cage.systems[0])).toBeNull();
    const naphthalene = perceive(carbons(10, [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [4, 6], [6, 7], [7, 8], [8, 9], [9, 5]]));
    expect(cageCore(naphthalene, naphthalene.systems[0])).toBeNull();
  });

  it("is drawn flat where the whole lies flat without a fault", () => {
    expect(layout2D(benzoNorbornene).solid.some(Boolean)).toBe(false);
  });

  it("is drawn in perspective where the whole will not lie flat - adamantane with a ring fused on its side - every bond whole", () => {
    const fused: [number, number, number?][] = [
      [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [5, 6], [6, 7], [7, 8], [8, 1], [7, 9], [9, 3],
      [0, 10], [10, 11, 2], [11, 12], [12, 13, 2], [13, 14], [14, 1],
    ];
    const input = carbons(15, fused);
    // (the cage in perspective; the ring fused on its side, with its double
    // bonds, flat onto it)
    const { x, y, depth } = layout2D(input);
    expect(depth.slice(0, 10).every((d) => d != null)).toBe(true);
    for (const { a, b } of input.bonds) expect(Math.hypot(x[a] - x[b], y[a] - y[b])).toBeGreaterThan(0.6);
    // (the whole engine on the fused adamantane: about a second alone, a few
    // times that on a machine busy with the rest of the tests)
  }, 30_000);
});

describe("a six-membered ring drawn as a chair or a boat", () => {
  // the template's chair: two zigzags 15 degrees off level, joined by two bonds 60 degrees steep
  const c = Math.cos((15 * Math.PI) / 180);
  const s = Math.sin((15 * Math.PI) / 180);
  const o = { x: -Math.cos(Math.PI / 3), y: -Math.sin(Math.PI / 3) };
  const chair = [
    { x: 0, y: 0 },
    { x: c, y: s },
    { x: c + o.x, y: s + o.y },
    { x: o.x, y: o.y + 2 * s },
    { x: -c + o.x, y: s + o.y },
    { x: -c, y: s },
  ];
  it("is told by its shape, any way round, mirrored or at any size", () => {
    const turned = chair.map((p) => ({ x: 3 * (p.x * Math.cos(1) - p.y * Math.sin(1)) + 5, y: 3 * (p.x * Math.sin(1) + p.y * Math.cos(1)) - 2 }));
    expect(drawnAsChairOrBoat(turned)).toBe(true);
    expect(drawnAsChairOrBoat(chair.map((p) => ({ x: -p.x, y: p.y })))).toBe(true);
    expect(drawnAsChairOrBoat([...chair.slice(2), ...chair.slice(0, 2)].reverse())).toBe(true);
  });

  it("is not a regular hexagon, nor a chair pulled out of its shape", () => {
    const hexagon = Array.from({ length: 6 }, (_, k) => ({ x: Math.cos((k * Math.PI) / 3), y: Math.sin((k * Math.PI) / 3) }));
    expect(drawnAsChairOrBoat(hexagon)).toBe(false);
    expect(drawnAsChairOrBoat(chair.map((p, k) => (k === 3 ? { x: p.x + 0.25, y: p.y + 0.2 } : p)))).toBe(false);
  });
});

describe("a solid found from its bonds", () => {
  const fromSmiles = (smiles: string) => {
    const s = readSmiles(smiles);
    const orders = kekuleOrders(s.atoms, s.bonds);
    const sum = s.atoms.map(() => 0);
    s.bonds.forEach((b, i) => ([sum[b.a1], sum[b.a2]] = [sum[b.a1] + orders[i], sum[b.a2] + orders[i]]));
    return perceive({
      atoms: s.atoms.map((a, i) => ({ el: a.el, hs: a.hs ?? implicitHydrogens(a.el, sum[i]), ...(a.tetra ? { tetra: a.tetra } : {}) })),
      bonds: s.bonds.map((b, i) => ({ a: b.a1, b: b.a2, order: orders[i] })),
    });
  };
  const sub = (p: Vec3, q: Vec3): Vec3 => [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
  const cross = (p: Vec3, q: Vec3): Vec3 => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];
  const dot = (p: Vec3, q: Vec3) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
  /** The torsion a-b-c-d, in degrees. */
  const torsion = (X: Map<number, Vec3>, a: number, b: number, c: number, d: number) => {
    const [pa, pb, pc, pd] = [a, b, c, d].map((v) => X.get(v)!);
    const n1 = cross(sub(pb, pa), sub(pc, pb));
    const n2 = cross(sub(pc, pb), sub(pd, pc));
    const b2 = sub(pc, pb);
    const m = cross(n1, b2.map((v) => v / Math.hypot(...b2)) as Vec3);
    return (Math.atan2(dot(m, n2), dot(n1, n2)) * 180) / Math.PI;
  };
  const angle = (X: Map<number, Vec3>, a: number, b: number, c: number) => {
    const u = sub(X.get(a)!, X.get(b)!);
    const v = sub(X.get(c)!, X.get(b)!);
    return (Math.acos(dot(u, v) / Math.hypot(...u) / Math.hypot(...v)) * 180) / Math.PI;
  };

  it("has cocaine's six-membered ring the chair it is, its torsions turning each way in turn", () => {
    // (eased from several placements: from the rough one alone, its angles
    // its own, it came out a boat)
    const mol = fromSmiles("CN1[C@H]2CC[C@@H]1[C@H]([C@H](C2)OC(=O)c1ccccc1)C(=O)OC");
    const sys = mol.systems.find((x) => x.atoms.includes(1))!;
    const X = solidOf(mol, sys);
    const ring = mol.rings.find((r) => r.length === 6 && r.includes(1))!;
    const t = ring.map((_, i) => torsion(X, ...([0, 1, 2, 3].map((k) => ring[(i + k) % 6]) as [number, number, number, number])));
    t.forEach((v, i) => {
      expect(Math.abs(v)).toBeGreaterThan(35);
      expect(Math.sign(v)).not.toBe(Math.sign(t[(i + 1) % 6]));
    });
  });

  it("keeps a double bond and its neighbours in one plane, at 120 degrees", () => {
    // cyclohexene: C1=C2 (atoms 0 and 1), their neighbours in the ring 5 and 2
    const mol = fromSmiles("C1=CCCCC1");
    const X = solidOf(mol, mol.systems[0]);
    expect(Math.abs(torsion(X, 5, 0, 1, 2))).toBeLessThan(5);
    expect(angle(X, 5, 0, 1)).toBeCloseTo(120, -1);
    expect(angle(X, 0, 1, 2)).toBeCloseTo(120, -1);
  });

  it("is found once for a molecule perceived anew, as a drawing read back is - and anew for its mirror image", () => {
    const cocaine = "CN1[C@H]2CC[C@@H]1[C@H]([C@H](C2)OC(=O)c1ccccc1)C(=O)OC";
    const solid = (smiles: string) => {
      const mol = fromSmiles(smiles);
      return solidOf(mol, mol.systems.find((x) => x.atoms.includes(1))!);
    };
    const once = solid(cocaine);
    const again = solid(cocaine);
    for (const [a, p] of once) expect(again.get(a)).toBe(p);
    // (the other enantiomer: every centre turned, the solid its mirror image)
    const mirror = solid(cocaine.replace(/@@|@/g, (m) => (m === "@" ? "@@" : "@")));
    for (const [a, p] of once) expect(mirror.get(a)).not.toBe(p);
    const [i, j, k, l] = [...once.keys()];
    const volume = (X: Map<number, Vec3>) => dot(sub(X.get(j)!, X.get(i)!), cross(sub(X.get(k)!, X.get(i)!), sub(X.get(l)!, X.get(i)!)));
    expect(Math.sign(volume(mirror))).toBe(-Math.sign(volume(once)));
  });
});

describe("a six-membered ring fused on a bond to a cage", () => {
  const input = (smiles: string): LayoutInput => {
    const s = readSmiles(smiles);
    const orders = kekuleOrders(s.atoms, s.bonds);
    const sum = s.atoms.map(() => 0);
    s.bonds.forEach((b, i) => ([sum[b.a1], sum[b.a2]] = [sum[b.a1] + orders[i], sum[b.a2] + orders[i]]));
    return {
      atoms: s.atoms.map((a, i) => ({ el: a.el, hs: a.hs ?? implicitHydrogens(a.el, sum[i]) })),
      bonds: s.bonds.map((b, i) => ({ a: b.a1, b: b.a2, order: orders[i] })),
    };
  };

  it("is drawn as the chair the solid has it as, beside the cage, not flat", () => {
    // a cyclohexane fused to adamantane: its atoms 0-3 and the two it shares
    const g = input("C1CCC2C3CC4CC(C3)CC2(C4)C1");
    const { x, y, depth } = layout2D(g);
    const mol = perceive(g);
    const ring = mol.rings.find((r) => r.length === 6 && r.includes(0))!;
    expect(ring.every((a) => depth[a] != null)).toBe(true);
    expect(drawnAsChairOrBoat(ring.map((a) => ({ x: x[a], y: y[a] })))).toBe(true);
    // (the whole engine on the cage with its chair: about a second alone, a few
    // times that on a machine busy with the rest of the tests)
  }, 30_000);

  it("has a group axial to that chair drawn along the chair's upright", () => {
    // (one methyl of a gem pair on the fused ring is axial; drawn as the
    // template has it - its upright 75 or 105 degrees from each level
    // bond, 30 or 150 from each steep one - the ring turned as its bond to
    // the cage lies)
    const g = input("CC1(C)CCC2C3CC4CC(C3)CC2(C4)C1");
    const { x, y } = layout2D(g);
    const mol = perceive(g);
    const sys = mol.systems[0];
    const ring = mol.rings.find((r) => r.length === 6 && r.includes(1))!;
    const axial = axialOut(mol, sys, ring, solidOf(mol, sys));
    expect(axial.length).toBeGreaterThan(0);
    const angle = (ax: number, ay: number, bx: number, by: number) =>
      (Math.acos(Math.abs(ax * bx + ay * by) / Math.hypot(ax, ay) / Math.hypot(bx, by)) * 180) / Math.PI;
    // (either methyl of the pair: the two are alike, and which of them the
    // solid has axial goes by the order the atoms are laid out in)
    for (const { from } of axial) {
      const upright = mol.neighbours[from].filter((to) => {
        if (ring.includes(to)) return false;
        const [ux, uy] = [x[to] - x[from], y[to] - y[from]];
        return ring.every((a, k) => {
          const b = ring[(k + 1) % 6];
          const t = angle(ux, uy, x[b] - x[a], y[b] - y[a]);
          return Math.min(Math.abs(t - 30), Math.abs(t - 75)) < 4;
        });
      });
      expect(upright).toHaveLength(1);
    }
    // (the whole engine on the cage with its chair: about a second alone, a few
    // times that on a machine busy with the rest of the tests)
  }, 30_000);
});

describe("a solid's configurations", () => {
  // a centre and three of its neighbours, the fourth an H not drawn
  const input: LayoutInput = {
    atoms: [{ el: "C", tetra: { neighbours: [1, 2, 3, -1], volume: 1 } }, { el: "C" }, { el: "C" }, { el: "C" }],
    bonds: [
      { a: 0, b: 1, order: 1 },
      { a: 0, b: 2, order: 1 },
      { a: 0, b: 3, order: 1 },
    ],
  };
  const mol = perceive(input);
  const pos = new Map([
    [0, { x: 0, y: 0 }],
    [1, { x: 1, y: 0 }],
    [2, { x: 0, y: 1 }],
    [3, { x: -0.5, y: -0.5 }],
  ]);

  it("are as given in a solid found from bond distances, a ring fusion those make trans turned cis", () => {
    // tetrodotoxin: its guanidine ring joins its cage at C4a, whose
    // configuration the distances alone leave the wrong way round
    const s = readSmiles("C([C@@]1([C@H]2[C@@H]3[C@H](N=C(N[C@@]34[C@@H]([C@@H]1O[C@]([C@H]4O)(O2)O)O)N)O)O)O");
    const orders = kekuleOrders(s.atoms, s.bonds);
    const sum = s.atoms.map(() => 0);
    s.bonds.forEach((b, i) => ([sum[b.a1], sum[b.a2]] = [sum[b.a1] + orders[i], sum[b.a2] + orders[i]]));
    const ttx = perceive({
      atoms: s.atoms.map((a, i) => ({ el: a.el, hs: a.hs ?? implicitHydrogens(a.el, sum[i]), ...(a.tetra ? { tetra: a.tetra } : {}) })),
      bonds: s.bonds.map((b, i) => ({ a: b.a1, b: b.a2, order: orders[i] })),
    });
    const sys = ttx.systems.find((x) => x.atoms.length === 14)!;
    const view = projectCage(ttx, sys);
    expect(keepsConfigurations(ttx, sys.atoms, view.pos, view.depth)).toBe(true);
  });

  it("are kept where the solid has the centre as given, and not where it has its mirror image", () => {
    const near = new Map([[0, 0], [1, 0], [2, 0], [3, 1]]);
    const far = new Map([[0, 0], [1, 0], [2, 0], [3, -1]]);
    expect(keepsConfigurations(mol, [0, 1, 2, 3], pos, near)).toBe(true);
    expect(keepsConfigurations(mol, [0, 1, 2, 3], pos, far)).toBe(false);
  });

  it("are put back where the easing turned one: the centre where the solid has it, unless the template holds it", () => {
    const atoms = [0, 1, 2, 3];
    const anchors = atoms.map((a) => pos.get(a)!);
    const depth = [0, 0, 0, 1];
    // (eased past its neighbours' line, the centre reads the other way)
    const eased = () => [{ x: 1, y: 1 }, ...anchors.slice(1)];
    const near = new Map(atoms.map((a, i) => [a, depth[i]]));
    expect(keepsConfigurations(mol, atoms, new Map(atoms.map((a, i) => [a, eased()[i]])), near)).toBe(false);
    const pts = eased();
    expect(putBackTurned(mol, atoms, pts, depth, anchors)).toBe(1);
    expect(pts[0]).toEqual(anchors[0]);
    expect(keepsConfigurations(mol, atoms, new Map(atoms.map((a, i) => [a, pts[i]])), near)).toBe(true);
    const held = eased();
    expect(putBackTurned(mol, atoms, held, depth, anchors, new Set([0]))).toBe(0);
    expect(held[0]).toEqual({ x: 1, y: 1 });
  });
});

describe("a cage eased onto its template", () => {
  it("keeps atoms not bonded to each other apart: scopolamine's tropane drawn as a solid, as cocaine's, no atom on another", () => {
    const s = readSmiles("CN1[C@@H]2CC(C[C@H]1[C@H]3[C@@H]2O3)OC(=O)[C@H](CO)C4=CC=CC=C4");
    const orders = kekuleOrders(s.atoms, s.bonds);
    const sum = s.atoms.map(() => 0);
    s.bonds.forEach((b, i) => ([sum[b.a1], sum[b.a2]] = [sum[b.a1] + orders[i], sum[b.a2] + orders[i]]));
    const input: LayoutInput = {
      atoms: s.atoms.map((a, i) => ({ el: a.el, hs: a.hs ?? implicitHydrogens(a.el, sum[i]), ...(a.tetra ? { tetra: a.tetra } : {}) })),
      bonds: s.bonds.map((b, i) => ({ a: b.a1, b: b.a2, order: orders[i] })),
    };
    const out = layout2D(input);
    const mol = perceive(input);
    const sys = mol.systems.find((x) => x.atoms.length === 9)!;
    expect(sys.atoms.every((a) => out.solid[a])).toBe(true);
    for (const a of sys.atoms)
      for (const b of sys.atoms) {
        if (a >= b || mol.neighbours[a].includes(b)) continue;
        expect(Math.hypot(out.x[a] - out.x[b], out.y[a] - out.y[b]), `${a}-${b}`).toBeGreaterThan(0.55);
      }
    // (the whole engine on the tropane: about a second alone, a few times
    // that on a machine busy with the rest of the tests)
  }, 30_000);
});
