import { describe, expect, it } from "vitest";
import { runnerOf, runners, THIS_COMPUTER } from "./runners";

describe("the runners", () => {
  it("are this computer's alone for now, which has every job not named for another", () => {
    expect(runners().map((r) => r.id)).toEqual(["this-computer"]);
    expect(runnerOf()).toBe(THIS_COMPUTER);
    expect(runnerOf("4f1c2a9e-0b7d-4e55-9a3c-2f8e1d6b7a10")).toBe(THIS_COMPUTER);
    expect(runnerOf("this-computer")).toBe(THIS_COMPUTER);
    // (a job named for a runner there is not: this computer's, which says it has no such job)
    expect(runnerOf("cluster:1234")).toBe(THIS_COMPUTER);
  });
});
