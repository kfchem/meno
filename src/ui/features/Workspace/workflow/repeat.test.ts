/** *Repeat*'s frame, as the flow reads it (workflow/repeat): its options, its steps, the wires that may cross its edge, and none a loop. */
import { describe, expect, it } from "vitest";
import type { Wire, WorkflowSet, WorkflowStep } from "../store/types";
import type { WorkspaceDocument } from "../document";
import { canWire, landing, repeatHolding, stepsAfter, stepsBefore, wireRefusal, type Flow } from "./flow";
import { moveStep, repeatsSettled } from "./model";
import { readWorkflow } from "./saved";
import { kindsOf } from "./doers";
import { cardHighOf } from "./kinds";
import { CARD_W } from "./look";
import { REPEAT_OUT, repeatHow, repeatNeeds, repeatRead, THIS_PASS, valueAt } from "./repeat";

const R = 1;
const [A, B, C] = [2, 3, 4];
/** A step of `kind` at (x, y). */
const step = (id: number, kind: WorkflowStep["kind"], x: number, y: number, more: Partial<WorkflowStep> = {}): WorkflowStep => ({ id, kind, x, y, by: "meno", ...more });
/** A step's exit's set. */
const made = (id: number, of: number, exit = "out"): WorkflowSet => ({ id, x0: 0, y0: 0, x1: 1, y1: 1, made: { step: of, exit }, members: [] }) as unknown as WorkflowSet;

/**
 * A chemist's set S into a Repeat R holding A and B: This pass into A, A into B, B's out to R's Again, and R's Out into C outside.
 * Sets: 10 S, 11 R's This pass, 12 R's Out, 13 A's, 14 B's, 15 C's.
 */
function flow(): Flow {
  const steps = [step(R, "repeat", 0, 0, { frame: { w: 1000, h: 400 }, holds: [A, B] }), step(A, "tag", 100, 100), step(B, "tag", 400, 100), step(C, "tag", 1400, 100)];
  const sets = [{ id: 10, x0: -300, y0: 0, x1: -100, y1: 100, members: [] } as unknown as WorkflowSet, made(11, R, THIS_PASS), made(12, R, REPEAT_OUT), made(13, A), made(14, B), made(15, C)];
  const wires: Wire[] = [
    { id: 20, from: { set: 10 }, to: { step: R, port: "in" } },
    { id: 21, from: { set: 11 }, to: { step: A, port: "in" } },
    { id: 22, from: { set: 13 }, to: { step: B, port: "in" } },
    { id: 23, from: { set: 14 }, to: { step: R, port: "again" } },
    { id: 24, from: { set: 12 }, to: { step: C, port: "in" } },
  ];
  return { model: { atoms: [], bonds: [] }, molecules3d: [], pictures: [], sets, steps, wires } as unknown as Flow;
}

describe("a Repeat's options", () => {
  it("read as how many passes, its variable's values and how they are counted; said in a line", () => {
    expect(repeatHow({})).toBe("3 passes");
    const k = { variable: "k", from: "50", step: "50", unit: "kcal/mol/rad2" };
    expect(repeatHow(k)).toBe("3 passes; k from 50 by 50 kcal/mol/rad², counted per entry");
    expect(repeatHow({ ...k, repeat: "until", counted: "pass" })).toBe("until none goes again, at most 10 passes; k from 50 by 50 kcal/mol/rad², counted per pass");
    expect(repeatHow({ repeat: "over", variable: "T", values: "298.15\n310\n", unit: "K" })).toBe("2 passes; T over 298.15, 310 K, counted per entry");
  });

  it("start a pass where restraints were first held, but over values from the last pass, each as its card sets", () => {
    expect(repeatRead({})).toMatchObject({ repeat: "times", passes: 3, counted: "entry", starts: "held" });
    expect(repeatRead({ repeat: "over", variable: "T", values: "1" })).toMatchObject({ starts: "last" });
    expect(repeatRead({ repeat: "over", variable: "T", values: "1", startsOver: "in" })).toMatchObject({ starts: "in" });
  });

  it("give each count's value: From and as many Steps; the values given, none past the last", () => {
    const r = repeatRead({ variable: "k", from: "50", step: "50" });
    if ("why" in r || !r.variable) throw new Error("not read");
    expect([0, 1, 2].map((c) => valueAt(r.variable!, c))).toEqual([50, 100, 150]);
    const o = repeatRead({ repeat: "over", variable: "T", values: "300\n310" });
    if ("why" in o || !o.variable) throw new Error("not read");
    expect([0, 1, 2].map((c) => valueAt(o.variable!, c))).toEqual([300, 310, undefined]);
  });

  it("say what they still need, as the card says it", () => {
    expect(repeatNeeds({})).toBeUndefined();
    expect(repeatNeeds({ variable: "k" })).toBe("Give k's first value, From");
    expect(repeatNeeds({ variable: "k", from: "50" })).toBe("Give how much k goes up each time, Step");
    expect(repeatNeeds({ variable: "1k", from: "1", step: "1" })).toBe("Name the variable with a letter first, then letters, digits, _ . or -");
    expect(repeatNeeds({ unit: "furlongs" })).toMatch(/^furlongs is no unit Meno knows/);
    expect(repeatNeeds({ repeat: "over", variable: "T" })).toBe("Give the values, one to a line");
    expect(repeatNeeds({ repeat: "over", variable: "T", values: "300\nwarm" })).toBe('"warm" is no number');
    expect(repeatNeeds({ repeat: "over", values: "300" })).toBe("Name the variable the values are given as");
  });

  it("is none of the kinds a step is chosen from: a Repeat is made round steps", () => {
    expect(kindsOf("meno")).not.toContain("repeat");
    expect(kindsOf("meno")).toContain("tag");
  });
});

