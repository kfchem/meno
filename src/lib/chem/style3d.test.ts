import { describe, expect, it } from "vitest";
import { elementColour } from "./elements";
import {
  COLOUR_SETS_3D,
  colourSet3d,
  greyOf,
  ballCircles,
  linedBall,
  paler,
  FADE_MOST,
  fadeAt,
  lookOfStyle,
  withAtomColour,
  acceptStyle3dChoice,
  atomColour,
  atomRadius,
  BALL_AND_STICK,
  bondRadiusOf,
  countedAtoms,
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
    // (Alvarez's radii: carbon 1.77 A, hydrogen 1.20)
    expect(atomRadius("C", BALL_AND_STICK)).toBeCloseTo(0.354, 9);
    expect(atomRadius("H", BALL_AND_STICK)).toBeCloseTo(0.24, 9);
    expect(atomRadius("C", look3dPreset("space").look)).toBeCloseTo(1.77, 9);
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
  it("shades hollows per atom in every style - space-filling the most - and casts shadows, part of the way dark", () => {
    for (const p of LOOK_3D_PRESETS) {
      expect(p.look.occlusionBy).toBe("atoms");
      expect(p.look.occlusion).toBeGreaterThan(0);
    }
    expect(look3dPreset("space").look.occlusion).toBeGreaterThan(look3dPreset("balls").look.occlusion);
    expect(SCENE_3D.shadows).toBeGreaterThan(0);
    expect(SCENE_3D.shadows).toBeLessThan(1);
    expect(SCENE_3D.largeDrawings).toBe("lighter");
    // (read within their bounds, as every setting is: no shade is None, never a depth of 0)
    expect(
      acceptStyle3dChoice({
        looks: { space: { occlusion: 2, occlusionBy: "screen" }, balls: { occlusion: 0, occlusionBy: "rays" }, glossy: { occlusionBy: "none" } },
        shared: { shadows: 0.5, largeDrawings: "asSet" },
      }),
    ).toMatchObject({
      looks: { space: { occlusionBy: "screen" }, glossy: { occlusionBy: "none" } },
      shared: { shadows: 0.5, largeDrawings: "asSet" },
    });
    expect(acceptStyle3dChoice({ looks: { balls: { occlusion: 0 } } }).looks.balls).toBeUndefined();
  });

  it("greys out how deep the shade is while there is none", () => {
    const deep = LOOK_3D_FIELDS.find((f) => f.key === "occlusion")!;
    expect(deep.unless).toEqual({ key: "occlusionBy", is: "none" });
    expect(LOOK_3D_FIELDS.some((f) => f.key === deep.unless!.key)).toBe(true);
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
  it("counts toward a very large drawing what it draws and what its ribbons stand for - not water, nor hydrogens it hides", () => {
    const hiding = { ...BALL_AND_STICK, hydrogens: "carbonHidden" as const };
    // (the chain's three atoms, the ligand's two; with C-H hidden, the chain's own C-H still stood for)
    expect(countedAtoms(m, BALL_AND_STICK)).toBe(5);
    expect(countedAtoms(m, hiding)).toBe(4);
    // (as atoms, the water drawn too)
    expect(countedAtoms(m, look3dPreset("space").look)).toBe(6);
    expect(countedAtoms(m, { ...hiding, biopolymers: "atoms" })).toBe(4);
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
          glossy: { ballScale: 0.3, bondRadius: 9, bondColor: "#ABCDEF", atoms: "tubes", roughness: "matt", ballSegments: 3, hydrogens: "carbonHidden" },
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
    // (the atoms' colours have a table of their own: withAtomColour)
    for (const key of Object.keys(BALL_AND_STICK)) expect(shown.has(key)).toBe(key !== "colours");
    const shared = new Set<string>(SCENE_3D_FIELDS.map((f) => f.key));
    for (const key of Object.keys(SCENE_3D)) expect(shared.has(key)).toBe(key !== "ballSegments" && key !== "bondSegments");
    for (const p of LOOK_3D_PRESETS) {
      const read = acceptStyle3dChoice({ primary: p.id, secondary: p.id === "balls" ? "space" : "balls", looks: { [p.id]: p.look } });
      const { colours, ...rest } = p.look;
      expect(read.looks[p.id]).toEqual({
        ...Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, typeof v === "string" && v.startsWith("#") ? v.toLowerCase() : v])),
        ...(Object.keys(colours).length ? { colours } : {}),
      });
    }
  });
});

