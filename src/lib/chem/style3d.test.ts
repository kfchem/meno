import { describe, expect, it } from "vitest";
import {
  acceptStyle3dChoice,
  atomColour,
  atomRadius,
  BALL_AND_STICK,
  bondRadiusOf,
  DEFAULT_STYLE_3D_CHOICE,
  hiddenAtoms,
  hidesCarbonHydrogens,
  look3dPreset,
  ribbonsOf,
  LOOK_3D_FIELDS,
  LOOK_3D_PRESETS,
  SCENE_3D,
  SCENE_3D_FIELDS,
  STYLE_3D,
  style3dOf,
  withLookSetting,
  withRole,
  withSharedSetting,
} from "./style3d";

describe("the 3D style", () => {
  it("draws balls a fifth of the van der Waals radius, as the 3D viewer did - and space-filling, each atom as large as it is", () => {
    expect(atomRadius("C", BALL_AND_STICK)).toBeCloseTo(0.34, 9);
    expect(atomRadius("H", BALL_AND_STICK)).toBeCloseTo(0.22, 9);
    expect(atomRadius("C", look3dPreset("space").look)).toBeCloseTo(1.7, 9);
    expect(bondRadiusOf(BALL_AND_STICK)).toBe(0.1);
    expect(bondRadiusOf(look3dPreset("space").look)).toBe(0);
  });
  it("colours atoms by element, an unknown one grey", () => {
    expect(atomColour("O")).toBe("#FF0D0D");
    expect(atomColour("Xx")).toBe("#cccccc");
  });
  it("is ball and stick first, space-filling a step away, in Meno's light", () => {
    expect(STYLE_3D.primary).toEqual(BALL_AND_STICK);
    expect(STYLE_3D.secondary.atoms).toBe("space");
    expect(STYLE_3D.ambientLight).toBe(SCENE_3D.ambientLight);
  });
  it("leaves out only the hydrogens on carbon, and only where a look hides them", () => {
    // methanol: H3C-OH
    const m = {
      atoms: [{ el: "C" }, { el: "O" }, { el: "H" }, { el: "H" }, { el: "H" }, { el: "H" }],
      bonds: [
        { a1: 0, a2: 1 },
        { a1: 0, a2: 2 },
        { a1: 3, a2: 0 },
        { a1: 0, a2: 4 },
        { a1: 1, a2: 5 },
      ],
    };
    expect([...hiddenAtoms(m, BALL_AND_STICK)]).toEqual([0, 0, 0, 0, 0, 0]);
    expect([...hiddenAtoms(m, { ...BALL_AND_STICK, hydrogens: "carbonHidden" })]).toEqual([0, 0, 1, 1, 1, 0]);
  });
});

describe("a biopolymer's chains in a look", () => {
  // a chain of two residues (an alpha carbon each, one with a C-H), a water, and a ligand's C-H
  const m = {
    atoms: [
      { el: "C", x: 0, y: 0, z: 0 },
      { el: "H", x: -1, y: 0, z: 0 },
      { el: "C", x: 3.8, y: 0, z: 0 },
      { el: "O", x: 0, y: 6, z: 0 },
      { el: "C", x: 0, y: -6, z: 0 },
      { el: "H", x: 0, y: -7, z: 0 },
    ],
    bonds: [
      { a1: 0, a2: 1 },
      { a1: 4, a2: 5 },
    ],
    biopolymer: {
      names: ["CA", "HA", "CA", "O", "C1", "H1"],
      residueOf: [0, 0, 1, 2, 3, 3],
      residues: [
        { name: "GLY", chain: "A", seq: 1, iCode: "", standard: true },
        { name: "GLY", chain: "A", seq: 2, iCode: "", standard: true },
        { name: "HOH", chain: "A", seq: 9, iCode: "", standard: false },
        { name: "LIG", chain: "A", seq: 10, iCode: "", standard: false },
      ],
      structure: [null, null, null, null],
    },
  };
  it("leaves out what its ribbons stand for, and water, where it draws ribbons - the ligand stays", () => {
    expect([...hiddenAtoms(m, BALL_AND_STICK)]).toEqual([1, 1, 1, 1, 0, 0]);
    expect([...hiddenAtoms(m, look3dPreset("space").look)]).toEqual([0, 0, 0, 0, 0, 0]);
    expect(ribbonsOf(m, BALL_AND_STICK)).toBe(true);
    expect(ribbonsOf(m, look3dPreset("space").look)).toBe(false);
  });
  it("says it hides hydrogens on carbon only where one it would draw is hidden", () => {
    const hiding = { ...BALL_AND_STICK, hydrogens: "carbonHidden" as const };
    expect(hidesCarbonHydrogens(m, hiding)).toBe(true);
    // (the ligand's C-H gone: what is left is the chain's, which the ribbon stands for)
    const chainOnly = { ...m, bonds: [m.bonds[0]] };
    expect(hidesCarbonHydrogens(chainOnly, hiding)).toBe(false);
    expect(hidesCarbonHydrogens(chainOnly, { ...hiding, biopolymers: "atoms" })).toBe(true);
  });
});

