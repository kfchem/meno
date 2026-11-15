import { describe, expect, it } from "vitest";
import type { Table } from "../../../../lib/table";
import { addMolecule3d, emptyWorkspaceDocument, type WorkspaceDocument } from "../document";
import { inputsOf, kindInfo, laterPortsNeed, type StepKind, type StepPort } from "./kinds";
import { addSet, addStep, connect } from "./model";
import { whyNot } from "./run";

const port = (id: string, name: string, extra: Partial<StepPort> = {}): StepPort => ({ id, name, takes: ["molecules"], ...extra });
const wired = (...ids: string[]) => (id: string) => ids.includes(id);

describe("a step's later inputs", () => {
  it("each needed unless marked optional: a second not wired says so", () => {
    const ports = [port("first", "First"), port("second", "Second")];
    expect(laterPortsNeed(ports, wired("first"))).toBe("Nothing comes into Second");
    expect(laterPortsNeed(ports, wired("first", "second"))).toBeNull();
  });

  it("an optional one, where wanted: the step runs with nothing wired into it", () => {
    const ports = [port("in", "Molecules"), port("number", "Number", { optional: true })];
    expect(laterPortsNeed(ports, wired("in"))).toBeNull();
    expect(laterPortsNeed(ports, wired("in", "number"))).toBeNull();
  });

  it("two that go together: both wired, or neither - one alone named, with the other it wants", () => {
    const ports = [port("guess", "Guess"), port("reactant", "Reactant side", { optional: true, together: "product" }), port("product", "Product side", { optional: true, together: "reactant" })];
    expect(laterPortsNeed(ports, wired("guess"))).toBeNull();
    expect(laterPortsNeed(ports, wired("guess", "reactant", "product"))).toBeNull();
    expect(laterPortsNeed(ports, wired("guess", "reactant"))).toBe("Reactant side is wired: wire Product side too, or neither");
    expect(laterPortsNeed(ports, wired("guess", "product"))).toBe("Product side is wired: wire Reactant side too, or neither");
  });

  it("an Energy diagram's Connects is optional, and the steps of two sets need both", () => {
    expect(inputsOf("energy-diagram").map((p) => [p.id, p.optional ?? false])).toEqual([
      ["levels", false],
      ["connects", true],
    ]);
    for (const kind of ["merge", "rebond", "compare-bonding"] as const) expect(inputsOf(kind).every((p) => !p.optional), kind).toBe(true);
  });
});


/** A water in 3D, at x. */
const water = (x: number) => ({
  at: { x, y: 0 },
  atoms: [
    { el: "O", x: 0, y: 0, z: 0 },
    { el: "H", x: 0.96, y: 0, z: 0 },
    { el: "H", x: -0.24, y: 0.93, z: 0 },
  ],
  bonds: [
    { a1: 0, a2: 1, order: 1 },
    { a1: 0, a2: 2, order: 1 },
  ],
});
const TABLE: Table = { columns: [{ name: "x", kind: "number", unit: "none" }], rows: [[1]], unread: [], left: [] };

/** Two sets of a water each, into a step of `kind` - both wired - and then what the second set holds changed, as `second` says. */
function wiredThen(kind: StepKind, second?: (s: NonNullable<WorkspaceDocument["sets"]>[number]) => object): { doc: WorkspaceDocument; step: number } {
  let doc = addMolecule3d(emptyWorkspaceDocument(), water(0));
  doc = addMolecule3d(doc, water(20));
  const a = doc.nextWorkflowId ?? 1;
  doc = addSet(doc, { x0: -3, y0: -3, x1: 3, y1: 3 });
  const b = doc.nextWorkflowId!;
  doc = addSet(doc, { x0: 17, y0: -3, x1: 23, y1: 3 });
  const step = doc.nextWorkflowId!;
  doc = addStep(doc, kind, 40, 0);
  const [first, other] = kindInfo(kind).inputs!.map((p) => p.id);
  doc = connect(connect(doc, { set: a }, step, first), { set: b }, step, other);
  if (second) doc = { ...doc, sets: doc.sets!.map((s) => (s.id === b ? { ...s, members: [], ...second(s) } : s)) };
  return { doc, step };
}
const why = ({ doc, step }: { doc: WorkspaceDocument; step: number }) => whyNot(doc, doc.steps!.find((s) => s.id === step)!, "meno");

describe("a step's later inputs, wired, giving what they take", () => {
  it("are ready wired as they take: Merge and Re-bond with molecules into both", () => {
    expect(why(wiredThen("merge"))).toBeNull();
    expect(why(wiredThen("rebond"))).toBeNull();
  });

  it("never pass a second input wired from a set that came to hold a table or a chart: named, not run without it", () => {
    expect(why(wiredThen("merge", () => ({ table: TABLE })))).toBe("Second takes molecules in 3D or conformer sets");
    expect(why(wiredThen("rebond", () => ({ table: TABLE })))).toBe("Bonding takes molecules in 3D or conformer sets");
    expect(why(wiredThen("rebond", () => ({ chart: { kind: "points", points: [] } })))).toBe("Bonding takes molecules in 3D or conformer sets");
  });

  it("never pass an optional one wired from a set that gives what it does not take: an Energy diagram's Connects from a chart", () => {
    let doc = addMolecule3d(emptyWorkspaceDocument(), water(0));
    const levels = doc.nextWorkflowId ?? 1;
    doc = addSet(doc, { x0: -3, y0: -3, x1: 3, y1: 3 });
    const other = doc.nextWorkflowId!;
    doc = addSet(doc, { x0: 17, y0: -3, x1: 23, y1: 3 });
    doc = { ...doc, sets: doc.sets!.map((s) => (s.id === other ? { ...s, table: TABLE } : s)) };
    const step = doc.nextWorkflowId!;
    doc = addStep(doc, "energy-diagram", 40, 0);
    doc = connect(connect(doc, { set: levels }, step, "levels"), { set: other }, step, "connects");
    // (wired from a table: as it takes; then that set made to hold a chart instead)
    const chart = { ...doc, sets: doc.sets!.map((s) => (s.id === other ? { ...s, table: undefined, chart: { kind: "points", points: [] } } : s)) } as WorkspaceDocument;
    expect(whyNot(chart, chart.steps!.find((s) => s.id === step)!, "meno")).toBe("Connects takes a table");
  });
});
