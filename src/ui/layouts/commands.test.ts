import { describe, expect, it } from "vitest";
import { askToOpenFiles, opensAsWorkspace, useFilesAsked } from "./commands";

describe("a workspace file dropped or pasted on a canvas (the maintainer, 2026-10-12: opened, as Open does)", () => {
  it("is a workspace's by its zip, or by what it was read as - a record is none", () => {
    expect(opensAsWorkspace(true, null, "meno-workspace")).toBe(true);
    expect(opensAsWorkspace(false, "meno-workspace", "meno-workspace")).toBe(true);
    expect(opensAsWorkspace(false, "meno-record", "meno-workspace")).toBe(false);
    expect(opensAsWorkspace(false, null, "meno-workspace")).toBe(false);
  });

  it("is handed to the app to be opened as Open opens it - once each time, the same file twice too", () => {
    const opened: string[][] = [];
    const stop = useFilesAsked.subscribe((s, prev) => {
      if (s.asked !== prev.asked) opened.push(s.files.map((f) => f.name));
    });
    const a = new File(["PK"], "a.meno");
    askToOpenFiles([a]);
    askToOpenFiles([a]);
    // (nothing to open: nothing asked)
    askToOpenFiles([]);
    stop();
    expect(opened).toEqual([["a.meno"], ["a.meno"]]);
  });
});
