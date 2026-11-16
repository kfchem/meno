// A SMILES typed while the first start's card sets chemistry up waits for it (found in review): not refused as wanting a plugin, nor offered one;
// then answered as ever.
import { describe, expect, it, vi } from "vitest";

// (a Meno with no plugin here that fills any role, as noPlugin.test.ts has it)
vi.mock("../calc/catalog", async (actual) => ({ ...(await actual<typeof import("../calc/catalog")>()), pluginsFilling: () => [] }));

const { chemWorker, firstSetUpWait, NoPlugin, useRoleOffer } = await import("./worker");

describe("a role asked of while the card sets chemistry up", () => {
  it("waits for the set-up, neither refused nor offered a plugin, and is answered as ever when it ends with none here", async () => {
    let end!: () => void;
    const underWay = new Promise<void>((ok) => (end = ok));
    firstSetUpWait.now = () => underWay;
    useRoleOffer.setState({ role: null });
    const asked = chemWorker("smiles");
    let settled = false;
    asked.then(() => (settled = true), () => (settled = true));
    await new Promise((ok) => setTimeout(ok, 0));
    expect(settled).toBe(false);
    expect(useRoleOffer.getState().role).toBeNull();
    // (the set-up ended, a plugin still none here: as without the card)
    firstSetUpWait.now = () => null;
    end();
    await expect(asked).rejects.toBeInstanceOf(NoPlugin);
    expect(useRoleOffer.getState().role).toBe("smiles");
  });
});
