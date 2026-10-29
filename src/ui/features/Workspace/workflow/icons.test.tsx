import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { KINDS } from "./kinds";
import { StepGlyph } from "./icons";
import { MENU_ICONS } from "../menuIcons";

describe("icons read without their names (docs/LOOK.md, Icons)", () => {
  it("gives each kind of step a picture of its own: none shared, none a stock chart, a bolt or a signal", () => {
    const drawn = new Map<string, string[]>();
    for (const k of KINDS) {
      const svg = renderToStaticMarkup(<StepGlyph icon={k.icon} size={20} stroke={2.1} />);
      drawn.set(svg, [...(drawn.get(svg) ?? []), k.name]);
    }
    // (a kind given in more than one place - the same name twice in KINDS - is one kind)
    for (const [, names] of drawn) expect(new Set(names).size, names.join(", ")).toBe(1);
    expect(renderToStaticMarkup(<StepGlyph icon="twins" />)).toContain("R/S");
  });

  it("draws Clean-up as a broom and 3D as its letters, and no menu icon for Reset orientation", () => {
    expect(renderToStaticMarkup(MENU_ICONS.make3d)).toContain(">3D<");
    expect(renderToStaticMarkup(MENU_ICONS.cleanUp)).not.toContain("M9 4.5"); // (not Heroicons' sparkles)
    expect("resetTurn" in MENU_ICONS).toBe(false);
  });
});