describe("the outlined style, and what it is made of", () => {
  it("draws a dark line round balls and thin near-black sticks, circles on every ball, its back fading, in its own colours", () => {
    const look = look3dPreset("outlined").look;
    expect(look.atoms).toBe("balls");
    expect(look.outline).toBeGreaterThanOrEqual(1);
    expect(look.outline).toBeLessThanOrEqual(1.5);
    expect(look.bondColouring).toBe("single");
    expect(look.depthFade).toBeGreaterThan(0);
    expect(look.roughness).toBeLessThan(0.5);
    // (hydrogen's ball smaller than carbon's)
    expect(atomRadius("H", look)).toBeLessThan(atomRadius("C", look));
    expect(atomColour("H", look)).toBe("#ffffff");
    // (a bright red)
    expect(atomColour("O", look)).toBe("#ff1f1f");
    expect(look.bondRadius).toBeLessThan(BALL_AND_STICK.bondRadius);
    // (three circles, on every atom - hydrogen's too - as thin as a line)
    expect(ballCircles(look)).toBe(3);
    for (const el of ["H", "C", "O", "Li"]) expect(linedBall(el, look)).toBe(true);
    expect(look.ballLinesWidth).toBeLessThanOrEqual(look.outline);
    expect(atomColour("Na", look)).toBe(atomColour("K", look));
    // (an element it does not colour: as Meno does)
    expect(atomColour("Br", look)).toBe(atomColour("Br"));
    // (Meno's own styles draw no line and fade nothing)
    for (const id of ["balls", "glossy", "space"]) {
      expect(ballCircles(look3dPreset(id).look)).toBe(0);
      expect(look3dPreset(id).look.outline).toBe(0);
      expect(look3dPreset(id).look.depthFade).toBe(0);
    }
  });

  it("fades nothing at the front, more toward the back, smoothly, never past its most", () => {
    expect(fadeAt(0, 1)).toBe(0);
    expect(fadeAt(1, 1)).toBeCloseTo(FADE_MOST, 12);
    expect(fadeAt(1, 0.5)).toBeCloseTo(FADE_MOST / 2, 12);
    expect(fadeAt(0.5, 0)).toBe(0);
    let last = -1;
    for (let d = 0; d <= 1.0001; d += 0.05) {
      const f = fadeAt(d, 0.8);
      expect(f).toBeGreaterThanOrEqual(last);
      last = f;
    }
    // (out of range, held at its ends)
    expect(fadeAt(-1, 1)).toBe(0);
    expect(fadeAt(3, 2)).toBeCloseTo(FADE_MOST, 12);
  });

  it("takes an element's colour of the user's own over its preset's, and gives it back", () => {
    let choice = withAtomColour(DEFAULT_STYLE_3D_CHOICE, "outlined", "C", "#202020");
    expect(lookOfStyle(choice, "outlined").colours.C).toBe("#202020");
    // (the preset's others kept)
    expect(lookOfStyle(choice, "outlined").colours.O).toBe(look3dPreset("outlined").look.colours.O);
    choice = withAtomColour(choice, "balls", "N", "#00FF00");
    expect(atomColour("N", lookOfStyle(choice, "balls"))).toBe("#00ff00");
    // (reset: the preset's again, nothing left changed)
    choice = withAtomColour(choice, "outlined", "C", null);
    choice = withAtomColour(choice, "balls", "N", atomColour("N"));
    expect(choice.looks).toEqual({});
    // (a colour set beside other changes keeps them)
    const both = withAtomColour(withLookSetting(DEFAULT_STYLE_3D_CHOICE, "balls", "outline", 1), "balls", "O", "#ff8800");
    expect(both.looks.balls).toEqual({ outline: 1, colours: { O: "#ff8800" } });
  });

  it("reads its settings and colours back from the settings file, and nothing that does not read", () => {
    const read = acceptStyle3dChoice({
      primary: "outlined",
      secondary: "space",
      looks: { outlined: { outline: 2, depthFade: 0.3, bondColouring: "byAtom", outlineColor: "#ABCDEF", colours: { C: "#123456", Xx: "#000000", O: "red", N: 3 } } },
    });
    expect(read.looks.outlined).toEqual({ outline: 2, depthFade: 0.3, bondColouring: "byAtom", outlineColor: "#abcdef", colours: { C: "#123456" } });
    const odd = acceptStyle3dChoice({ primary: "outlined", secondary: "balls", looks: { outlined: { outline: 9, depthFade: -1, bondColouring: "rainbow", colours: [] } } });
    expect(odd.looks.outlined).toBeUndefined();
  });
});

