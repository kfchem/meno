/**
 * Where a structure drawn can carry a configuration that sets something (chem/candidatesDrawn): the core's candidates, then
 * identity's units. The chemistry check's cases: offered where a configuration sets something, never where its two senses are
 * one structure.
 */
import { describe, expect, it } from "vitest";
import type { Model } from "../store/types";
import { candidatesDrawn } from "./candidatesDrawn";
import { drawnFromSmiles } from "./testdata/identityCases";

/** The atoms (by element and place) and the bonds (by their atoms' places) offered of `smiles` drawn. */
function offered(smiles: string): { atoms: string[]; bonds: string[] } {
  const m: Model = drawnFromSmiles(smiles);
  const ask = candidatesDrawn(m);
  const place = new Map(m.atoms.map((a, i) => [a.id, i]));
  return {
    atoms: m.atoms.flatMap((a, i) => (ask.atom(a.id) ? [`${a.el}${i}`] : [])),
    bonds: m.bonds.flatMap((b) => (ask.bond(b.id) ? [`${place.get(b.a)}-${place.get(b.b)}`] : [])),
  };
}

describe("where a configuration can be and sets something, drawn", () => {
  it("a centre of four unlike groups, as drawn or not drawn; four alike or two alike, none", () => {
    expect(offered("CC(O)CC").atoms).toEqual(["C1"]);
    expect(offered("C[C@H](O)CC").atoms).toEqual(["C1"]);
    expect(offered("CC(C)(C)C").atoms).toEqual([]);
    expect(offered("CC(C)(C)O").atoms).toEqual([]);
    expect(offered("C[Si](C)(C)C").atoms).toEqual([]);
  });

  it("a meso form's centres and a pseudoasymmetric centre are offered: each turned alone is another structure", () => {
    expect(offered("C[C@@H](O)[C@@H](O)C").atoms).toEqual(["C1", "C3"]);
    expect(offered("OC(=O)[C@H](O)[C@@H](O)[C@H](O)C(=O)O").atoms).toEqual(["C3", "C5", "C7"]);
  });

  it("charged and lone-pair centres of unlike groups: an ammonium, a sulfonium, an N-oxide, a phosphonium", () => {
    expect(offered("C[N+](CC)(CCC)Cc1ccccc1").atoms).toEqual(["N1"]);
    expect(offered("C[S+](CC)c1ccccc1").atoms).toEqual(["S1"]);
    expect(offered("C[N+]([O-])(CC)c1ccccc1").atoms).toEqual(["N1"]);
    expect(offered("C[P+](CC)(c1ccccc1)Cc1ccccc1").atoms).toEqual(["P1"]);
  });

  it("a cage's atom with no configuration drawn is not offered: the CIP gives it no label (Troeger's base's N, a cage's)", () => {
    expect(offered("Cc1ccc2c(c1)CN3c4ccc(C)cc4CN2C3").atoms).toEqual([]);
    expect(offered("C1CC2CCC1C2").atoms).toEqual([]);
  });

  it("a sulfone's S, a phosphate's P of two alike esters, PPh3's P: candidates by shape, none here", () => {
    expect(offered("CS(C)(=O)=O").atoms).toEqual([]);
    expect(offered("COP(=O)(OC)OCC").atoms).toEqual([]);
    expect(offered("c1ccc(cc1)P(c1ccccc1)c1ccccc1").atoms).toEqual([]);
  });

  it("a double bond with unlike groups on each end; an oxime of two alike groups and a CH2= end none", () => {
    expect(offered("C/C=C/CC").bonds).toEqual(["1-2"]);
    expect(offered("CC=CCC").bonds).toEqual(["1-2"]);
    expect(offered("CC(C)=NO").bonds).toEqual([]);
    expect(offered("C=CC").bonds).toEqual([]);
  });

  it("a cumulene's run: an allene's two double bonds, a butatriene's three; an allene with two alike groups at one end none", () => {
    expect(offered("CC=C=CC").bonds).toEqual(["1-2", "2-3"]);
    expect(offered("CC=C=C=CC").bonds).toEqual(["1-2", "2-3", "3-4"]);
    expect(offered("CC(C)=C=CC").bonds).toEqual([]);
  });

  it("a biaryl's axis drawn with a wedge is offered: 2,2'-dimethyl-6,6'-dinitrobiphenyl", () => {
    const m: Model = drawnFromSmiles("Cc1cccc([N+](=O)[O-])c1-c1c(C)cccc1[N+](=O)[O-]");
    // (the axis: the single bond between the rings, atoms 9 and 10; a wedge out of its first end along a single bond of its ring,
    //  narrow at the end)
    const id = (i: number) => m.atoms[i].id;
    const axis = m.bonds.find((b) => [b.a, b.b].sort().join() === [id(9), id(10)].sort().join())!;
    const out = m.bonds.find((b) => b.id !== axis.id && b.order === 1 && (b.a === id(9) || b.b === id(9)))!;
    const wedged: Model = { ...m, bonds: m.bonds.map((b) => (b.id === out.id ? { ...b, a: id(9), b: b.a === id(9) ? b.b : b.a, stereo: "up" as const } : b)) };
    const ask = candidatesDrawn(wedged);
    expect(ask.bond(axis.id)).toBe(true);
    expect(candidatesDrawn(m).bond(axis.id)).toBe(false);
  });
});
