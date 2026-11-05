import { describe, expect, it } from "vitest";
import { layout2D, measureLaidOut } from "./engine";
import { perceive } from "./perceive";
import { drawnRingSets } from "./ringSets";
import { closedFaces, schlegel, schlegelFaces } from "./schlegel";
import { c60, cubaneOpened, dodecahedrane, honeycombTorus, k5, prism, prismPinched, propellane, pyramid, truncatedDodecahedron, truncatedOctahedron } from "./testdata/polyhedra";
import { fromSmiles } from "./testdata/fromSmiles";

describe("a ring system that closes on itself", () => {
  it("has its faces found: C60's twelve pentagons and twenty hexagons, the last the one its smallest rings leave out", () => {
    const mol = perceive(c60());
    expect(mol.n).toBe(60);
    const faces = closedFaces(mol, mol.systems[0])!;
    expect(faces).toHaveLength(32);
    expect(faces.filter((f) => f.length === 5)).toHaveLength(12);
    expect(faces.filter((f) => f.length === 6)).toHaveLength(20);
    // (round each face in order: each atom bonded to the next)
    for (const f of faces) f.forEach((a, i) => expect(mol.neighbours[a]).toContain(f[(i + 1) % f.length]));
  });

  it("is no closed surface where its rings are fused flat, and is drawn as a cage at twenty atoms or fewer", () => {
    // (naphthalene's edge round both rings is the face they leave out, ten long; and two of its atoms have three bonds)
    for (const smiles of ["c1ccc2ccccc2c1", "c1ccc2cc3ccccc3cc2c1", "C1CC2CCC1C2"]) {
      const m = perceive(fromSmiles(smiles));
      expect(closedFaces(m, m.systems[0]), smiles).toBeNull();
    }
    const cubane = perceive(fromSmiles("C12C3C4C1C5C2C3C45"));
    expect(closedFaces(cubane, cubane.systems[0])).not.toBeNull();
    expect(schlegelFaces(cubane, cubane.systems[0])).toBeNull();
    const d = perceive(dodecahedrane());
    expect(d.n).toBe(20);
    expect(closedFaces(d, d.systems[0])).toHaveLength(12);
    expect(schlegelFaces(d, d.systems[0])).toBeNull();
  });

  it("draws C60 as its Schlegel diagram: no bond crossing another, no atom on another or on a bond", () => {
    const input = c60();
    const m = measureLaidOut(input, layout2D(input));
    expect(m.crossings).toBe(0);
    expect(m.overlaps).toBe(0);
    expect(m.clashes).toBe(0);
  });

  it("is not tried flat with each of its smallest sets of rings, all of them alike seen through a face", () => {
    const mol = perceive(c60());
    let flat = 0;
    expect(drawnRingSets(mol, () => (flat++, { pos: new Map() }))).toBe(mol);
    expect(flat).toBe(0);
  });
});

describe("a ring system's rings that are no closed surface, each for one reason alone", () => {
  // (cubane's six faces: its five smallest rings, and the one they leave out; each case below its rings as given,
  //  every other condition met - so that each guard of closedFaces is the one that refuses it)
  const cube = perceive(fromSmiles("C12C3C4C1C5C2C3C45"));
  const six = closedFaces(cube, cube.systems[0])!;
  const top = six[5];
  const bottom = six.find((f) => !f.some((a) => top.includes(a)))!;
  const sides = six.filter((f) => f !== top && f !== bottom);
  const withRings = (rings: number[][]) => {
    const mol = { ...cube, rings };
    return closedFaces(mol, { ...cube.systems[0], rings: rings.map((_, i) => i) });
  };

  it("is as found where its rings are the five smallest - the sixth the one they leave out", () => {
    expect(withRings(six.slice(0, 5))).toHaveLength(6);
  });

  it("is none where a bond lies in three rings: a face counted twice, the face it is across from left out", () => {
    expect(sides).toHaveLength(4);
    expect(withRings([...six.slice(0, 5), bottom])).toBeNull();
  });

  it("is none where no bond lies in one ring only: all six faces given, none left out", () => {
    expect(withRings(six)).toBeNull();
  });

  it("is none where the bonds in one ring only go round two faces, not one: the four sides of a box, its top and bottom left out", () => {
    expect(withRings(sides)).toBeNull();
  });
});

describe("a closed surface, of any faces", () => {
  it("is drawn through its largest face whatever its faces - triangles and decagons, squares and hexagons - and at 21 atoms or more", () => {
    for (const [name, input] of [
      ["truncated dodecahedron", truncatedDodecahedron()],
      ["truncated octahedron", truncatedOctahedron()],
      ["an 11-gonal prism (22 atoms)", prism(11)],
      ["the same, two of its atoms made one (21)", prismPinched(11)],
      // (a polyhedron with one face larger than every other: that face round the outside)
      ["a 20-gonal pyramid", pyramid(20)],
    ] as const) {
      const mol = perceive(input);
      expect(schlegelFaces(mol, mol.systems[0]), name).not.toBeNull();
      const m = measureLaidOut(input, layout2D(input));
      expect([m.crossings, m.overlaps, m.clashes], name).toEqual([0, 0, 0]);
    }
    // (a closed surface of twenty atoms: laid out as before)
    const p10 = perceive(prism(10));
    expect(closedFaces(p10, p10.systems[0])).not.toBeNull();
    expect(schlegelFaces(p10, p10.systems[0])).toBeNull();
  });

  it("is seen through its largest face: the truncated dodecahedron's decagon round the outside, not a triangle", () => {
    const mol = perceive(truncatedDodecahedron());
    const sys = mol.systems[0];
    const pos = schlegel(mol, sys, closedFaces(mol, sys)!);
    // (the atoms on the drawing's outer edge: its convex hull)
    const pts = [...pos.values()];
    const hull = pts.filter((p) => pts.every((q) => q === p || Math.hypot(q.x, q.y) <= Math.hypot(p.x, p.y) + 1e-9));
    expect(hull).toHaveLength(10);
  });

  it("has bonds one long on average, more even than Tutte's drawing alone", () => {
    const mol = perceive(c60());
    const sys = mol.systems[0];
    const faces = closedFaces(mol, sys)!;
    const spread = (pos: Map<number, { x: number; y: number }>) => {
      const lengths = mol.bonds.map((b) => Math.hypot(pos.get(b.a)!.x - pos.get(b.b)!.x, pos.get(b.a)!.y - pos.get(b.b)!.y));
      const mean = lengths.reduce((x, y) => x + y, 0) / lengths.length;
      return { mean, cv: Math.sqrt(lengths.reduce((x, y) => x + (y - mean) ** 2, 0) / lengths.length) / mean };
    };
    const drawn = spread(schlegel(mol, sys, faces));
    expect(drawn.mean).toBeCloseTo(1, 9);
    expect(drawn.cv).toBeLessThan(spread(schlegel(mol, sys, faces, [1])).cv - 0.05);
  });

  it("is none where a bond lies in three rings, an atom has two bonds, or it closes round a torus", () => {
    for (const [name, input] of [
      ["K5, every atom bonded to every other", k5()],
      ["[1.1.1]propellane", propellane()],
      ["cubane with a CH2 in one bond", cubaneOpened()],
      ["a honeycomb torus", honeycombTorus(3, 4)],
    ] as const) {
      const mol = perceive(input);
      expect(closedFaces(mol, mol.systems[0]), name).toBeNull();
    }
  });
});
