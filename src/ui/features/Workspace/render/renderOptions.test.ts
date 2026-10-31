import { describe, expect, it } from "vitest";
import { shownOptions, valuesOf } from "../../../../lib/options";
import type { LookDecl, MotionDecl } from "../../../../lib/plugins/manifest";
import { askOf, bySection, filmLength, finishEntry, finishOf, lengthNote, tooShort, withFixed, looksOffered, motionEntry, partsOf, renderOptions, shortestFilm } from "./renderOptions";

/** Looks as a render plugin's manifest declares them: Meno knows none of these names. */
const DECLARED: LookDecl[] = [
  { id: "cartoon", label: "Cartoon: one lit band, outlined", parts: { shading: "toon", outlines: "mixed" } },
  { id: "line-art", label: "Line art", parts: { molecules: "white", surfaces: "matte", shading: "toon", outlines: "mixed", band: 1 } },
  { id: "shiny-thing", label: "A made-up look", description: "Only in a manifest.", own: true },
  { id: "jelly", label: "Jelly", own: true, seeThrough: true, parts: { sticks: "stopped" } },
  { id: "pane", label: "Pane", parts: { molecules: "glass", surfaces: "glass" }, seeThrough: true },
];

describe("Render's look: one choice, a bundle of parts, declared by the renderer", () => {
  const options = renderOptions("picture", [], true, DECLARED);
  const look = options.find((o) => o.id === "look")! as unknown as { type: string; choices: { value: string; label: string; sets?: Record<string, unknown> }[]; default: string };

  it("offers the canvas's look, Meno's own, and then those the renderer declares, in its order, with its labels - one of Meno's ids once", () => {
    expect(look.type).toBe("choice");
    expect(look.choices.map((c) => c.value)).toEqual(["meno", "glossy", "matte", "glass", "metal", "cartoon", "lineart", "line-art", "shiny-thing", "jelly", "pane"]);
    expect(look.choices.map((c) => c.label)[8]).toBe("A made-up look");
    expect(look.default).toBe("meno");
  });

  it("has looks of its own made of Meno's parts alone - the renderer is asked for the parts, not their names", () => {
    const own = renderOptions("picture", [], false).find((o) => o.id === "look") as unknown as { choices: { value: string }[] };
    expect(own.choices.map((c) => c.value)).toEqual(["meno", "glossy", "matte", "glass", "metal", "cartoon", "lineart"]);
    // (and one declared twice, or as Meno's, once)
    expect(looksOffered([{ id: "meno", label: "X" }, { id: "a", label: "A" }, { id: "a", label: "A again" }]).map((l) => l.label).slice(-2)).toEqual(["Line art: white fill, outlined", "A"]);
    expect(finishEntry(finishOf({ look: "cartoon", shading: "toon", outlines: "mixed" }))).toMatchObject({ look: "meno", shading: "toon", outlines: "mixed" });
    expect(finishEntry(finishOf({ look: "shiny-thing" })).look).toBe("shiny-thing");
  });

  it("fills in the parts a look declares, the plain ones for the rest", () => {
    const cartoon = look.choices.find((c) => c.value === "cartoon")!;
    expect(cartoon.sets).toMatchObject({ molecules: "meno", surfaces: "meno", shading: "toon", outlines: "mixed", band: 0.5, sticks: "shown" });
    expect(partsOf(DECLARED[1])).toMatchObject({ molecules: "white", surfaces: "matte", band: 1 });
    // (no separate "made of" choices left on the card's top: they are the look's parts, folded)
    expect(options.filter((o) => o.id === "molecules" || o.id === "surfaces").every((o) => o.group === "Adjust this look")).toBe(true);
  });

  it("hides the parts that do not apply: a band without toon shading, a width without an outer edge, the renderer's choices under toon", () => {
    const lit = valuesOf(options, {});
    expect(shownOptions(options, lit).map((o) => o.id)).not.toContain("band");
    expect(shownOptions(options, lit).map((o) => o.id)).not.toContain("outline");
    const toon = { ...lit, shading: "toon", outlines: "mixed" };
    expect(shownOptions(options, toon).map((o) => o.id)).toEqual(expect.arrayContaining(["band", "outline", "outline_colour"]));
    expect(shownOptions([{ id: "engine", label: "R", type: "choice", choices: [{ value: "a", label: "A" }], default: "a", when: { id: "shading", in: ["lit"] } }], {}, toon)).toHaveLength(0);
  });

  it("offers no surfaces choice where nothing shows a surface", () => {
    expect(renderOptions("picture", [], false, DECLARED).some((o) => o.id === "surfaces")).toBe(false);
  });

  it("is asked of the renderer by its parts: the materials in the scene, the shading and outlines in the entry, the look's name with them", () => {
    const l = DECLARED[1];
    const ask = askOf("picture", { width: 900, shape: "fit", look: l.id, ...partsOf(l) });
    expect(ask).toMatchObject({ molecules: "white", surfaces: "matte", finish: { shading: "toon", outlines: "mixed", band: 1 } });
    expect(finishEntry(ask.finish)).toEqual({ look: "line-art", shading: "toon", outlines: "mixed", outline: 3, outline_colour: "black", band: 1 });
    expect(finishEntry(askOf("picture", { width: 900, shape: "fit" }).finish)).toMatchObject({ look: "meno", shading: "lit", outlines: "none" });
    const own = askOf("picture", { width: 900, shape: "fit", look: "shiny-thing", ...partsOf(DECLARED[2]) });
    expect(own.molecules).toBe("meno");
    expect(finishEntry(own.finish).look).toBe("shiny-thing");
  });

  it("offers where sticks stop only under the looks declared see-through, each with the default it declares", () => {
    const sticks = options.find((o) => o.id === "sticks") as unknown as { when: { id: string; in: string[] } };
    expect(sticks.when).toEqual({ id: "look", in: ["glass", "jelly", "pane"] });
    const ask = askOf("picture", { width: 900, shape: "fit", look: "jelly", ...partsOf(DECLARED[3]) });
    expect(ask.finish?.sticks).toBe("stopped");
    expect(askOf("picture", { width: 900, shape: "fit", look: "pane", ...partsOf(DECLARED[4]) }).finish?.sticks).toBe("shown");
    // (with no renderer's look seen through, only Meno's own crystal: under it alone)
    expect((renderOptions("picture", [], false, [DECLARED[0]]).find((o) => o.id === "sticks") as unknown as { when: unknown }).when).toEqual({ id: "look", in: ["glass"] });
  });
});

