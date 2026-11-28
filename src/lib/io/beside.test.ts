import { describe, expect, it } from "vitest";
import { firstFreeBeside, numbered, takenBeside, withEnding } from "./beside";

describe("a name beside a file", () => {
  it("is numbered before its extension, which is kept", () => {
    expect(numbered("/runs/job.inp", 2)).toBe("/runs/job-2.inp");
    expect(numbered("C:\\runs\\a.b.gjf", 3)).toBe("C:\\runs\\a.b-3.gjf");
    expect(numbered("/runs/README", 2)).toBe("/runs/README-2");
    expect(numbered("/runs.d/input", 2)).toBe("/runs.d/input-2");
  });

  it("is the first from 2 not there already", async () => {
    expect(firstFreeBeside("/a/x.pdb")).toBe("/a/x-2.pdb");
    const isThere = async (p: string) => p === "/a/x-2.pdb" || p === "/a/x-3.pdb";
    expect(firstFreeBeside("/a/x.pdb", await takenBeside("/a/x.pdb", isThere))).toBe("/a/x-4.pdb");
  });

  it("as a file of another kind, has its own ending in place of the new one - never both", () => {
    expect(withEnding("ethanol.mol", "png")).toBe("ethanol.png");
    expect(withEnding("ethanol.mol", "mov")).toBe("ethanol.mov");
    expect(withEnding("Ethanol.MOL", "mp4")).toBe("Ethanol.mp4");
    expect(withEnding("/runs/b.sdf", "meno")).toBe("/runs/b.meno");
    expect(withEnding("C:\\runs\\a.b.gjf", "mol")).toBe("C:\\runs\\a.b.mol");
    // (none to take: the new one added)
    expect(withEnding("ethanol", "png")).toBe("ethanol.png");
    expect(withEnding("/runs.d/README", "mol")).toBe("/runs.d/README.mol");
    // (what only looks like an ending stays)
    expect(withEnding("compound 3.1", "png")).toBe("compound 3.1.png");
    // (a job of a calculation named after its file: that file's ending gone too)
    expect(withEnding("opt.log, job 2", "png")).toBe("opt, job 2.png");
  });
});
