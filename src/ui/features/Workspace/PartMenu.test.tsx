import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import PartMenu, { type MenuTarget } from "./PartMenu";

// Vitest runs in Node, with no page to mount on: the server's renderer
// draws the menu, and what it lists is read off that.

const none = () => {};
const target = (t: Partial<MenuTarget>): MenuTarget => ({
  kind: null,
  id: null,
  selection: "none",
  at: { x: 0, y: 0 },
  x: 10,
  y: 10,
  within: { width: 800, height: 600 },
  ...t,
});

/** The menu for `t`: the names along its top, in order, those listed under them, and the whole of it. */
function menu(t: MenuTarget, extra: Partial<Parameters<typeof PartMenu>[0]> = {}) {
  const html = renderToString(
    <PartMenu
      target={t}
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
      {...extra}
    />,
  );
  const row = html.match(/<div role="group" aria-label="Frequent"[^>]*>(.*?)<\/div>/)?.[1] ?? "";
  const icons = [...row.matchAll(/aria-label="([^"]+)"/g)].map((m) => m[1]);
  const rest = html.replace(/<div role="group" aria-label="Frequent".*?<\/div>/, "");
  const listed = [...rest.matchAll(/<button[^>]*><span>([^<]+)<\/span>/g)].map((m) => m[1]);
  return { icons, listed, html };
}

describe("the right-click menu", () => {
  it("puts what is done most to an atom first, as icons, Delete at the end, and lists the rest", () => {
    expect(menu(target({ kind: "atom", id: 1 }))).toMatchObject({
      icons: ["Charge one up", "Charge one down", "Clean up this structure", "3D structure", "Delete atom"],
      listed: ["Unpaired electron", "Select this structure"],
    });
    expect(menu(target({ kind: "bond", id: 2 })).icons).toEqual(["Clean up this structure", "3D structure", "Delete bond"]);
    // (a label read as something else than was typed: had back as typed, beside what else concerns the label)
    expect(menu(target({ kind: "atom", id: 1 }), { onExpand: none, asTyped: { typed: "obz", run: none } }).listed).toEqual([
      "Unpaired electron",
      "Expand abbreviation",
      "As typed: obz",
      "Select this structure",
    ]);
  });

  it("gives the selection its clipboard, clean-up and 3D as icons - Paste where it was opened on empty space - and Export among the rest", () => {
    const here = target({ selection: "here", drawing: true });
    const { icons, listed } = menu(here, { onExport: none });
    expect(icons).toEqual(["Cut", "Copy", "Paste", "Clean up these structures", "3D structures", "Delete selection"]);
    expect(listed).toEqual(["Copy as SMILES", "Export…", "Turn over left to right", "Turn over top to bottom", "Save as abbreviation…"]);
    // (opened on an atom of it: no paste there)
    expect(menu({ ...here, kind: "atom", id: 1 }).icons).not.toContain("Paste");
  });

  it("offers on empty space Paste and Select all, and what the workspace does as a whole - nothing Quick Add puts down", () => {
    const { icons, listed } = menu(target({}), { canvas: [{ name: "Open…", keys: "", run: none }, { name: "Fit to content", keys: "", run: none, divider: true }] });
    expect(icons).toEqual(["Paste", "Select all"]);
    expect(listed).toEqual(["Open…", "Fit to content"]);
  });

  it("keeps a PDF's page icons in their places, the way on that is not there shown but not to be pressed", () => {
    const pdf = { spread: false, icon: false, onSpread: none, onIcon: none, onRead: none, onNext: none };
    const { html } = menu(target({ kind: "pdf", id: 1 }), { pdf });
    expect(html).toMatch(/aria-label="Previous page"[^>]*disabled=""/);
    expect(html).not.toMatch(/aria-label="Next page"[^>]*disabled=""/);
  });

  it("offers a PDF's pages spread, some in places of their own, put back in their rows", () => {
    const spread = { spread: true, icon: false, onSpread: none, onIcon: none, onRead: none };
    expect(menu(target({ kind: "pdf", id: 1 }), { pdf: spread }).listed).not.toContain("Put pages in rows");
    expect(menu(target({ kind: "pdf", id: 1 }), { pdf: { ...spread, onRows: none } }).listed).toEqual(expect.arrayContaining(["Gather pages", "Put pages in rows"]));
  });

  it("marks the words' alignment as it is, among their icons", () => {
    const { icons, html } = menu(target({ kind: "caption", id: 1 }), { captionAlign: { now: "right", set: none } });
    expect(icons).toEqual(["Edit text", "Align left", "Align centre", "Align right", "Justify", "Delete text"]);
    expect(html).toMatch(/aria-label="Align right" aria-pressed="true"/);
    expect(html).toMatch(/aria-label="Align left" aria-pressed="false"/);
  });
});

describe("the menu of a molecule in 3D, and of a measurement on one", () => {
  const molecule3d = (extra: object = {}) => ({
    otherLook: { name: "Space-filling", atoms: "space" as const, run: none },
    chosen: 3,
    onMeasure: none,
    onResetTurn: none,
    onCut: none,
    onCopy: none,
    ...extra,
  });
  it("offers to set what is chosen, beside measuring it, where it can be set", () => {
    const t = target({ kind: "molecule3d", id: 1 });
    expect(menu(t, { molecule3d: molecule3d({ onSetChosen: none }) }).listed).toEqual(["Measure angle", "Set angle…"]);
    // (a torsion angle about a ring's bond cannot be set: measured only)
    expect(menu(t, { molecule3d: molecule3d({ chosen: 4 }) }).listed).toEqual(["Measure torsion angle"]);
  });
  it("offers to set a measurement right-clicked, where it can be set", () => {
    const t = target({ kind: "measure3d", id: 1, measure: 1 });
    expect(menu(t, { measure3d: { atoms: 2, onSet: none } })).toMatchObject({ icons: ["Delete measurement"], listed: ["Set distance…"] });
    expect(menu(t).listed).toEqual([]);
  });
});
