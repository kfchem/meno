import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import type { OptionValues } from "../../../lib/options";
import { kindInfo, WINDOW_GUIDE } from "../Workspace/workflow/kinds";
import CalculationSettings, { OwnValues, partsOf } from "./CalculationSettings";

// Vitest runs in Node, with no page to mount on: the card as the server's renderer writes it.

describe("Calculations in Settings, Meno's Energy window", () => {
  const options = kindInfo("energy-window").options!;

  it("has no window of Meno's: its field empty, the guide under it, and nothing to clear", () => {
    const html = renderToString(<CalculationSettings />);
    expect(html).toContain(">Energy window</span>");
    expect(html).toMatch(/aria-label="Within"[^>]*value=""/);
    expect(html).toContain(WINDOW_GUIDE);
    expect(html).not.toMatch(/>Clear<\/button>/);
  });

  it("shows the guide right under the window it is for, before the options after it", () => {
    expect(partsOf(options).map((p) => p.map((o) => o.id))).toEqual([["window"], ["within", "groupBy"]]);
    const html = renderToString(<CalculationSettings />);
    const at = (s: string) => html.indexOf(s);
    expect(at('aria-label="Within"')).toBeLessThan(at(WINDOW_GUIDE));
    expect(at(WINDOW_GUIDE)).toBeLessThan(at(">From the lowest in<"));
  });

  it("keeps the chemist's own window, which can be cleared again - leaving the rest as it was", () => {
    let kept: unknown = null;
    const element = OwnValues({ options, own: { window: 2.5, within: "each value" }, keep: (v) => (kept = v) });
    const html = renderToString(element);
    expect(html).toContain(WINDOW_GUIDE);
    expect(html).toMatch(/>Clear<\/button>/);
    // (Clear: the window taken out, the rest kept)
    const button = (element.props.children as { props: { children: unknown[] } }[])[0].props.children[1] as { props: { onClick: () => void } };
    button.props.onClick();
    expect(kept).toEqual({ within: "each value" });
    // (none given, or none that is a number: nothing to clear)
    const none: (OptionValues | undefined)[] = [undefined, { within: "each value" }, { window: Number.NaN }];
    for (const own of none) expect(renderToString(OwnValues({ options, own, keep: () => {} }))).not.toMatch(/>Clear<\/button>/);
  });
});
