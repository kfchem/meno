import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { DrawAs } from "./QuickAdd";
import { readSmiles, notDrawnSaid, offerDone } from "./quickAddSmiles";
import { resolve } from "./chem/resolve";
import { lookUpName, type LookupSteps } from "./chem/nameLookupRun";
import { NoPlugin } from "../../../lib/roles/worker";
import { ChemRefusal, ChemTimeout } from "../../../lib/roles/client";
import type { PythonPlugin } from "../../../lib/calc/catalog";

// What Quick Add says where a plugin or the back end failed it: made-up failures, no plugin run, nothing sent.

/** What the back end says where it will not start a worker: made-up text naming a file, as such text does. */
const REFUSED = "forbidden path: /home/someone/data/uv/plugin-x/venv/bin/python";

describe("Quick Add, where a plugin or the back end fails it", () => {
  afterEach(() => vi.restoreAllMocks());

  it("says a SMILES was not drawn by what kind of failure it was, never the back end's text", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const said = await readSmiles("CCO", async () => Promise.reject(REFUSED), "Sketchkit");
    expect(said).toEqual({ error: "This SMILES could not be drawn. Meno's log, in Settings, General, can be sent with a report.", needs: null });
    expect(warn).toHaveBeenCalledWith("Meno: Sketchkit: SMILES failed: outside.");
  });

  it("... and a plugin's answer for it without asking for it again; a plugin that did not answer, to be tried again", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const refused = await readSmiles("CCO", async () => Promise.reject(new ChemRefusal("Traceback (most recent call last): KeyError 'x'")), "Sketchkit");
    expect(refused?.error).toBe("This SMILES could not be made into a structure.");
    const late = await readSmiles("CCO", async () => Promise.reject(new ChemTimeout("Sketchkit did not answer from_smiles in time")), "Sketchkit");
    expect(late?.error).toBe("Sketchkit did not answer. Try again.");
  });

  it("keeps Meno's own words, where they say why", async () => {
    const said = await readSmiles("C(C", async () => Promise.reject(new Error("This SMILES could not be read: a ( is not closed.")), "Sketchkit");
    expect(said).toEqual({ error: "This SMILES could not be read: a ( is not closed.", needs: null });
  });

  it("offers, for a compound found that no plugin here can draw, the plugin it needs - as for a SMILES typed", () => {
    const missing = new NoPlugin("smiles");
    expect(notDrawnSaid(missing, "compound", "Sketchkit")).toEqual({ error: missing.message, needs: "smiles" });
  });

  it("draws that compound once the plugin offered is added - not looked up again, nor what was typed read as a SMILES", () => {
    const found = { id: "ID 1", smiles: "CCO" };
    const read = vi.fn();
    const draw = vi.fn();
    const letGo = vi.fn();
    offerDone("smiles", found, "abc", false, { read, draw, letGo });
    expect(draw).toHaveBeenCalledWith(found);
    expect(read).not.toHaveBeenCalled();
    // (a SMILES typed, with no compound found: read again, as before)
    offerDone("smiles", null, "CCO", false, { read, draw, letGo });
    expect(read).toHaveBeenCalledWith("CCO");
  });

  it("says a plugin that looks names up and could not be started so, by why", async () => {
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
    await expect(lookUpName(plugin, "abc", steps)).rejects.toThrow("Names Service could not be started: Meno may not reach its files. Meno's log, in Settings, General, can be sent with a report.");
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
