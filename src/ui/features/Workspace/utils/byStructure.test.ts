import { describe, expect, it } from "vitest";
import { unsureOf, type Unsure } from "../chem/drawing";
import type { Atom, Bond, Model } from "../store/types";
import { byStructure, type StructureValues } from "./byStructure";

const at = (id: number, deg: number, from = { x: 0, y: 0 }): Atom => ({ id, el: "C", x: from.x + 1.5 * Math.cos((deg * Math.PI) / 180), y: from.y + 1.5 * Math.sin((deg * Math.PI) / 180) }) as Atom;

/** A centre with all four bonds in one half of the page, one wedged: shown only by luck (lib/layout/drawn). */
function fan(first: number, x: number): Model {
  const c = { x, y: 0 };
  const atoms: Atom[] = [{ id: first, el: "C", ...c } as Atom, ...[-20, 30, 80, 130].map((d, k) => at(first + 1 + k, d, c))];
  atoms[2] = { ...atoms[2], el: "N" };
  atoms[3] = { ...atoms[3], el: "O" };
  const bonds: Bond[] = [1, 2, 3, 4].map((k) => ({ id: first + 10 + k, a: first, b: first + k, order: 1, ...(k === 1 ? { stereo: "up" as const } : {}) }) as Bond);
  return { atoms, bonds };
}

function join(...ms: Model[]): Model {
  return { atoms: ms.flatMap((m) => m.atoms), bonds: ms.flatMap((m) => m.bonds) };
}

describe("what is made of each structure of a drawing", () => {
  it("is made once for each structure, in the drawing's order, and again only for one whose atoms or bonds changed", () => {
    const m = join(fan(100, 0), fan(200, 10), fan(300, 20));
    const kept: StructureValues<number> = new Map();
    const made: number[] = [];
    const of = (part: Model) => (made.push(part.atoms[0].id), part.atoms.length * 100 + part.bonds.length);
    expect(byStructure(m, kept, of)).toEqual([504, 504, 504]);
    expect(made).toEqual([100, 200, 300]);
    made.length = 0;
    expect(byStructure(m, kept, of)).toEqual([504, 504, 504]);
    expect(made).toEqual([]);
    // (an atom of the second moved, and the third's bond changed)
    const moved = { ...m, atoms: m.atoms.map((a) => (a.id === 201 ? { ...a, x: a.x + 0.1 } : a)), bonds: m.bonds.map((b) => (b.id === 314 ? { ...b, order: 2 as const } : b)) };
    byStructure(moved, kept, of);
    expect(made).toEqual([200, 300]);
  });

  it("leaves out a bond to an atom the drawing does not have, and keeps a lone atom a structure of its own", () => {
    const m: Model = { atoms: [{ id: 1, el: "C", x: 0, y: 0 } as Atom, { id: 2, el: "O", x: 5, y: 0 } as Atom], bonds: [{ id: 9, a: 1, b: 7, order: 1 } as Bond] };
    expect(byStructure(m, new Map(), (part) => part.atoms.map((a) => a.id).join() + "/" + part.bonds.length)).toEqual(["1/0", "2/0"]);
  });

  it("finds what a drawing shows only by luck as the whole drawing read at once does, as structures move", () => {
    const m = join(fan(100, 0), fan(200, 10));
    const kept: StructureValues<Unsure> = new Map();
    expect(unsureOf(m, kept)).toEqual(unsureOf(m));
    expect(unsureOf(m, kept).atoms).toEqual(new Set([100, 200]));
    // (the second's bonds spread round it: no longer by luck)
    const spread = { ...m, atoms: m.atoms.map((a) => (a.id === 204 ? at(204, 210, { x: 10, y: 0 }) : a)) };
    expect(unsureOf(spread, kept)).toEqual(unsureOf(spread));
    expect(unsureOf(spread, kept).atoms).toEqual(new Set([100]));
  });

  it("works out one structure of a thousand moved in a small share of the time the thousand take", () => {
    const m = join(...Array.from({ length: 1000 }, (_, k) => fan(100 * (k + 1), 10 * k)));
    const kept: StructureValues<Unsure> = new Map();
    const cpu = (f: () => void) => {
      const c = process.cpuUsage();
      f();
      const d = process.cpuUsage(c);
      return (d.user + d.system) / 1000;
    };
    const all = cpu(() => unsureOf(m, kept));
    let one = Infinity;
    for (let k = 1; k <= 5; k++) {
      const moved = { ...m, atoms: m.atoms.map((a) => (a.id === 101 ? { ...a, x: a.x + 0.01 * k } : a)) };
      one = Math.min(one, cpu(() => unsureOf(moved, kept)));
    }
    expect(one).toBeLessThan(all / 3);
  });
});
