import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAppSettings } from "../settings/appSettings";
import { locate, lookFor, lookForAll, useInstalled, whereIs } from "./installed";

vi.mock("./here", () => ({ systemHere: () => "macos" }));

const ORCA = { name: "orca", label: "ORCA", files: { macos: "orca", linux: "orca" }, path: [], env: {} };
const G16W = { name: "g16", label: "Gaussian", files: { windows: "g16.exe" }, path: [], env: {} };

/** Meno's backend, as a test has it: a program is where it was located, if that is it; else where `onPath` says. */
function backend(onPath: Record<string, string> = {}) {
  const asked: unknown[] = [];
  const ask = vi.fn(async (_cmd: string, args?: Record<string, unknown>) => {
    asked.push(args);
    const { name, located } = args as { name: string; located: string | null };
    if (located && located.endsWith(`/${name}`)) return located;
    return onPath[name] ?? null;
  });
  return { ask: ask as never, asked };
}

beforeEach(() => {
  useInstalled.setState({ where: {} });
  const s = useAppSettings.getState();
  useAppSettings.setState({ plugins: { ...s.plugins, programs: {} } });
});

describe("a program installed separately", () => {
  it("is looked for where it was located, else where the system finds programs - and where it is, kept", async () => {
    const { ask, asked } = backend({ orca: "/usr/local/bin/orca" });
    expect(whereIs("orca", "orca")).toBeUndefined();
    expect(await lookFor("orca", "orca", ask)).toBe("/usr/local/bin/orca");
    expect(asked[0]).toEqual({ plugin: "orca", name: "orca", located: null });
    expect(whereIs("orca", "orca")).toBe("/usr/local/bin/orca");
    // located, it is asked for there
    useAppSettings.setState({ plugins: { ...useAppSettings.getState().plugins, programs: { "orca:orca": "/Applications/orca_6/orca" } } });
    expect(await lookFor("orca", "orca", ask)).toBe("/Applications/orca_6/orca");
    // found nowhere: null
    expect(await lookFor("gaussian", "g16", backend().ask)).toBeNull();
    expect(whereIs("gaussian", "g16")).toBeNull();
  });

  it("is looked for only where it is made for the system Meno runs on", async () => {
    const { ask, asked } = backend();
    await lookForAll([{ id: "orca", installed: [ORCA] }, { id: "gaussian", installed: [G16W] }], ask);
    expect(asked).toEqual([{ plugin: "orca", name: "orca", located: null }]);
  });

  it("is located by picking its file - taken only where it is that program, and kept in Settings", async () => {
    const { ask } = backend();
    expect(await locate("orca", ORCA, async () => "/Applications/orca_6/orca", ask)).toBe("/Applications/orca_6/orca");
    expect(useAppSettings.getState().plugins.programs).toEqual({ "orca:orca": "/Applications/orca_6/orca" });
    expect(whereIs("orca", "orca")).toBe("/Applications/orca_6/orca");
    // nothing picked: nothing changes
    expect(await locate("orca", ORCA, async () => null, ask)).toBeNull();
    // another file: refused, saying what it should be
    await expect(locate("orca", ORCA, async () => "/Applications/orca_6/orca_scf", ask)).rejects.toThrow(/not ORCA: its program is the file called orca/);
    expect(useAppSettings.getState().plugins.programs).toEqual({ "orca:orca": "/Applications/orca_6/orca" });
  });
});
