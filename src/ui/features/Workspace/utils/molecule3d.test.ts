import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { STYLE_3D } from "../../../../lib/chem/style3d";
import type { Molecule3D } from "../store/types";
import {
  BODY_PX,
  asSeen,
  bondsAt,
  frameBondsOf,
  atomAt,
  bondAt,
  bondLines,
  chosenPath,
  frameOf,
  onMolecule,
  pictureMarks,
  poseOf,
  ringsOf,
  rowAbout,
  seenBounds,
  seenOnPage,
  solidOf,
  standingHeight,
  turnedInPlane,
  turnedTogether,
  WORLD_PER_ANGSTROM,
  RIBBON_REACH,
  coveredLength,
  labelSpot,
  populations,
  widestWay,
  type Turning3D,
} from "./molecule3d";
import type { SolidMark } from "../../../../lib/chem/layout2d";

/** Two carbons 1.5 Å apart along x, standing at `at`. */
const ethane = (at = { x: 0, y: 0 }): Molecule3D => ({
  id: 1,
  atoms: [
    { el: "C", x: 10, y: 5, z: 1 },
    { el: "C", x: 11.5, y: 5, z: 1 },
  ],
  bonds: [{ a1: 0, a2: 1, order: 1 }],
  at,
});

describe("a molecule in 3D as it is drawn", () => {
  it("is laid about its centre, a bond of 1.5 Å as long as a drawn one", () => {
    const s = solidOf(ethane(), STYLE_3D);
    expect(Array.from(s.frames[0])).toEqual([-0.75 * WORLD_PER_ANGSTROM, 0, 0, 0.75 * WORLD_PER_ANGSTROM, 0, 0].map((v) => expect.closeTo(v, 6)));
    // a carbon's ball: a fifth of its van der Waals radius (1.7 Å); space-filling, all of it
    expect(s.radii.primary[0]).toBeCloseTo(0.34 * WORLD_PER_ANGSTROM, 6);
    expect(s.radii.secondary[0]).toBeCloseTo(1.7 * WORLD_PER_ANGSTROM, 6);
    expect(s.reach.primary).toBeCloseTo((0.75 + 0.34) * WORLD_PER_ANGSTROM, 6);
    expect(s.reach.secondary).toBeCloseTo((0.75 + 1.7) * WORLD_PER_ANGSTROM, 6);
  });

  it("stands as high as it reaches, so that no turn takes it behind the page", () => {
    const s = solidOf(ethane(), STYLE_3D);
    expect(standingHeight(s)).toBeCloseTo(s.reach.primary, 9);
    expect(standingHeight(s, "secondary")).toBeCloseTo(s.reach.secondary, 9);
  });

  it("stands as high as a turn of several put it, where one did", () => {
    const m = ethane({ x: 0, y: 0, z: 7 } as Molecule3D["at"]);
    expect(poseOf(m, solidOf(m, STYLE_3D), "primary").height).toBe(7);
  });

  it("is seen straight from above by an orthographic camera - the canvas's - as large as it is, however high", () => {
    const m = ethane();
    const s = solidOf(m, STYLE_3D);
    const seen = seenOnPage(poseOf(m, s, "primary"));
    expect(seen[1].x).toBeCloseTo(0.75 * WORLD_PER_ANGSTROM, 6);
    expect(seen[1].r).toBeCloseTo(s.radii.primary[1], 6);
    expect(seen[1].z).toBeCloseTo(standingHeight(s), 6);
    // end on: one atom over the other, and the higher the one seen there
    const quarter = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
    const turn: [number, number, number, number] = [quarter.x, quarter.y, quarter.z, quarter.w];
    const end = seenOnPage(poseOf(m, s, "primary", turn));
    expect(end[0].x).toBeCloseTo(end[1].x, 6);
    expect(atomAt(poseOf(m, s, "primary", turn), undefined, 0, 0)).toBe(end[0].z > end[1].z ? 0 : 1);
    // and off to the side, as large and as far out as it is
    const aside = seenBounds(poseOf(ethane({ x: 20, y: 0 }), s, "primary"));
    expect((aside.minX + aside.maxX) / 2).toBeCloseTo(20, 6);
  });

  it("is seen larger than it would be lying on the page, being nearer the camera, in perspective", () => {
    const m = ethane();
    const s = solidOf(m, STYLE_3D);
    const seen = seenOnPage(poseOf(m, s, "primary"), new THREE.Vector3(0, 0, 60));
    const k = 60 / (60 - standingHeight(s));
    expect(seen[1].x).toBeCloseTo(0.75 * WORLD_PER_ANGSTROM * k, 6);
    expect(seen[1].r).toBeCloseTo(s.radii.primary[1] * k, 6);
    // turned a quarter about y, it is end on: one atom over the other
    const quarter = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
    const end = seenOnPage(poseOf(m, s, "primary", [quarter.x, quarter.y, quarter.z, quarter.w]), new THREE.Vector3(0, 0, 60));
    expect(end[0].x).toBeCloseTo(0, 6);
    expect(end[1].x).toBeCloseTo(0, 6);
    // and the nearer of the two is the one seen there
    expect(atomAt(poseOf(m, s, "primary", [quarter.x, quarter.y, quarter.z, quarter.w]), new THREE.Vector3(0, 0, 60), 0, 0)).toBe(end[0].z > end[1].z ? 0 : 1);
  });

  it("reaches further out on the page seen from off to its side, as perspective has it", () => {
    const m = ethane({ x: 20, y: 0 });
    const pose = poseOf(m, solidOf(m, STYLE_3D), "primary");
    const above = seenBounds(pose, { x: 20, y: 0, z: 60 });
    const aside = seenBounds(pose, { x: 0, y: 0, z: 60 });
    // the same size seen straight on, but out from the eye by its height's share
    expect(aside.maxX - aside.minX).toBeCloseTo(above.maxX - above.minX, 6);
    expect((aside.minX + aside.maxX) / 2).toBeCloseTo(20 * (60 / (60 - pose.height)), 4);
  });

  it("has its frames, each about its own centre, and reaches as far as any of them", () => {
    // (the second frame stretched, and moved: its centre is its own)
    const m = { ...ethane(), frames: [[0, 0, 0, 3, 0, 0], [1, 2]] };
    const s = solidOf(m, STYLE_3D);
    expect(s.frames).toHaveLength(2);
    expect(s.frames[1][0]).toBeCloseTo(-1.5 * WORLD_PER_ANGSTROM, 6);
    expect(s.reach.primary).toBeCloseTo((1.5 + 0.34) * WORLD_PER_ANGSTROM, 6);
    expect([frameOf(s, undefined), frameOf(s, 1), frameOf(s, 7), frameOf(s, -1)]).toEqual([0, 1, 1, 0]);
  });
});

