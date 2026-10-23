import { describe, expect, it } from "vitest";
import { asideExit, asideIn, exitsIn, exitsOf, KINDS, restHolds, type StepExit } from "./kinds";

describe("a kind's exits, as a list", () => {
  it("are, for every kind Meno has, what they were with one second exit: the first, then rest or failed where it has one", () => {
    // (as each kind declared them before its exits became a list)
    const had: Record<string, string[]> = {
      generate: ["out"],
      conformers: ["out", "failed"],
      optimise: ["out", "failed"],
      energy: ["out", "failed"],
      frequencies: ["out", "failed"],
      nci: ["out", "failed"],
      render: ["out"],
      "energy-window": ["out", "rest"],
      duplicates: ["out", "rest"],
      populations: ["out"],
      filter: ["out", "rest"],
      "as-conformers": ["out"],
      choose: ["out", "rest"],
      "check-structures": ["out", "rest"],
      stereoisomers: ["out", "rest"],
      descriptors: ["out", "rest"],
      enumerate: ["out", "rest"],
      chart: ["out"],
    };
    // (every kind there was then, each still there; one added since declares its own)
    for (const [kind, ids] of Object.entries(had)) {
      const k = KINDS.find((x) => x.kind === kind);
      expect(k, kind).toBeDefined();
      expect(exitsOf(k!.kind).map((e) => e.id), kind).toEqual(ids);
      expect(asideExit(k!.kind)?.id, kind).toBe(ids[1]);
    }
    // (what the exit for what was set aside holds: as declared, or what came in)
    expect(restHolds("choose", "molecules")).toBe("conformers");
    expect(restHolds("filter", "conformers")).toBe("conformers");
    expect(restHolds("conformers", "structures")).toBe("molecules");
    expect(restHolds("render", "molecules")).toBeUndefined();
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
