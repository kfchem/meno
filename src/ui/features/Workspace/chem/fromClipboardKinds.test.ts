import { afterEach, describe, expect, it, vi } from "vitest";
import { writeClipboard } from "../../../../lib/clipboard";
import { registerKinds } from "../../../../lib/io/kinds";
import { MANIFESTS } from "../../../../lib/plugins/known";
import { structureInOutput, structureOnClipboard } from "./fromClipboard";
import { outputKindIn } from "../../../../lib/calc/probe";

// (no plugin's worker in tests: Meno's own reader alone added - or, where a test says, the ORCA interface too, its reading a stand-in)
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
      added.ids.has("orca")
        ? { output: { schema: 1, program: "ORCA", version: "6.1.0", method: "B3LYP", atoms: ["O", "H", "H"], frames: [[0, 0, 0.1173, 0, 0.7572, -0.4692, 0, -0.7572, -0.4692]], energies: [-76.4] }, readers: ["orca 0.4.1"] }
        : real.readOutput(...args),
  };
});

const ORCA = "\n\n                                 * O   R   C   A *\n";

describe("text pasted that is a calculation's output", () => {
  afterEach(() => registerKinds([]));

  it("is told as Open tells it: one a plugin not added reads names that plugin, to be added", async () => {
    registerKinds([], MANIFESTS);
    await writeClipboard([{ flavor: "text", text: ORCA }]);
    await expect(structureOnClipboard()).rejects.toThrow(/ORCA output\): ORCA interface or cclib or PySCF would read it/);
  });
});

describe("a calculation's output pasted in Quick Add, or chosen in a text", () => {
  afterEach(() => {
    registerKinds([]);
    added.ids = new Set(["meno"]);
  });

  it("is read as one opened is, by its reader, where its plugin is added", async () => {
    added.ids = new Set(["meno", "orca"]);
    registerKinds(MANIFESTS.filter((m) => m.id === "orca"), MANIFESTS);
    const drawn = await structureInOutput(ORCA, outputKindIn(ORCA)!, "Pasted text");
    expect(drawn?.molecules3d).toHaveLength(1);
    expect(drawn!.molecules3d![0]).toMatchObject({ atoms: [{ el: "O" }, { el: "H" }, { el: "H" }], energies: [-76.4], calc: { program: "ORCA", method: "B3LYP" } });
  });

  it("is said to be what a plugin not added reads, naming it, as Open says it - nothing of it read", async () => {
    registerKinds([], MANIFESTS);
    await expect(structureInOutput(ORCA, outputKindIn(ORCA)!, "Pasted text")).rejects.toThrow(/ORCA output\): ORCA interface or cclib or PySCF would read it/);
  });
});