describe("a molecule's bonds in 3D", () => {
  /** Ethene, flat in the xy plane, with its hydrogens. */
  const ethene = (): Molecule3D => ({
    id: 3,
    atoms: [
      { el: "C", x: 0, y: 0, z: 0 },
      { el: "C", x: 1.34, y: 0, z: 0 },
      { el: "H", x: -0.55, y: 0.95, z: 0 },
      { el: "H", x: 1.89, y: 0.95, z: 0 },
    ],
    bonds: [
      { a1: 0, a2: 1, order: 2 },
      { a1: 0, a2: 2, order: 1 },
      { a1: 1, a2: 3, order: 1 },
    ],
    at: { x: 0, y: 0 },
  });

  it("draws a single bond as one line, a double as two thinner, side by side in the plane of its atoms", () => {
    const m = ethene();
    const lines = bondLines(m, solidOf(m, STYLE_3D).frames[0], 0.1);
    expect(lines).toHaveLength(4);
    const [d1, d2] = lines;
    expect(d1.r).toBeLessThan(0.1);
    // apart across the bond, in the molecule's plane (z = 0)
    expect(Math.abs(d1.a.y - d2.a.y)).toBeGreaterThan(0.1);
    expect(d1.a.z).toBeCloseTo(0, 6);
    expect(d2.b.z).toBeCloseTo(0, 6);
  });

  it("draws a triple bond as three, about its axis", () => {
    const m: Molecule3D = {
      id: 4,
      atoms: [
        { el: "C", x: 0, y: 0, z: 0 },
        { el: "N", x: 1.16, y: 0, z: 0 },
      ],
      bonds: [{ a1: 0, a2: 1, order: 3 }],
      at: { x: 0, y: 0 },
    };
    const lines = bondLines(m, solidOf(m, STYLE_3D).frames[0], 0.1);
    expect(lines).toHaveLength(3);
    expect(lines[1].a.distanceTo(new THREE.Vector3(-0.58 * WORLD_PER_ANGSTROM, 0, 0))).toBeCloseTo(0, 6);
  });
});

