import { describe, expect, it } from "vitest";
import { discardedSaid, runsAgainSaid } from "./changesSaid";

describe("what a turn's changes leave to say", () => {
  const steps = [
    { id: 4, kind: "filter" },
    { id: 7, kind: "duplicates" },
  ];

  it("names the steps its changes made run again, by what each does, in the order given - none where none, and none it cannot find", () => {
    expect(runsAgainSaid(["4"], steps)).toBe("This makes Filter run again, when you next run it.");
    expect(runsAgainSaid(["7", "4"], steps)).toBe("This makes Duplicates, Filter run again, when you next run it.");
    expect(runsAgainSaid(["9", "4"], steps)).toBe("This makes Filter run again, when you next run it.");
    expect(runsAgainSaid(["9"], steps)).toBeNull();
    expect(runsAgainSaid([], steps)).toBeNull();
    expect(runsAgainSaid(undefined, steps)).toBeNull();
  });

  it("says why Discard left the changes as they were - a step running, the page changed since - and nothing where it dropped them", () => {
    expect(discardedSaid("running")).toBe("A step it added is running: stop it first.");
    expect(discardedSaid("since")).toBe("The page has changed since: undo is yours, step by step.");
    expect(discardedSaid("dropped")).toBeNull();
    expect(discardedSaid("none")).toBeNull();
  });
});
