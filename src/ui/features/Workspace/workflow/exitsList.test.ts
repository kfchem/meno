import { describe, expect, it } from "vitest";
import { asideExit, asideIn, exitsIn, exitsOf, KINDS, restHolds, type StepExit } from "./kinds";

describe("a kind's exits, as a list", () => {
  it("are, for every kind Meno has, exactly what they were with one second exit: the first, then rest or failed where it has one", () => {
    // (each kind's exits as declared before they became a list - id, name, what each gives, and the mark - main 954b163c)
    const first = (name: string, gives: StepExit["gives"]): StepExit => ({ id: "out", name, gives });
    const failed = (gives: StepExit["gives"] = "same"): StepExit => ({ id: "failed", name: "Failed", gives, of: "failed" });
    const rest = (name: string, gives: StepExit["gives"]): StepExit => ({ id: "rest", name, gives, of: "rest" });
    const had: Record<string, StepExit[]> = {
      generate: [first("Generated", "structures")],
      conformers: [first("Conformers", "conformers"), failed("molecules")],
      optimise: [first("Optimised", "same"), failed()],
      minimise: [first("Minimised", "same"), failed()],
      energy: [first("Energies", "same"), failed()],
      frequencies: [first("Frequencies", "same"), failed()],
      nci: [first("Non-covalent interactions", "same"), failed()],
      render: [first("Rendered", "pictures")],
      "energy-window": [first("Within {window} kcal/mol", "same"), rest("Outside it", "same")],
      duplicates: [first("Unlike", "same"), rest("Alike", "same")],
      populations: [first("Populations at {temperature} K", "conformers")],
      filter: [first("Filtered", "same"), rest("The rest", "same")],
      "as-conformers": [first("Conformers", "conformers")],
      choose: [first("Chosen", "molecules"), rest("The rest", "conformers")],
      "check-structures": [first("Checked", "structures"), rest("Set aside", "structures")],
      stereoisomers: [first("Stereoisomers", "structures"), rest("Set aside", "structures")],
      descriptors: [first("With descriptors", "structures"), rest("Set aside", "structures")],
      enumerate: [first("Made", "structures"), rest("Aside", "same")],
      chart: [first("Chart", "chart")],
      "energy-diagram": [first("Energy diagram", "chart")],
      tag: [first("Tagged", "same")],
      species: [first("With species", "same"), failed()],
      combine: [first("Combined", "molecules")],
      measure: [first("Measured", "same")],
      merge: [first("Merged", "same"), rest("The rest", "same")],
      rebond: [first("Re-bonded", "same"), rest("Not re-bonded", "same")],
      "compare-bonding": [first("Same", "same"), rest("Different", "same")],
      "take-frames": [first("Frames", "molecules")],
      displace: [first("Displaced", "same"), rest("Not displaced", "same")],
      "path-search": [first("Refined structures", "molecules"), { id: "failed", name: "Failed", gives: "same", of: "failed" }],
      rank: [first("The first {keep}", "same"), rest("The rest", "same")],
      join: [first("Joined", "same"), rest("Not joined", "same")],
      barrier: [first("With barriers", "molecules"), failed()],
      restraints: [first("Restrained", "same"), failed()],
      "torsion-restraints": [first("Restrained", "same"), rest("Trans already", "same")],
      number: [first("Number", "number")],
      add: [first("{as}", "same"), rest("Not added", "same")],
      "atom-map": [first("Mapped", "same"), rest("Not mapped", "same"), { id: "changes", name: "Bond changes", gives: "table" }],
      "reaction-path": [first("Reaction paths", "molecules"), { id: "failed", name: "Failed", gives: "same", of: "failed" }],
      "saddle-point": [first("Optimised structures", "molecules"), { id: "failed", name: "Failed", gives: "same", of: "failed" }],
      ensemble: [first("{as}", "same"), rest("The rest", "same")],
    };
    // (every kind guarded: one added declares its exits here too)
    expect(KINDS.map((k) => k.kind).sort()).toEqual(Object.keys(had).sort());
    for (const k of KINDS) {
      expect(exitsOf(k.kind), k.kind).toEqual(had[k.kind]);
      expect(asideExit(k.kind), k.kind).toEqual(had[k.kind][1]);
    }
    // (what the exit for what was set aside holds: as declared, or what came in)
    expect(restHolds("choose", "molecules")).toBe("conformers");
    expect(restHolds("filter", "conformers")).toBe("conformers");
    expect(restHolds("conformers", "structures")).toBe("molecules");
    expect(restHolds("render", "molecules")).toBeUndefined();
  });

  it("mark at most one exit of any kind as the one for what it sets aside or could not do", () => {
    for (const k of KINDS) expect(exitsOf(k.kind).filter((e) => e.of).length, k.kind).toBeLessThanOrEqual(1);
  });

  it("take a kind with three - its first, what it sets aside, and something else it gives - in the order declared, the aside one found by its mark wherever it stands", () => {
    const rest: StepExit = { id: "rest", name: "Not mapped", gives: "same", of: "rest" };
    const table: StepExit = { id: "changes", name: "Bond changes", gives: "table" };
    for (const others of [[rest, table], [table, rest]]) {
      const exits = exitsIn({ made: "Mapped products", gives: "molecules", others });
      expect(exits.map((e) => e.id)).toEqual(["out", ...others.map((e) => e.id)]);
      expect(exits[0]).toEqual({ id: "out", name: "Mapped products", gives: "molecules" });
      expect(asideIn(exits)).toBe(rest);
    }
    expect(asideIn(exitsIn({ made: "Made", gives: "same", others: [table] }))).toBeUndefined();
    expect(exitsIn({ made: "Made", gives: "same" })).toEqual([{ id: "out", name: "Made", gives: "same" }]);
  });
});