/** Benzene's six carbons, flat, 1.4 Å apart, standing at the origin. */
const benzene = (): Molecule3D => ({
  id: 2,
  atoms: Array.from({ length: 6 }, (_, i) => ({
    el: "C",
    x: 1.4 * Math.cos((i * Math.PI) / 3),
    y: 1.4 * Math.sin((i * Math.PI) / 3),
    z: 0,
  })),
  bonds: Array.from({ length: 6 }, (_, i) => ({ a1: i, a2: (i + 1) % 6, order: 1 })),
  at: { x: 0, y: 0 },
});

describe("what a point is to a molecule in 3D", () => {
  const camera = new THREE.Vector3(0, 0, 60);
  const zoom = 20; // (pixels per world unit)
  it("finds its rings", () => {
    expect(ringsOf(benzene()).map((r) => [...r].sort())).toEqual([[0, 1, 2, 3, 4, 5]]);
    expect(ringsOf(ethane())).toEqual([]);
  });

  it("is on it on an atom, on a bond, and within a ring", () => {
    const m = benzene();
    const pose = poseOf(m, solidOf(m, STYLE_3D), "primary");
    const seen = seenOnPage(pose, camera);
    const on = (x: number, y: number) => onMolecule(m, pose, camera, x, y, zoom, STYLE_3D.primary.bondRadius);
    expect(on(seen[0].x, seen[0].y)).toBe(true);
    expect(on((seen[0].x + seen[1].x) / 2, (seen[0].y + seen[1].y) / 2)).toBe(true);
    expect(on(0, 0)).toBe(true);
  });

  it("is on it within BODY_PX outside its outline - room to take hold of it - and not beyond", () => {
    const m = benzene();
    const pose = poseOf(m, solidOf(m, STYLE_3D), "primary");
    const seen = seenOnPage(pose, camera);
    const on = (x: number, y: number) => onMolecule(m, pose, camera, x, y, zoom, STYLE_3D.primary.bondRadius);
    const edge = seen[0].x + seen[0].r;
    expect(on(edge + 2 / zoom, 0)).toBe(true);
    expect(on(edge + (BODY_PX - 1) / zoom, 0)).toBe(true);
    expect(on(edge + (BODY_PX + 4) / zoom, 0)).toBe(false);
  });

  it("finds the bond under a point between two atoms, and none on an atom's ball or within the ring", () => {
    const m = benzene();
    const pose = poseOf(m, solidOf(m, STYLE_3D), "primary");
    const seen = seenOnPage(pose, camera);
    const mid = { x: (seen[0].x + seen[1].x) / 2, y: (seen[0].y + seen[1].y) / 2 };
    expect(bondAt(m, pose, camera, mid.x, mid.y, STYLE_3D.primary.bondRadius)).toBe(0);
    expect(atomAt(pose, camera, mid.x, mid.y)).toBeNull();
    expect(bondAt(m, pose, camera, 0, 0, STYLE_3D.primary.bondRadius)).toBeNull();
  });
});