describe("a film's motion: Meno's own, then those the renderer declares", () => {
  const declared = [
    { id: "ripple", label: "Ripple: a made-up motion" },
    { id: "turn", label: "Meno's own, declared again" },
  ];

  it("offers Meno's motions the molecules can make, then the renderer's, in its order, with its labels, each once", () => {
    const moving = renderOptions("film", ["turn", "frames"], false, [], declared).find((o) => o.id === "motion") as unknown as { choices: { value: string; label: string }[]; default: string };
    expect(moving.choices.map((c) => c.value)).toEqual(["turn", "frames", "ripple"]);
    expect(moving.choices[2].label).toBe("Ripple: a made-up motion");
    expect(moving.default).toBe("turn");
    // (a picture moves not at all)
    expect(renderOptions("picture", ["turn"], false, [], declared).some((o) => o.id === "motion")).toBe(false);
  });

  it("tells the renderer the motion only where it is the renderer's own: Meno's are keyed into the scene", () => {
    expect(motionEntry({ kind: "film", motion: "ripple" })).toEqual({ motion: "ripple", mode: "once" });
    expect(motionEntry({ kind: "film", motion: "turn" })).toEqual({});
    expect(motionEntry({ kind: "picture", motion: "ripple" })).toEqual({});
  });
});

