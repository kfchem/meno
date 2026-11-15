/**
 * Where a program stopped with an error, why - in its own words, as its plugin read them - is said wherever Meno says
 * the job failed: the step's line, a chip, its tip (`failureSaid`, `failuresSaid`). Its other kinds say what happened
 * already, their why kept in the record.
 */
import { describe, expect, it } from "vitest";
import { FAILURE_WORDS, failureSaid, failuresLine, failuresSaid, WHY_SHUT } from "./failures";
import { unfinishedWhy } from "../pageGl/liveChip";
import { chipMarks as setMarks, type ChipFacts } from "../utils/chipSaid";
import { chipMarks as framesMarks } from "../utils/molecule3d";

const error = (why: string) => ({ kind: "program-error" as const, why });

describe("a failure said", () => {
  it("is the program's error with why, on one line - cut with an ellipsis where a chip has little room, whole elsewhere", () => {
    expect(failureSaid(error("A made-up reason the run stopped."))).toBe("the program stopped with an error: A made-up reason the run stopped.");
    expect(failureSaid(error("  two\n lines  "))).toBe("the program stopped with an error: two lines");
    const long = "x".repeat(WHY_SHUT + 40);
    const cut = failureSaid(error(long), WHY_SHUT);
    expect(cut.endsWith("…")).toBe(true);
    expect(cut.length).toBe(`${FAILURE_WORDS["program-error"]}: `.length + WHY_SHUT);
    expect(failureSaid(error(long))).toContain(long);
  });

  it("is the kind alone where no why was given, or the kind says what happened already", () => {
    expect(failureSaid(error(""))).toBe(FAILURE_WORDS["program-error"]);
    expect(failureSaid({ kind: "not-converged", why: "The optimisation did not converge" })).toBe(FAILURE_WORDS["not-converged"]);
    expect(failureSaid({ kind: "refused", why: "a plugin's own words" })).toBe(FAILURE_WORDS.refused);
  });

  it("counted on the step's line: with why where all of a kind give the same, the kind alone where they differ", () => {
    expect(failuresSaid([error("A made-up reason.")], 1)).toBe("1 of 1 failed (1: the program stopped with an error: A made-up reason.)");
    expect(failuresSaid([error("A."), error("A.")], 3)).toBe("2 of 3 failed (2: the program stopped with an error: A.)");
    expect(failuresSaid([error("A."), error("B."), { kind: "not-converged", why: "" }], 5)).toBe("3 of 5 failed (2: the program stopped with an error; 1: not converged)");
  });

  it("is said so on a set's chip and a molecule's frames chip, cut; whole in the tip over its bar", () => {
    const long = `${"y".repeat(WHY_SHUT)} and the rest`;
    const cut = failureSaid(error(long), WHY_SHUT);
    expect(setMarks({ failed: [null, error(long)] }, 1)).toBe(cut);
    expect(setMarks({ failed: [null, error(long)] }, 0)).toBe("");
    expect(framesMarks({ failed: [error("A."), error(long)] }, 1, 2)).toBe(cut);
    expect(framesMarks({ failed: [error("A.")] }, 0, 1)).toBe(failureSaid(error("A.")));
    const facts = { count: 2, frame: 0, failed: [null, error(long)] } as unknown as ChipFacts;
    expect(unfinishedWhy(facts, 1)).toBe(`${FAILURE_WORDS["program-error"]}: ${long}`);
    expect(unfinishedWhy({ ...facts, marksUnread: true }, 1)).toBe("its marks could not be read");
  });
});

describe("a step's line where its jobs failed", () => {
  it("says a why once, folded to one line, however the program broke it over lines or spaced it - and adds nothing for an empty why", () => {
    for (const why of ["Some atoms\nare very close", "Some atoms  are very close", "  Some atoms are very close\n"]) {
      const line = failuresLine([error(why), error(why), error(why)], 3, true).join(" \u00b7 ");
      expect([why, line]).toEqual([why, "3 of 3 failed (3: the program stopped with an error: Some atoms are very close)"]);
    }
    expect(failuresLine([error("")], 1, true)).toEqual(["1 of 1 failed (1: the program stopped with an error)"]);
    // (a why the count does not say - two jobs' words that differ: the first's after it, on one line)
    expect(failuresLine([error("No\nconvergence"), error("Out of memory")], 2, true)).toEqual(["2 of 2 failed (2: the program stopped with an error)", "No convergence"]);
    // (not every job failed: the count alone)
    expect(failuresLine([error("No convergence"), error("Out of memory")], 3, false)).toEqual(["2 of 3 failed (2: the program stopped with an error)"]);
    expect(failuresLine([], 3, true)).toEqual([]);
  });

  it("cuts a why a shut chip says at 80 characters, its ellipsis the 80th; 80 are said whole", () => {
    expect(WHY_SHUT).toBe(80);
    const words = (n: number) => "x".repeat(n);
    expect(failureSaid(error(words(80)), WHY_SHUT)).toBe(`${FAILURE_WORDS["program-error"]}: ${words(80)}`);
    expect(failureSaid(error(words(81)), WHY_SHUT)).toBe(`${FAILURE_WORDS["program-error"]}: ${words(79)}\u2026`);
    // (a space where it is cut: none before the ellipsis)
    expect(failureSaid(error(`${words(78)} ${words(10)}`), WHY_SHUT)).toBe(`${FAILURE_WORDS["program-error"]}: ${words(78)}\u2026`);
  });
});

