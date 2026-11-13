import { describe, expect, it } from "vitest";
import { identityOfDrawn } from "../chem/identityOf";
import type { Atom, Bond, Model } from "../store/types";
import { chairDrawing, chairOf, depthRings, isProjection, seenPlaces } from "./chair";
import { flipOf } from "./flip";

const draw = () => chairDrawing({ at: { x: 0, y: 0 }, firstId: 1, firstBondId: 100 });

/** The chair with a methyl on each (atom, face): the group's atom at the free position of that face. */
function methylated(groups: [number, 1 | -1][]): Model {
  const d = draw();
  const atoms: Atom[] = [...d.atoms];
  const bonds: Bond[] = [...d.bonds];
  groups.forEach(([k, face], i) => {
    const free = d.solid.free.find((f) => f.at === k && f.face === face)!;
    const place = seenPlaces(d, k).find((p) => p.free === free)!;
    atoms.push({ id: 50 + i, el: "C", r: 0.9, x: place.place.x, y: place.place.y });
    bonds.push({ id: 200 + i, a: d.ring[k], b: 50 + i, order: 1 });
  });
  return { atoms, bonds };
}

const apply = (m: Model, moves: { id: number; x: number; y: number; z?: number }[]): Model => {
  const to = new Map(moves.map((x) => [x.id, x]));
  return { atoms: m.atoms.map((a) => (to.has(a.id) ? { ...a, ...to.get(a.id)! } : a)), bonds: m.bonds };
};

