import { describe, expect, it, vi } from "vitest";
import { emptyWorkspaceDocument } from "../document";
import type { Molecule3D } from "../store/types";
import type { Table } from "../../../../lib/table";
import { resultOf } from "./flow";
import { exitsOf, KINDS, ONE_EXIT, type StepKind } from "./kinds";
import { addStep } from "./model";
import { placeResults, type RunResults, type RunWith } from "./run";

// (each exit a set not made yet is placed for, as run.ts asks place's placeFor - its line kept clear from that exit's port, place
//  `lineFrom`: told the first exit's in place of a later one's, its line would be measured from the wrong port)
const asked = vi.hoisted(() => [] as string[]);
vi.mock("./place", async (importOriginal) => {
  const real = await importOriginal<typeof import("./place")>();
  return {
    ...real,
    placeFor: (...args: Parameters<typeof real.placeFor>) => {
      asked.push(args[2]);
      return real.placeFor(...args);
    },
  };
});

const W: RunWith = { extentOf: () => ({ x0: -1, x1: 1, y0: -1, y1: 1 }), byOf: () => "meno", now: 1 };
const water = (dx: number): Omit<Molecule3D, "id" | "at"> =>
  ({ atoms: [{ el: "O", x: dx, y: 0, z: 0 }, { el: "H", x: dx + 0.96, y: 0, z: 0 }, { el: "H", x: dx - 0.24, y: 0.93, z: 0 }], bonds: [{ a1: 0, a2: 1, order: 1 }, { a1: 0, a2: 2, order: 1 }] }) as never;
const table: Table = { columns: [{ name: "bond", kind: "text" }], rows: [["C1-C2"]], unread: [], left: [] };

describe("a set not made yet, placed for the exit it is of (place `placeFor`)", () => {
  // (its step read from a file written before its kind had the exit: the set made as its run fills it)
  const LATER: { name: string; kind: StepKind; exit: string; results: RunResults }[] = [
    // (its earlier exits each given something: an exit given nothing makes the sets of all its step's exits it has none for, this one too)
    { name: "a table at a later exit", kind: "atom-map", exit: "changes", results: { molecules: [water(0)], rest: [water(1)], holds: "molecules", tables: { changes: table } } as unknown as RunResults },
    { name: "more molecules at a later exit than are laid out, held in its set", kind: "optimise", exit: "failed", results: { molecules: [water(0)], rest: Array.from({ length: 51 }, (_, i) => water(i)), holds: "molecules" } as unknown as RunResults },
    { name: "a few molecules at a later exit, laid out", kind: "optimise", exit: "failed", results: { molecules: [water(0)], rest: [water(0)], holds: "molecules" } as unknown as RunResults },
  ];
  for (const c of LATER) {
    it(`is placed for its own exit: ${c.name}`, () => {
      const made = addStep(emptyWorkspaceDocument(), c.kind, 0, 0);
      const s = made.steps![0];
      const doc = { ...made, sets: made.sets!.filter((b) => b.id !== resultOf(made, s.id, c.exit)!.id) };
      asked.length = 0;
      const ran = placeResults(doc, s, c.results, W);
      expect(resultOf(ran, s.id, c.exit)).toBeDefined();
      expect(asked).toEqual([c.exit]);
    });
  }

  it("is placed for its own exit: a chart's, its kind's one exit - so placeChart's first is its own", () => {
    const charts = KINDS.filter((k) => exitsOf(k.kind).some((x) => x.gives === "chart"));
    expect(charts.length).toBeGreaterThan(0);
    for (const k of charts) expect(exitsOf(k.kind).map((x) => x.id)).toEqual([ONE_EXIT]);
  });
});
