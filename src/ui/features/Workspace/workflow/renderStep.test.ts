import { describe, expect, it } from "vitest";
import { addPicture, emptyWorkspaceDocument } from "../document";
import { countOf, setMembers } from "./entries";
import { canWire, givesOf, inputOf, resultOf } from "./flow";
import { kindInfo, KINDS } from "./kinds";
import { CARD_W } from "./look";
import { addSet, addStep, connect } from "./model";
import { entryCarried, picturesSaid, placePictures, type Rendered } from "./renderStep";

/** A picture a render made, `w` by `h` on the page; `n` tells it apart. */
const rendered = (w: number, h: number, n: number): Rendered => ({ picture: { name: `Render ${n}.png`, sha256: String(n).repeat(64).slice(0, 64), media: "image/png", px: [2 * w, 2 * h] }, size: [w, h] });

describe("Render as a step", () => {
  it("is a kind Meno defines that takes molecules or conformers, gives a set of pictures, and has Meno's own choices for a picture", () => {
    const render = kindInfo("render");
    expect(render).toMatchObject({ name: "Render", takes: ["molecules", "conformers"], gives: "pictures", runs: "program", made: "Rendered" });
    expect(render.own?.map((o) => o.id)).toEqual(["width", "shape", "look", "molecules", "surfaces", "sticks", "shading", "band", "outlines", "outline", "outline_colour"]);
    // (Meno's picture defaults: wide, fitted to the molecules, as the 3D style draws them)
    expect(render.own?.map((o) => o.default)).toEqual([2400, "fit", "meno", "meno", "meno", "shown", "lit", 0.5, "none", 3, "black"]);
    expect(KINDS.filter((k) => k.gives === "pictures").map((k) => k.kind)).toEqual(["render"]);
  });

  it("takes an entry at its own geometry, in its molecule's look, turned as the canvas turns it", () => {
    const e = { compound: 0, number: 2, atoms: [{ el: "H", x: 9, y: 9, z: 9 }, { el: "H", x: 9, y: 9, z: 9 }], bonds: [{ a1: 0, a2: 1, order: 1 }], xyz: [0, 0, 0, 0, 0, 0.74], name: "H2" };
    const turn = { x: 0, y: 0, z: 0, w: 1 };
    const m = entryCarried(e as never, { look: "secondary" } as never, turn as never);
    expect(m.atoms.map((a) => [a.x, a.y, a.z])).toEqual([
      [0, 0, 0],
      [0, 0, 0.74],
    ]);
    expect(m).toMatchObject({ name: "H2", look: "secondary", turn, at: { x: 0, y: 0 } });
  });

  it("puts its pictures in its result set, to its right, in the order they came - a set wired from it that no step takes", () => {
    let d = addSet(emptyWorkspaceDocument(), { x0: 0, y0: 0, x1: 4, y1: 4 });
    d = addStep(d, "render", 10, 4, {}, "blender");
    d = connect(d, { set: 1 }, 2);
    d = addStep(d, "energy", 40, 4, {}, "xtb");
    const energy = d.steps![d.steps!.length - 1].id;
    d = placePictures(d, d.steps!.find((s) => s.kind === "render")!, [rendered(4, 2, 1), rendered(6, 3, 2)]);
    const set = resultOf(d, 2)!;
    expect(set.made).toEqual({ step: 2, exit: "out", holds: "pictures" });
    expect(set.x0).toBeGreaterThan(10 + CARD_W);
    // (inside it, in a row, left to right)
    const inside = setMembers(d, set).pictures;
    expect(inside).toHaveLength(2);
    const [a, b] = inside.map((id) => d.pictures!.find((p) => p.id === id)!);
    expect([a.name, b.name]).toEqual(["Render 1.png", "Render 2.png"]);
    expect(a.x + a.w / 2).toBeLessThan(b.x - b.w / 2);
    expect(a.y + a.h / 2).toBeCloseTo(b.y + b.h / 2);
    expect(countOf(d, set)).toEqual({ holds: "pictures", entries: 2, compounds: 2 });
    // (nothing is wired from it: no step takes pictures, and none comes into one from them)
    expect(givesOf(d, { set: set.id })).toBe("pictures");
    expect(canWire(d, { set: set.id }, energy)).toBe(false);
    expect(inputOf(connect(d, { set: set.id }, energy), energy)).toBeNull();
  });

  it("run again, puts its new pictures in the same set in place of those it held - and leaves the page's other pictures be", () => {
    let d = addSet(emptyWorkspaceDocument(), { x0: 0, y0: 0, x1: 4, y1: 4 });
    d = addStep(d, "render", 10, 4, {}, "blender");
    d = connect(d, { set: 1 }, 2);
    const step = d.steps!.find((s) => s.kind === "render")!;
    d = placePictures(d, step, [rendered(4, 2, 1), rendered(4, 2, 2)]);
    const set = resultOf(d, 2)!;
    d = addPicture(d, { ...rendered(3, 3, 9).picture, x: -50, y: -50, w: 3, h: 3 });
    d = placePictures(d, step, [rendered(5, 5, 3)]);
    const again = resultOf(d, 2)!;
    expect(again.id).toBe(set.id);
    // (the same top left; sized to what it holds now)
    expect([again.x0, again.y1]).toEqual([set.x0, set.y1]);
    expect(d.pictures!.map((p) => p.name).sort()).toEqual(["Render 3.png", "Render 9.png"]);
    expect(setMembers(d, again).pictures.map((id) => d.pictures!.find((p) => p.id === id)!.name)).toEqual(["Render 3.png"]);
    expect(d.sets!.filter((b) => b.made?.step === 2)).toHaveLength(1);
  });

  it("says how many pictures it made, of how many", () => {
    expect([picturesSaid(1, 1), picturesSaid(3, 3), picturesSaid(2, 3)]).toEqual(["1 picture", "3 pictures", "2 pictures of 3"]);
  });
});

describe("a set of pictures", () => {
  it("moves with its pictures, as a set moves with all it holds", async () => {
    const { moveSet } = await import("./model");
    let d = addStep(emptyWorkspaceDocument(), "render", 10, 4, {}, "blender");
    d = placePictures(d, d.steps![0], [rendered(4, 2, 1)]);
    const set = resultOf(d, d.steps![0].id)!;
    const before = d.pictures![0];
    d = moveSet(d, set.id, 5, -3);
    expect([d.pictures![0].x, d.pictures![0].y]).toEqual([before.x + 5, before.y - 3]);
    expect(setMembers(d, resultOf(d, d.steps![0].id)!).pictures).toEqual([before.id]);
  });
});
