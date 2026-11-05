import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { askFor, calcShowing, findOutput, givenValue, rememberOutput, useAsks, askKey } from "./asks";
import type { Reader } from "./client";
import type { CalcInfo } from "./output";
import { resultKey } from "./results";

vi.mock("./workers", () => ({ readerClient: () => Promise.reject(new Error("no workers in tests")) }));

// a molecule read from a cube file: its grids a list, each a promise
const calcOf = (source?: CalcInfo["source"], from = "meno"): CalcInfo => ({
  readers: [from],
  source,
  results: [
    {
      id: "grids",
      on: "list",
      group: "Orbitals",
      label: "Orbitals",
      from,
      columns: [{ label: "Grid" }],
      rows: [{ cells: ["Orbital 4"], surface: { ask: "grid:0" } }, { cells: ["Orbital 5"], surface: { ask: "grid:1" } }],
    },
  ],
});
const reader = (answer: (key: string, text: string) => unknown): Reader & { asked: string[] } => {
  const asked: string[] = [];
  return {
    version: "",
    asked,
    read: () => Promise.reject(new Error("not here")),
    ask: async (kind, key, _name, text) => (asked.push(`${kind} ${key}`), answer(key, text)),
    probe: async () => false,
    write: () => Promise.reject(new Error("not here")),
  };
};
// a cube file's start, as one told by its layout
const CUBE = ["density", "of water", "    1    0.0 0.0 0.0", "    2    0.5 0.0 0.0", "    2    0.0 0.5 0.0", "    2    0.0 0.0 0.5", "    8    8.0 0.0 0.0 0.0", ""].join("\n");

