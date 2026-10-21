import { describe, expect, it, vi } from "vitest";

// (the app's one true path, as a file system that takes no notice of case has it - a Mac's as it comes, Windows' - for the files kept on it)
const kept = vi.hoisted(() => ["/Users/Chem/Work/Aspirin.meno", "/Users/Chem/Work/Other.meno"]);
const asked = vi.hoisted(() => [] as string[]);
vi.mock("@tauri-apps/api/core", () => ({
  invoke: async (cmd: string, args: { path: string }) => {
    asked.push(cmd);
    if (cmd !== "true_path_of") throw new Error(`no ${cmd} in tests`);
    const file = kept.find((k) => k.toLowerCase() === args.path.replace(/\/[^/]+\/\.\.\//g, "/").toLowerCase());
    if (!file) throw new Error(`${args.path}: no such file`);
    return file;
  },
}));

const { openEachOnce, setSavedPathOf, tabHolding } = await import("./savers");
const { truePath } = await import("../io/truePath");

describe("the tab that holds a workspace's file", () => {
  it("is the one whose view says it is saved there, else the one opened from there - so that opening it again brings it forward", () => {
    let saved: string | null = "/w/a.meno";
    const away = setSavedPathOf("t1", () => saved);
    const tabs = [{ id: "t1", openedFrom: "/w/old.meno" }, { id: "t2", openedFrom: "/w/b.meno" }, { id: "t3" }];
    // (where it is saved now, not where it was opened from)
    expect(tabHolding("/w/a.meno", tabs)).toBe("t1");
    expect(tabHolding("/w/old.meno", tabs)).toBeUndefined();
    // (a tab whose view is not there yet: where it was opened from)
    expect(tabHolding("/w/b.meno", tabs)).toBe("t2");
    expect(tabHolding("/w/c.meno", tabs)).toBeUndefined();
    // (saved somewhere else, Save As: there)
    saved = "/w/c.meno";
    expect(tabHolding("/w/c.meno", tabs)).toBe("t1");
    // (its view gone: where it was opened from again)
    away();
    expect(tabHolding("/w/old.meno", tabs)).toBe("t1");
  });

  it("is found by the file's one true path, however the path it was opened by was written", async () => {
    const once = await truePath("/users/chem/work/ASPIRIN.MENO");
    const again = await truePath("/Users/Chem/Work/Sub/../aspirin.meno");
    expect(once).toBe("/Users/Chem/Work/Aspirin.meno");
    expect(tabHolding(again, [{ id: "t1", openedFrom: once }])).toBe("t1");
    // (where the app has none to give - no such file, or outside the app - the path as given)
    expect(await truePath("/Users/Chem/gone.meno")).toBe("/Users/Chem/gone.meno");
  });
});

describe("workspace files opened", () => {
  /** A window's tabs, as App opens them: each opened from a path. */
  function window() {
    const tabs: { id: string; openedFrom?: string; name: string }[] = [];
    const brought: string[] = [];
    const run = (found: { name: string; path: string }[]) =>
      openEachOnce(
        found,
        () => tabs,
        (id) => brought.push(id),
        (w) => tabs.push({ id: `t${tabs.length + 1}`, openedFrom: w.path, name: w.name }),
      );
    return { tabs, brought, run };
  }

  it("open one file once, in one tab, however its path was written - opened again, that tab comes forward", async () => {
    const { tabs, brought, run } = window();
    asked.length = 0;
    await run([{ name: "aspirin.meno", path: "/users/chem/work/aspirin.meno" }]);
    await run([{ name: "ASPIRIN.MENO", path: "/USERS/CHEM/WORK/ASPIRIN.MENO" }]);
    // (two ways of writing it in one go, too: picked twice in one Open)
    await run([
      { name: "Aspirin.meno", path: "/Users/Chem/Work/Aspirin.meno" },
      { name: "aspirin.meno", path: "/Users/Chem/Work/Sub/../aspirin.meno" },
    ]);
    expect(tabs).toEqual([{ id: "t1", openedFrom: "/Users/Chem/Work/Aspirin.meno", name: "Aspirin.meno" }]);
    expect(brought).toEqual(["t1", "t1", "t1"]);
    // (each asked of the app)
    expect(asked).toEqual(["true_path_of", "true_path_of", "true_path_of", "true_path_of"]);
  });

  it("open two files in two tabs, and one the app has no true path for as it was given", async () => {
    const { tabs, run } = window();
    await run([
      { name: "aspirin.meno", path: "/users/chem/work/aspirin.meno" },
      { name: "other.meno", path: "/users/chem/work/other.meno" },
      { name: "gone.meno", path: "/Users/Chem/gone.meno" },
    ]);
    expect(tabs.map((t) => t.openedFrom)).toEqual(["/Users/Chem/Work/Aspirin.meno", "/Users/Chem/Work/Other.meno", "/Users/Chem/gone.meno"]);
  });
});
