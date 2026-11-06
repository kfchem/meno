import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import type { OptionValues } from "../../../lib/options";
import { kindInfo, WINDOW_GUIDE } from "../Workspace/workflow/kinds";
import type { ReactElement } from "react";
import OptionRows from "../../options/OptionRows";
import CalculationSettings, { clearOf, OwnValues, partsOf } from "./CalculationSettings";

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

  it("keeps the chemist's own window, Clear just before its field - in its row - which empties it, leaving the rest as it was", () => {
    let kept: unknown = null;
    const window = options.find((o) => o.id === "window")!;
    const clear = clearOf(window, { window: 2.5, within: "each value" }, (v) => (kept = v)) as ReactElement<{ onClick: () => void }>;
    clear.props.onClick();
    expect(kept).toEqual({ within: "each value" });
    // (in the field's row, before the field: the field where it was)
    const row = renderToString(<OptionRows options={[window]} values={{ window: 2.5 }} onChange={() => {}} before={(o) => clearOf(o, { window: 2.5 }, () => {})} />);
    expect(row).toMatch(/<button[^>]*>Clear<\/button><input[^>]*aria-label="Within"/);
    // (none given, or none that is a number, or an option with a default: nothing to clear)
    const none: (OptionValues | undefined)[] = [undefined, { within: "each value" }, { window: Number.NaN }];
    for (const own of none) expect(clearOf(window, own, () => {})).toBeNull();
    expect(clearOf(options.find((o) => o.id === "within")!, { within: "each value" }, () => {})).toBeNull();
    // (and the guide under it, alone)
    expect(renderToString(<OwnValues options={options} />)).not.toMatch(/Clear/);
  });
});