describe("what is chosen in a molecule, measured", () => {
  // butane's four carbons in a row, bonds 0-1, 1-2, 2-3
  const butane = { bonds: [0, 1, 2].map((i) => ({ a1: i, a2: i + 1, order: 1 })) };
  it("is the atoms chosen, two to four, in the order chosen", () => {
    expect(chosenPath(butane, { atoms: [2, 0], bonds: [] })).toEqual([2, 0]);
    expect(chosenPath(butane, { atoms: [0], bonds: [] })).toBeNull();
  });

  it("is a bond's two atoms, two bonds' angle and three bonds' torsion, chosen in any order", () => {
    expect(chosenPath(butane, { atoms: [], bonds: [1] })).toEqual([1, 2]);
    expect(chosenPath(butane, { atoms: [], bonds: [1, 0] })).toEqual([0, 1, 2]);
    expect(chosenPath(butane, { atoms: [], bonds: [2, 0, 1] })).toEqual([0, 1, 2, 3]);
  });

  it("goes on from a bond to an atom bonded to its end, and is nothing for bonds or atoms apart", () => {
    expect(chosenPath(butane, { atoms: [3], bonds: [1] })).toEqual([1, 2, 3]);
    expect(chosenPath(butane, { atoms: [], bonds: [0, 2] })).toBeNull();
    expect(chosenPath(butane, { atoms: [3], bonds: [0] })).toBeNull();
  });
});

describe("molecules turned together, as one body", () => {
  const q = (x: number, y: number, z: number, angle: number) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(x, y, z).normalize(), angle);
  const ms: Turning3D[] = [
    { id: 1, at: { x: -5, y: 0 }, standing: 2 },
    { id: 2, at: { x: 5, y: 1 }, standing: 3 },
    { id: 3, at: { x: 0, y: 6 }, standing: 2.5 },
  ];
  const where = (t: { at: { x: number; y: number; z?: number } }, standing: number) => new THREE.Vector3(t.at.x, t.at.y, t.at.z ?? standing);

  it("keeps how far each is from each other, and turns each with the whole", () => {
    const turn = q(1, 2, 0.5, 0.9);
    const out = turnedTogether(ms, turn);
    for (let i = 0; i < ms.length; i++) {
      for (let j = i + 1; j < ms.length; j++) {
        const before = where(ms[i], ms[i].standing).distanceTo(where(ms[j], ms[j].standing));
        expect(where(out[i], 0).distanceTo(where(out[j], 0))).toBeCloseTo(before, 9);
      }
      expect(new THREE.Quaternion(...out[i].turn).angleTo(turn)).toBeCloseTo(0, 6);
    }
  });

  it("rests on the page: the lowest for its reach as high as it stands alone", () => {
    const out = turnedTogether(ms, q(1, 0, 0, 1.2));
    const above = out.map((t, i) => t.at.z - ms[i].standing);
    expect(Math.min(...above)).toBeCloseTo(0, 9);
    expect(above.every((h) => h >= -1e-9)).toBe(true);
    // not turned at all, they stand as they did
    const still = turnedTogether(ms, new THREE.Quaternion());
    still.forEach((t, i) => expect(t.at).toEqual({ x: ms[i].at.x, y: ms[i].at.y, z: ms[i].standing }));
  });

  it("turned a half about the upright, swaps sides and faces about", () => {
    const two: Turning3D[] = [
      { id: 1, at: { x: -5, y: 0 }, standing: 2 },
      { id: 2, at: { x: 5, y: 0 }, standing: 2 },
    ];
    const out = turnedTogether(two, q(0, 1, 0, Math.PI));
    expect(out[0].at.x).toBeCloseTo(5, 9);
    expect(out[1].at.x).toBeCloseTo(-5, 9);
  });

  it("with a drawing, turns in its plane about its middle, each as high as it was", () => {
    const out = turnedInPlane([{ id: 1, at: { x: 2, y: 0, z: 4 }, standing: 2 }], { x: 0, y: 0 }, Math.PI / 2);
    expect(out[0].at.x).toBeCloseTo(0, 9);
    expect(out[0].at.y).toBeCloseTo(2, 9);
    expect(out[0].at.z).toBe(4);
    expect(new THREE.Quaternion(...out[0].turn).angleTo(q(0, 0, 1, Math.PI / 2))).toBeCloseTo(0, 6);
  });

  it("keeps their heights apart in a file for another program", () => {
    const a = asSeen({ ...ethane({ x: 0, y: 0, z: 0 } as Molecule3D["at"]) }, undefined, 0, true);
    const b = asSeen({ ...ethane({ x: 0, y: 0, z: 3 * WORLD_PER_ANGSTROM } as Molecule3D["at"]) }, undefined, 0, true);
    expect(b[0].z - a[0].z).toBeCloseTo(3, 9);
  });
});

