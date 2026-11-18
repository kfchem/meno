import { describe, expect, it } from "vitest";
import { drawnFromSmiles } from "../chem/testdata/identityCases";
import type { Model } from "../store/types";
import { changedAt, changesFrom } from "./stereoKept";

/**
 * A hydrogen bond is no bond of the structure (perception/graph `ofTheStructure`), so a hydrogen bond drawn
 * to a centre's own drawn H must not change what the comparison says.
 * (found in review: the H with a hydrogen bond was read as a group, and the centre as changed)
 */
function withH(m: Model, c: number): { model: Model; h: number } {
  const at = new Map(m.atoms.map((a) => [a.id, a]));
  const a = at.get(c)!;
  const out = m.bonds.filter((b) => b.a === c || b.b === c);
  const angle = (b: (typeof out)[number]) => {
    const o = at.get(b.a === c ? b.b : b.a)!;
    return Math.atan2(o.y - a.y, o.x - a.x);
  };
  const w = out.find((b) => (b.stereo === "up" || b.stereo === "down") && b.narrow === c)!;
  const turn = (x: number) => (((x - angle(w)) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const rel = out.filter((b) => b !== w).map((b) => turn(angle(b)));
  const ccw = Math.min(...rel);
  const cw = 2 * Math.PI - Math.max(...rel);
  const dir = ccw >= cw ? angle(w) + ccw / 2 : angle(w) - cw / 2;
  const id = Math.max(...m.atoms.map((x) => x.id), ...m.bonds.map((b) => b.id)) + 1;
  return {
    model: { atoms: [...m.atoms, { id, el: "H", x: a.x + Math.cos(dir) * 0.8, y: a.y + Math.sin(dir) * 0.8, r: 0.9 } as Model["atoms"][number]], bonds: [...m.bonds, { id: id + 1, a: c, b: id, order: 1 }] },
    h: id,
  };
}

describe("a hydrogen bond drawn to a centre's own drawn H", () => {
  it("leaves the centre the same centre: the H drawn is the centre's H, with the hydrogen bond or without", () => {
    const m = drawnFromSmiles("F[C@H](Cl)Br");
    const { model: drawnH, h } = withH(m, 2);
    const hAt = drawnH.atoms.find((a) => a.id === h)!;
    const cAt = drawnH.atoms.find((a) => a.id === 2)!;
    const oId = Math.max(...drawnH.atoms.map((x) => x.id), ...drawnH.bonds.map((b) => b.id)) + 1;
    const o = { id: oId, el: "O", x: hAt.x + (hAt.x - cAt.x) * 1.5, y: hAt.y + (hAt.y - cAt.y) * 1.5, r: 0.9 } as Model["atoms"][number];
    const without: Model = { atoms: [...drawnH.atoms, o], bonds: [...drawnH.bonds] };
    const withBond: Model = { atoms: [...drawnH.atoms, o], bonds: [...drawnH.bonds, { id: oId + 1, a: h, b: oId, order: 1, hydrogen: true } as Model["bonds"][number]] };
    expect(changedAt(m, without, new Map())).toEqual([]);
    expect(changedAt(m, withBond, new Map())).toEqual([]);
    expect(changesFrom(m, withBond, new Map())).toEqual(changesFrom(m, without, new Map()));
  });
});