describe("a film's shortest length, by its motion and its molecules", () => {
  // (motions as a renderer declares them: Meno knows none of these names)
  const DECLARED_MOTIONS: MotionDecl[] = [
    { id: "glow", label: "Glow", shortest: { film: 4, loop: 6 } },
    { id: "pour", label: "Pour", shortest: { change: 6 } },
    { id: "hop", label: "Hop", shortest: { film: 1, change: 2.5 } },
    { id: "plain", label: "Plain" },
  ];

  it("is a motion's own, its Loop's where that is longer", () => {
    expect(shortestFilm("glow", DECLARED_MOTIONS, 1, false)).toBe(4);
    expect(shortestFilm("glow", DECLARED_MOTIONS, 1, true)).toBe(6);
    // (Meno's own: turning once round)
    expect(shortestFilm("turn", DECLARED_MOTIONS, 1, false)).toBe(3);
    // (one that says none, or none chosen: a second)
    expect(shortestFilm("plain", DECLARED_MOTIONS, 3, false)).toBe(1);
    expect(shortestFilm(undefined, undefined, 3, false)).toBe(1);
  });

  it("is each change's for each change: one fewer than the molecules, or as many where it loops back to the first", () => {
    expect(shortestFilm("pour", DECLARED_MOTIONS, 3, false)).toBe(12);
    expect(shortestFilm("pour", DECLARED_MOTIONS, 3, true)).toBe(18);
    expect(shortestFilm("pour", DECLARED_MOTIONS, 11, false)).toBe(60);
    // (in whole seconds, up: 1 + 2.5 x 2)
    expect(shortestFilm("hop", DECLARED_MOTIONS, 3, false)).toBe(6);
    expect(shortestFilm("hop", DECLARED_MOTIONS, 2, false)).toBe(4);
  });

  it("bounds the card's Length and says so under it", () => {
    const seconds = (length: Parameters<typeof renderOptions>[5]) => renderOptions("film", ["turn"], false, [], DECLARED_MOTIONS, length).find((o) => o.id === "seconds") as unknown as { min: number; max: number; default: number; note?: string };
    expect(seconds({ shortest: 12, molecules: 3 })).toMatchObject({ min: 12, max: 60, default: 12, note: "At least 12 s for 3 molecules" });
    // (as many molecules as need more than the longest: the longest is theirs)
    expect(seconds({ shortest: 72, molecules: 13 })).toMatchObject({ min: 72, max: 72 });
    expect(seconds({ shortest: 1 })).toMatchObject({ min: 1, max: 60, default: 8 });
    expect(seconds({ shortest: 1 }).note).toBeUndefined();
    expect(lengthNote({ shortest: 4 })).toBe("At least 4 s");
    expect(lengthNote({ shortest: 12, molecules: 3, raised: true })).toBe("Raised to 12 s, the shortest for 3 molecules");
  });

  it("raises a length chosen shorter, counting a Loop as Meno's Once or Loop says", () => {
    const once = filmLength("film", { motion: "pour", mode: "once", seconds: 5 }, DECLARED_MOTIONS, 3);
    expect(once.values.seconds).toBe(12);
    expect(once.length).toEqual({ shortest: 12, molecules: 3, raised: true });
    const loop = filmLength("film", { motion: "pour", mode: "loop", seconds: 20 }, DECLARED_MOTIONS, 3);
    expect(loop.values.seconds).toBe(20);
    expect(loop.length).toEqual({ shortest: 18, molecules: 3, raised: false });
    // (a motion that changes nothing counts no molecules; its Loop's own shortest)
    expect(filmLength("film", { motion: "glow", mode: "loop", seconds: 8 }, DECLARED_MOTIONS, 3).length).toEqual({ shortest: 6, raised: false });
    // (one that cannot loop - Meno's frames - counts none, whatever was chosen)
    expect(filmLength("film", { motion: "frames", mode: "loop", seconds: 8 }, DECLARED_MOTIONS, 3).length).toEqual({ shortest: 2, raised: false });
    // (a picture: no length)
    expect(filmLength("picture", { width: 100 }, DECLARED_MOTIONS, 3)).toEqual({ length: { shortest: 1 }, values: { width: 100 } });
  });
});