describe("molecules placed in a row", () => {
  it("stand about the point, each clear of the next by a bond", () => {
    const at = rowAbout({ x: 0, y: 2 }, [3, 1]);
    expect(at).toEqual([
      // (9.8 wide in all: 6 and 2 across, and a bond, 1.8, between)
      { x: expect.closeTo(-1.9, 6), y: 2 },
      { x: expect.closeTo(3.9, 6), y: 2 },
    ]);
  });
});

describe("a molecule in 3D in a picture", () => {
  it("is balls and sticks from the back forward, the sticks cut back to their balls", () => {
    const m = { ...ethane({ x: 0, y: 0 }), atoms: [{ el: "C", x: 0, y: 0, z: 0 }, { el: "O", x: 1.5, y: 0, z: 1 }] };
    const marks = pictureMarks(m, STYLE_3D);
    expect(marks.map((x) => x.kind)).toEqual(["ball", "stick", "ball"]);
    const [far, stick, near] = marks as [Extract<SolidMark, { kind: "ball" }>, Extract<SolidMark, { kind: "stick" }>, Extract<SolidMark, { kind: "ball" }>];
    // the nearer is the O, larger as it is nearer
    expect(near.color).not.toBe(far.color);
    expect(stick.a.x).toBeGreaterThan(far.c.x);
    expect(stick.b.x).toBeLessThan(near.c.x);
  });

  it("is balls alone, space-filling", () => {
    const marks = pictureMarks({ ...ethane(), look: "secondary" }, STYLE_3D);
    expect(marks.every((x) => x.kind === "ball")).toBe(true);
  });
});

describe("a molecule in 3D drawn without the hydrogens on its carbons", () => {
  // methanol: H3C-OH, the carbon's hydrogens out along -x, the oxygen's along +x
  const methanol = (): Molecule3D => ({
    id: 1,
    atoms: [
      { el: "C", x: 0, y: 0, z: 0 },
      { el: "O", x: 1.43, y: 0, z: 0 },
      { el: "H", x: -0.4, y: 1, z: 0 },
      { el: "H", x: -0.4, y: -0.5, z: 0.9 },
      { el: "H", x: -0.4, y: -0.5, z: -0.9 },
      { el: "H", x: 2.4, y: 0, z: 0 },
    ],
    bonds: [
      { a1: 0, a2: 1, order: 1 },
      { a1: 0, a2: 2, order: 1 },
      { a1: 0, a2: 3, order: 1 },
      { a1: 0, a2: 4, order: 1 },
      { a1: 1, a2: 5, order: 1 },
    ],
    at: { x: 0, y: 0 },
  });
  const hiding = { ...STYLE_3D, primary: { ...STYLE_3D.primary, hydrogens: "carbonHidden" as const } };

  it("draws them at no size in the look that hides them, and reaches only as far as what it draws", () => {
    const s = solidOf(methanol(), hiding);
    expect([...s.hidden.primary]).toEqual([0, 0, 1, 1, 1, 0]);
    expect([...s.hidden.secondary]).toEqual([0, 0, 0, 0, 0, 0]);
    expect([0, 1, 2, 3, 4, 5].map((i) => s.radii.primary[i] > 0)).toEqual([true, true, false, false, false, true]);
    expect(s.reach.primary).toBeLessThan(solidOf(methanol(), STYLE_3D).reach.primary + 1e-9);
  });

  it("leaves them and their bonds out of a picture, and out of where it reaches on the page", () => {
    const m = methanol();
    const marks = pictureMarks(m, hiding);
    expect(marks.filter((x) => x.kind === "ball")).toHaveLength(3);
    expect(marks.filter((x) => x.kind === "stick")).toHaveLength(2);
    const all = seenBounds(poseOf(m, solidOf(m, STYLE_3D), "primary"));
    const some = seenBounds(poseOf(m, solidOf(m, hiding), "primary"));
    // (the carbon's hydrogens out to the left: it reaches less far that way)
    expect(some.minX).toBeGreaterThan(all.minX);
    expect(some.maxX).toBeCloseTo(all.maxX, 6);
    // and the pointer finds nothing where one of them would be
    const h = seenOnPage(poseOf(m, solidOf(m, hiding), "primary"))[2];
    expect(atomAt(poseOf(m, solidOf(m, hiding), "primary"), undefined, h.x + 0.01, h.y)).not.toBe(2);
  });
});

