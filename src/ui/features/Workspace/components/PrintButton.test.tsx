import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import PrintButton from "./PrintButton";

// Vitest runs in Node, with no page to mount on: the button is drawn by the
// server's renderer, and pressed by calling what it was given to run.

const pressed = (printing: Parameters<typeof PrintButton>[0]["printing"]) => {
  let ran = 0;
  const element = PrintButton({ printing, shortcut: "Cmd+P", onPrint: () => ran++ });
  element.props.onClick();
  return { ran, html: renderToString(<PrintButton printing={printing} shortcut="Cmd+P" onPrint={() => {}} />) };
};

describe("The printer button", () => {
  it("prints when it is pressed, and says its shortcut", () => {
    for (const printing of ["full", "low", undefined] as const) {
      const { ran, html } = pressed(printing);
      expect(ran).toBe(1);
      expect(html).toContain('title="Print… (Cmd+P)"');
      expect(html).not.toContain("aria-disabled");
    }
  });

  it("where the author does not allow printing, does nothing when pressed, is greyed, and says why in its tip", () => {
    const { ran, html } = pressed("no");
    expect(ran).toBe(0);
    expect(html).toContain('title="Its author does not allow printing."');
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain("text-gh-line");
    // (not `disabled`: the tip of a disabled button is not shown in the app's webview)
    expect(html).not.toMatch(/ disabled(=|>| )/);
  });
});
