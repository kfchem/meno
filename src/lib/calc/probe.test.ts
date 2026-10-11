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

  it("is, where no plugin added brings it, what the catalogue of a plugin added names it - so that Meno says which plugin it suggests", async () => {
    registerKinds(MANIFESTS.filter((m) => m.id === "getting-started"));
    const kind = (await kindOfFile("job.out", ORCA))!;
    expect(kind.id).toBe("orca");
    expect(kindById("orca")).toBeUndefined();
    expect(kind.suggest).toEqual(["cclib", "pyscf"]);
    const why = whoReads(kind, "job.out", new Set(["meno"]), { read: {}, also: {} });
    expect(why).toBeInstanceOf(NotRead);
    expect((why as NotRead).message).toBe("job.out (ORCA output): cclib or PySCF would read it.");
    expect((why as NotRead).suggest).toEqual(["cclib", "pyscf"]);
    // (a banner is stronger evidence than a molfile's markers, added or not)
    expect((await kindOfFile("job.out", ORCA + MOL))?.id).toBe("orca");
  });

  it("is told by no plugin not added: with no catalogue, a file no plugin added reads is what Meno itself makes of it", async () => {
    registerKinds([]);
    expect(await kindOfFile("job.out", ORCA)).toBeNull();
  });

  it("is Meno's own, or text, where no catalogue names it either", async () => {
    expect((await kindOfFile("ethane.mol", MOL))?.id).toBe("mol");
    expect(await kindOfFile("build.log", "compiled in 3 s\n")).toBeNull();
  });
});
