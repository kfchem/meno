/**
 * A Fischer projection's metal test asked of what an atom is read as (found in review): a "Pr" the drawing holds as a propyl group is no
 * praseodymium, and a "Pr" with nothing held is one.
 */
import { describe, expect, it } from "vitest";
import type { Atom, Bond, Model } from "../store/types";
import { fischerCentres } from "./fischer";

const A = (id: number, el: string, x: number, y: number, extra: Partial<Atom> = {}) => ({ id, el, x, y, r: 0.9, ...extra }) as Atom;
const B = (id: number, a: number, b: number) => ({ id, a, b, order: 1 }) as Bond;
const plus = (centre: Atom): Model =>
  ({ atoms: [centre, A(2, "Cl", -1, 0), A(3, "Br", 1, 0), A(4, "N", 0, 1), A(5, "I", 0, -1)], bonds: [B(11, 1, 2), B(12, 1, 3), B(13, 1, 4), B(14, 1, 5)] }) as Model;

describe("a label that is also an element's symbol, at the centre of a plus", () => {
  it("a Pr the drawing holds as a group (a typed propyl) is no metal; a Pr with nothing held - praseodymium - is: not taken", () => {
    expect(fischerCentres(plus(A(1, "Pr", 0, 0, { abbrev: {} } as Partial<Atom>)), 1)).toHaveLength(1);
    expect(fischerCentres(plus(A(1, "Pr", 0, 0)), 1)).toEqual([]);
  });
});
