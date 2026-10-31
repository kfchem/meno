import { afterEach, describe, expect, it, vi } from "vitest";
import { kindOfFile } from "./probe";
import { NotRead, whoReads } from "./read";
import { kindById, registerKinds } from "../io/kinds";
import { MANIFESTS } from "../plugins/known";

// (no plugin's worker in tests: what is added is said by each test)
vi.mock("./workers", () => ({
  addedReaders: async () => new Set(["meno"]),
  readerClient: () => Promise.reject(new Error("no workers in tests")),
}));

const ORCA = "\n\n                                 * O   R   C   A *\n";
const MOL = "ethane\n\n\n  2  1  0  0  0  0  0  0  0  0999 V2000\nM  END\n";

describe("what a file opened or dropped is", () => {
  afterEach(() => registerKinds([]));

  it("is a kind a plugin added brings, by what it holds", async () => {
    registerKinds(MANIFESTS.filter((m) => m.id === "cclib"));
    const kind = await kindOfFile("job.out", ORCA);
    expect(kind?.id).toBe("orca");
    expect(kindById("orca")).toBe(kind);
  });

  it("is, where no plugin added brings it, what a plugin not added reads it as - so that Meno says which plugins would read it", async () => {
    registerKinds([], MANIFESTS);
    const kind = (await kindOfFile("job.out", ORCA))!;
    expect(kind.id).toBe("orca");
    expect(kindById("orca")).toBeUndefined();
    // (each a plugin Meno carries that says it reads ORCA's output)
    const readers = MANIFESTS.filter((m) => m.reads.includes("orca")).map((m) => m.id);
    expect([...kind.suggest!].sort()).toEqual([...readers].sort());
    const why = whoReads(kind, "job.out", new Set(["meno"]), { read: {}, also: {} });
    expect(why).toBeInstanceOf(NotRead);
    expect((why as NotRead).message).toMatch(/^job\.out \(ORCA output\): .+ would read it\.$/);
    expect((why as NotRead).suggest).toEqual(kind.suggest);
    // (a banner is stronger evidence than a molfile's markers, added or not)
    expect((await kindOfFile("job.out", ORCA + MOL))?.id).toBe("orca");
  });

  it("is told by no plugin not added where none is offered: a file no plugin added reads is what Meno itself makes of it", async () => {
    registerKinds([]);
    expect(await kindOfFile("job.out", ORCA)).toBeNull();
  });

  it("is Meno's own, or text, where no plugin reads it either", async () => {
    expect((await kindOfFile("ethane.mol", MOL))?.id).toBe("mol");
    expect(await kindOfFile("build.log", "compiled in 3 s\n")).toBeNull();
  });
});
