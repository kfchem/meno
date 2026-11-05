import { describe, expect, it, vi } from "vitest";

// (the made-up Orbitron interface as of a version Densitool's manifest does not work with)
vi.mock("../plugins/known", async (importOriginal) => {
  const known = await importOriginal<typeof import("../plugins/known")>();
  return { ...known, MANIFESTS: known.MANIFESTS.map((m) => (m.id === "orbitron" ? { ...m, version: "1.2.0" } : m)) };
});

const { kindsNotTaken, manifestOf, pluginOf, stoppedOf } = await import("./catalog");

describe("a kind of file of another plugin's that a step uses, that plugin of a version it does not work with", () => {
  const densitool = pluginOf(manifestOf("densitool")!);

  it("is not taken, said on the plugin - and stops nothing", () => {
    const added = new Set(["densitool", "orbitron"]);
    expect(kindsNotTaken(densitool, added)).toEqual(["Orbitron checkpoint, as text is not taken: Needs Orbitron interface from 0.3.0 to before 1.0.0; 1.2.0 is added"]);
    expect(stoppedOf(densitool, added)).toBeNull();
    // (that plugin not added: nothing said here - the line of the plugins it uses says it is taken where that one is added)
    expect(kindsNotTaken(densitool, new Set(["densitool"]))).toEqual([]);
  });
});