describe("Flip chair", () => {
  const everything = (m: Model) => new Set(m.atoms.map((a) => a.id));

  it("flips trans-1,2-dimethylcyclohexane - diequatorial to diaxial - and the compound is the same", () => {
    const m = methylated([[0, 1], [1, -1]]);
    const flip = flipOf(m, everything(m));
    expect(flip).not.toBeNull();
    expect("moves" in flip!).toBe(true);
    const after = apply(m, (flip as { moves: { id: number; x: number; y: number; z?: number }[] }).moves);
    expect(identityOfDrawn(after).text).toBe(identityOfDrawn(m).text);
    expect(identityOfDrawn(after).complete).toBe(true);
    // (the ring is a chair of the tool's still - a bare chair's ring flip is its own picture again, its atoms counted round from the other
    // end, so which of the two it is the ring alone does not say - each methyl moved, on the same face: and flipped again, it is as it was)
    expect(chairOf(after, depthRings(after)[0])).not.toBeNull();
    for (const id of [50, 51]) expect(Math.hypot(after.atoms.find((a) => a.id === id)!.x - m.atoms.find((a) => a.id === id)!.x, after.atoms.find((a) => a.id === id)!.y - m.atoms.find((a) => a.id === id)!.y)).toBeGreaterThan(0.1);
    const back = flipOf(after, everything(after)) as { moves: { id: number; x: number; y: number; z?: number }[] };
    const again = apply(after, back.moves);
    for (const a of m.atoms) {
      const b = again.atoms.find((x) => x.id === a.id)!;
      expect(b.x).toBeCloseTo(a.x, 6);
      expect(b.y).toBeCloseTo(a.y, 6);
      expect(b.z ?? 0).toBeCloseTo(a.z ?? 0, 6);
    }
  });

  it("flips cis too, each group on its own face, the compound the same; carries what hangs from a group with it", () => {
    const m = methylated([[0, 1], [1, 1]]);
    const flip = flipOf(m, everything(m)) as { moves: { id: number; x: number; y: number; z?: number }[] };
    expect(identityOfDrawn(apply(m, flip.moves)).text).toBe(identityOfDrawn(m).text);
    // (an ethyl: its second carbon moves with the first by the same step)
    const ethyl: Model = { atoms: [...m.atoms, { id: 90, el: "C", r: 0.9, x: m.atoms[6].x + 1, y: m.atoms[6].y }], bonds: [...m.bonds, { id: 300, a: 50, b: 90, order: 1 }] };
    const moved = apply(ethyl, (flipOf(ethyl, everything(ethyl)) as { moves: { id: number; x: number; y: number; z?: number }[] }).moves);
    const was = ethyl.atoms.find((a) => a.id === 90)!;
    const now = moved.atoms.find((a) => a.id === 90)!;
    const first = [ethyl.atoms.find((a) => a.id === 50)!, moved.atoms.find((a) => a.id === 50)!];
    expect(now.x - was.x).toBeCloseTo(first[1].x - first[0].x, 6);
    expect(now.y - was.y).toBeCloseTo(first[1].y - first[0].y, 6);
  });

  it("is none for a ring drawn by hand, a group standing at neither free position, and two chairs", () => {
    const m = methylated([[0, 1]]);
    expect(flipOf({ atoms: m.atoms.map((a) => (a.id === 50 ? { ...a, x: a.x + 0.7 } : a)), bonds: m.bonds }, everything(m))).toBeNull();
    expect(flipOf({ atoms: m.atoms.map((a) => ({ ...a, z: undefined })), bonds: m.bonds }, everything(m))).toBeNull();
  });

  it("marks the structure a projection: a chair of the tool's, and no other drawing", () => {
    const m = methylated([[0, 1]]);
    expect(isProjection(m, everything(m))).toBe(true);
    expect(isProjection({ atoms: m.atoms.map((a) => ({ ...a, z: undefined })), bonds: m.bonds }, everything(m))).toBe(false);
  });

  it("is not offered on a chair that does not stand alone - a ring spiro on one atom, a ring fused through a bond, a chain from one atom to another - but is on one with a ring of its own hung from it", () => {
    const d = draw();
    /** The chair with an atom at each (atom, kind) place given, ids from 60, and bonds among them and to their ring atoms as said. */
    const built = (places: [number, "axial" | "equatorial"][], extra: [number, number][], more: Atom[] = []): Model => {
      const atoms: Atom[] = [...d.atoms];
      const bonds: Bond[] = [...d.bonds];
      places.forEach(([k, kind], i) => {
        const place = seenPlaces(d, k).find((p) => p.free.kind === kind)!;
        atoms.push({ id: 60 + i, el: "C", r: 0.9, x: place.place.x, y: place.place.y });
        bonds.push({ id: 300 + i, a: d.ring[k], b: 60 + i, order: 1 });
      });
      atoms.push(...more);
      extra.forEach(([a, b], i) => bonds.push({ id: 400 + i, a, b, order: 1 }));
      return { atoms, bonds };
    };
    const far = (id: number): Atom => ({ id, el: "C", r: 0.9, x: 9, y: 9 });
    // (atom 0's two places joined through a third atom: a ring of four spiro on it)
    const spiro = built([[0, "axial"], [0, "equatorial"]], [[60, 70], [70, 61]], [far(70)]);
    // (the equatorial places of atoms 0 and 1 bonded: a ring of four fused on the bond 0-1)
    const fused = built([[0, "equatorial"], [1, "equatorial"]], [[60, 61]]);
    // (from atom 0's axial place to atom 3's, through a third atom: a chain across the ring)
    const across = built([[0, "axial"], [3, "axial"]], [[60, 70], [70, 61]], [far(70)]);
    for (const [name, m] of [["spiro", spiro], ["fused", fused], ["across", across]] as const) {
      expect(isProjection(m, everything(m)), name).toBe(true);
      expect(flipOf(m, everything(m)), name).toBeNull();
    }
    // (a phenyl at atom 0's equatorial place: a ring of its own, touching the chair at one bond - it flips)
    const ring = [0, 1, 2, 3, 4, 5].map((k) => ({ id: 80 + k, el: "C", r: 0.9, x: 20 + Math.cos((k * Math.PI) / 3), y: 20 + Math.sin((k * Math.PI) / 3) }));
    const phenyl = built([[0, "equatorial"]], [[60, 80], ...[0, 1, 2, 3, 4, 5].map((k): [number, number] => [80 + k, 80 + ((k + 1) % 6)])], ring);
    expect(flipOf(phenyl, everything(phenyl))).not.toBeNull();
  });
});
