import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { emptyWorkspaceDocument } from "../document";
import { CARD, cardBoxOf, cardFace, nameBoxOf, type CardFaceOf } from "../pageGl/cardFace";
import { bodyBoxOf } from "../utils/textBody";
import type { EditorState } from "../store/types";
import type { Box } from "../pageGl/shapes";
import { pagePx } from "../pageGl/units";
import { cardState } from "./cardState";
import { cardHighOf, inputsOf } from "./kinds";
import { BETWEEN, CARD_H, CARD_W, GAP, nearWire, PORT_STEP, portDown, PX, wirePath } from "./look";
import { addStep } from "./model";
import { flowIn, partsBounds } from "./parts";
import { cardFrameOf, columnWidth } from "./place";

// A card of four inputs - Optimise to a saddle point's, its Restraints the fourth - one port's step taller than the rest
// (docs/WORKFLOWS.md, *Exit ports*; look `cardHigh`): its ports a plain list down its left edge, each on it, and its frame as
// tall wherever a card is measured.

const TALL = cardHighOf("saddle-point");

describe("a card of four inputs", () => {
  it("is one port's step taller than a card of three, its fourth input on it as far above its foot as a third is on one of three", () => {
    expect(inputsOf("saddle-point").map((p) => p.name)).toEqual(["Guesses", "Reactant side", "Product side", "Restraints"]);
    expect([TALL, cardHighOf("path-search"), cardHighOf("optimise")]).toEqual([CARD_H + PORT_STEP, CARD_H, CARD_H]);
    expect(TALL - portDown(3)).toBeCloseTo(CARD_H - portDown(2), 9);
  });

  it("reaches as far down wherever its card is measured: the parts' bounds, and where a box takes it by its middle", () => {
    const d = addStep(emptyWorkspaceDocument(), "saddle-point", 10, 0);
    const s = d.steps![0];
    expect(partsBounds({ sets: [], steps: [s], wires: [] })).toEqual({ x0: 10, y0: -TALL, x1: 10 + CARD_W, y1: 0 });
    // (its middle half its own height down: a box to half a card of three down misses it)
    expect(flowIn(d, "box", [{ x: 0, y: -TALL / 2 + PX }, { x: 10 + CARD_W, y: 1 }]).steps).toEqual([]);
    expect(flowIn(d, "box", [{ x: 0, y: -TALL / 2 - PX }, { x: 10 + CARD_W, y: 1 }]).steps).toEqual([s.id]);
  });

  it("keeps a step's result set out of its row as far down as it reaches: a card of four reaching into it narrows the column, one of three no", () => {
    // (a step, and to its right a card whose top stands a little more than a card of three above the step's top)
    for (const [kind, narrowed] of [["optimise", false], ["saddle-point", true]] as const) {
      let d = addStep(emptyWorkspaceDocument(), "energy", 0, 0);
      d = addStep(d, kind, 2 * CARD_W + 2 * GAP, CARD_H + 10 * PX);
      const step = d.steps![0];
      expect(columnWidth(d, step) < Infinity).toBe(narrowed);
    }
    // (and the step's own card of four: one to its right whose top stands a little lower than a card of three's foot is in its row)
    for (const [kind, narrowed] of [["optimise", false], ["saddle-point", true]] as const) {
      let d = addStep(emptyWorkspaceDocument(), kind, 0, 0);
      d = addStep(d, "energy", 2 * CARD_W + 2 * GAP, -CARD_H - 10 * PX);
      expect(columnWidth(d, d.steps![0]) < Infinity).toBe(narrowed);
    }
  });
});