describe("lines on the balls", () => {
  it("are on the atoms chosen: all, all but hydrogen, or carbon alone - none, where the style draws none", () => {
    const on = (ballLinesOn: "all" | "heavy" | "carbon", ballLines: "none" | "two" | "three" = "two") => ["H", "C", "O"].filter((el) => linedBall(el, { ballLines, ballLinesOn }));
    expect(on("all")).toEqual(["H", "C", "O"]);
    expect(on("heavy")).toEqual(["C", "O"]);
    expect(on("carbon")).toEqual(["C"]);
    expect(on("all", "none")).toEqual([]);
    expect(ballCircles({ ballLines: "two" })).toBe(2);
  });

  it("are read back from the settings file, within their bounds", () => {
    const read = acceptStyle3dChoice({ primary: "balls", secondary: "space", looks: { balls: { ballLines: "two", ballLinesOn: "carbon", ballLinesWidth: 2, ballLinesColor: "#334455" } } });
    expect(read.looks.balls).toEqual({ ballLines: "two", ballLinesOn: "carbon", ballLinesWidth: 2, ballLinesColor: "#334455" });
    const odd = acceptStyle3dChoice({ primary: "balls", secondary: "space", looks: { balls: { ballLines: 2, ballLinesOn: "H", ballLinesWidth: 9 } } });
    expect(odd.looks.balls).toBeUndefined();
  });
});

describe("the colour sets", () => {
  it("are Jmol's - the elements' own - Bright over Jmol's, and Greys as light as Jmol's", () => {
    expect(COLOUR_SETS_3D.map((c) => c.id)).toEqual(["jmol", "bright", "greys", "pastel"]);
    expect(colourSet3d("jmol").name).toBe("Jmol");
    expect(atomColour("N")).toBe(elementColour("N"));
    expect(colourSet3d("bright").colour("O")).toBe("#ff1f1f");
    expect(colourSet3d("bright").colour("Br")).toBe(elementColour("Br"));
    expect(colourSet3d("greys").colour("H")).toBe("#ffffff");
    expect(greyOf("#000000")).toBe("#000000");
    // (a pure red as light as it is: about a third of the way up)
    expect(greyOf("#ff0000")).toBe("#7f7f7f");
    expect(colourSet3d("rainbow").id).toBe("jmol");
  });

  it("are chosen per style, the style's own colours over them, and set back to the set chosen", () => {
    let choice = withLookSetting(DEFAULT_STYLE_3D_CHOICE, "balls", "colourSet", "greys");
    expect(atomColour("O", lookOfStyle(choice, "balls"))).toBe(greyOf(elementColour("O")));
    choice = withAtomColour(choice, "balls", "O", "#ff0000");
    expect(atomColour("O", lookOfStyle(choice, "balls"))).toBe("#ff0000");
    // (set back: the grey of the set chosen, nothing of its own left)
    choice = withAtomColour(choice, "balls", "O", greyOf(elementColour("O")));
    expect(choice.looks.balls).toEqual({ colourSet: "greys" });
    expect(look3dPreset("outlined").look.colourSet).toBe("bright");
    expect(look3dPreset("balls").look.colourSet).toBe("jmol");
  });
});

describe("the styles built in", () => {
  it("draw balls a fifth of each atom's size in Meno's own, 18% in the other balls and sticks, 15% in Outlined", () => {
    const scale = Object.fromEntries(LOOK_3D_PRESETS.filter((p) => p.look.atoms === "balls").map((p) => [p.id, p.look.ballScale]));
    expect(scale).toEqual({ balls: 0.2, glossy: 0.18, outlined: 0.15, print: 0.18, pastel: 0.18, modelKit: 0.18 });
    expect(LOOK_3D_PRESETS.map((p) => p.name)).toEqual(["Ball and stick", "Glossy", "Outlined", "Print", "Pastel", "Model kit", "Sticks", "Space-filling"]);
  });

  it("draw sticks alone with every atom as thick as a stick, and its sticks", () => {
    const sticks = look3dPreset("licorice").look;
    expect(sticks.atoms).toBe("sticks");
    for (const el of ["H", "C", "Br"]) expect(atomRadius(el, sticks)).toBe(sticks.bondRadius);
    expect(bondRadiusOf(sticks)).toBe(sticks.bondRadius);
    expect(sticks.bondColouring).toBe("byAtom");
  });

  it("print in greys, and Pastel's colours are Jmol's two fifths of the way to white", () => {
    expect(look3dPreset("print").look.colourSet).toBe("greys");
    expect(paler("#000000", 0.4)).toBe("#666666");
    expect(colourSet3d("pastel").colour("O")).toBe(paler(elementColour("O").toLowerCase(), 0.4));
  });

  it("let every setting be changed in every one of them - none hidden, none fixed", () => {
    for (const p of LOOK_3D_PRESETS) {
      for (const f of LOOK_3D_FIELDS) {
        const now = p.look[f.key];
        const other =
          f.kind === "choice" ? f.options.find((o) => o.value !== now)!.value : f.kind === "number" ? (now === f.max ? f.min : f.max) : now === "#123456" ? "#654321" : "#123456";
        const read = acceptStyle3dChoice(withLookSetting(DEFAULT_STYLE_3D_CHOICE, p.id, f.key, other as never));
        expect([p.id, f.key, read.looks[p.id]?.[f.key]]).toEqual([p.id, f.key, other]);
      }
    }
  });
});