describe("the 3D style as chosen", () => {
  it("is each role's style, with what was changed of it, and what they share", () => {
    const style = style3dOf({ primary: "glossy", secondary: "space", looks: { glossy: { bondRadius: 0.2 } }, shared: { keyLight: 2 } });
    expect(style.primary.roughness).toBe(look3dPreset("glossy").look.roughness);
    expect(style.primary.bondRadius).toBe(0.2);
    expect(style.secondary).toEqual(look3dPreset("space").look);
    expect(style.keyLight).toBe(2);
    expect(style3dOf(DEFAULT_STYLE_3D_CHOICE)).toEqual(STYLE_3D);
  });

  it("no longer counts a setting as changed once it is set back to its style's - or Meno's - value", () => {
    const changed = withLookSetting(DEFAULT_STYLE_3D_CHOICE, "balls", "ballScale", 0.3);
    expect(changed.looks).toEqual({ balls: { ballScale: 0.3 } });
    expect(withLookSetting(changed, "balls", "ballScale", BALL_AND_STICK.ballScale).looks).toEqual({});
    const lit = withSharedSetting(DEFAULT_STYLE_3D_CHOICE, "keyLight", 2);
    expect(lit.shared).toEqual({ keyLight: 2 });
    expect(withSharedSetting(lit, "keyLight", SCENE_3D.keyLight).shared).toEqual({});
  });

  it("gives a style a role - the two changing places when it was the other's", () => {
    expect(withRole(DEFAULT_STYLE_3D_CHOICE, "secondary", "glossy")).toMatchObject({ primary: "balls", secondary: "glossy" });
    expect(withRole(DEFAULT_STYLE_3D_CHOICE, "primary", "space")).toMatchObject({ primary: "space", secondary: "balls" });
    expect(withRole(DEFAULT_STYLE_3D_CHOICE, "primary", "balls")).toBe(DEFAULT_STYLE_3D_CHOICE);
  });

  it("is read from the settings file as far as it reads, the rest left as its style has it", () => {
    expect(acceptStyle3dChoice(undefined)).toEqual(DEFAULT_STYLE_3D_CHOICE);
    // (a settings file from before the styles had roles: Meno's)
    expect(acceptStyle3dChoice({ preset: "glossy", changes: { ballScale: 0.3 } })).toEqual(DEFAULT_STYLE_3D_CHOICE);
    expect(acceptStyle3dChoice({ primary: "space", secondary: "space" })).toMatchObject({ primary: "balls", secondary: "space" });
    expect(
      acceptStyle3dChoice({
        primary: "glossy",
        secondary: "nonesuch",
        looks: {
          glossy: { ballScale: 0.3, bondRadius: 9, bondColor: "#ABCDEF", atoms: "sticks", roughness: "matt", ballSegments: 3, hydrogens: "carbonHidden" },
          nonesuch: { ballScale: 0.3 },
          space: { keyLight: 2 },
        },
        shared: { keyLight: 2, ambientLight: -1, bondColor: "#000000" },
      }),
    ).toEqual({
      primary: "glossy",
      secondary: "space",
      looks: { glossy: { ballScale: 0.3, bondColor: "#abcdef", hydrogens: "carbonHidden" } },
      shared: { keyLight: 2 },
    });
  });

  it("has a field for every setting but how smooth the balls and sticks are, and every style within the fields' bounds", () => {
    const shown = new Set<string>(LOOK_3D_FIELDS.map((f) => f.key));
    for (const key of Object.keys(BALL_AND_STICK)) expect(shown.has(key)).toBe(true);
    const shared = new Set<string>(SCENE_3D_FIELDS.map((f) => f.key));
    for (const key of Object.keys(SCENE_3D)) expect(shared.has(key)).toBe(key !== "ballSegments" && key !== "bondSegments");
    for (const p of LOOK_3D_PRESETS) {
      const read = acceptStyle3dChoice({ primary: p.id, secondary: p.id === "balls" ? "space" : "balls", looks: { [p.id]: p.look } });
      expect(read.looks[p.id]).toEqual(Object.fromEntries(Object.entries(p.look).map(([k, v]) => [k, typeof v === "string" ? v.toLowerCase() : v])));
    }
  });
});
