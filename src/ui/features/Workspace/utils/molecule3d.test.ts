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
  seenShare,
  solidOf,
  standingHeight,
  turnedInPlane,
  turnedTogether,
  WORLD_PER_ANGSTROM,
  RIBBON_REACH,
  coveredLength,
  labelSpot,
  notesOf,
  plainNoteOf,
  populations,
  sharesOf,
  sharesWithheld,
  widestWay,
  type Turning3D,
  spotFollowed,
  fadeStep,
  type LabelFade,
  valueSpots,
  VALUE_SLACK_PX,
  type SpotAbout,
  framesChipAt,
} from "./molecule3d";
import type { SolidMark } from "../../../../lib/chem/layout2d";
import { LARGE_ATOMS } from "./largeDrawing";
import { bondsByDistance } from "../../../../utils/structureParsers";
import { least } from "../../../../lib/chem/lists";

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
  it("says over it how many of its file's atoms it leaves out, where it leaves out any", () => {
    const notes = (m: Molecule3D) => notesOf(m, solidOf(m, STYLE_3D), "primary").filter((n) => n.endsWith("left out"));
    expect(notes(ethane())).toEqual([]);
    expect(notes({ ...ethane(), atomsLeftOut: 1 })).toEqual(["1 atom left out"]);
    expect(notes({ ...ethane(), atomsLeftOut: 3 })).toEqual(["3 atoms left out"]);
  });

  it("tells the note that only says how it is - its converged points the entries - from those that say what is wrong", () => {
    const ethaneAt = (k: number) => [10, 5, 1 + k, 11.5, 5, 1 + k];
    const opt = (more: Partial<Molecule3D>): Molecule3D => ({ ...ethane(), frames: [ethaneAt(1), ethaneAt(2), ethaneAt(3)], ...more });
    // (an optimisation that converged: its last point the entry - said, plainly)
    const done = opt({ entryFrames: [3] });
    expect(plainNoteOf(done)).toBe("1 of 4 frames is an entry (the converged one)");
    expect(notesOf(done, solidOf(done, STYLE_3D), "primary")).toContain("1 of 4 frames is an entry (the converged one)");
    // (one that did not, or whose frames none is an entry: what is wrong, never plain)
    expect(plainNoteOf(opt({ entryFrames: [3], notConverged: true }))).toBeNull();
    expect(plainNoteOf(opt({ entryFrames: [], noEntryWhy: "unstated" }))).toBeNull();
    expect(plainNoteOf(ethane())).toBeNull();
  });

  it("is laid about its centre, a bond of 1.5 Å as long as a drawn one", () => {
    const s = solidOf(ethane(), STYLE_3D);
    expect(Array.from(s.frames[0])).toEqual([-0.75 * WORLD_PER_ANGSTROM, 0, 0, 0.75 * WORLD_PER_ANGSTROM, 0, 0].map((v) => expect.closeTo(v, 6)));
    // a carbon's ball: a fifth of its van der Waals radius (1.77 Å); space-filling, all of it
    expect(s.radii.primary[0]).toBeCloseTo(0.354 * WORLD_PER_ANGSTROM, 6);
    expect(s.radii.secondary[0]).toBeCloseTo(1.77 * WORLD_PER_ANGSTROM, 6);
    expect(s.reach.primary).toBeCloseTo((0.75 + 0.354) * WORLD_PER_ANGSTROM, 6);
    expect(s.reach.secondary).toBeCloseTo((0.75 + 1.77) * WORLD_PER_ANGSTROM, 6);
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
    expect(s.reach.primary).toBeCloseTo((1.5 + 0.354) * WORLD_PER_ANGSTROM, 6);
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

  it("are turned together past what a call takes as its arguments", () => {
    // (65,536 in WebKit, about twice that here: so many turned together threw)
    const many = Array.from({ length: 150_000 }, (_, i) => ({ id: i + 1, at: { x: i % 400, y: Math.floor(i / 400) }, standing: 1 + (i % 3) }));
    const out = turnedTogether(many, q(1, 0, 0, 1.2));
    expect(out).toHaveLength(150_000);
    expect(least(out.map((t, i) => t.at.z - many[i].standing))).toBeCloseTo(0, 6);
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

  it("takes with them what is drawn of them - a chosen atom's ring, a measurement - as the look goes over, and gives it back", () => {
    const s = solidOf(methanol(), hiding);
    // (C-O: drawn in either look; C-H: none in the primary, all in the secondary, half way over half)
    expect(seenShare(s.hidden, [0, 1], 0)).toBe(1);
    expect(seenShare(s.hidden, [0, 2], 0)).toBe(0);
    expect(seenShare(s.hidden, [0, 2], 0.5)).toBe(0.5);
    expect(seenShare(s.hidden, [0, 2], 1)).toBe(1);
    expect(seenShare(s.hidden, [2], 0)).toBe(0);
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

  it("counts every atom its ribbons stand for toward a very large drawing - a protein of 22 000 atoms in ribbons is one", () => {
    // (2 200 residues of ten atoms each, their alpha carbons 3.8 A apart in a line)
    const atoms: Molecule3D["atoms"] = [];
    const names: string[] = [];
    const residueOf: number[] = [];
    for (let r = 0; r < 2_200; r++) {
      for (let k = 0; k < 10; k++) {
        atoms.push({ el: k ? "H" : "C", x: 3.8 * r, y: k ? 1 : 0, z: 0 });
        names.push(k ? `H${k}` : "CA");
        residueOf.push(r);
      }
    }
    const residues = Array.from({ length: 2_200 }, (_, r) => ({ name: "ALA", chain: "A", seq: r + 1, iCode: "", standard: true }));
    const m: Molecule3D = { id: 1, atoms, bonds: [], at: { x: 0, y: 0 }, biopolymer: { names, residueOf, residues, structure: residues.map(() => null) } };
    const s = solidOf(m, STYLE_3D);
    expect(s.ribbons.primary).toBe(true);
    expect(s.radii.primary.every((r) => r === 0)).toBe(true);
    expect(s.counted.primary).toBe(22_000);
    expect(s.counted.primary).toBeGreaterThan(LARGE_ATOMS);
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

describe("the shares a conformer set's chip shows", () => {
  const frame = [0, 0, 0];
  const set = { atoms: [], frames: [frame], energies: [-0.5, -0.5], degeneracies: [1, 3], conformerSet: true };
  it("are by Boltzmann where none were worked out - each counted as often as its search found it - or those a Populations step worked out", () => {
    // (two of one energy, the second found three times: 1 and 3 of 4)
    expect(sharesOf(set)).toEqual([0.25, 0.75]);
    expect(sharesOf({ ...set, shares: [0.6, 0.4] })).toEqual([0.6, 0.4]);
  });

  it("are none of a part of a search's conformers - but those a Populations step worked out of them - nor of what is no conformer set", () => {
    expect(sharesOf({ ...set, partOf: true })).toBeUndefined();
    expect(sharesOf({ ...set, partOf: true, shares: [0.6, 0.4] })).toEqual([0.6, 0.4]);
    expect(sharesOf({ ...set, conformerSet: false })).toBeUndefined();
    // (nor where its energies are not a frame's each)
    expect(sharesOf({ ...set, energies: [-0.5] })).toBeUndefined();
  });

  it("are none where a frame is no minimum - not converged, or judged to have an imaginary frequency - which is named, by its number", () => {
    const notConverged = { ...set, failed: [null, { kind: "not-converged" as const, why: "100 cycles" }] };
    expect(sharesOf(notConverged)).toBeUndefined();
    expect(sharesWithheld(notConverged)).toBe("#2 is not converged: it is no minimum, so no shares are given");
    const saddle = { ...set, imaginary: [[-382.6], null], numbers: [4, 7] };
    expect(sharesOf(saddle)).toBeUndefined();
    expect(sharesWithheld(saddle)).toBe("#4 has 1 imaginary frequency, 382.6i cm⁻¹: it is no minimum, so no shares are given");
    // (nor those a Populations step worked out before)
    expect(sharesOf({ ...saddle, shares: [0.6, 0.4] })).toBeUndefined();
    // (another failure is no judgement of a minimum: shares as before)
    expect(sharesOf({ ...set, failed: [null, { kind: "stopped" as const, why: "stopped" }] })).toEqual([0.25, 0.75]);
    expect(sharesWithheld(set)).toBeNull();
    // (its file's marks of that did not read: not known, so none - and said)
    expect(sharesOf({ ...set, marksUnread: true })).toBeUndefined();
    expect(sharesWithheld({ ...set, marksUnread: true })).toBe("its frames' marks could not be read, so whether each is a minimum is not known: no shares are given");
  });
});

describe("populations", () => {
  it("are found for more conformers or frames than a call takes as its arguments", () => {
    const shares = populations(Array.from({ length: 150_000 }, (_, i) => (i === 7 ? -1 : 0)));
    expect(shares[7]).toBeCloseTo(1, 6);
  });

  const HARTREE = 627.509474;
  it("shares a conformer set by Boltzmann at room temperature, adding up to one", () => {
    expect(populations([0, 0])).toEqual([0.5, 0.5]);
    // 1.364 kcal/mol above: a tenth as much, at 298 K
    const [low, high] = populations([-0.5, -0.5 + 1.3642 / HARTREE]);
    expect(low / high).toBeCloseTo(10, 1);
    expect(low + high).toBeCloseTo(1, 12);
    expect(populations([])).toEqual([]);
  });

  it("of a long run of frames - three hundred thousand energies - without overrunning the stack", () => {
    const shares = populations(Array.from({ length: 300_000 }, (_, i) => (i % 5) / HARTREE));
    expect(shares.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
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

  it("are in every frame those its atoms' distances give there - a trajectory of 600 atoms, found cube by cube, its first frame's orders kept", () => {
    // (200 waters on a grid, shaken more in each frame, so that bonds break and form)
    let seed = 11;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5;
    const base: { el: string; x: number; y: number; z: number }[] = [];
    for (let u = 0; u < 200; u++) {
      const [x, y, z] = [(u % 6) * 3.1, (Math.floor(u / 6) % 6) * 3.1, Math.floor(u / 36) * 3.1];
      base.push({ el: "O", x, y, z }, { el: "H", x: x + 0.96, y, z }, { el: "H", x: x - 0.24, y: y + 0.93, z });
    }
    const frames = Array.from({ length: 8 }, (_, f) => base.flatMap((a) => [a.x + rand() * 0.3 * f, a.y + rand() * 0.3 * f, a.z + rand() * 0.3 * f]));
    const bonds = bondsByDistance(base).map((b, i) => (i === 0 ? { ...b, order: 2 } : b));
    const m = { atoms: base, bonds, frames, bondsFrom: "distance" as const };
    const fb = frameBondsOf(m)!;
    const xyzs = [base.flatMap((a) => [a.x, a.y, a.z]), ...frames];
    xyzs.forEach((xyz, f) => {
      const expected = bondsByDistance(base.map((a, i) => ({ el: a.el, x: xyz[3 * i], y: xyz[3 * i + 1], z: xyz[3 * i + 2] })));
      // (as a set: a bond first met in a later frame comes after those met before)
      const pairs = (bs: { a1: number; a2: number }[]) => bs.map((b) => b.a1 * 600 + b.a2).sort((p, q) => p - q);
      expect(pairs(bondsAt(m, f))).toEqual(pairs(expected));
    });
    // (some came and went)
    expect(fb.bonds.length).toBeGreaterThan(bonds.length);
    expect(fb.present.some((p) => p.includes(0))).toBe(true);
    expect(bondsAt(m, 0)[0].order).toBe(2);
  });

  it("are its bonds, in every frame, where its file gave them", () => {
    expect(frameBondsOf(h2)).toBeNull();
    expect(bondsAt(h2, 1)).toBe(h2.bonds);
  });
});

describe("a stereo label's place about its atom, followed", () => {
  it("goes round the atom the shorter way to a new best way, out of the same reach, never across it", () => {
    const was = { a: 0.9 * Math.PI, r: 20 };
    const goal = { a: -0.9 * Math.PI, r: 20 };
    let at = was;
    const seen: number[] = [];
    for (let k = 0; k < 60; k++) {
      at = spotFollowed(at, goal, 1 / 60, 0.07);
      seen.push(at.a);
      // (never nearer the atom than either end: round it, not across)
      expect(at.r).toBeCloseTo(20, 9);
    }
    // (through pi - the left - not through 0, the right: the short way, a fifth of a turn)
    const wrapped = seen.map((a) => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI));
    expect(wrapped.every((a) => a > 0.85 * Math.PI && a < 1.15 * Math.PI)).toBe(true);
    expect(at).toEqual(goal);
  });

  it("moves without a jump and without going past its goal, and is there in a fraction of a second", () => {
    const goal = { a: 0, r: 30 };
    let at = { a: Math.PI / 2, r: 18 };
    let steps = 0;
    let last = at;
    while ((at.a !== goal.a || at.r !== goal.r) && steps < 600) {
      at = spotFollowed(at, goal, 1 / 60, 0.07);
      // (each frame's move a small one; never beyond the goal)
      expect(Math.abs(at.a - last.a)).toBeLessThan(0.4);
      expect(at.a).toBeGreaterThanOrEqual(0);
      expect(at.r).toBeLessThanOrEqual(30);
      last = at;
      steps++;
    }
    expect(steps).toBeGreaterThan(5);
    expect(steps / 60).toBeLessThan(0.75);
  });

  it("stays where it is when its goal does not move", () => {
    expect(spotFollowed({ a: 1, r: 12 }, { a: 1, r: 12 }, 1 / 60, 0.07)).toEqual({ a: 1, r: 12 });
  });
});

describe("measurements' values close together on the screen", () => {
  const half = { x: 22, y: 9 };
  const place = (v: { o: { x: number; y: number } }, s: SpotAbout) => ({ x: v.o.x + s.r * Math.cos(s.a), y: v.o.y + s.r * Math.sin(s.a) });
  const apart = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.abs(a.x - b.x) >= 2 * half.x - VALUE_SLACK_PX || Math.abs(a.y - b.y) >= 2 * half.y - VALUE_SLACK_PX;

  it("stay on their points while those are clear of each other", () => {
    const spots = valueSpots([
      { o: { x: 0, y: 0 }, half, way: { x: 0, y: -1 } },
      { o: { x: 100, y: 0 }, half, way: { x: 0, y: -1 } },
    ]);
    expect(spots.map((s) => s.r)).toEqual([0, 0]);
  });

  it("keep apart where their points are close, the later one moved off its way", () => {
    const values = [
      { o: { x: 0, y: 0 }, half, way: { x: 0, y: -1 } },
      { o: { x: 10, y: 4 }, half, way: { x: 0, y: 1 } },
    ];
    const spots = valueSpots(values);
    expect(spots[0].r).toBe(0);
    expect(spots[1].r).toBeGreaterThan(0);
    expect(apart(place(values[0], spots[0]), place(values[1], spots[1]))).toBe(true);
  });

  it("keep their places as the view turns slowly, rather than trading them frame by frame", () => {
    // (three values near one another, their points drifting a little each frame as a slow turn moves them; each placed
    // from where it stood the frame before, as the canvas places them)
    let was: (SpotAbout | undefined)[] = [undefined, undefined, undefined];
    let moves = 0;
    for (let f = 0; f < 240; f++) {
      const t = f / 240;
      const values = [
        { o: { x: 100 + 8 * Math.sin(2 * Math.PI * t), y: 100 }, half, way: { x: 0, y: -1 }, was: was[0] },
        { o: { x: 112, y: 104 + 6 * Math.cos(2 * Math.PI * t) }, half, way: { x: 0, y: 1 }, was: was[1] },
        { o: { x: 95 + 4 * t, y: 96 }, half, way: { x: -1, y: 0 }, was: was[2] },
      ];
      const spots = valueSpots(values);
      // (never on top of one another)
      for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) expect(apart(place(values[i], spots[i]), place(values[j], spots[j]))).toBe(true);
      // (a value goes over to another side - its way off changing by more than a quarter turn - rarely, if ever)
      spots.forEach((s, i) => {
        const w = was[i];
        if (w && w.r > 0 && s.r > 0 && Math.abs(Math.atan2(Math.sin(s.a - w.a), Math.cos(s.a - w.a))) > Math.PI / 2) moves++;
      });
      was = spots;
    }
    expect(moves).toBeLessThanOrEqual(2);
  });

  it("go back to their points once those are clear again, not before", () => {
    const off = { a: Math.PI / 2, r: 12 };
    const near = valueSpots([
      { o: { x: 0, y: 0 }, half, way: { x: 0, y: -1 } },
      // (its point now clear of the first by less than the slack: it stays off)
      { o: { x: 2 * half.x + 1, y: 0 }, half, way: { x: 0, y: 1 }, was: off },
    ]);
    expect(near[1]).toEqual(off);
    const clear = valueSpots([
      { o: { x: 0, y: 0 }, half, way: { x: 0, y: -1 } },
      { o: { x: 2 * half.x + VALUE_SLACK_PX + 1, y: 0 }, half, way: { x: 0, y: 1 }, was: off },
    ]);
    expect(clear[1].r).toBe(0);
  });
});

describe("fadeStep", () => {
  const TIME = 0.12;
  const DT = 1 / 60;
  const fresh = (): LabelFade => ({ v: 0, from: 0, to: 0, t: 0 });

  it("brings labels shown together into view together, none before all of them are there", () => {
    const a = fresh();
    const b = fresh();
    // (b's element not made yet: neither starts)
    for (let k = 0; k < 3; k++) {
      fadeStep(a, 1, false, DT, TIME);
      fadeStep(b, 1, false, DT, TIME);
    }
    expect([a.v, b.v]).toEqual([0, 0]);
    // (both there: both go, frame by frame alike, and are in view on the same frame)
    let frames = 0;
    for (;;) {
      const goingA = fadeStep(a, 1, true, DT, TIME);
      const goingB = fadeStep(b, 1, true, DT, TIME);
      expect(a.v).toBe(b.v);
      if (!goingA && !goingB) break;
      frames++;
    }
    expect([a.v, b.v]).toEqual([1, 1]);
    expect(frames).toBeGreaterThan(3);
  });

  it("takes as long to go out of view as to come into it, eased and never back", () => {
    const f = fresh();
    const seen: number[] = [];
    let inFrames = 0;
    while (fadeStep(f, 1, true, DT, TIME)) {
      seen.push(f.v);
      inFrames++;
    }
    let outFrames = 0;
    let last = f.v;
    while (fadeStep(f, 0, true, DT, TIME)) {
      expect(f.v).toBeLessThan(last);
      last = f.v;
      outFrames++;
    }
    expect(f.v).toBe(0);
    expect(outFrames).toBe(inFrames);
    // (into view quick out of its start, as a mark comes; never a jump to the end)
    expect(seen[0]).toBeGreaterThan(DT / TIME);
    expect(seen[0]).toBeLessThan(0.5);
  });

  it("goes out of view from where it stands, hidden as it comes, at once - waiting for no other", () => {
    const f = fresh();
    for (let k = 0; k < 3; k++) fadeStep(f, 1, true, DT, TIME);
    const part = f.v;
    expect(part).toBeGreaterThan(0);
    expect(part).toBeLessThan(1);
    fadeStep(f, 0, false, DT, TIME);
    expect(f.v).toBeLessThan(part);
    expect(f.from).toBe(part);
  });

  it("is all the way once its time is up, and goes nowhere on a frame of no time", () => {
    const f = fresh();
    fadeStep(f, 1, true, 10, TIME);
    expect(f.v).toBe(1);
    const g = fresh();
    fadeStep(g, 1, true, -1, TIME);
    expect(g.v).toBe(0);
  });
});

describe("where a frames chip hangs from", () => {
  it("is below its lowest atom - and, opened, clear of its set: half a bond below the set's foot, its own gap counted in", () => {
    expect(framesChipAt(-1.2)).toBe(-1.2);
    // (half a bond, 0.9; less the chip's own 10 page pixels, 0.375: 0.525 below the foot)
    expect(framesChipAt(-1.2, -3.5)).toBeCloseTo(-4.025, 9);
    // (a set whose foot is above the molecule's lowest atom - not drawn round it: never raised into it)
    expect(framesChipAt(-1.2, 0.5)).toBe(-1.2);
    expect(framesChipAt(-1.2, Number.NaN)).toBe(-1.2);
  });
});
