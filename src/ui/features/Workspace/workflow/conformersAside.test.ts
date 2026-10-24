/**
 * An earlier run of a step on molecules in 3D that set structures drawn
 * aside - Conformers', those it could not make in 3D, as they came - kept
 * in a workspace's file and read back with them.
 */
import { describe, expect, it } from "vitest";
import { readWorkflow } from "./saved";

describe("an earlier Conformers run's structures set aside, in a workspace's file", () => {
  it("are read back as they were kept, each with its record saying why - and one that does not read counted", () => {
    const drawn = {
      atoms: [
        { id: 1, el: "C", x: 0, y: 0, r: 0.9 },
        { id: 2, el: "C", x: 1.3, y: 0.75, r: 0.9 },
      ],
      bonds: [{ id: 3, a: 1, b: 2, order: 2 }],
      record: { status: { aside: "1 double bond not specified: put Stereoisomers before Conformers" } },
    };
    const run = { at: 1, ok: true, said: "0 conformers", input: "k", kind: "conformers", results: { molecules: [], rest: [], holds: "conformers", drawn: { made: [], rest: [drawn, { atoms: "no" }] } } };
    const read = readWorkflow(JSON.parse(JSON.stringify({ sets: [], steps: [{ id: 1, kind: "conformers", x: 0, y: 0, by: "rdkit", runs: [run] }], wires: [] })))!;
    const kept = read.steps[0].runs![0].results!;
    expect(kept.holds).toBe("conformers");
    expect(kept.drawn?.rest).toHaveLength(1);
    expect(kept.drawn?.rest[0].record).toEqual(drawn.record);
    expect(kept.restUnread).toBe(1);
  });
});
