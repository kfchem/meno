import { describe, expect, it, vi } from "vitest";

// (a Meno with no plugin here that fills any role: as one fresh, its plugins got from the list online)
vi.mock("../calc/catalog", async (actual) => ({ ...(await actual<typeof import("../calc/catalog")>()), pluginsFilling: () => [] }));

const { chemWorker, NoPlugin, noPluginSaid, useRoleOffer } = await import("./worker");

describe("a role asked of that no plugin here fills", () => {
  it("is refused saying what is needed - and offered for, from the plugins online", async () => {
    useRoleOffer.setState({ role: null });
    const asked = chemWorker("smiles");
    await expect(asked).rejects.toBeInstanceOf(NoPlugin);
    await expect(asked).rejects.toThrow(noPluginSaid("smiles"));
    expect(noPluginSaid("smiles")).toBe("Needs a plugin: SMILES to a structure, and back.");
    expect(useRoleOffer.getState().role).toBe("smiles");
  });
});
