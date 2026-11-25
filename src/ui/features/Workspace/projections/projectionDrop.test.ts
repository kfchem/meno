import { describe, expect, it } from "vitest";
import { NOMINAL_BOND_LENGTH as L } from "../../../../lib/chem/acs";
import type { Atom, Bond, Model } from "../store/types";
import { dropOutcome } from "../utils/dropOutcome";
import { chairDrawing, seenPlaces } from "./chair";
import { haworthDrawing } from "./haworth";
import { newmanDrawing } from "./newman";

// Angles in degrees, counter-clockwise from the page's right, y up (as the model stores it). A drop is asked of utils/dropOutcome, as the page asks.
const rad = (deg: number) => (deg * Math.PI) / 180;
const angle = (from: { x: number; y: number }, to: { x: number; y: number }) => (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
const same = (p: number, q: number) => Math.abs((((p - q) % 360) + 540) % 360 - 180) < 1e-6;
const toward = (at: { x: number; y: number }, deg: number, r = 1.5 * L) => ({ x: at.x + r * Math.cos(rad(deg)), y: at.y + r * Math.sin(rad(deg)) });

/** A drawing with groups added: each a carbon on `on`, at `deg` and `length` from it; ids from 50. */
function withGroups(base: { atoms: Atom[]; bonds: Bond[] }, groups: { on: number; deg: number; length?: number }[]): Model {
  const atoms = [...base.atoms];
  const bonds = [...base.bonds];
  groups.forEach((g, i) => {
    const on = atoms.find((a) => a.id === g.on)!;
    const p = toward(on, g.deg, g.length ?? L);
    atoms.push({ id: 50 + i, el: "C", r: 0.9, x: p.x, y: p.y });
    bonds.push({ id: 150 + i, a: g.on, b: 50 + i, order: 1 });
  });
  return { atoms, bonds } as Model;
}

const drop = (model: Model, moving: number, pointer: { x: number; y: number }, free = false) => dropOutcome(model, moving, pointer, { x: 0, y: 0 }, free);
const movedTo = (out: ReturnType<typeof drop>) => {
  if (!("move" in out)) throw new Error(`no move: ${JSON.stringify(out)}`);
  return out.move;
};

describe("a group of a chair dragged round its ring atom", () => {
  // (the tool's chair, form 1; atom 0 - the left end, id 1 - has its axial position at 90 and its equatorial at -165, each a bond long)
  const chair = chairDrawing({ at: { x: 0, y: 0 }, firstId: 1, firstBondId: 1 });
  const c0 = chair.atoms[0];
  it("rests at the equatorial position (-165) when let go toward -150, and at the axial (90) toward 60 - paused or not", () => {
    const m = withGroups(chair, [{ on: 1, deg: 90 }]);
    for (const free of [false, true]) {
      const eq = movedTo(drop(m, 50, toward(c0, -150), free));
      expect(same(angle(c0, eq), -165)).toBe(true);
      expect(Math.hypot(eq.x - c0.x, eq.y - c0.y)).toBeCloseTo(L, 6);
      const ax = movedTo(drop(m, 50, toward(c0, 60), free));
      expect(same(angle(c0, ax), 90)).toBe(true);
    }
    // (and nowhere between: toward 180, where a 30-degree step would put it, the equatorial)
    expect(same(angle(c0, movedTo(drop(m, 50, toward(c0, 180)))), -165)).toBe(true);
  });

  it("changes places with the group at the other position, that group carried whole", () => {
    // (a methyl axial, an ethyl equatorial: the methyl let go toward the equatorial)
    const m = withGroups(chair, [{ on: 1, deg: 90 }, { on: 1, deg: -165 }]);
    const eq = seenPlaces(chair, 0).find((p) => p.free.kind === "equatorial")!.place;
    m.atoms.push({ id: 60, el: "C", r: 0.9, x: eq.x - L, y: eq.y });
    m.bonds.push({ id: 160, a: 51, b: 60, order: 1 });
    const out = drop(m, 50, toward(c0, -150));
    if (!("swap" in out)) throw new Error(JSON.stringify(out));
    const at = new Map(out.swap.map((p) => [p.id, p]));
    expect(same(angle(c0, at.get(50)!), -165)).toBe(true);
    expect(same(angle(c0, at.get(51)!), 90)).toBe(true);
    expect(Math.hypot(at.get(51)!.x - c0.x, at.get(51)!.y - c0.y)).toBeCloseTo(L, 6);
    // (the ethyl's second atom moved by the same step as its first)
    const was51 = m.atoms.find((a) => a.id === 51)!;
    expect(at.get(60)!.x - (eq.x - L)).toBeCloseTo(at.get(51)!.x - was51.x, 9);
    expect(at.get(60)!.y - eq.y).toBeCloseTo(at.get(51)!.y - was51.y, 9);
    // (let go toward its own position: it stays there)
    expect(same(angle(c0, movedTo(drop(m, 50, toward(c0, 70)))), 90)).toBe(true);
  });

  it("takes a group drawn off both positions to the nearer free one, and leaves it to the general rule where both are held", () => {
    const m = withGroups(chair, [{ on: 1, deg: 180 }]);
    expect(same(angle(c0, movedTo(drop(m, 50, toward(c0, -150)))), -165)).toBe(true);
    expect(same(angle(c0, movedTo(drop(m, 50, toward(c0, 100)))), 90)).toBe(true);
    const full = withGroups(chair, [{ on: 1, deg: 180 }, { on: 1, deg: 90 }, { on: 1, deg: -165 }]);
    // (the 30-degree rule: 150, a place neither position is)
    expect(same(angle(c0, movedTo(drop(full, 50, toward(c0, 150)))), 150)).toBe(true);
  });
});

describe("a group of a Haworth ring dragged round its ring atom", () => {
  it("rests straight down (-90) at the drawn length when let go toward -45, and straight up toward 135", () => {
    const h = haworthDrawing({ at: { x: 0, y: 0 }, size: 6, firstId: 1, firstBondId: 1 });
    // (C-1, id 2: its up group at the drawn length)
    const k = 1;
    const up = seenPlaces(h, k).find((p) => p.free.kind === "up")!;
    const down = seenPlaces(h, k).find((p) => p.free.kind === "down")!;
    const c1 = h.atoms[k];
    const m = withGroups(h, [{ on: 2, deg: 90, length: Math.hypot(up.place.x - c1.x, up.place.y - c1.y) }]);
    const to = movedTo(drop(m, 50, toward(c1, -45)));
    expect(same(angle(c1, to), -90)).toBe(true);
    expect(Math.hypot(to.x - c1.x, to.y - c1.y)).toBeCloseTo(Math.hypot(down.place.x - c1.x, down.place.y - c1.y), 6);
    expect(same(angle(c1, movedTo(drop(m, 50, toward(c1, 135)))), 90)).toBe(true);
  });
});

describe("a group of a Newman pair off every spoke of its atom's set", () => {
  const pair = newmanDrawing({ at: { x: 0, y: 0 }, firstId: 1, firstBondId: 1 });
  const centre = { x: 0, y: 0 };
  it("rests at the nearest free spoke of its own set, a bond length from the centre", () => {
    // (a back group at 0, alone: the back's default set 30, 150, 270; let go toward 20, it rests at 30)
    const back = withGroups(pair, [{ on: 2, deg: 0 }]);
    const b = movedTo(drop(back, 50, toward(centre, 20)));
    expect(same(angle(centre, b), 30)).toBe(true);
    expect(Math.hypot(b.x, b.y)).toBeCloseTo(L, 6);
    // (a front group at 60 beside one at 90: the front's set 90, 210, 330, 90 held; toward 200, 210)
    const front = withGroups(pair, [{ on: 1, deg: 90 }, { on: 1, deg: 60 }]);
    expect(same(angle(centre, movedTo(drop(front, 51, toward(centre, 200)))), 210)).toBe(true);
    // (toward 100, where 90 is held: the nearest free one, 210 or 330 - never 90)
    const near = angle(centre, movedTo(drop(front, 51, toward(centre, 100))));
    expect(same(near, 210) || same(near, 330)).toBe(true);
  });
});