describe("the card's parts: Look, Render, Scene, Motion", () => {
  const options = renderOptions("film", ["turn", "frames"], true, [], [{ id: "glow", label: "Glow" }]);
  const parts = bySection(options);

  it("puts each of Meno's own choices in its part", () => {
    expect(parts.motion.map((o) => o.id)).toEqual(["motion", "mode", "seconds", "fps"]);
    expect(parts.render.map((o) => o.id)).toEqual(["width", "shape"]);
    expect(parts.look.map((o) => o.id)).toEqual(["look", "molecules", "surfaces", "sticks", "shading", "band", "outlines", "outline", "outline_colour"]);
    expect(parts.scene).toEqual([]);
    // (a picture has no motion)
    expect(bySection(renderOptions("picture", [], false)).motion).toEqual([]);
  });

  it("offers Once or Loop for every motion that can come back to its start - turning, and those a renderer makes - not its frames", () => {
    const mode = options.find((o) => o.id === "mode")!;
    expect(mode.when).toEqual({ id: "motion", in: ["turn", "glow"] });
    expect(askOf("film", { ...valuesOf(options), motion: "glow", mode: "loop" })).toMatchObject({ motion: "glow", mode: "loop" });
    expect(motionEntry({ kind: "film", motion: "glow", mode: "loop" })).toEqual({ motion: "glow", mode: "loop" });
    expect(motionEntry({ kind: "film", motion: "turn", mode: "loop" })).toEqual({});
  });

  it("shows a choice a motion is always made with as that one alone, saying why, whatever was chosen", () => {
    const theirs = [{ id: "engine", label: "Renderer", type: "choice" as const, choices: [{ value: "cycles", label: "Cycles" }, { value: "eevee", label: "EEVEE" }], default: "cycles", section: "render" as const }];
    const fixed = withFixed(theirs, { engine: "eevee" }, [{ id: "engine", value: "cycles", why: "This motion is made with light traced" }, { id: "nothing", value: "x", why: "Not an option" }]);
    expect(fixed.values.engine).toBe("cycles");
    expect(fixed.options[0]).toMatchObject({ choices: [{ value: "cycles", label: "Cycles" }], note: "This motion is made with light traced" });
    // (none fixed: as they were)
    expect(withFixed(theirs, { engine: "eevee" }, undefined)).toEqual({ options: theirs, values: { engine: "eevee" } });
    // (a renderer's option that says no part: its own)
    expect(bySection([{ ...theirs[0], section: undefined }]).own.map((o) => o.id)).toEqual(["engine"]);
  });

  it("refuses a film asked for shorter, however it was asked, saying how long it needs - Meno's rule, kept by no renderer", () => {
    const DECLARED_MOTIONS: MotionDecl[] = [
      { id: "glow", label: "Glow", shortest: { film: 4, loop: 6 } },
      { id: "pour", label: "Pour", shortest: { change: 6 } },
    ];
    expect(tooShort({ kind: "film", motion: "pour", mode: "once", seconds: 5 }, DECLARED_MOTIONS, 3)).toBe("This film needs at least 12 s for 3 molecules");
    expect(tooShort({ kind: "film", motion: "pour", mode: "loop", seconds: 12 }, DECLARED_MOTIONS, 3)).toBe("This film needs at least 18 s for 3 molecules");
    expect(tooShort({ kind: "film", motion: "glow", seconds: 3 }, DECLARED_MOTIONS, 1)).toBe("This film needs at least 4 s");
    expect(tooShort({ kind: "film", motion: "pour", mode: "once", seconds: 12 }, DECLARED_MOTIONS, 3)).toBeUndefined();
    expect(tooShort({ kind: "picture" }, DECLARED_MOTIONS, 3)).toBeUndefined();
  });
});
