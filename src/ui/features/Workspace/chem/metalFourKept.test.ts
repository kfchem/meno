import { describe, expect, it } from "vitest";
import { forgetLaidOut, layout2D } from "../../../../lib/layout/engine";
import type { Model } from "../store/types";
import { layoutJob } from "./engineLayout";

// Clean-up keeps a four-coordinate metal in the form the chemist drew it - an upright cross or an X, whichever its bonds lie nearer
// to - for every metal, the surely square-planar ones too: it never turns one into the other (docs/LAYOUT-2D.md).

/** A metal `el` (charge `charge`) with four Cl, drawn as an X (`x`) or an upright cross, a little askew as by hand. */
function drawn(el: string, charge: number, form: "x" | "cross"): Model {
  const turn = ((form === "x" ? 45 : 0) + 7) * (Math.PI / 180);
  const cl = [0, 1, 2, 3].map((k) => ({ id: k + 2, x: 1.5 * Math.cos(turn + (k * Math.PI) / 2), y: 1.5 * Math.sin(turn + (k * Math.PI) / 2), r: 0.9, el: "Cl" }));
  return {
    atoms: [{ id: 1, x: 0, y: 0, r: 0.9, el, ...(charge ? { charge } : {}) }, ...cl],
    bonds: cl.map((c, k) => ({ id: 10 + k, a: 1, b: c.id, order: 1 as const, stereo: "none" as const })),
  } as Model;
}

/** The directions of the metal's bonds, laid out from what Clean-up gives the engine, in degrees from -180 up. */
function laidOut(model: Model): number[] {
  forgetLaidOut();
  const job = layoutJob(model);
  const out = layout2D(job.input);
  return [1, 2, 3, 4]
    .map((n) => Math.round((Math.atan2(out.y[n] - out.y[0], out.x[n] - out.x[0]) * 180) / Math.PI))
    .map((d) => (d === 180 ? -180 : d === 0 ? 0 : d))
    .sort((p, q) => p - q);
}

describe("a four-coordinate metal cleaned up", () => {
  it("keeps the form it was drawn in: an X stays an X, an upright cross stays upright, whatever the metal", () => {
    const X = [-135, -45, 45, 135];
    const cross = [-180, -90, 0, 90];
    for (const [el, charge] of [["Ni", -2], ["Ti", 0], ["Pt", -2], ["Au", -1]] as const) {
      expect(laidOut(drawn(el, charge, "x")), `${el} drawn as an X`).toEqual(X);
      expect(laidOut(drawn(el, charge, "cross")), `${el} drawn upright`).toEqual(cross);
    }
  });
});
