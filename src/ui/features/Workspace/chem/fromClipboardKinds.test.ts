import { afterEach, describe, expect, it, vi } from "vitest";
import { writeClipboard } from "../../../../lib/clipboard";
import { registerKinds } from "../../../../lib/io/kinds";
import { MANIFESTS } from "../../../../lib/plugins/known";
import { structureInOutput, structureOnClipboard } from "./fromClipboard";
import { outputKindIn } from "../../../../lib/calc/probe";
import { NotRead } from "../../../../lib/calc/read";

// (no plugin's worker in tests: Meno's own reader alone added - or, where a test says, the Quanta interface too, its reading a stand-in)
const added = vi.hoisted(() => ({ ids: new Set(["meno"]) }));
vi.mock("../../../../lib/calc/workers", async (actual) => ({
  ...(await actual<typeof import("../../../../lib/calc/workers")>()),
  addedReaders: async () => added.ids,
  readerClient: () => Promise.reject(new Error("no workers in tests")),
}));
vi.mock("../../../../lib/calc/read", async (actual) => {
  const real = await actual<typeof import("../../../../lib/calc/read")>();
  return {
    ...real,
    readOutput: async (...args: Parameters<typeof real.readOutput>) =>
      added.ids.has("quanta")
        ? { output: { schema: 1, program: "Quanta", version: "6.1.0", method: "M1", atoms: ["O", "H", "H"], frames: [[0, 0, 0.1173, 0, 0.7572, -0.4692, 0, -0.7572, -0.4692]], energies: [-76.4] }, readers: ["quanta 0.4.0"] }
        : real.readOutput(...args),
  };
});

const QUANTA = "\n\n                                 ~ Q   U   A   N   T   A ~\n";

describe("text pasted that is a calculation's output", () => {
  afterEach(() => registerKinds([]));

  it("is told as Open tells it: one a plugin not added reads names that plugin, to be added", async () => {
    registerKinds([], MANIFESTS);
    await writeClipboard([{ flavor: "text", text: QUANTA }]);
    await expect(structureOnClipboard()).rejects.toThrow(/Quanta output\): Quanta interface or Manyread would read it/);
  });
});

describe("a calculation's output pasted in Quick Add, or chosen in a text", () => {
  afterEach(() => {
    registerKinds([]);
    added.ids = new Set(["meno"]);
  });

  it("is read as one opened is, by its reader, where its plugin is added", async () => {
    added.ids = new Set(["meno", "quanta"]);
    registerKinds(MANIFESTS.filter((m) => m.id === "quanta"), MANIFESTS);
    const drawn = await structureInOutput(QUANTA, outputKindIn(QUANTA)!, "Pasted text");
    expect(drawn?.molecules3d).toHaveLength(1);
    expect(drawn!.molecules3d![0]).toMatchObject({ atoms: [{ el: "O" }, { el: "H" }, { el: "H" }], energies: [-76.4], calc: { program: "Quanta", method: "M1" } });
  });

  it("is said to be what a plugin not added reads, naming it, as Open says it - nothing of it read", async () => {
    registerKinds([], MANIFESTS);
    const said = await structureInOutput(QUANTA, outputKindIn(QUANTA)!, "Pasted text").then(
      () => null,
      (e: unknown) => e,
    );
    // (named once, as given; the plugins that would read it each one Meno knows of that says it reads Quanta's output)
    expect(said).toBeInstanceOf(NotRead);
    expect((said as NotRead).message).toMatch(/^Pasted text \(Quanta output\): .+ would read it\.$/);
    expect([...(said as NotRead).suggest].sort()).toEqual(MANIFESTS.filter((m) => m.reads.includes("quanta")).map((m) => m.id).sort());
  });
});