describe("a biopolymer's molecule in 3D, its chains as ribbons", () => {
  // three residues of a chain, an alpha carbon each, 3.8 A apart
  const chain = (): Molecule3D => ({
    id: 1,
    atoms: [0, 1, 2].map((k) => ({ el: "C", x: 3.8 * k, y: 0, z: 0 })),
    bonds: [],
    at: { x: 0, y: 0 },
    biopolymer: {
      names: ["CA", "CA", "CA"],
      residueOf: [0, 1, 2],
      residues: [1, 2, 3].map((seq) => ({ name: "ALA", chain: "A", seq, iCode: "", standard: true })),
      structure: ["helix", "helix", null],
    },
  });

  it("draws none of the chain's atoms, but reaches - and is found under the pointer - as far as its ribbon does", () => {
    const m = chain();
    const s = solidOf(m, STYLE_3D);
    expect(s.ribbons).toEqual({ primary: true, secondary: false });
    expect([...s.radii.primary]).toEqual([0, 0, 0]);
    expect(s.extent.primary[0]).toBeCloseTo(RIBBON_REACH * WORLD_PER_ANGSTROM, 6);
    expect(s.hidesH.primary).toBe(false);
    const pose = poseOf(m, s, "primary");
    expect(atomAt(pose, undefined, 0, 0)).toBe(1);
  });

  it("is drawn in a picture as sticks along its ribbon, in the ribbon's colours", () => {
    const marks = pictureMarks(chain(), STYLE_3D);
    expect(marks.length).toBeGreaterThan(2);
    expect(marks.every((x) => x.kind === "stick")).toBe(true);
  });
});

describe("widestWay", () => {
  const near = (v: { x: number; y: number }, x: number, y: number) => {
    expect(v.x).toBeCloseTo(x);
    expect(v.y).toBeCloseTo(y);
  };

  it("goes halfway across the widest gap between the neighbours", () => {
    // (three bonds, two of them close together on the right: out to the left)
    near(widestWay([-0.3, 0.3, Math.PI / 2]), Math.cos((Math.PI / 2 + 2 * Math.PI - 0.3) / 2), Math.sin((Math.PI / 2 + 2 * Math.PI - 0.3) / 2));
  });

  it("goes straight away from a lone neighbour, and up between two opposite ones", () => {
    near(widestWay([0]), -1, 0);
    near(widestWay([0, Math.PI]), 0, -1);
  });

  it("goes up and to the right with no neighbours", () => {
    near(widestWay([]), Math.SQRT1_2, -Math.SQRT1_2);
  });
});

