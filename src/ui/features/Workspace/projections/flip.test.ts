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
    // (the ring is the other picture of the chair now, the groups on the same faces: and flipped again, it is as it was)
    expect(chairOf(after, depthRings(after)[0])!.flip).toBe(true);
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
});
