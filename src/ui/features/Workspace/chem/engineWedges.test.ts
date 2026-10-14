import { describe, expect, it } from "vitest";
import { layout2D } from "../../../../lib/layout/engine";
import { emptyWorkspaceDocument, relayout } from "../document";
import type { Model } from "../store/types";
import { layoutJob, relayoutFrom } from "./engineLayout";

// Propenal: C=C-C=O, drawn plainly.
const propenal: Model = {
  atoms: [
    { id: 1, x: 0, y: 0, r: 0.9, el: "C" },
    { id: 2, x: 1.3, y: 0.75, r: 0.9, el: "C" },
    { id: 3, x: 2.6, y: 0, r: 0.9, el: "C" },
    { id: 4, x: 3.9, y: 0.75, r: 0.9, el: "O" },
  ],
  bonds: [
    { id: 5, a: 1, b: 2, order: 2, stereo: "none", stereoOrient: "principle" },
    { id: 6, a: 2, b: 3, order: 1, stereo: "none", stereoOrient: "principle" },
    { id: 7, a: 3, b: 4, order: 2, stereo: "none", stereoOrient: "principle" },
  ],
};

describe("Clean-up's wedges", () => {
  it("go on single bonds only: one the engine gives a double bond is no wedge", () => {
    const doc = { ...emptyWorkspaceDocument(), model: propenal, nextId: 8 };
    const job = layoutJob(propenal);
    const laid = layout2D(job.input);
    // (the engine telling a wedge on C=O, as at an atom with too many bonds, and one on the single C-C)
    const index = (id: number) => job.ids.indexOf(id);
    laid.wedges = [
      { from: index(3), to: index(4), stereo: "up" },
      { from: index(2), to: index(3), stereo: "down" },
    ];
    const after = relayout(doc, relayoutFrom(propenal, propenal, job, laid)).model;
    const bond = (id: number) => after.bonds.find((b) => b.id === id)!;
    expect(bond(7).stereo).toBe("none");
    expect(bond(7).order).toBe(2);
    expect(bond(6).stereo).toBe("down");
  });
});