describe("labelSpot", () => {
  const o = { x: 100, y: 100 };
  const half = { x: 12, y: 6 };
  const right = { x: 1, y: 0 };

  // (how far a box's nearest point is from a point)
  const gapTo = (p: { x: number; y: number }, b: { x: number; y: number; hx: number; hy: number }) =>
    Math.hypot(Math.max(Math.abs(p.x - b.x) - b.hx, 0), Math.max(Math.abs(p.y - b.y) - b.hy, 0));

  it("stands the way preferred, its nearest edge the reach away, when nothing is there", () => {
    const spot = labelSpot(o, 10, half, right, [], []);
    expect(spot.x).toBeCloseTo(122);
    expect(spot.y).toBeCloseTo(100);
    // (on a slant too: its corner no nearer its atom than the reach)
    const slant = labelSpot(o, 10, half, { x: Math.SQRT1_2, y: -Math.SQRT1_2 }, [], []);
    expect(gapTo(o, slant)).toBeCloseTo(10);
  });

  it("goes round to the nearest clear way when an atom is in the way - one in front of it, say", () => {
    const spot = labelSpot(o, 10, half, right, [{ x: 124, y: 100, r: 8 }], []);
    const clear = (b: { x: number; y: number; r: number }) =>
      Math.hypot(Math.max(Math.abs(b.x - spot.x) - spot.hx, 0), Math.max(Math.abs(b.y - spot.y) - spot.hy, 0)) >= b.r;
    expect(clear({ x: 124, y: 100, r: 8 })).toBe(true);
    // (still on the preferred side: up or down a little, not round to the left)
    expect(spot.x).toBeGreaterThan(o.x);
  });

  it("keeps clear of the labels already placed", () => {
    const first = labelSpot(o, 10, half, right, [], []);
    const second = labelSpot({ x: 104, y: 100 }, 10, half, right, [], [first]);
    const overlap = Math.abs(second.x - first.x) < 24 && Math.abs(second.y - first.y) < 12;
    expect(overlap).toBe(false);
  });

  it("goes a little further out, the same way round, when every way at the reach is taken", () => {
    // (a ring of small atoms just beyond the reach, all the way round)
    const ring = Array.from({ length: 48 }, (_, k) => ({ x: 100 + 13 * Math.cos((k * Math.PI) / 24), y: 100 + 13 * Math.sin((k * Math.PI) / 24), r: 1.5 }));
    const spot = labelSpot(o, 10, half, right, ring, []);
    expect(ring.every((b) => gapTo(b, spot) >= b.r)).toBe(true);
    expect(spot.x).toBeGreaterThan(o.x);
  });

  it("would sooner touch two atoms at their edges than hide one", () => {
    // (one atom right where the label would go, two others touching every other way)
    const balls = [
      { x: 122, y: 100, r: 6 },
      ...Array.from({ length: 23 }, (_, k) => {
        const a = ((k + 1) * Math.PI) / 12;
        return { x: 100 + 24 * Math.cos(a), y: 100 + 24 * Math.sin(a), r: 3 };
      }),
    ];
    const spot = labelSpot(o, 10, half, right, balls, []);
    expect(gapTo({ x: 122, y: 100 }, spot)).toBeGreaterThan(0);
  });

  it("takes the way that covers least where none is clear", () => {
    const ring = Array.from({ length: 24 }, (_, k) => ({ x: 100 + 30 * Math.cos((k * Math.PI) / 12), y: 100 + 30 * Math.sin((k * Math.PI) / 12), r: k === 6 ? 2 : 12 }));
    const spot = labelSpot(o, 10, half, right, ring, []);
    // (the small one is straight down, on a screen)
    expect(spot.y).toBeGreaterThan(o.y);
    expect(Math.abs(spot.x - o.x)).toBeLessThan(1e-9);
  });

  it("keeps off a bond in the way - one running past where it would stand - when another way is clear", () => {
    // (a bond up and down the screen, just right of the atom, through the preferred place)
    const bond = { a: { x: 120, y: 60 }, b: { x: 120, y: 140 }, r: 2 };
    const spot = labelSpot(o, 10, half, right, [], [], [bond]);
    expect(coveredLength(spot, bond)).toBe(0);
    // without it, the label stands across it
    expect(coveredLength(labelSpot(o, 10, half, right, [], []), bond)).toBeGreaterThan(0);
  });

  it("would sooner lie over a bond than hide an atom", () => {
    // (every way out has a bond across it but the one blocked by an atom)
    const spokes = Array.from({ length: 24 }, (_, k) => {
      const a = (k * Math.PI) / 12 + Math.PI / 24;
      return { a: { x: 100 + 14 * Math.cos(a), y: 100 + 14 * Math.sin(a) }, b: { x: 100 + 40 * Math.cos(a), y: 100 + 40 * Math.sin(a) }, r: 1.5 };
    });
    const atom = { x: 122, y: 100, r: 8 };
    const spot = labelSpot(o, 10, half, right, [atom], [], spokes);
    expect(gapTo(atom, spot)).toBeGreaterThanOrEqual(atom.r);
  });
});

