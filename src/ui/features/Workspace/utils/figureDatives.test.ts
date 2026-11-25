/**
 * Read as structure on a dative bond as Meno draws one - an arrow from its donor - read back from Meno's own drawings (lib/figure
 * `dativeArrows`): cisplatin, its NH3s each lending a pair to the platinum, and Ph3PAuCl, its phosphine lending one to the gold.
 * Before, cisplatin's NH3s were left out and the P-Au bond was read as a plain bond or not at all, with nothing said.
 */
import { describe, expect, it } from "vitest";
import type { FigureDrawn } from "../../../../lib/figure/drawn";
import { hydrogensOn } from "../../../../lib/chem/perception/hydrogens";
import cisplatin from "../../../../lib/figure/fixtures/cisplatin-meno.json";
import goldPhosphine from "../../../../lib/figure/fixtures/ph3paucl-nature.json";
import type { Model } from "../store/types";
import { figureFrom } from "./figures";

const modelOf = (f: unknown): Model => {
  const r = figureFrom(f as FigureDrawn, "", 0);
  if (!("model" in r)) throw new Error(r.none);
  return r.model;
};
/** Each dative bond, as its donor's and its acceptor's elements. */
const datives = (m: Model) => {
  const el = (id: number) => m.atoms.find((a) => a.id === id)!.el;
  return m.bonds.filter((b) => b.dative).map((b) => `${el(b.a)}>${el(b.b)}`);
};
/** Each atom's hydrogens, by the core's one count. */
const hydrogens = (m: Model) => {
  const at = new Map(m.atoms.map((a, i) => [a.id, i]));
  const bonds = m.bonds.map((b) => ({ a: at.get(b.a)!, b: at.get(b.b)!, order: b.order, ...(b.dative ? { dative: true } : {}) }));
  return m.atoms.map((a, i) => [a.el, hydrogensOn(m.atoms, bonds, i)]);
};

describe("a dative bond Meno draws, read back", () => {
  it("cisplatin: each NH3 bonded to the platinum by a dative bond from its N, its three hydrogens its own, nothing said", () => {
    const m = modelOf(cisplatin);
    expect(m.atoms.map((a) => a.el).sort()).toEqual(["Cl", "Cl", "N", "N", "Pt"]);
    expect(datives(m)).toEqual(["N>Pt", "N>Pt"]);
    expect(hydrogens(m).filter(([el]) => el === "N")).toEqual([
      ["N", 3],
      ["N", 3],
    ]);
    expect(m.atoms.filter((a) => a.unsure)).toEqual([]);
  });

  it("Ph3PAuCl: the phosphine bonded to the gold by a dative bond, not a plain one, and no scheme's arrow read", () => {
    const r = figureFrom(goldPhosphine as unknown as FigureDrawn, "", 0);
    if (!("model" in r)) throw new Error(r.none);
    expect(r.scheme?.arrows ?? []).toEqual([]);
    expect(datives(r.model)).toEqual(["P>Au"]);
    expect(r.model.atoms.length).toBe(21);
    expect(r.model.atoms.filter((a) => a.unsure)).toEqual([]);
  });
});
