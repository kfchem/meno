import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CarriesBackEnd, failureKind, failureSaid, kindSaid, loggedOf, setUpFailed } from "./failureSaid";
import { ChemError, ChemRefusal, ChemTimeout } from "../roles/client";
import { logText } from "../log";

/** A file of the back end's source, as it is in this tree. */
const rust = (file: string) => readFileSync(new URL(`../../../src-tauri/src/${file}`, import.meta.url), "utf8");

describe("a failure from beneath Meno, recognised by the back end's own words", () => {
  // (each sentence quoted from the Rust source, and held to it: a change there fails here, to be met in failureKind)
  const quoted: [file: string, source: string, said: string, kind: string][] = [
    ["net.rs", 'format!("{label}: Meno is offline")', "Setting up X: Meno is offline", "offline"],
    ["net.rs", 'format!("{label}: not allowed to use the network")', "Setting up X: not allowed to use the network", "not-allowed"],
    ["lib.rs", '"the Python environment is not set up"', "the Python environment is not set up", "not-whole"],
    ["lib.rs", '"no worker directory"', "no worker directory", "not-whole"],
    ["lib.rs", "\"sidecar entry must be inside the app's Python environments\"", "sidecar entry must be inside the app's Python environments", "outside"],
    ["lib.rs", '"sidecar script must be one of the bundled workers"', "sidecar script must be one of the bundled workers", "outside"],
  ];
  it.each(quoted)("%s: %s", (file, source, said, kind) => {
    expect(rust(file)).toContain(source);
    expect(failureKind(said)).toBe(kind);
  });

  it("knows the webview's file scope's refusal (its words: \"forbidden path: {0}\", in the plugin that keeps that scope)", () => {
    expect(failureKind("forbidden path: /home/someone/data/uv/plugin-x/venv/bin/python")).toBe("outside");
  });

  it("knows a worker's answers by what they are, not by their words", () => {
    expect(failureKind(new ChemTimeout("X did not answer from_smiles in time"))).toBe("timed-out");
    expect(failureKind(new ChemRefusal("Explicit valence for atom # 1 N, 4, is greater than permitted"))).toBe("answer");
    expect(failureKind(new ChemError("X stopped"))).toBe("stopped");
    expect(failureKind(new ChemError("X stopped as it started: ModuleNotFoundError: No module named 'x'"))).toBe("not-whole");
  });

  it("never shows the engine's own error, nor text Meno's error carries from beneath it", () => {
    expect(failureKind(new TypeError("Cannot read properties of undefined (reading 'x')"))).toBe("engine");
    expect(failureKind(new CarriesBackEnd("x.bin: Permission denied (os error 13) - it could not be read"))).toBe("unknown");
    expect(failureKind("something else altogether")).toBe("unknown");
  });

  it("keeps Meno's own words", () => {
    expect(failureKind(new Error("X was taken away: add it in Settings, Plugins."))).toBeNull();
  });
});

describe("what the screen says, by the kind", () => {
  afterEach(() => vi.restoreAllMocks());

  it("says try again only where trying again can help", () => {
    for (const where of ["set-up", "start", "SMILES", "compound", "look-up"] as const) {
      for (const kind of ["timed-out", "stopped"] as const) expect(kindSaid(where, kind, "X")).toMatch(/Try again\.$/);
      for (const kind of ["outside", "not-whole", "answer", "engine", "unknown", "offline", "not-allowed"] as const) expect(kindSaid(where, kind, "X")).not.toMatch(/Try again/);
    }
  });

  it("says to remove and add a plugin only where that makes its set-up anew: one not whole", () => {
    expect(kindSaid("start", "not-whole", "X")).toBe("X could not be started: its set-up is not whole. Remove it and add it again in Settings, Plugins.");
    expect(kindSaid("start", "outside", "X")).toBe("X could not be started: Meno may not reach its files. Meno's log, in Settings, General, can be sent with a report.");
  });

  it("says a refusal of the network in Meno's own words for it", () => {
    expect(kindSaid("start", "offline", "X")).toBe("X needs the network; Meno is offline.");
    expect(kindSaid("look-up", "not-allowed", "X")).toBe("X needs the network, and was not allowed it.");
  });

  it("says a plugin's answer for this input without asking for it again", () => {
    expect(kindSaid("SMILES", "answer", "X")).toBe("This SMILES could not be made into a structure.");
    expect(kindSaid("compound", "answer", "X")).toBe("This compound could not be made into a structure.");
  });

  it("tells Meno's log which plugin, where and what kind - and nothing of what came with it", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    failureSaid("forbidden path: /home/someone/data/uv/plugin-x/venv/bin/python", "start", "Sketchkit");
    expect(warn).toHaveBeenCalledWith("Meno: Sketchkit: start failed: outside.");
    // (as the log keeps it: the line whole - it is one of Meno's own)
    expect(logText([loggedOf("start", "outside", "Sketchkit")])).toBe("Meno: Sketchkit: start failed: outside.");
  });

  it("keeps Meno's own words for a set-up, after the plugin's name", () => {
    const own = new Error("Setting up X needs the network, and was not allowed it (Meno is offline, or the download was declined).");
    expect(setUpFailed("X", own)).toBe(`X was not added: ${own.message}`);
  });
});