describe("a promise", () => {
  it("is asked for of the reader that gave it, the output sent again, and kept once given", async () => {
    const source = await rememberOutput("water.cube", "the cube's text", "cube");
    const calc = calcOf(source);
    const r = reader((key, text) => ({ key, text }));
    const value = await askFor(calc, "meno", "grid:1", async () => r);
    expect(value).toEqual({ key: "grid:1", text: "the cube's text" });
    expect(givenValue(source, "meno", "grid:1")).toEqual(value);
    expect(useAsks.getState().state[askKey(source, "meno", "grid:1")]).toBe("given");
    // (asked for again: not asked of the reader again)
    await askFor(calc, "meno", "grid:1", async () => r);
    expect(r.asked).toEqual(["cube grid:1"]);
  });

  it("is worked out once, however often it is asked for meanwhile", async () => {
    const source = await rememberOutput("twice.cube", "another text", "cube");
    const r = reader((key) => key);
    await Promise.all([askFor(calcOf(source), "meno", "grid:0", async () => r), askFor(calcOf(source), "meno", "grid:0", async () => r)]);
    expect(r.asked).toEqual(["cube grid:0"]);
  });

  it("says to open its output again, where it is not open this session - nor where it was - and that it is missing", async () => {
    const calc = calcOf({ name: "gone.cube", sha256: "0".repeat(64), path: "/data/gone.cube" });
    await expect(askFor(calc, "meno", "grid:0", async () => reader(() => 1), async () => null)).rejects.toThrow("Open gone.cube again to show this.");
    expect(useAsks.getState().state[askKey(calc.source, "meno", "grid:0")]).toEqual({ error: "Open gone.cube again to show this.", missing: true });
  });

  it("is asked for from its output read again where it was, where it is there unchanged", async () => {
    // (kept as a workspace keeps it - its SHA-256, and where it was - and not opened this session)
    const text = "the text it had, never opened this session";
    const kept = { name: "elsewhere.cube", sha256: createHash("sha256").update(text).digest("hex"), kind: "cube", path: "/data/run/elsewhere.cube" };
    const asked: string[] = [];
    const read = async (path: string) => (asked.push(path), path === kept.path ? text : null);
    const r = reader((key, sent) => `${key} of ${sent}`);
    expect(await askFor(calcOf(kept), "meno", "grid:1", async () => r, read)).toBe(`grid:1 of ${text}`);
    expect(asked).toEqual(["/data/run/elsewhere.cube"]);
    // (and kept for the session once read)
    expect(await askFor(calcOf(kept), "meno", "grid:0", async () => r, async () => null)).toBe(`grid:0 of ${text}`);
    // changed since: not taken
    const changed = calcOf({ ...kept, sha256: "1".repeat(64) });
    await expect(askFor(changed, "meno", "grid:0", async () => r, read)).rejects.toThrow("Open elsewhere.cube again");
    // and a path is kept as the output was opened from it
    expect((await rememberOutput("here.cube", "here", "cube", "/data/here.cube")).path).toBe("/data/here.cube");
  });

  it("missing, takes the file the chemist finds only if it is that output, and asks again for what waited on it", async () => {
    const text = "the output found again";
    const { sha256 } = await rememberOutput("x.cube", "something else entirely", "cube");
    const source = { name: "found.cube", sha256: (await rememberOutput("found.cube", text, "cube")).sha256, kind: "cube", path: "/old/found.cube" };
    expect(sha256).not.toBe(source.sha256);
    const waiting = askKey(source, "meno", "grid:0");
    useAsks.setState({ state: { [waiting]: { error: "Open found.cube again to show this.", missing: true } } });
    // another file: not taken, and said
    await expect(findOutput(source, async () => ({ path: "/new/found.cube", text: "another text" }))).rejects.toThrow(/not the found.cube this molecule was read from/);
    expect(useAsks.getState().state[waiting]).toMatchObject({ missing: true, error: expect.stringMatching(/changed since/) });
    // none chosen: nothing taken
    expect(await findOutput(source, async () => null)).toBe(false);
    // the same output: taken, and what waited on it asked for again
    expect(await findOutput(source, async () => ({ path: "/new/found.cube", text }))).toBe(true);
    expect(useAsks.getState().state[waiting]).toBeUndefined();
  });

  it("kept without its kind, as before kinds were kept, is asked for with its kind told again", async () => {
    const source = await rememberOutput("old.cube", CUBE, "cube");
    const { kind: _kind, ...before } = source;
    const r = reader((key) => key);
    await askFor(calcOf(before), "meno", "grid:0", async () => r);
    expect(r.asked).toEqual(["cube grid:0"]);
  });

  it("given and shown, is saved as what it came to; one not shown, or not given, stays a promise", async () => {
    const source = await rememberOutput("saved.cube", "saved text", "cube");
    const calc = calcOf(source);
    await askFor(calc, "meno", "grid:0", async () => reader(() => ({ the: "grid" })));
    const rows = (c: CalcInfo) => (c.results![0] as { rows: { surface?: unknown }[] }).rows.map((r) => r.surface);
    const grids = resultKey({ id: "grids", from: "meno" });
    expect(rows(calcShowing(calc, grids, 0))).toEqual([{ the: "grid" }, { ask: "grid:1" }]);
    expect(rows(calcShowing(calc, grids, 1))).toEqual([{ ask: "grid:0" }, { ask: "grid:1" }]);
    expect(calcShowing(calc, grids, null)).toBe(calc);
  });
});

describe("an orbital of a wavefunction its reader gives whole", () => {
  it("is drawn by Meno: the wavefunction asked for once, the orbitals offered checked, then each orbital drawn", async () => {
    const source = await rememberOutput("job.fchk", "a checkpoint's text", "some-checkpoint");
    // (a reader Meno knows of: one of the plugins it carries, played here by the test)
    const calc = { ...calcOf(source, "pyscf"), readers: ["pyscf 1.0"] };
    const n = (2 * 0.8 / Math.PI) ** 0.75;
    const expansion = {
      nuclei: [0, 0, 0, 0, 0, 1.4],
      centres: [0, 1],
      powers: [[0, 0, 0], [0, 0, 0]],
      exponents: [0.8, 0.8],
      functions: [{ primitives: [0], coefficients: [n] }, { primitives: [1], coefficients: [n] }],
      orbitals: [[1, 0], [0, 1]],
    };
    const r = reader((key) => (key === "expansion" ? { expansion } : null));
    const first = (await askFor(calc, "pyscf", "expansion:0", async () => r, undefined, undefined, [0])) as { signed?: boolean; quantity?: string };
    expect(first).toMatchObject({ signed: true, quantity: "orbital" });
    await askFor(calc, "pyscf", "expansion:1", async () => r, undefined, undefined, [1]);
    // (the whole wavefunction asked for once)
    expect(r.asked).toEqual(["some-checkpoint expansion"]);
  });
});

