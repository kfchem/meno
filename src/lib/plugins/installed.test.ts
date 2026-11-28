import { beforeEach, describe, expect, it, vi } from "vitest";
import { create } from "zustand";
import { useAppSettings } from "../settings/appSettings";
import { locate, lookAgainOnceDone, lookFor, lookForAll, tooOld, useInstalled, whereIs } from "./installed";

vi.mock("./here", () => ({ systemHere: () => "macos" }));

const QUANTA = { name: "quanta", label: "Quanta", files: { macos: "quanta", linux: "quanta" }, path: [], env: {}, places: {} };
const ORBITRONW = { name: "orbitron", label: "Orbitron", files: { windows: "orbitron.exe" }, path: [], env: {}, places: {} };
const LUMEN = { name: "lumen", label: "Lumen", files: { macos: "Lumen" }, path: [], env: {}, places: {} };

/** Meno's backend, as a test has it: a program is where it was located, if that is it; else where `onPath` says. */
function backend(onPath: Record<string, string> = {}) {
  const asked: unknown[] = [];
  const ask = vi.fn(async (_cmd: string, args?: Record<string, unknown>) => {
    asked.push(args);
    const { name, located } = args as { name: string; located: string | null };
    if (located && located.endsWith(`/${name}`)) return { path: located };
    return onPath[name] ? { path: onPath[name] } : null;
  });
  return { ask: ask as never, asked };
}

beforeEach(() => {
  useInstalled.setState({ where: {}, chosen: {} });
  const s = useAppSettings.getState();
  useAppSettings.setState({ plugins: { ...s.plugins, programs: {} } });
});

describe("a program installed separately", () => {
  it("is looked for where it was located, else where the system finds programs - and where it is, kept", async () => {
    const { ask, asked } = backend({ quanta: "/usr/local/bin/quanta" });
    expect(whereIs("quanta", "quanta")).toBeUndefined();
    expect(await lookFor("quanta", "quanta", ask)).toBe("/usr/local/bin/quanta");
    expect(asked[0]).toEqual({ plugin: "quanta", name: "quanta", located: null });
    expect(whereIs("quanta", "quanta")).toBe("/usr/local/bin/quanta");
    // located, it is asked for there
    useAppSettings.setState({ plugins: { ...useAppSettings.getState().plugins, programs: { "quanta:quanta": "/Applications/quanta_6/quanta" } } });
    expect(await lookFor("quanta", "quanta", ask)).toBe("/Applications/quanta_6/quanta");
    // found nowhere: null
    expect(await lookFor("orbitron", "orbitron", backend().ask)).toBeNull();
    expect(whereIs("orbitron", "orbitron")).toBeNull();
  });

  it("is looked for only where it is made for the system Meno runs on", async () => {
    const { ask, asked } = backend();
    await lookForAll([{ id: "quanta", installed: [QUANTA] }, { id: "orbitron", installed: [ORBITRONW] }], ask);
    expect(asked).toEqual([{ plugin: "quanta", name: "quanta", located: null }]);
  });

  it("is located by picking its file - taken only where it is that program, and kept in Settings", async () => {
    const { ask } = backend();
    expect(await locate("quanta", QUANTA, async () => "/Applications/quanta_6/quanta", ask)).toBe("/Applications/quanta_6/quanta");
    expect(useAppSettings.getState().plugins.programs).toEqual({ "quanta:quanta": "/Applications/quanta_6/quanta" });
    expect(whereIs("quanta", "quanta")).toBe("/Applications/quanta_6/quanta");
    // nothing picked: nothing changes
    expect(await locate("quanta", QUANTA, async () => null, ask)).toBeNull();
    // another file: refused, saying what it should be
    await expect(locate("quanta", QUANTA, async () => "/Applications/quanta_6/quanta_scf", ask)).rejects.toThrow(/not Quanta: its program is the file called quanta/);
    expect(useAppSettings.getState().plugins.programs).toEqual({ "quanta:quanta": "/Applications/quanta_6/quanta" });
  });

  it("keeps where it was located, whatever a look begun before answers after", async () => {
    // (the window coming back as the file dialog closes: a look begun with nothing located yet, answering late)
    let late: (v: unknown) => void = () => {};
    const slow = ((_cmd: string, a?: Record<string, unknown>) => (a?.located ? Promise.resolve({ path: a.located }) : new Promise((go) => (late = go)))) as never;
    const looking = lookFor("quanta", "quanta", slow);
    expect(await locate("quanta", QUANTA, async () => "/Applications/quanta_6/quanta", slow)).toBe("/Applications/quanta_6/quanta");
    late(null);
    await looking;
    expect(whereIs("quanta", "quanta")).toBe("/Applications/quanta_6/quanta");
  });

  it("is located on macOS by picking the app that holds it: the program inside it kept", async () => {
    const inside = "/Applications/Lumen.app/Contents/MacOS/Lumen";
    const asked: unknown[] = [];
    const ask = (async (_cmd: string, a?: Record<string, unknown>) => (asked.push(a), a?.located === "/Applications/Lumen.app" ? { path: inside, version: "5.2.2" } : null)) as never;
    expect(await locate("lumen", LUMEN, async () => "/Applications/Lumen.app", ask)).toBe(inside);
    expect(useAppSettings.getState().plugins.programs["lumen:lumen"]).toBe(inside);
    // (what was picked alone is asked for - never another copy found elsewhere - and its version kept)
    expect(asked).toEqual([{ plugin: "lumen", name: "lumen", located: "/Applications/Lumen.app", exact: true }]);
    expect(useInstalled.getState().chosen["lumen:lumen"]).toEqual({ path: inside, version: "5.2.2" });
    // (an app that holds something else is not it)
    const elsewhere = (async () => ({ path: "/Applications/Other.app/x/Lumen" })) as never;
    await expect(locate("lumen", LUMEN, async () => "/Applications/Lumen.app", elsewhere)).rejects.toThrow(/not Lumen/);
  });

  it("where its plugin says how to ask, is of a version Meno takes: an older one said, and not run", async () => {
    const why = "Meno needs Lumen 5.0 or later; this one is 4.1.1";
    const old = "/Applications/Lumen 4.1.app/Contents/MacOS/Lumen";
    const ask = (async () => ({ path: old, version: "4.1.1", why })) as never;
    // looked for: none to run, and why
    expect(await lookFor("lumen", "lumen", ask)).toBeNull();
    expect(whereIs("lumen", "lumen")).toBeNull();
    expect(tooOld("lumen", "lumen")).toBe(why);
    // located: refused, saying why, and not kept
    await expect(locate("lumen", LUMEN, async () => "/Applications/Lumen 4.1.app", ask)).rejects.toThrow(`${why}.`);
    expect(useAppSettings.getState().plugins.programs["lumen:lumen"]).toBeUndefined();
    // a newer one found later: run, and nothing said against it
    const now = (async () => ({ path: "/Applications/Lumen.app/Contents/MacOS/Lumen", version: "5.2.2" })) as never;
    expect(await lookFor("lumen", "lumen", now)).toBe("/Applications/Lumen.app/Contents/MacOS/Lumen");
    expect(tooOld("lumen", "lumen")).toBeUndefined();
  });
});

