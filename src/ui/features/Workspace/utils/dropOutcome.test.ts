import { describe, expect, it } from "vitest";
import { dropOutcome } from "./dropOutcome";
import { onAnotherAtom } from "./moveSnap";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import type { Model } from "../store/types";

const L = NOMINAL_BOND_LENGTH;
const atom = (id: number, x: number, y: number) => ({ id, x, y, r: 0.9, el: "C" });
const bond = (id: number, a: number, b: number) => ({ id, a, b, order: 1 as const, stereo: "none" as const });
const none = { x: 0, y: 0 };

/** A tert-butyl's centre (1) with its parent (2) and three methyls (3, 4, 5), as a cross. */
const tBu = (): Model => ({
  atoms: [atom(1, 0, 0), atom(2, -L, 0), atom(3, L, 0), atom(4, 0, L), atom(5, 0, -L)],
  bonds: [bond(11, 1, 2), bond(12, 1, 3), bond(13, 1, 4), bond(14, 1, 5)],
});

describe("what a dropped atom does", () => {
  it("never merges a tert-butyl's centre dropped beside, or on, a methyl or its parent: it moves, clear of every atom", () => {
    const model = tBu();
    for (const id of [2, 3, 4, 5]) {
      const a = model.atoms.find((x) => x.id === id)!;
      for (const free of [false, true]) {
        for (const d of [0, 0.15, 0.3, 0.5, 0.7]) {
          const out = dropOutcome(model, 1, { x: a.x + d * L * 0.7, y: a.y + d * L * 0.7 }, none, free);
          expect("merge" in out).toBe(false);
          if ("move" in out) expect(onAnotherAtom(model, 1, out.move, L)).toBe(false);
        }
      }
    }
  });

  it("becomes the atom the pointer is on, where that is a far one", () => {
    // a chain end 4 dropped on 1: a ring closed
    const chain: Model = {
      atoms: [atom(1, 0, 0), atom(2, L, 0), atom(3, L, L), atom(4, 0.1 * L, L)],
      bonds: [bond(11, 1, 2), bond(12, 2, 3), bond(13, 3, 4)],
    };
    expect(dropOutcome(chain, 4, { x: 0.05, y: 0.05 }, none, false)).toEqual({ merge: 1 });
    expect(dropOutcome(chain, 4, { x: 0.05, y: 0.05 }, none, true)).toEqual({ merge: 1 });
  });

  it("snaps, not merges, a free drag onto an atom it may not become", () => {
    const model = tBu();
    const out = dropOutcome(model, 1, { x: L, y: 0 }, none, true);
    expect("move" in out).toBe(true);
    // (not where the pointer is, which is on the methyl)
    if ("move" in out) expect(Math.hypot(out.move.x - L, out.move.y)).toBeGreaterThan(0.4 * L);
  });

  it("goes to the pointer when held still on clear ground, and to the snap otherwise", () => {
    const model: Model = { atoms: [atom(1, L, 0), atom(2, 0, 0)], bonds: [bond(11, 1, 2)] };
    const p = { x: 1.3 * L, y: 0.3 * L };
    expect(dropOutcome(model, 1, p, none, true)).toEqual({ move: p });
    const snapped = dropOutcome(model, 1, p, none, false);
    expect("move" in snapped && Math.hypot(snapped.move.x, snapped.move.y)).toBeCloseTo(L);
  });

  it("stays where every place is taken", () => {
    // 1 bonded to 2, a blocker on each of the twelve places about 2
    const turn = (k: number) => ({ x: L * Math.cos((k * Math.PI) / 6), y: L * Math.sin((k * Math.PI) / 6) });
    const model: Model = {
      atoms: [atom(1, L, 0), atom(2, 0, 0), ...Array.from({ length: 12 }, (_, k) => atom(10 + k, turn(k).x, turn(k).y))],
      bonds: [bond(11, 1, 2)],
    };
    expect(dropOutcome(model, 1, { x: 2 * L, y: 0 }, none, false)).toEqual({ stay: true });
  });

  it("stays for an atom that is gone", () => {
    expect(dropOutcome(tBu(), 99, none, none, false)).toEqual({ stay: true });
  });
});