describe("a card of four inputs, gone round", () => {
  it("is gone round as tall as it is: a wire level with its fourth input's row passes under it lower than under a card of three", () => {
    // (a wire from left of the card to right of it, level with its fourth input: below a card of three, inside a card of four)
    const level = -(CARD_H + PORT_STEP / 2);
    const p = { x: -GAP, y: level };
    const q = { x: CARD_W + GAP, y: level };
    const routed = (kind: "saddle-point" | "optimise") => {
      const card = cardFrameOf(addStep(emptyWorkspaceDocument(), kind, 0, 0).steps![0]);
      // (between two sets, as placement routes a wire: going round what stands between them)
      const path = wirePath(p, q, {}, nearWire(p, q, {}, [card]));
      return { card, path, lowest: Math.min(...path.map((t) => t.y)) };
    };
    // (half a bond clear of the card - docs/LOOK.md, *Room* - all the way past it)
    const near = (path: { x: number; y: number }[], foot: number) => path.some((t) => t.x > -BETWEEN && t.x < CARD_W + BETWEEN && t.y > foot - BETWEEN && t.y < BETWEEN);
    const four = routed("saddle-point");
    const three = routed("optimise");
    expect(four.card).toEqual({ x0: 0, x1: CARD_W, y0: -TALL, y1: 0 });
    expect(three.card.y0).toBeCloseTo(-CARD_H, 12);
    expect(near(four.path, -TALL)).toBe(false);
    expect(near(three.path, -CARD_H)).toBe(false);
    // (both under the card: round the card of four the lower)
    expect(four.lowest).toBeLessThan(-TALL - BETWEEN);
    expect(four.lowest).toBeLessThan(three.lowest);
  });

  it("is where a step's text flies from and to, as tall as it is", () => {
    const s = addStep(emptyWorkspaceDocument(), "saddle-point", 10, 5).steps![0];
    const st = { steps: [s] } as unknown as EditorState;
    expect(bodyBoxOf(st, { id: 1, name: "log", text: "", of: { step: s.id } })).toEqual({ x0: 10, x1: 10 + CARD_W, y0: 5 - TALL, y1: 5 });
  });
});

describe("a card of four inputs, drawn", () => {
  const card = (over: Partial<CardFaceOf> = {}): CardFaceOf => ({
    key: "step:4",
    x: 2,
    y: 3,
    icon: "saddle",
    who: "Quanta",
    summary: "Optimise to a saddle point",
    state: cardState("ready", undefined, undefined, 0),
    selected: false,
    words: 1,
    inputs: inputsOf("saddle-point").map((p) => p.name),
    high: TALL / PX,
    ...over,
  });

  it("by WebGL: as tall as its kind's ports make it, each input named beside its port, its icons alone in the middle of that height", () => {
    const d = cardFace(card());
    const box = d.shapes[0] as Box;
    expect(box.y1 - box.y0).toBeCloseTo(TALL + pagePx(2 * CARD.hair), 9);
    const names = d.texts.filter((t) => t.key.includes(":input:"));
    expect(names.map((t) => [t.text, t.y])).toEqual(inputsOf("saddle-point").map((p, k) => [p.name, 3 - (portDown(k) - PORT_STEP / 2)]));
    expect(names.every((t) => t.y > box.y0)).toBe(true);
    const far = cardFace(card({ words: 0 }));
    expect(far.icons.find((i) => i.key.endsWith(":big"))!.y).toBeCloseTo(3 - TALL / 2, 9);
    // (a card given no height of its own: as tall as a card of three)
    expect((cardFace(card({ high: undefined })).shapes[0] as Box).y1 - (cardFace(card({ high: undefined })).shapes[0] as Box).y0).toBeCloseTo(CARD_H + pagePx(2 * CARD.hair), 9);
  });

  it("its name, where only marked, in the middle of its height; and what is kept clear of it as tall as it is", () => {
    const tall = nameBoxOf({ key: "k", x: 2, y: 3, who: "Quanta", high: TALL / PX }, 0.1, false);
    expect((tall.y0 + tall.y1) / 2).toBeCloseTo(3 - TALL / 2, 9);
    const short = nameBoxOf({ key: "k", x: 2, y: 3, who: "Quanta" }, 0.1, false);
    expect((short.y0 + short.y1) / 2).toBeCloseTo(3 - CARD_H / 2, 9);
    expect(cardBoxOf(card())).toEqual({ x0: 2, x1: 2 + pagePx(CARD.w), y0: 3 - pagePx(TALL / PX), y1: 3 });
    expect(cardBoxOf(card({ high: undefined })).y0).toBeCloseTo(3 - CARD_H, 9);
  });

  it("the same in its HTML and on the page's layer: its height its kind's, the frames wires go round its own", () => {
    const html = readFileSync(join(__dirname, "StepCard.tsx"), "utf8");
    expect(html).toMatch(/const high = cardHighOf\(p\.step\.kind\) \/ PX;/);
    expect(html).toMatch(/height: high \}\}/);
    expect(html).toMatch(/minHeight: high \}\}/);
    const layer = readFileSync(join(__dirname, "../components/Workflow2D.tsx"), "utf8");
    expect(layer).toMatch(/high: cardHighOf\(s\.kind\) \/ PX,/);
    expect(layer).toMatch(/const cardFrame = \(s: WorkflowStep\): Frame => cardFrameOf\(s\);/);
  });
});
