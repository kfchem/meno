/**
 * What a 3D structure does not keep of a configuration asked for or drawn, read back from its frames (chem/pageMirror `notKept`,
 * chem/make3d `notKeptRows`): said where it is, never passed by - Troeger's base drawn with both N wedged, whose given sense the
 * plugin's toolkit drops (MEASURED on RDKit 2026.03.6, foundation part 13: the plugin keeps it in its own change, with item 225).
 */
import { describe, expect, it } from "vitest";
import type { Model } from "../store/types";
import { identityInputOf } from "./identityOf";
import { notKeptRows } from "./make3d";
import { hasConfiguration, notKept } from "./pageMirror";
import { drawnFromSmiles } from "./testdata/identityCases";

const NONE = { centres: [], doubles: [] };

/** Troeger's base drawn, each N's bond to its own ring's CH2 (atoms 8-7 and 17-16, by place) a wedge narrow at the N. */
function troeger(): Model {
  const m = drawnFromSmiles("Cc1ccc2c(c1)CN3c4ccc(C)cc4CN2C3");
  const id = (i: number) => m.atoms[i].id;
  const wedged = new Map([
    [id(8), id(7)],
    [id(17), id(16)],
  ]);
  return {
    ...m,
    bonds: m.bonds.map((b) => {
      const n = wedged.get(b.a) === b.b ? b.a : wedged.get(b.b) === b.a ? b.b : null;
      return n == null ? b : { ...b, a: n, b: wedged.get(n)!, stereo: "up" as const };
    }),
  };
}

/** A frame of `m`: its drawing's places, each wedge's far end lifted towards the eye (`up`) - or the whole turned over (`down`). */
function frame(m: Model, side: 1 | -1): number[] {
  const lifted = new Set(m.bonds.flatMap((b) => (b.stereo === "up" ? [b.b] : [])));
  return m.atoms.flatMap((a) => [a.x, a.y, side * (lifted.has(a.id) ? 0.8 : 0)]);
}

describe("a configuration asked for or drawn, read back from 3D", () => {
  const m = troeger();

  it("reads both of Troeger's base's N as drawn centres", () => {
    const { input } = identityInputOf(m);
    expect(input.atoms.flatMap((a, i) => (a.tetra ? [`${a.el}${i + 1}`] : []))).toEqual(["N9", "N18"]);
  });

  it("names each N whose sense the 3D does not keep; none where both are kept", () => {
    expect(notKept({ frames: [frame(m, 1)] }, m, NONE)).toEqual([]);
    expect(hasConfiguration({ frames: [frame(m, 1)] }, m, NONE)).toBe(true);
    expect(notKept({ frames: [frame(m, -1)] }, m, NONE)).toEqual(["N9", "N18"]);
    // (one frame of several that turns them: said all the same)
    expect(notKept({ frames: [frame(m, 1), frame(m, -1)] }, m, NONE)).toEqual(["N9", "N18"]);
  });

  it("says it on the structure made, in its Stereo row", () => {
    expect(notKeptRows({ frames: [frame(m, -1)] }, m, NONE)).toEqual([{ label: "Stereo", text: "configuration at N9, N18 not kept in 3D" }]);
    expect(notKeptRows({ frames: [frame(m, 1)] }, m, NONE)).toEqual([]);
  });
});
