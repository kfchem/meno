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

describe("a bond's menu", () => {
  it("chooses its kind in the first row, the rest of its kinds under it, Delete last, and lists what else it does", () => {
    const m = menu(target({ kind: "bond", id: 2 }), { bondKind: { current: "double", choose: none } });
    expect(m.icons).toEqual(["Single bond", "Double bond", "Triple bond", "Wedge", "Hashed wedge", "More kinds of bond", "Delete bond"]);
    // (its second row hidden until "more" is pressed - and shown at once where the bond is one of those kinds)
    expect(m.html).not.toContain("Other kinds");
    const open = menu(target({ kind: "bond", id: 2 }), { bondKind: { current: "dashed", choose: none } }).html;
    const other = open.match(/aria-label="Other kinds"[^>]*>(.*?)<\/div>/)?.[1] ?? "";
    expect([...other.matchAll(/aria-label="([^"]+)"/g)].map((x) => x[1])).toEqual(["Wavy bond", "Bold bond", "Bold dashed bond", "Dashed bond", "Dative bond"]);
    expect(open).toMatch(/aria-label="Dashed bond" aria-pressed="true"/);
    expect(m.listed).toEqual(["Clean up this structure", "3D structure", "Select this structure"]);
    // (the current kind marked)
    expect(m.html).toMatch(/aria-label="Double bond" aria-pressed="true"/);
    expect(m.html).toMatch(/aria-label="Single bond" aria-pressed="false"/);
  });
});

describe("the right-click menu", () => {
  it("lists Chain from here for an atom that can take another bond - and not for a bond, or an atom that cannot", () => {
    expect(menu(target({ kind: "atom", id: 1 }), { onChain: none }).listed).toEqual(["Chain from here", "Unpaired electron", "Select this structure"]);
    expect(menu(target({ kind: "atom", id: 1 })).listed).not.toContain("Chain from here");
    expect(menu(target({ kind: "bond", id: 2 }), { onChain: none }).listed).not.toContain("Chain from here");
  });

  it("lists Edit label first among an atom's entries", () => {
    expect(menu(target({ kind: "atom", id: 1 }), { onEditLabel: none, onChain: none }).listed).toEqual(["Edit label", "Chain from here", "Unpaired electron", "Select this structure"]);
    expect(menu(target({ kind: "bond", id: 2 }), { onEditLabel: none }).listed).not.toContain("Edit label");
  });

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

  it("offers a record of a stack of drawings its stack laid out as a grid - or, laid out, stacked again", () => {
    expect(menu(target({ kind: "atom", id: 1 }), { records: { spread: false, run: none } }).listed).toEqual(["Unpaired electron", "Select this structure", "Lay out as a grid"]);
    expect(menu(target({ kind: "bond", id: 2 }), { records: { spread: true, run: none } }).listed).toEqual(["Select this structure", "Stack again"]);
    expect(menu({ ...target({ selection: "here", drawing: true }), kind: "atom", id: 1 }, { records: { spread: false, run: none } }).listed).toContain("Lay out as a grid");
  });

  it("offers on empty space Paste and Select all, and what the workspace does as a whole - nothing Quick Add puts down", () => {
    const { icons, listed } = menu(target({}), { canvas: [{ name: "Open…", keys: "", run: none }, { name: "Fit to content", keys: "", run: none, divider: true }] });
    expect(icons).toEqual(["Paste", "Select all"]);
    expect(listed).toEqual(["Open…", "Fit to content"]);
  });

  it("keeps a PDF's page icons in their places, the way on that is not there shown but not to be pressed", () => {
    const pdf = { spread: false, icon: false, onSpread: none, onIcon: none, onRead: none, onNext: none, onNumbers: none, onPages: none, onSave: none };
    const { html } = menu(target({ kind: "pdf", id: 1 }), { pdf });
    expect(html).toMatch(/aria-label="Previous page"[^>]*disabled=""/);
    expect(html).not.toMatch(/aria-label="Next page"[^>]*disabled=""/);
  });

  it("offers a PDF's pages spread, some in places of their own, put back in their rows", () => {
    const spread = { spread: true, icon: false, onSpread: none, onIcon: none, onRead: none, onNumbers: none, onPages: none, onSave: none };
    expect(menu(target({ kind: "pdf", id: 1 }), { pdf: spread }).listed).not.toContain("Put pages in rows");
    expect(menu(target({ kind: "pdf", id: 1 }), { pdf: { ...spread, onRows: none } }).listed).toEqual(expect.arrayContaining(["Gather pages", "Put pages in rows"]));
  });

  it("offers a new PDF from a PDF - its pages numbered, or arranged - and it written to a file; several selected, made one", () => {
    const pdf = { spread: false, icon: false, onSpread: none, onIcon: none, onRead: none, onNumbers: none, onPages: none, onSave: none };
    const one = menu(target({ kind: "pdf", id: 1 }), { pdf });
    expect(one.listed).toEqual(expect.arrayContaining(["Page numbers…", "Pages…", "Save as PDF…"]));
    expect(one.listed).not.toContain("Combine into one PDF");
    // (a rule above the group: it begins one)
    expect(one.html).toMatch(/role="separator"[^>]*><\/div><button[^>]*><span>Page numbers…/);
    const two = menu(target({ kind: "pdf", id: 1 }), { pdf, onCombinePdfs: none });
    expect(two.listed.slice(two.listed.indexOf("Page numbers…"))).toEqual(["Page numbers…", "Pages…", "Combine into one PDF", "Save as PDF…"]);
  });

  it("offers words' size, bold, italic and a list among their icons - ticked as they are - and how their lines lie listed", () => {
    const words = { onSize: none, bold: true, italic: false, list: false, onBold: none, onItalic: none, onList: none, onSup: none, onSub: none };
    const { icons, listed, html } = menu(target({ kind: "caption", id: 1 }), { captionAlign: { now: "right", set: none }, words, onColour: none });
    expect(icons).toEqual(["Edit text", "Size…", "Bold", "Italic", "Bullets", "Colour…", "Delete text"]);
    expect(listed).toEqual(["Align left", "Align centre", "Align right", "Justify", "Superscript", "Subscript"]);
    // (their keys named by what they give - + and = - not where they lie, which a keyboard decides)
    expect(html).toMatch(/Superscript<\/span>[\s\S]*?<kbd[^>]*>(Ctrl\+\+|⌘\+)<\/kbd>/);
    expect(html).toMatch(/Subscript<\/span>[\s\S]*?<kbd[^>]*>(Ctrl\+=|⌘=)<\/kbd>/);
    expect(html).not.toMatch(/Shift\+=|⇧⌘=/);
    expect(html).toMatch(/aria-label="Bold" aria-pressed="true"/);
    expect(html).toMatch(/aria-label="Italic" aria-pressed="false"/);
    expect(html).toMatch(/Align right<\/span><svg[^>]*aria-label="Chosen"/);
    expect(html).not.toMatch(/Align left<\/span><svg[^>]*aria-label="Chosen"/);
  });

  it("offers a shape its colour and Delete as icons - no words: a shape is a shape - and a rectangle's corners, its line and its place among the shapes listed", () => {
    const shape = { onCorners: none, width: 2, onWidth: none, dash: false, onDash: none, onFront: none, onBack: none };
    const { icons, listed, html } = menu(target({ kind: "shape", id: 1 }), { shape, onColour: none });
    expect(icons).toEqual(["Colour…", "Delete shape"]);
    expect(listed).toEqual(["Corners…", "Line as bonds", "1 pt line", "2 pt line", "Dashed line", "Bring to front", "Send to back"]);
    expect(html).toMatch(/2 pt line<\/span><svg[^>]*aria-label="Chosen"/);
    // (as the bonds, as one is made, ticked so; an ellipse or a line has no corners)
    const plain = menu(target({ kind: "shape", id: 1 }), { shape: { ...shape, width: null, onCorners: undefined } });
    expect(plain.html).toMatch(/Line as bonds<\/span><svg[^>]*aria-label="Chosen"/);
    expect(plain.listed).not.toContain("Corners…");
    // (an arrow is the page's one Arrow, not a shape: its own menu, called so)
    const arrow = menu(target({ kind: "arrow", id: 1 }));
    expect(arrow.html).toContain('aria-label="Arrow"');
    expect(arrow.icons).toContain("Delete arrow");
    // (and the selection a box round it)
    expect(menu(target({ selection: "here", drawing: true }), { onBoxAround: none }).listed).toContain("Box around these");
  });
});

describe("the menu of a molecule in 3D, and of a measurement on one", () => {
  const molecule3d = (extra: object = {}) => ({
    otherLook: { name: "Space-filling", atoms: "space" as const, run: none },
    chosen: 3,
    onMeasure: none,
    onResetTurn: none,
    onTurnOnce: none,
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
  it("offers its other look, Reset orientation and Turn once, as icons", () => {
    expect(menu(target({ kind: "molecule3d", id: 1 }), { molecule3d: molecule3d({ chosen: 0 }) }).icons).toEqual(
      expect.arrayContaining(["Space-filling", "Reset orientation", "Turn once"]),
    );
  });
  it("offers what completes a file's molecule - its bond orders, its hydrogens - together, under a line", () => {
    const t = target({ kind: "molecule3d", id: 1 });
    const { listed, html } = menu(t, { molecule3d: molecule3d({ chosen: 0, onOrdersFromDictionary: none, onOrdersFromSmiles: none, onEstimateOrders: none, onAddHydrogens: none }) });
    expect(listed).toEqual(["Bond orders from the CCD", "Bond orders from SMILES…", "Estimate bond orders from distances", "Add hydrogens"]);
    // (first in the list, under the icons' row and its line: no rule of its own)
    expect(html).not.toContain('role="separator"');
    // (after another item: one line, above the first of them)
    const after = menu(t, { molecule3d: molecule3d({ chosen: 0, onTurnLikeDrawing: none, onOrdersFromDictionary: none, onOrdersFromSmiles: none }) }).html;
    expect(after).toMatch(/role="separator"[^>]*><\/div><button[^>]*><span>Bond orders from the CCD/);
    expect(after).not.toMatch(/role="separator"[^>]*><\/div><button[^>]*><span>Bond orders from SMILES/);
    expect(menu(t, { molecule3d: molecule3d({ chosen: 0, onAddHydrogens: none }) }).listed).toEqual(["Add hydrogens"]);
  });
  it("offers its magnification, and back to its true size where it is not at it", () => {
    const t = target({ kind: "molecule3d", id: 1 });
    expect(menu(t, { molecule3d: molecule3d({ chosen: 0 }), magnify: { now: 1, set: none } }).listed).toContain("Magnification");
    expect(menu(t, { molecule3d: molecule3d({ chosen: 0 }), magnify: { now: 1, set: none } }).listed).not.toContain("Back to 100 %");
    expect(menu(t, { molecule3d: molecule3d({ chosen: 0 }), magnify: { now: 1.5, set: none } }).listed).toContain("Back to 100 %");
    expect(menu(t, { molecule3d: molecule3d({ chosen: 0 }) }).listed).not.toContain("Magnification");
  });
  it("offers to set a measurement right-clicked, where it can be set", () => {
    const t = target({ kind: "measure3d", id: 1, measure: 1 });
    expect(menu(t, { measure3d: { atoms: 2, onSet: none } })).toMatchObject({ icons: ["Delete measurement"], listed: ["Set distance…"] });
    expect(menu(t).listed).toEqual([]);
  });
});

describe("the menu of writing by hand", () => {
  it("offers its colour and Delete, as icons", () => {
    expect(menu(target({ kind: "ink", id: 1 }), { onColour: none }).icons).toEqual(["Colour…", "Delete writing"]);
  });
});

describe("a menu's rules", () => {
  it("are drawn only between items shown: never first, never two together, never last - a group left empty draws none", async () => {
    const { withRules } = await import("./menuRules");
    const rules = (items: { name: string; divider?: boolean }[]) => withRules(items).map((i) => (i.divider ? `| ${i.name}` : i.name));
    expect(rules([{ name: "a", divider: true }, { name: "b" }, { name: "c", divider: true }])).toEqual(["a", "b", "| c"]);
    expect(rules([])).toEqual([]);
    // (a group whose items are all left out: nothing of it, not its rule)
    expect(rules([{ name: "a" }, ...[].map((name: string) => ({ name, divider: true })), { name: "b", divider: true }])).toEqual(["a", "| b"]);
  });

  it("puts no rule under the row of icons, nor at the top of a menu with none, whatever a menu's first listed item says", () => {
    // (on empty space, a workspace in a document's object: the first command listed begins a group)
    const m = menu(target({}), { canvas: [{ name: "Fit to content", keys: "", run: none, divider: true }, { name: "Styles…", keys: "", run: none, divider: true }] });
    expect(m.listed).toEqual(["Fit to content", "Styles…"]);
    const rest = m.html.replace(/<div role="group" aria-label="Frequent".*?<\/div>/, "");
    expect(rest.indexOf('role="separator"')).toBeGreaterThan(rest.indexOf("Fit to content"));
    expect(rest.match(/role="separator"/g)).toHaveLength(1);
    // (a molecule in 3D whose first listed item begins a group: its rule not drawn under the icons)
    const m3 = menu(target({ kind: "molecule3d", id: 1 }), {
      molecule3d: { otherLook: { name: "Ball and stick", atoms: "balls", run: none }, onResetTurn: none, onTurnOnce: none, onRemake: none, onCut: none, onCopy: none } as never,
    });
    const listed3 = m3.html.replace(/<div role="group" aria-label="Frequent".*?<\/div>/, "");
    const first = listed3.indexOf('role="menuitem"');
    expect(first).toBeGreaterThan(-1);
    expect(listed3.slice(0, first)).not.toContain('role="separator"');
  });
});
