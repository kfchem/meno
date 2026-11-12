import { describe, expect, it } from "vitest";
import { identityOfDrawn } from "../chem/identityOf";
import type { Atom, Bond, Model } from "../store/types";
import { chairDrawing, seenPlaces } from "./chair";
import { fusableBonds, fusedOn, type Fuse, type FuseHow } from "./fuse";

const draw = () => chairDrawing({ at: { x: 0, y: 0 }, firstId: 1, firstBondId: 100 });

/** The chair with a methyl on each (atom, face) given. */
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

const everything = (m: Model) => new Set(m.atoms.map((a) => a.id));
const added = (m: Model, f: Fuse): Model => {
  const ids = f.atoms.map((_, n) => 500 + n);
  const end = (e: { id: number } | { new: number }) => ("id" in e ? e.id : ids[e.new]);
  return {
    atoms: [...m.atoms, ...f.atoms.map((a, n) => ({ ...a, id: ids[n] }))],
    bonds: [...m.bonds, ...f.bonds.map((b, n) => ({ id: 600 + n, a: end(b.a), b: end(b.b), order: 1 as const, ...(b.display ? { display: b.display } : {}) }))],
  };
};
const fuse = (m: Model, bond: number, how: FuseHow) => {
  const f = fusedOn(m, everything(m), bond, how);
  if (!f || "refused" in f) throw new Error(f ? f.refused : "none");
  return added(m, f);
};

describe("a chair fused on a bond of a chair", () => {
  const bare = methylated([]);
  const trans = { id: 100, how: "trans" as const };

  it("offers the ring's bonds of a chair, and none on a drawing without one", () => {
    expect(fusableBonds(bare, everything(bare)).sort()).toEqual([100, 101, 102, 103, 104, 105]);
    expect(fusableBonds({ atoms: bare.atoms.map((a) => ({ ...a, z: undefined })), bonds: bare.bonds }, everything(bare))).toEqual([]);
  });

  it("adds four atoms and five bonds, ten atoms in two six-rings that share the bond", () => {
    const m = fuse(bare, trans.id, trans.how);
    expect(m.atoms).toHaveLength(10);
    expect(m.bonds).toHaveLength(11);
    expect(m.atoms.slice(6).every((a) => a.z != null && a.stereoCentre === true)).toBe(true);
  });

  it("makes trans- and cis-decalin: two identities, the two cis fusions of a bare chair one compound", () => {
    const t = identityOfDrawn(fuse(bare, 100, "trans")).text;
    const cisUp = identityOfDrawn(fuse(bare, 100, { cis: 1 })).text;
    const cisDown = identityOfDrawn(fuse(bare, 100, { cis: -1 })).text;
    expect(identityOfDrawn(fuse(bare, 100, "trans")).complete).toBe(true);
    expect(t).not.toBe(cisUp);
    expect(cisUp).toBe(cisDown);
  });

  it("makes on a ring with one methyl the two cis fusions at one bond two compounds, and trans a third (cis-syn-cis, cis-anti-cis)", () => {
    const m = methylated([[3, 1]]);
    // (the bond between the atoms 0 and 1, away from the methyl)
    const t = identityOfDrawn(fuse(m, 100, "trans")).text;
    const up = identityOfDrawn(fuse(m, 100, { cis: 1 })).text;
    const down = identityOfDrawn(fuse(m, 100, { cis: -1 })).text;
    expect(new Set([t, up, down]).size).toBe(3);
  });

  it("refuses, in words, a bond whose places a group stands at; none for a bond of no chair", () => {
    // (a methyl on atom 0, on each face: the equatorial place trans takes is held)
    const held = methylated([[0, 1], [0, -1]]);
    const f = fusedOn(held, everything(held), 100, "trans");
    expect(f && "refused" in f).toBe(true);
    expect(fusedOn(bare, everything(bare), 999, "trans")).toBeNull();
  });

  it("draws the new ring's near edge bold as the first ring's is", () => {
    const m = fuse(bare, 100, "trans");
    expect(m.bonds.filter((b) => b.display === "bold").length).toBeGreaterThanOrEqual(2);
  });
});
