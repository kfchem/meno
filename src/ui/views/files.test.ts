import { describe, expect, it } from "vitest";
import { fileTakerOf, forgetFiles, giveFiles, setFileTaker, type OpenedFile } from "./files";
import { waitedFor } from "./onItsWay";

const file = (name: string): OpenedFile => ({ name, bytes: new TextEncoder().encode(name) });

describe("files opened, given to a workspace", () => {
  it("are taken at once by the workspace that takes them", () => {
    const taken: string[] = [];
    const stop = setFileTaker("a", (files) => taken.push(...files.map((f) => f.name)));
    giveFiles("a", [file("one.mol"), file("two.sdf")]);
    expect(taken).toEqual(["one.mol", "two.sdf"]);
    stop();
    expect(fileTakerOf("a")).toBeUndefined();
  });

  it("wait for a canvas just opened for them, and are taken as it comes to take them - once", () => {
    giveFiles("b", [file("first.mol")]);
    giveFiles("b", [file("second.out")]);
    const taken: string[] = [];
    const stop = setFileTaker("b", (files) => taken.push(...files.map((f) => f.name)));
    expect(taken).toEqual(["first.mol", "second.out"]);
    // (taken away and set again: nothing given twice)
    stop();
    setFileTaker("b", (files) => taken.push(...files.map((f) => f.name)))();
    expect(taken).toEqual(["first.mol", "second.out"]);
  });

  it("are let go of with a tab closed before it took them", () => {
    giveFiles("c", [file("never.mol")]);
    forgetFiles("c");
    const taken: string[] = [];
    setFileTaker("c", (files) => taken.push(...files.map((f) => f.name)))();
    expect(taken).toEqual([]);
  });

  it("keep the page of the canvas just opened for them waiting, not empty, until it takes them - or they are let go of", () => {
    giveFiles("d", [file("coming.mol")]);
    giveFiles("d", [file("coming too.out")]);
    expect(waitedFor("d")).toBe(true);
    expect(waitedFor("e")).toBe(false);
    setFileTaker("d", () => {})();
    expect(waitedFor("d")).toBe(false);
    giveFiles("e", [file("never.mol")]);
    forgetFiles("e");
    expect(waitedFor("e")).toBe(false);
  });
});
