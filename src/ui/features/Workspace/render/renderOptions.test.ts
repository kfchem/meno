import { describe, expect, it } from "vitest";
import { shownOptions, valuesOf } from "../../../../lib/options";
import { askOf, finishEntry, LOOK_IDS, LOOKS, renderOptions } from "./renderOptions";

describe("Render's look: one choice, a bundle of parts", () => {
  const options = renderOptions("picture", [], true);
  const look = options.find((o) => o.id === "look")!;

  it("is one choice that fills in what the molecules and surfaces are made of, how it is shaded and how outlined", () => {
    expect(look.type).toBe("choice");
    expect((look as unknown as { choices: { value: string }[] }).choices.map((c) => c.value)).toEqual([...LOOK_IDS]);
    const cartoon = (look as unknown as { choices: { value: string; sets?: Record<string, unknown> }[] }).choices.find((c) => c.value === "cartoon")!;
    expect(cartoon.sets).toMatchObject({ molecules: "meno", shading: "toon", outlines: "mixed", band: 0.5 });
    // (no separate "made of" choices left on the card's top: they are the look's parts, folded)
    expect(options.filter((o) => o.id === "molecules" || o.id === "surfaces").every((o) => o.group === "Adjust this look")).toBe(true);
  });

  it("hides the parts that do not apply: a band without toon shading, a width without an outer edge, the renderer's choices under toon", () => {
    const lit = valuesOf(options, {});
    expect(shownOptions(options, lit).map((o) => o.id)).not.toContain("band");
    expect(shownOptions(options, lit).map((o) => o.id)).not.toContain("outline");
    const toon = { ...lit, shading: "toon", outlines: "mixed" };
    expect(shownOptions(options, toon).map((o) => o.id)).toEqual(expect.arrayContaining(["band", "outline", "outline_colour"]));
    // (a plugin's option that names the shading, shown beside these)
    expect(shownOptions([{ id: "engine", label: "R", type: "choice", choices: [{ value: "a", label: "A" }], default: "a", when: { id: "shading", in: ["lit"] } }], {}, toon)).toHaveLength(0);
  });

  it("offers only the looks the renderer can make, and none where it can make none Meno knows", () => {
    const some = renderOptions("picture", [], false, ["meno", "cartoon"]).find((o) => o.id === "look") as unknown as { choices: { value: string }[]; default: string };
    expect(some.choices.map((c) => c.value)).toEqual(["meno", "cartoon"]);
    expect(some.default).toBe("meno");
    // (no surfaces option where nothing shows a surface)
    expect(renderOptions("picture", [], false).some((o) => o.id === "surfaces")).toBe(false);
  });

  it("is asked of the renderer by its parts: the materials in the scene, the shading and outlines in the entry", () => {
    const l = LOOKS.find((x) => x.id === "lineart")!;
    const ask = askOf("picture", { width: 900, shape: "fit", look: l.id, ...l.parts });
    expect(ask).toMatchObject({ molecules: "white", surfaces: "matte", finish: { shading: "toon", outlines: "mixed", band: 1 } });
    expect(finishEntry(ask.finish)).toEqual({ shading: "toon", outlines: "mixed", outline: 3, outline_colour: "black", band: 1 });
    // (a look as the canvas draws it: lit, no outlines)
    expect(finishEntry(askOf("picture", { width: 900, shape: "fit" }).finish)).toMatchObject({ shading: "lit", outlines: "none" });
  });
});
