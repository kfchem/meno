import { describe, expect, it } from "vitest";
import { STYLE_PRESETS, styleOf, type OwnStyle2D } from "./style";
import {
  acceptOwnStyles2d,
  acceptStyleChoice,
  drawingStyleNameTaken,
  freshDrawingStyleName,
  ownChoice,
  withOwnRenamed2d,
  withOwnStyle2d,
  withSetting,
} from "./styleFields";

const rsc = STYLE_PRESETS.find((p) => p.id === "rsc")!.style;

describe("the user's own drawing styles", () => {
  it("are saved from a style as it is set, named freshly where the name is taken, and numbered on", () => {
    let made = withOwnStyle2d([], "Group style", { ...rsc, bondLengthPt: 12 });
    expect(made.id).toBe("own-1");
    expect(made.own[0]).toMatchObject({ name: "Group style", style: { bondLengthPt: 12 } });
    made = withOwnStyle2d(made.own, "group style", rsc);
    expect(made.id).toBe("own-2");
    expect(made.own[1].name).toBe("group style 2");
    // (a built-in preset's name is taken too)
    expect(freshDrawingStyleName([], "Nature")).toBe("Nature 2");
    expect(drawingStyleNameTaken([], "acs 1996")).toBe(true);
  });

  it("are renamed - never to nothing, nor to another style's name", () => {
    const own: OwnStyle2D[] = [
      { id: "own-1", name: "Mine", style: rsc },
      { id: "own-2", name: "Theirs", style: rsc },
    ];
    expect(withOwnRenamed2d(own, "own-1", "  ")).toBe(own);
    expect(withOwnRenamed2d(own, "own-1", "theirs")).toBe(own);
    expect(withOwnRenamed2d(own, "own-1", "Wiley")).toBe(own);
    expect(withOwnRenamed2d(own, "own-1", " Lab ")[0].name).toBe("Lab");
  });

  it("are carried whole by a workspace drawn in one, so it opens the same where that style is not", () => {
    const o: OwnStyle2D = { id: "own-3", name: "Group style", style: { ...rsc, bondLengthPt: 12, fontFamily: "Arimo" } };
    const choice = withSetting(ownChoice(o), "lineThickness", { value: 0.8, unit: "pt" });
    // (a change keeps what it is made from)
    expect(choice.own?.name).toBe("Group style");
    const read = acceptStyleChoice(JSON.parse(JSON.stringify(choice)));
    expect(read).toEqual(choice);
    expect(styleOf(read).bondLengthPt).toBe(12);
    expect(styleOf(read).lineThickness).toEqual({ value: 0.8, unit: "pt" });
    // (an own style's id with nothing carried: Meno's own, not a guess)
    expect(acceptStyleChoice({ preset: "own-3", changes: {} })).toEqual({ preset: "meno", changes: {} });
  });

  it("are kept by the settings file - each with an id of its own and a name no other style has; what does not read left out", () => {
    const read = acceptOwnStyles2d([
      { id: "own-1", name: "Group style", style: { ...rsc, bondLengthPt: 99999 } },
      { id: "own-1", name: "Twice", style: rsc },
      { id: "mine", name: "Mine", style: rsc },
      { id: "own-2", name: "RSC", style: rsc },
      { id: "own-3", name: "", style: rsc },
      { id: "own-4", name: "Fine", style: { lineThickness: "thick" } },
    ]);
    expect(read.map((o) => [o.id, o.name])).toEqual([
      ["own-1", "Group style"],
      ["own-4", "Fine"],
    ]);
    // (a value out of range brought into it; one that does not read, Meno's own)
    expect(read[0].style.bondLengthPt).toBeLessThan(99999);
    expect(read[1].style.lineThickness).toEqual(STYLE_PRESETS[0].style.lineThickness);
  });
});
