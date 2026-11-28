import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { DrawAs } from "./QuickAdd";
import { readSmiles, notDrawnSaid } from "./quickAddSmiles";
import { resolve } from "./chem/resolve";
import { lookUpName, type LookupSteps } from "./chem/nameLookupRun";
import { NoPlugin } from "../../../lib/roles/worker";
import { ChemError } from "../../../lib/roles/client";
import type { PythonPlugin } from "../../../lib/calc/catalog";

// What Quick Add says where a plugin or the back end failed it: made-up failures, no plugin run, nothing sent.

/** What the back end says where it will not start a worker: made-up text naming a file, as such text does. */
const REFUSED = "forbidden path: /home/someone/data/uv/plugin-x/venv/bin/python";

describe("Quick Add, where a plugin or the back end fails it", () => {
  afterEach(() => vi.restoreAllMocks());

  it("says a SMILES was not drawn in plain words, never the back end's text, which goes to the log", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const said = await readSmiles("CCO", async () => Promise.reject(REFUSED));
    expect(said).toEqual({ error: "This SMILES could not be drawn. Try again.", needs: null });
    expect(warn).toHaveBeenCalledWith(expect.any(String), REFUSED);
  });

  it("... nor a program's own words", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const said = await readSmiles("CCO", async () => Promise.reject(new ChemError("Traceback (most recent call last): KeyError 'x'")));
    expect(said?.error).toBe("This SMILES could not be drawn. Try again.");
  });

  it("keeps Meno's own words, where they say why", async () => {
    const said = await readSmiles("C(C", async () => Promise.reject(new Error("This SMILES could not be read: a ( is not closed.")));
    expect(said).toEqual({ error: "This SMILES could not be read: a ( is not closed.", needs: null });
  });

  it("offers, for a compound found that no plugin here can draw, the plugin it needs - as for a SMILES typed", () => {
    const missing = new NoPlugin("smiles");
    expect(notDrawnSaid(missing, "This compound could not be drawn. Try again.")).toEqual({ error: missing.message, needs: "smiles" });
  });

  it("says a plugin that looks names up and could not be started so, with what to do", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const plugin = { id: "finder", name: "Names Service", roleHosts: { names: ["names.example.org"] } } as unknown as PythonPlugin;
    const steps: LookupSteps = {
      ask: async () => true,
      allowed: () => true,
      offline: () => false,
      ready: async () => true,
      worker: async () => Promise.reject(REFUSED),
      running: () => false,
      stop: async () => undefined,
    };
    await expect(lookUpName(plugin, "abc", steps)).rejects.toThrow("Names Service could not be started. Remove it and add it again in Settings, Plugins.");
  });
});

describe("Quick Add's rows under the SMILES field", () => {
  it("are each named by the words they show, the formula among them, and the lookup's by its own", () => {
    const readings = resolve("dmf", "molecule").readings;
    const html = renderToString(<DrawAs offered={readings} chosen={readings[0]} onChoose={() => {}} lookup={{ text: "Look up “abc” at Names Service", chosen: false, dim: false, onChoose: () => {} }} />);
    const names = [...html.matchAll(/role="radio"[^>]*aria-label="([^"]+)"/g)].map((m) => m[1]);
    expect(names.length).toBe(readings.length + 1);
    expect(names[0]).toMatch(/^N,N-dimethylformamide · C3H7NO$/);
    expect(names[names.length - 1]).toBe("Look up “abc” at Names Service");
  });
});
