import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { renderToString } from "react-dom/server";
import PartMenu, { type MenuTarget } from "./PartMenu";
import QuickAdd from "./QuickAdd";

// The icons of the right-click menu and of Quick Add give under the press (App.css `.meno-press`): that each icon button
// carries the class, and what the class does.

const none = () => {};
const target: MenuTarget = { kind: "bond", id: 2, selection: "none", at: { x: 0, y: 0 }, x: 10, y: 10, within: { width: 800, height: 600 } };

/** The opening tags of the buttons in `html` that are named (aria-label): each icon of a row. */
const icons = (html: string) => [...html.matchAll(/<button[^>]*aria-label="[^"]+"[^>]*>/g)].map((m) => m[0]);

describe("the icons of a right-click menu", () => {
  const menu = (bondKind: string) =>
    renderToString(
      <PartMenu
        target={target}
        onDelete={none}
        onCleanUp={none}
        onMake3d={none}
        onSelectStructure={none}
        onTurnOver={none}
        onCharge={none}
        onRadical={none}
        radical={false}
        onArrowStyle={none}
        onEditText={none}
        onRunStep={none}
        onStepOptions={none}
        onSaveAbbreviation={none}
        clipboard={{ onCut: none, onCopy: none, onCopySmiles: none, onPaste: none, onSelectAll: none }}
        onClose={none}
        bondKind={{ current: bondKind as never, choose: none }}
      />,
    );
  it("each give under the press: the first row, Delete among them, and the second row of kinds", () => {
    const html = menu("dashed");
    const all = icons(html);
    // (the first row's six, Delete, and the second row's five)
    expect(all.length).toBe(12);
    for (const tag of all) expect(tag).toMatch(/class="[^"]*\bmeno-press\b/);
  });
});

describe("the icons of Quick Add", () => {
  it("each give under the press: its first row, its calculations, and the rows its groups open", () => {
    const html = renderToString(
      <QuickAdd x={10} y={10} within={{ width: 800, height: 600 }} steps={[]} onChoose={none} onChain={none} onArrow={none} onShape={none} onSmiles={async () => {}} onStep={none} onClose={none} />,
    );
    const all = icons(html);
    expect(all.length).toBeGreaterThanOrEqual(9);
    for (const tag of all) expect(tag).toMatch(/class="[^"]*\bmeno-press\b/);
  });
});

describe("the press", () => {
  const css = readFileSync(new URL("../../../App.css", import.meta.url), "utf8");
  const rule = (sel: string) => css.match(new RegExp(`${sel.replace(/[.:()]/g, "\\$&")}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
  it("darkens what it is pressed on and makes it a little smaller, only while it is pressed and only where it can be", () => {
    const pressed = rule(".meno-press:active:not(:disabled)");
    expect(pressed).toContain("background-color: var(--color-gh-line)");
    expect(pressed).toContain("transform: scale(0.96)");
  });
  it("eases the colour and the size both ways, as every button's colours are eased", () => {
    expect(rule(".meno-press")).toMatch(/transition-property:[^;]*background-color[^;]*transform/);
  });
});
