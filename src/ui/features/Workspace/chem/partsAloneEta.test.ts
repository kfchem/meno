import { describe, expect, it } from "vitest";
import type { Model } from "../store/types";
import { drawnFromSmiles } from "../utils/smilesDrawn";
import { blocksOf } from "./make3d";
import { partsAlone } from "./partsAlone";

// A structure of several parts one of which holds a ring bound through all its atoms to a metal is searched whole, as before.

const L = 1.5;
/** Ferrocene drawn by hand: Fe 1, a bond from it to each of the ten carbons of two Kekule rings. */
function ferroceneByHand(): Model {
  const atoms: Model["atoms"] = [{ id: 1, x: 0, y: 0, r: 0.9, el: "Fe", joined: 1 }];
  const bonds: Model["bonds"] = [];
  let id = 100;
  for (const [base, y] of [[11, L], [21, -L]]) {
    for (let i = 0; i < 5; i++) atoms.push({ id: base + i, x: L * Math.cos((2 * Math.PI * i) / 5), y: y + 0.3 * L * Math.sin((2 * Math.PI * i) / 5), r: 0.9, el: "C", joined: 1 });
    for (let i = 0; i < 5; i++) bonds.push({ id: id++, a: base + i, b: base + ((i + 1) % 5), order: i === 0 || i === 2 ? 2 : 1 });
    for (let i = 0; i < 5; i++) bonds.push({ id: id++, a: 1, b: base + i, order: 1 });
  }
  return { atoms, bonds };
}

describe("a ring bound to a metal through all its atoms, beside another part", () => {
  it("is searched whole: no parts", () => {
    const fc = ferroceneByHand();
    const eth = drawnFromSmiles("CCO");
    const whole: Model = {
      atoms: [...fc.atoms, ...eth.atoms.map((a) => ({ ...a, id: a.id + 1000, x: a.x + 10, joined: 1 }))],
      bonds: [...fc.bonds, ...eth.bonds.map((b) => ({ ...b, id: b.id + 1000, a: b.a + 1000, b: b.b + 1000 }))],
    } as Model;
    const [block] = blocksOf(whole, [1]);
    expect(block.centres?.length).toBeGreaterThan(0);
    expect(partsAlone(block.part, block)).toBeNull();
  });
});
