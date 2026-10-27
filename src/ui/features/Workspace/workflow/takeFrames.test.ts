import { describe, expect, it } from "vitest";
import type { Molecule3D } from "../store/types";
import { factor } from "../../../../lib/units";
import { addMolecule3d, emptyWorkspaceDocument } from "../document";
import { kindInfo } from "./kinds";
import { addSet, addStep, connect } from "./model";
import { runStep, type RunWith } from "./run";
import { takeFrames } from "./takeFrames";

const KCAL = factor("kcal/mol", "Eh");
/** A path of five images - water's hydrogen moved along x - their energies (kcal/mol above the first) rising to a top at the third and down past where it began: a step's path, its last frame its entry. */
function path(above: (number | null)[] = [0, 5, 12, 3, -2], title = "path a"): Molecule3D {
  const geo = (k: number) => [0, 0, 0, 0.96 + 0.1 * k, 0, 0, -0.24, 0.93, 0];
  const first = geo(0);
  return {
    id: 7,
    at: { x: 0, y: 0 },
    title,
    atoms: ["O", "H", "H"].map((el, i) => ({ el, x: first[3 * i], y: first[3 * i + 1], z: first[3 * i + 2] })),
    bonds: [
      { a1: 0, a2: 1, order: 1 },
      { a1: 0, a2: 2, order: 1 },
    ],
    frames: above.slice(1).map((_, k) => geo(k + 1)),
    energies: above.map((e) => (e == null ? Number.NaN : -76.4 + e * KCAL)),
    path: true,
  };
}
const ok = (o: ReturnType<typeof takeFrames>) => {
  if (!o.ok) throw new Error(o.said);
  return o;
};
const frames = (o: ReturnType<typeof ok>) => o.kept.map((e) => e.frame);

describe("Take frames", () => {
  it("takes the highest in energy - a path's top, its third image - with its energy, and the molecule and frame it came from", () => {
    const o = ok(takeFrames([path()], "highest"));
    expect(frames(o)).toEqual([2]);
    expect(o.kept[0]).toMatchObject({ from: 7, frame: 2, energy: -76.4 + 12 * KCAL });
    expect(o.kept[0].xyz[3]).toBeCloseTo(1.16);
    expect(o.said).toBe("1 frame of 1 molecule: the highest in energy");
  });

  it("takes the first, the last, the entry frame - a path's last - or the highest and those either side", () => {
    expect(frames(ok(takeFrames([path()], "first")))).toEqual([0]);
    expect(frames(ok(takeFrames([path()], "last")))).toEqual([4]);
    expect(frames(ok(takeFrames([path()], "entry")))).toEqual([4]);
    expect(frames(ok(takeFrames([path()], "around", 1)))).toEqual([1, 2, 3]);
    // (as far as there are frames: two either side of the top reach both ends)
    expect(frames(ok(takeFrames([path()], "around", 2)))).toEqual([0, 1, 2, 3, 4]);
    // (each frame taken a molecule of its own)
    expect(ok(takeFrames([path()], "around", 1)).kept.map((e) => e.compound)).toEqual([0, 1, 2]);
  });

  it("refuses the highest where a frame has no energy, naming the molecule - never the highest of those that have one", () => {
    expect(takeFrames([path(), path([0, 5, null, 3, -2], "path b")], "highest")).toEqual({ ok: false, said: "Not every frame of path b has an energy: the highest cannot be told" });
    expect(takeFrames([path([0, 5, null, 3, -2])], "around", 1)).toMatchObject({ ok: false });
    // (the first, the last, the entry frame need none)
    expect(frames(ok(takeFrames([path([0, 5, null, 3, -2])], "first")))).toEqual([0]);
    expect(takeFrames([path()], "around", 0)).toEqual({ ok: false, said: "Either side must be 1 frame or more" });
  });

  it("runs on a set wired into it, on the page", () => {
    let doc = addMolecule3d(emptyWorkspaceDocument(), path());
    const set = doc.nextWorkflowId ?? 1;
    doc = addSet(doc, { x0: -3, y0: -3, x1: 3, y1: 3 });
    const step = doc.nextWorkflowId!;
    doc = connect(addStep(doc, "take-frames", 20, 0, { which: "around" }), { set }, step);
    const W: RunWith = { extentOf: () => ({ x0: -1, x1: 1, y0: -1, y1: 1 }), byOf: () => "meno", now: 1000 };
    const ran = runStep(doc, step, W).steps!.find((s) => s.id === step)!.ran;
    expect([ran?.ok, ran?.said]).toEqual([true, "3 frames of 1 molecule: the highest in energy and 1 frame either side"]);
    expect(kindInfo("take-frames").how?.({ which: "last" })).toBe("The last");
  });
});
