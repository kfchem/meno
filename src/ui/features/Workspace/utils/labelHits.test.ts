import { describe, expect, it } from "vitest";
import { layoutMolecule } from "../../../../lib/chem/layout2d";
import { styleOf, DEFAULT_STYLE_CHOICE } from "../../../../lib/chem/style";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { editorLayoutOptions, layoutBonds } from "../layoutOptions";
import { labelReach } from "../workflow/selectionSet";
import { atomOfLabelAt } from "./labelHits";

/**
 * A label's other letters were not its atom: a double-click on the H of HO
 * was a double-click on empty space, and opened Quick Add (the maintainer,
 * 2026-10-12: they are the O).
 */
describe("a label's other letters", () => {
  // ethanol's O, its bond leaving to the right: drawn HO, the H to its left
  const B = NOMINAL_BOND_LENGTH;
  const atoms = [
    { id: 1, el: "O", x: 0, y: 0 },
    { id: 2, el: "C", x: B, y: 0.5 * B },
    { id: 3, el: "C", x: 2 * B, y: 0 },
  ];
  const bonds = [
    { id: 10, a: 1, b: 2, order: 1 as const },
    { id: 11, a: 2, b: 3, order: 1 as const },
  ];
  const style = styleOf(DEFAULT_STYLE_CHOICE);
  const opts = editorLayoutOptions(style, { minLinePx: 0, paddingPx: 4 });
  const index = new Map(atoms.map((a, i) => [a.id, i]));
  const layout = layoutMolecule(atoms, layoutBonds(bonds, index), opts, (style.bondLengthPt * 96) / 72 / B);
  const reach = labelReach(layout, atoms, opts);

  it("are its atom: the H of HO is the O", () => {
    const box = reach.get(1)!;
    expect(box.x0).toBeLessThan(-0.3 * B / 2);
    expect(atomOfLabelAt(reach, { x: box.x0 + 0.1 * (box.x1 - box.x0), y: (box.y0 + box.y1) / 2 })).toBe(1);
  });

  it("are nothing where no label is", () => {
    expect(atomOfLabelAt(reach, { x: -B, y: 0 })).toBeNull();
    expect(atomOfLabelAt(undefined, { x: 0, y: 0 })).toBeNull();
    // (the carbons are drawn bare: nothing of theirs is a label)
    expect(reach.has(2)).toBe(false);
  });

  it("reach where they did while the layout keeps them, and are measured again under other options or as they move", () => {
    // (the same label, kept by a layout that did not lay its structure out again: not measured again)
    expect(labelReach(layout, atoms, opts).get(1)).toBe(reach.get(1));
    const larger = editorLayoutOptions(style, { minLinePx: 0, paddingPx: 4, fontPx: opts.fontPx * 2 });
    expect(labelReach(layout, atoms, larger).get(1)!.x0).toBeLessThan(reach.get(1)!.x0);
    const moved = { ...layout, texts: layout.texts.map((t) => ({ ...t, x: t.x + B })) };
    expect(labelReach(moved, atoms, opts).get(1)!.x0).toBeCloseTo(reach.get(1)!.x0 + B);
  });
});