describe("coveredLength", () => {
  const box = { x: 0, y: 0, hx: 10, hy: 5 };
  it("is how much of a bond's line lies within a box, grown by the bond's half width", () => {
    expect(coveredLength(box, { a: { x: -20, y: 0 }, b: { x: 20, y: 0 }, r: 0 })).toBeCloseTo(20);
    expect(coveredLength(box, { a: { x: -20, y: 0 }, b: { x: 20, y: 0 }, r: 1 })).toBeCloseTo(22);
    expect(coveredLength(box, { a: { x: 0, y: -20 }, b: { x: 0, y: 0 }, r: 0 })).toBeCloseTo(5);
    // (past it, or beside it beyond its half width: none)
    expect(coveredLength(box, { a: { x: 11, y: -20 }, b: { x: 11, y: 20 }, r: 0.5 })).toBe(0);
    expect(coveredLength(box, { a: { x: -20, y: 9 }, b: { x: 20, y: 9 }, r: 1 })).toBe(0);
  });
});

describe("populations", () => {
  const HARTREE = 627.509474;
  it("shares a conformer set by Boltzmann at room temperature, adding up to one", () => {
    expect(populations([0, 0])).toEqual([0.5, 0.5]);
    // 1.364 kcal/mol above: a tenth as much, at 298 K
    const [low, high] = populations([-0.5, -0.5 + 1.3642 / HARTREE]);
    expect(low / high).toBeCloseTo(10, 1);
    expect(low + high).toBeCloseTo(1, 12);
    expect(populations([])).toEqual([]);
  });
});

describe("a molecule's bonds frame by frame", () => {
  // two carbons coming apart: bonded in the first frame, apart in the second, back in the third
  const h2 = {
    atoms: [
      { el: "C", x: 0, y: 0, z: 0 },
      { el: "C", x: 1.54, y: 0, z: 0 },
    ],
    bonds: [{ a1: 0, a2: 1, order: 1 }],
    frames: [
      [0, 0, 0, 3, 0, 0],
      [0, 0, 0, 1.5, 0, 0],
    ],
  };

  it("go where its atoms stand close enough, frame by frame, where its bonds are by distance", () => {
    const fb = frameBondsOf({ ...h2, bondsFrom: "distance" })!;
    expect(fb.bonds).toEqual([{ a1: 0, a2: 1, order: 1 }]);
    expect(fb.present.map((p) => [...p])).toEqual([[1], [0], [1]]);
    expect(bondsAt({ ...h2, bondsFrom: "distance" }, 1)).toEqual([]);
    expect(bondsAt({ ...h2, bondsFrom: "distance" }, 2)).toEqual([{ a1: 0, a2: 1, order: 1 }]);
  });

  it("are its bonds, in every frame, where its file gave them", () => {
    expect(frameBondsOf(h2)).toBeNull();
    expect(bondsAt(h2, 1)).toBe(h2.bonds);
  });
});
