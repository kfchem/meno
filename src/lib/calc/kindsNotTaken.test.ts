import { describe, expect, it, vi } from "vitest";

// (the Gaussian interface as of a version Multiwfn's manifest does not work with: made up, as no such version is carried)
vi.mock("../plugins/known", async (importOriginal) => {
  const known = await importOriginal<typeof import("../plugins/known")>();
  return { ...known, MANIFESTS: known.MANIFESTS.map((m) => (m.id === "gaussian" ? { ...m, version: "1.2.0" } : m)) };
});

const { kindsNotTaken, manifestOf, pluginOf, stoppedOf } = await import("./catalog");

describe("a kind of file of another plugin's that a step uses, that plugin of a version it does not work with", () => {
  const multiwfn = pluginOf(manifestOf("multiwfn")!);

  it("is not taken, said on the plugin - and stops nothing", () => {
    const added = new Set(["multiwfn", "gaussian"]);
    expect(kindsNotTaken(multiwfn, added)).toEqual(["Gaussian formatted checkpoint is not taken: Needs Gaussian interface from 0.4.0 to before 1.0.0; 1.2.0 is added"]);
    expect(stoppedOf(multiwfn, added)).toBeNull();
    // (that plugin not added: nothing said here - the line of the plugins it uses says it is taken where that one is added)
    expect(kindsNotTaken(multiwfn, new Set(["multiwfn"]))).toEqual([]);
  });
});