describe("a program installed separately, looked for again", () => {
  /** A plugin's state, as Settings' store holds it, and what was looked for. */
  function watched() {
    const readers = create<{ state: Record<string, string> }>(() => ({ state: { quantum: "absent", other: "added" } }));
    let changedListener: () => void = () => {};
    const changed = (l: () => void) => ((changedListener = l), () => (changedListener = () => {}));
    const plugins = [
      { id: "quantum", installed: [QUANTA] },
      { id: "other", installed: [LUMEN] },
    ];
    const looked: string[][] = [];
    const stop = lookAgainOnceDone(readers, changed, () => plugins, async (ps) => void looked.push(ps.map((p) => p.id)));
    const to = (id: string, state: string) => readers.setState((s) => ({ state: { ...s.state, [id]: state } }));
    return { to, looked, stop, changedNow: () => changedListener() };
  }

  it("once a plugin's Add has finished - not while it waits or is being added - for that plugin's programs alone", () => {
    const w = watched();
    w.to("quantum", "waiting");
    w.to("quantum", "adding");
    expect(w.looked).toEqual([]);
    w.to("quantum", "added");
    expect(w.looked).toEqual([["quantum"]]);
    // (one that failed to be added comes to rest too: what is there is said all the same)
    w.to("quantum", "adding");
    w.to("quantum", "absent");
    expect(w.looked).toEqual([["quantum"], ["quantum"]]);
    w.stop();
  });

  it("once a Remove has finished, and as the plugins in place change - an update, one got - for every plugin", () => {
    const w = watched();
    w.to("other", "removing");
    w.to("other", "absent");
    expect(w.looked).toEqual([["other"]]);
    w.changedNow();
    expect(w.looked).toEqual([["other"], ["quantum", "other"]]);
    // (stopped as the page is left: nothing more)
    w.stop();
    w.to("quantum", "adding");
    w.to("quantum", "added");
    w.changedNow();
    expect(w.looked).toHaveLength(2);
  });
});
