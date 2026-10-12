import { describe, expect, it } from "vitest";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { readRxnfile } from "../../../../lib/chem/ctfile";
import { writeRxnfile, type WriterModel } from "../../../../lib/chem/molWriter";
import { buildEditorModelFromRXN } from "../../../../utils/importers";
import sample from "../../../../samples/esterification.rxn?raw";
import { drawnOf } from "../utils/io";
import { notOneReaction, reactionArrows, reactionFileText } from "./reactionFile";

const L = NOMINAL_BOND_LENGTH;
const chain = (els: string[]): WriterModel => ({
  atoms: els.map((el, i) => ({ id: i + 1, x: i * L, y: (i % 2) * L * 0.5, el })),
  bonds: els.slice(1).map((_, i) => ({ a: i + 1, b: i + 2, order: 1 as const })),
});

// acetic acid and ethanol to ethyl acetate and water, over sulfuric acid
// and a second reagent
const fischer = writeRxnfile({
  reactants: [chain(["C", "C", "O"]), chain(["C", "C", "O"])],
  products: [chain(["C", "C", "O", "C", "C"]), chain(["O"])],
  reagents: [chain(["O", "S", "O"]), chain(["Cl"])],
});

/** The file read and laid out as the editor opens it. */
const opened = (text: string) => {
  const laid = buildEditorModelFromRXN(text);
  return { laid, drawn: drawnOf({ model: laid.model, centroid: laid.centroid, arrow: laid.arrow ?? undefined, pluses: laid.pluses }) };
};

describe("a reaction from an RXN file, laid out", () => {
  it("has a plus between each two molecules on either side of the arrow, on its line", () => {
    const { laid } = opened(fischer);
    expect(laid.pluses).toHaveLength(2);
    const [left, right] = laid.pluses;
    expect(left.x).toBeLessThan(laid.arrow!.x1);
    expect(right.x).toBeGreaterThan(laid.arrow!.x2);
    expect(left.y).toBe(laid.arrow!.y1);
    // between the two reactants' atoms
    const reactants = laid.model.atoms.slice(0, 6);
    expect(left.x).toBeGreaterThan(Math.max(...reactants.slice(0, 3).map((a) => a.x)));
    expect(left.x).toBeLessThan(Math.min(...reactants.slice(3).map((a) => a.x)));
  });

  it("has its reagents above the arrow, which reaches half a bond past them either side", () => {
    const { laid } = opened(fischer);
    const reagents = laid.model.atoms.slice(-4);
    expect(reagents.map((a) => a.el)).toEqual(["O", "S", "O", "Cl"]);
    for (const a of reagents) expect(a.y).toBeGreaterThan(laid.arrow!.y1 + 0.3 * L);
    expect(laid.arrow!.x1).toBeLessThan(Math.min(...reagents.map((a) => a.x)) - L / 2);
    expect(laid.arrow!.x2).toBeGreaterThan(Math.max(...reagents.map((a) => a.x)) + L / 2);
  });

  it("is no longer than it was with no reagents", () => {
    const { laid } = opened(sample);
    expect(laid.arrow!.x2 - laid.arrow!.x1).toBeCloseTo((8 / 3) * L, 9);
    expect(laid.pluses).toHaveLength(2);
  });
});

describe("a drawn reaction, saved as an RXN file", () => {
  it("reads back as the reaction it was opened from: each molecule in its role, in order", () => {
    const { drawn } = opened(fischer);
    const back = readRxnfile(reactionFileText(drawn, "Fischer"));
    expect(back.name).toBe("Fischer");
    const symbols = (ms: typeof back.reactants) => ms.map((m) => m.atoms.map((a) => a.symbol).join(""));
    expect(symbols(back.reactants)).toEqual(["CCO", "CCO"]);
    expect(symbols(back.products)).toEqual(["CCOCC", "O"]);
    expect(symbols(back.reagents)).toEqual(["OSO", "Cl"]);
  });

  it("takes a plus away, and two molecules close together become one", () => {
    const { drawn } = opened(sample);
    // the reactants a bond apart, the plus between them gone
    const back = readRxnfile(reactionFileText({ ...drawn, pluses: drawn.pluses!.slice(1) }));
    expect(back.reactants.length).toBe(2);
    const near = {
      ...drawn,
      pluses: [],
      atoms: drawn.atoms.map((a, i) => (i < 4 ? { ...a, x: a.x + 0.5 * L } : a)),
    };
    expect(readRxnfile(reactionFileText(near)).reactants.length).toBe(1);
  });

  it("is written by the arrow that shows a reaction, whatever its kind: an arrow alone, on a slide, shows none", () => {
    const { drawn } = opened(sample);
    const lone = { ...drawn.arrows![0], id: 9, x: drawn.arrows![0].x, y: drawn.arrows![0].y + 40 * L };
    const two = { ...drawn, arrows: [...drawn.arrows!, lone] };
    expect(reactionArrows(two).map((a) => a.id)).toEqual([drawn.arrows![0].id]);
    expect(notOneReaction(two)).toBeNull();
    const kinded = { ...drawn, arrows: [{ ...drawn.arrows![0], kind: "retrosynthetic" as const }] };
    expect(readRxnfile(reactionFileText(kinded)).reactants.length).toBe(readRxnfile(reactionFileText(drawn)).reactants.length);
    expect(notOneReaction({ ...drawn, atoms: [], bonds: [], arrows: [lone] })).toMatch(/arrow/);
  });

  it("says why where the drawing is not one reaction", () => {
    const { drawn } = opened(sample);
    expect(notOneReaction(drawn)).toBeNull();
    expect(notOneReaction({ ...drawn, arrows: [] })).toMatch(/arrow/);
    expect(() => reactionFileText({ ...drawn, arrows: [...drawn.arrows!, { ...drawn.arrows![0], id: 2 }] })).toThrow(
      /one reaction, and the drawing has 2 arrows/,
    );
  });
});
