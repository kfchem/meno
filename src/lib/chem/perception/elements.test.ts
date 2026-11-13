import { describe, expect, it } from "vitest";
import { ELEMENTS } from "../elements";
import {
  alwaysIonic,
  bridgesToMetal,
  drawnRoundMetal,
  inValenceSums,
  inValenceSumsFromGeometry,
  ionic,
  labelNotElement,
  mainGroupMetal,
  metal,
  notMetal,
  transitionMetal,
} from "./elements";

const symbols = ELEMENTS.map((e) => e.symbol);
/** What is no element's symbol but reaches these sets all the same: a star, a label, a symbol in the wrong case, nothing. */
const notSymbols = ["*", "R", "Ph", "Me", "fe", "FE", "pr", "D", "T", ""];
const sorted = (s: Iterable<string>) => [...s].sort();

describe("what kind of element: each set by hand, against the periodic table", () => {
  it("takes the d block with the lanthanoids and actinoids as the transition metals: 68, by the four ranges of Z", () => {
    expect(transitionMetal.size).toBe(68);
    for (const el of ["Sc", "Zn", "La", "Pr", "Lu", "Hg", "Ac", "U", "Lr", "Cn"]) expect(transitionMetal.has(el), el).toBe(true);
    for (const el of ["Ca", "Ga", "Ba", "Tl", "Ra", "Nh"]) expect(transitionMetal.has(el), el).toBe(false);
    // Sc to Zn and Y to Cd, ten each; La to Hg and Ac to Cn, twenty-four each (an f row with the rest of its d row)
    expect(ELEMENTS.filter((e) => transitionMetal.has(e.symbol)).map((e) => e.number)).toEqual([
      ...Array.from({ length: 10 }, (_, k) => 21 + k),
      ...Array.from({ length: 10 }, (_, k) => 39 + k),
      ...Array.from({ length: 24 }, (_, k) => 57 + k),
      ...Array.from({ length: 24 }, (_, k) => 89 + k),
    ]);
  });

  it("takes the metals of the main groups: groups 1 and 2, and Al to Nh, Sn to Fl, Bi and Mc, Po and Lv", () => {
    expect(sorted(mainGroupMetal)).toEqual(sorted("Li Na K Rb Cs Fr Be Mg Ca Sr Ba Ra Al Ga In Tl Nh Sn Pb Fl Bi Mc Po Lv".split(" ")));
    for (const el of ["B", "Si", "Ge", "As", "Sb", "Te", "At", "Zn", "H"]) expect(mainGroupMetal.has(el), el).toBe(false);
  });

  it("takes either as a metal, and no metalloid", () => {
    for (const el of ["Li", "Al", "Sn", "Bi", "Po", "Fe", "Pr", "U"]) expect(metal.has(el), el).toBe(true);
    for (const el of ["B", "Si", "Ge", "As", "Sb", "Te", "At", "H", "C", "Xe"]) expect(metal.has(el), el).toBe(false);
    expect(transitionMetal.size + mainGroupMetal.size).toBe(metal.size);
  });

  it("holds the metals and the elements that are none as complements over the whole table: every element in one, none in both", () => {
    expect(symbols.filter((el) => metal.has(el) === notMetal.has(el))).toEqual([]);
    expect(metal.size + notMetal.size).toBe(118);
    expect(sorted(notMetal)).toEqual(sorted("H He B C N O F Ne Si P S Cl Ar Ge As Se Br Kr Sb Te I Xe At Rn Ts Og".split(" ")));
  });

  it("puts nothing that is no element's symbol in any set", () => {
    const sets = [transitionMetal, mainGroupMetal, metal, notMetal, drawnRoundMetal, bridgesToMetal, alwaysIonic, inValenceSums, inValenceSumsFromGeometry];
    for (const s of sets) expect([...s].filter((el) => !symbols.includes(el))).toEqual([]);
    for (const s of sets) for (const x of notSymbols) expect(s.has(x), x).toBe(false);
    expect([...ionic.keys()].filter((el) => !symbols.includes(el))).toEqual([]);
  });

  it("draws ligands round the transition metals but Pr, propyl's label, and the seventh row", () => {
    expect(sorted(labelNotElement)).toEqual(["Pr"]);
    expect(drawnRoundMetal.size).toBe(43);
    for (const el of ["Sc", "Fe", "Zn", "Pd", "La", "Ce", "Nd", "Lu", "Hg"]) expect(drawnRoundMetal.has(el), el).toBe(true);
    for (const el of ["Pr", "Ac", "Th", "U", "Lr", "Rf", "Cn", "Al", "Li"]) expect(drawnRoundMetal.has(el), el).toBe(false);
    expect([...drawnRoundMetal].filter((el) => !transitionMetal.has(el))).toEqual([]);
  });

  it("bridges the main-group metals of the Tebbe reagent's kind", () => {
    expect(sorted(bridgesToMetal)).toEqual(sorted(["Li", "Na", "K", "Mg", "Ca", "Zn", "Al", "Ga", "In"]));
  });

  it("gives groups 1 and 2 their ions' charges, and a condensed formula its view of them", () => {
    expect(Object.fromEntries(ionic)).toEqual({ Li: 1, Na: 1, K: 1, Rb: 1, Cs: 1, Fr: 1, Be: 2, Mg: 2, Ca: 2, Sr: 2, Ba: 2, Ra: 2 });
    expect(sorted(alwaysIonic)).toEqual(["Cs", "K", "Na", "Rb"]);
    for (const el of alwaysIonic) expect(ionic.get(el), el).toBe(1);
  });

  it("counts the bonds of hydrogen, the nonmetals and the metalloids in a valence, and Sb's in protonation only", () => {
    expect(sorted(inValenceSums)).toEqual(sorted("H B C N O F Si P S Cl Ge As Se Br Sb Te I".split(" ")));
    expect(sorted(inValenceSums).filter((el) => !inValenceSumsFromGeometry.has(el))).toEqual(["Sb"]);
    expect([...inValenceSums].filter((el) => metal.has(el))).toEqual([]);
  });
});

