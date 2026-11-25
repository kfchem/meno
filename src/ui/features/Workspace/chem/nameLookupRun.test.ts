import { describe, expect, it, vi } from "vitest";
import type { PythonPlugin } from "../../../../lib/calc/catalog";
import type { PluginWorker } from "../../../../lib/plugins/process";
import { lookUpName, type LookupSteps } from "./nameLookupRun";

// (a hand-written record in the answer's shape: no answer fetched from any service)
const HOST = "names.example.org";
const record = {
  id: "ID 2244",
  page: `https://${HOST}/compound/2244`,
  title: "aspirin",
  smiles: "CC(=O)OC1=CC=CC=C1C(=O)O",
  formula: "C9H8O4",
  charge: 0,
  centres: { defined: 0, undefined: 0 },
  doubleBonds: { defined: 0, undefined: 0 },
  parts: 1,
};
const plugin = { id: "finder", name: "Names Service", roleHosts: { names: [HOST] } } as unknown as PythonPlugin;

function steps(over: Partial<LookupSteps> = {}, answer: unknown = { found: [record], more: 0 }) {
  const request = vi.fn(async () => answer);
  const s: LookupSteps = {
    ask: vi.fn(async () => true),
    allowed: () => true,
    offline: () => false,
    ready: async () => true,
    worker: vi.fn(async () => ({ chem: { request } }) as unknown as PluginWorker),
    running: () => false,
    stop: vi.fn(async () => undefined),
    ...over,
  };
  return { s, request };
}

describe("a name looked up", () => {
  it("asks nothing and sends nothing for a plugin that cannot run - taken away, or its set-up not done - and says so", async () => {
    const { s, request } = steps({ ready: async () => false });
    expect(await lookUpName(plugin, "aspirin", s)).toEqual({ error: "Names Service is not added: add it in Settings, Plugins." });
    expect(s.ask).not.toHaveBeenCalled();
    expect(s.worker).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });

  it("goes to the plugin's worker as find_name, the most asked for said, and comes back read strictly", async () => {
    const { s, request } = steps();
    expect(await lookUpName(plugin, "  aspirin ", s)).toEqual({ found: [record], more: 0 });
    expect(request).toHaveBeenCalledWith("find_name", { name: "aspirin", most: 8 }, 90_000);
    // (asked each time - the backend keeps the yes; nothing kept here: twice looked up, twice sent)
    await lookUpName(plugin, "aspirin", s);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("sends nothing where the person says no, where Meno is offline, or where the name is empty or too long", async () => {
    for (const [over, name, said] of [
      [{ ask: async () => false }, "aspirin", `Nothing was sent: looking names up at ${HOST} was not allowed.`],
      [{ offline: () => true }, "aspirin", "Names Service needs the network; Meno is offline"],
      [{}, "  ", "A name of 1 to 300 characters is looked up"],
      [{}, "x".repeat(301), "A name of 1 to 300 characters is looked up"],
    ] as [Partial<LookupSteps>, string, string][]) {
      const { s, request } = steps(over);
      expect(await lookUpName(plugin, name, s)).toEqual({ error: said });
      expect(request).not.toHaveBeenCalled();
      expect(s.worker).not.toHaveBeenCalled();
    }
  });

  it("starts its worker again where it ran before the yes - that one goes out nowhere - and not where it was allowed already", async () => {
    let granted = false;
    const { s } = steps({ allowed: () => granted, running: () => true, ask: async () => ((granted = true), true) });
    await lookUpName(plugin, "aspirin", s);
    expect(s.stop).toHaveBeenCalledWith("finder", "Names Service was started again: it may now look names up");
    const again = steps({ running: () => true });
    await lookUpName(plugin, "aspirin", again.s);
    expect(again.s.stop).not.toHaveBeenCalled();
  });

  it("refuses an answer it does not read, whole", async () => {
    const { s } = steps({}, { found: [{ ...record, page: "https://elsewhere.example.net/x" }], more: 0 });
    await expect(lookUpName(plugin, "aspirin", s)).rejects.toThrow("The plugin that looks names up gave what Meno does not read");
  });
});
