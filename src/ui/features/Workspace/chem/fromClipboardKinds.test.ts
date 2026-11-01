import { afterEach, describe, expect, it, vi } from "vitest";
import { writeClipboard } from "../../../../lib/clipboard";
import { registerKinds } from "../../../../lib/io/kinds";
import { MANIFESTS } from "../../../../lib/plugins/known";
import { structureOnClipboard } from "./fromClipboard";

// (no plugin's worker in tests: Meno's own reader alone added)
vi.mock("../../../../lib/calc/workers", async (actual) => ({
  ...(await actual<typeof import("../../../../lib/calc/workers")>()),
  addedReaders: async () => new Set(["meno"]),
  readerClient: () => Promise.reject(new Error("no workers in tests")),
}));

const ORCA = "\n\n                                 * O   R   C   A *\n";

describe("text pasted that is a calculation's output", () => {
  afterEach(() => registerKinds([]));

  it("is told as Open tells it: one a plugin not added reads names that plugin, to be added", async () => {
    registerKinds([], MANIFESTS);
    await writeClipboard([{ flavor: "text", text: ORCA }]);
    await expect(structureOnClipboard()).rejects.toThrow(/ORCA output\): ORCA interface or cclib would read it/);
  });
});
