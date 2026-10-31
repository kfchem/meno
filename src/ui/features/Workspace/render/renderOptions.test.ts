import { describe, expect, it } from "vitest";
import { shownOptions, valuesOf } from "../../../../lib/options";
import type { LookDecl } from "../../../../lib/plugins/manifest";
import { askOf, finishEntry, looksOffered, motionEntry, partsOf, renderContext, renderOptions } from "./renderOptions";

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

  it("offers the canvas's look and then those the renderer declares, in its order, with its labels", () => {
    expect(look.type).toBe("choice");
    expect(look.choices.map((c) => c.value)).toEqual(["meno", "cartoon", "line-art", "shiny-thing", "jelly", "pane"]);
    expect(look.choices.map((c) => c.label)[3]).toBe("A made-up look");
    expect(look.default).toBe("meno");
  });

  it("knows no look of its own but the canvas's", () => {
    const none = renderOptions("picture", [], false).find((o) => o.id === "look") as unknown as { choices: { value: string }[] };
    expect(none.choices.map((c) => c.value)).toEqual(["meno"]);
    // (and one declared twice, or as the canvas's, once)
    expect(looksOffered([{ id: "meno", label: "X" }, { id: "a", label: "A" }, { id: "a", label: "A again" }]).map((l) => l.label)).toEqual(["As the canvas draws them", "A"]);
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
    expect(sticks.when).toEqual({ id: "look", in: ["jelly", "pane"] });
    const ask = askOf("picture", { width: 900, shape: "fit", look: "jelly", ...partsOf(DECLARED[3]) });
    expect(ask.finish?.sticks).toBe("stopped");
    expect(askOf("picture", { width: 900, shape: "fit", look: "pane", ...partsOf(DECLARED[4]) }).finish?.sticks).toBe("shown");
    // (a renderer that declares none seen through: no such choice)
    expect(renderOptions("picture", [], false, [DECLARED[0]]).some((o) => o.id === "sticks")).toBe(false);
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
    expect(motionEntry({ kind: "film", motion: "ripple" })).toEqual({ motion: "ripple" });
    expect(motionEntry({ kind: "film", motion: "turn" })).toEqual({});
    expect(motionEntry({ kind: "picture", motion: "ripple" })).toEqual({});
  });
});

describe("a render plugin's options", () => {
  it("are shown by the card's own options and by whether a picture or a film is made, each as its manifest says", () => {
    const theirs = [
      { id: "grain", label: "Grain", type: "choice" as const, choices: [{ value: "fine", label: "Fine" }], default: "fine", when: { id: "kind", in: ["film"] } },
      { id: "rim", label: "Rim", type: "switch" as const, default: false, when: { id: "look", in: ["cartoon"] } },
      { id: "glow", label: "Glow", type: "switch" as const, default: false },
    ];
    const ids = (kind: "picture" | "film", look: string) => shownOptions(theirs, valuesOf(theirs), renderContext({ look }, kind)).map((o) => o.id);
    expect(ids("picture", "meno")).toEqual(["glow"]);
    expect(ids("film", "meno")).toEqual(["grain", "glow"]);
    expect(ids("film", "cartoon")).toEqual(["grain", "rim", "glow"]);
  });
});