/**
 * The move (foundation part 3, A): each caller's old list, as it stood in its file, against the set it now takes - over every element symbol
 * and what is none. Each list below is copied from the code the move deleted, unchanged.
 */
describe("each caller takes the set that was its list: nothing moved", () => {
  const old = {
    // layout/perceive.ts METALS and chem/ligands.ts METALS (one list, written twice)
    drawnRound: new Set("Sc Ti V Cr Mn Fe Co Ni Cu Zn Y Zr Nb Mo Tc Ru Rh Pd Ag Cd Hf Ta W Re Os Ir Pt Au Hg La Ce Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu".split(" ")),
    // chem/metalHolds.ts isMetal, by atomic number
    dOrF: (el: string) => {
      const z = ELEMENTS.find((e) => e.symbol === el)?.number ?? 0;
      return (z >= 21 && z <= 30) || (z >= 39 && z <= 48) || (z >= 57 && z <= 80) || (z >= 89 && z <= 112);
    },
    // layout/perceive.ts BRIDGED_TO
    bridged: new Set(["Li", "Na", "K", "Mg", "Ca", "Zn", "Al", "Ga", "In"]),
    // chem/elements.ts NOT_METALS (before Ts and Og joined it)
    notMetals: new Set("H He B C N O F Ne Si P S Cl Ar Ge As Se Br Kr Sb Te I Xe At Rn".split(" ")),
    // chem/smilesWhy.ts IONIC
    ionic: new Map<string, number>([...["Li", "Na", "K", "Rb", "Cs", "Fr"].map((e) => [e, 1] as const), ...["Be", "Mg", "Ca", "Sr", "Ba", "Ra"].map((e) => [e, 2] as const)]),
    // chem/condensed.ts IONIC
    condensed: new Set(["Na", "K", "Rb", "Cs"]),
    // chem/protonation.ts COUNTED and chem/ordersFromGeometry.ts COUNTED
    protonation: new Set(["H", "B", "C", "N", "O", "F", "Si", "P", "S", "Cl", "Ge", "As", "Se", "Br", "Sb", "Te", "I"]),
    geometry: new Set(["H", "B", "C", "N", "O", "F", "Si", "P", "S", "Cl", "Ge", "As", "Se", "Br", "Te", "I"]),
  };
  const every = [...symbols, ...notSymbols];
  const differ = (was: (el: string) => unknown, is: (el: string) => unknown) => every.filter((el) => was(el) !== is(el));

  it("draws round the same metals, and a complex's formula reads the same ones", () => {
    expect(differ((el) => old.drawnRound.has(el), (el) => drawnRoundMetal.has(el))).toEqual([]);
  });
  it("holds the same metals by their d count", () => {
    expect(differ(old.dOrF, (el) => transitionMetal.has(el))).toEqual([]);
  });
  it("bridges the same main-group metals", () => {
    expect(differ((el) => old.bridged.has(el), (el) => bridgesToMetal.has(el))).toEqual([]);
  });
  it("gives the same ions the same charges, and a condensed formula the same ions", () => {
    expect(differ((el) => old.ionic.get(el), (el) => ionic.get(el))).toEqual([]);
    expect(differ((el) => old.condensed.has(el), (el) => alwaysIonic.has(el))).toEqual([]);
  });
  it("counts the same elements' bonds in a valence, each of the two as it did", () => {
    expect(differ((el) => old.protonation.has(el), (el) => inValenceSums.has(el))).toEqual([]);
    expect(differ((el) => old.geometry.has(el), (el) => inValenceSumsFromGeometry.has(el))).toEqual([]);
  });
  it("reads the same elements as no metals but Ts and Og, which join At and Rn so that every element is one or the other", () => {
    expect(differ((el) => old.notMetals.has(el), (el) => notMetal.has(el))).toEqual(["Ts", "Og"]);
  });
});