describe("a Repeat's frame in the flow", () => {
  it("makes no loop: what lands on Again is no way back, so the steps before it are those before its In", () => {
    const d = flow();
    expect(landing(d, d.wires![3])).toBe(true);
    expect(landing(d, d.wires![0])).toBe(false);
    expect(stepsBefore(d, R)).toEqual([]);
    expect(stepsBefore(d, C)).toEqual([R]);
    expect(stepsBefore(d, B)).toEqual([A, R]);
    // (what its steps give comes down through it to what is after it)
    expect(stepsAfter(d, A)).toEqual([B, R, C]);
  });

  it("lets what its steps give land on Again or Done, and nothing else", () => {
    const d = flow();
    expect(wireRefusal(d, { set: 14 }, R, "done")).toBeNull();
    expect(wireRefusal(d, { set: 13 }, R, "again")).toBeNull();
    expect(canWire(d, { set: 11 }, R, "again")).toBe(true);
    expect(wireRefusal(d, { set: 10 }, R, "again")).toBe("Only what the steps inside it give goes to Again or Done");
    expect(wireRefusal(d, { set: 15 }, R, "done")).toBe("Only what the steps inside it give goes to Again or Done");
  });

  it("is crossed only by its ports: in by In, out by Done and Out", () => {
    const d = flow();
    expect(wireRefusal(d, { set: 10 }, A, "in")).toBe("This step is inside a Repeat: wire it into the Repeat's In, and This pass to this step");
    expect(wireRefusal(d, { set: 12 }, A, "in")).toBe("This step is inside a Repeat: wire it into the Repeat's In, and This pass to this step");
    expect(wireRefusal(d, { set: 13 }, C, "in")).toBe("It is inside a Repeat: what leaves it goes by Done, then Out");
    expect(wireRefusal(d, { set: 11 }, C, "in")).toBe("It is inside a Repeat: what leaves it goes by Done, then Out");
    expect(wireRefusal(d, { set: 14 }, R, "in")).toBe("It is inside this Repeat: wire it to Again to go round once more");
    expect(wireRefusal(d, { set: 12 }, C, "in")).toBeNull();
    expect(wireRefusal(d, { set: 11 }, B, "in")).toBeNull();
  });
});

describe("the steps a Repeat holds", () => {
  const doc = (steps: WorkflowStep[]) => ({ steps }) as unknown as WorkspaceDocument;
  const inFrame = (x: number, y: number) => ({ x: x - CARD_W / 2, y: y - cardHighOf("tag") / 2 });

  it("are those whose cards' middles lie inside its frame, in reading order: one dragged in joins, one dragged out leaves", () => {
    const r = step(R, "repeat", 0, 0, { frame: { w: 1000, h: 400 } });
    const a = step(A, "tag", inFrame(600, 100).x, inFrame(600, 100).y);
    const b = step(B, "tag", inFrame(300, 100).x, inFrame(300, 100).y);
    const c = step(C, "tag", inFrame(300, 300).x, inFrame(300, 300).y);
    const settled = repeatsSettled(doc([r, a, b, c]));
    expect(settled.steps!.find((s) => s.id === R)!.holds).toEqual([B, A, C]);
    expect(repeatHolding(settled as unknown as Flow, B)).toBe(R);
    const out = repeatsSettled({ ...settled, steps: settled.steps!.map((s) => (s.id === A ? { ...s, x: 2000 } : s)) });
    expect(out.steps!.find((s) => s.id === R)!.holds).toEqual([B, C]);
    // (nothing moved: the same document)
    expect(repeatsSettled(out)).toBe(out);
  });

  it("move with it, by as much: its frame round them as it was", () => {
    const moved = moveStep(doc([step(R, "repeat", 0, 0, { frame: { w: 1000, h: 400 }, holds: [A] }), step(A, "tag", 100, 100), step(C, "tag", 2000, 0)]), R, 50, -20);
    expect(moved.steps!.map((s) => [s.id, s.x, s.y])).toEqual([
      [R, 50, -20],
      [A, 150, 80],
      [C, 2000, 0],
    ]);
  });

  it("are kept with its frame in the workspace's file; a step of another kind keeps neither", () => {
    const saved = readWorkflow({
      sets: [],
      wires: [],
      steps: [
        { id: 1, kind: "repeat", x: 0, y: 0, by: "meno", frame: { w: 900, h: 300 }, holds: [2, 2, -1, "3"] },
        { id: 2, kind: "tag", x: 10, y: 10, by: "meno", frame: { w: 5, h: 5 }, holds: [1] },
      ],
    });
    expect(saved?.steps[0]).toMatchObject({ frame: { w: 900, h: 300 }, holds: [2] });
    expect(saved?.steps[1].frame).toBeUndefined();
    expect(saved?.steps[1].holds).toBeUndefined();
  });
});
