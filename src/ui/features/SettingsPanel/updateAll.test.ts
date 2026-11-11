import { describe, expect, it } from "vitest";
import type { CatalogueEntry, Offer } from "../../../lib/plugins/catalogue";
import { updatable, updatedSaid, updateEach, updateOne } from "./updateAll";

const entry = (id: string) => ({ id, name: id, version: "2.0.0" }) as CatalogueEntry;
const offers: Offer[] = [
  { entry: entry("a"), offer: "update" },
  { entry: entry("b"), offer: "update" },
  { entry: entry("c"), offer: "update" },
  { entry: entry("d"), offer: "here" },
  { entry: entry("e"), offer: "add" },
  { entry: entry("f"), offer: "not-here", why: "For Windows only" },
];

describe("the plugins Update all updates", () => {
  it("are those here with a newer version online, added or not - not one being added or taken away, nor one that is not here", () => {
    const states = { a: "added", b: "absent", c: "adding", d: "added", e: "absent", f: "absent" };
    expect(updatable(offers, states).map((o) => o.entry.id)).toEqual(["a", "b"]);
    expect(updatable(offers, { a: "removing", b: "waiting" })).toEqual([]);
    expect(updatable([], states)).toEqual([]);
  });
});

describe("updating each in turn", () => {
  it("does one after another, never two at once, in order", async () => {
    const log: string[] = [];
    let running = 0;
    let most = 0;
    const out = await updateEach(["a", "b", "c"], async (x) => {
      running++;
      most = Math.max(most, running);
      log.push(`start ${x}`);
      await Promise.resolve();
      log.push(`end ${x}`);
      running--;
    });
    expect(out).toEqual({ done: 3, failed: 0 });
    expect(most).toBe(1);
    expect(log).toEqual(["start a", "end a", "start b", "end b", "start c", "end c"]);
  });

  it("goes on past one that fails, and counts it", async () => {
    const tried: string[] = [];
    const out = await updateEach(["a", "b", "c"], async (x) => {
      tried.push(x);
      if (x === "b") throw new Error("could not be got");
    });
    expect(tried).toEqual(["a", "b", "c"]);
    expect(out).toEqual({ done: 2, failed: 1 });
  });

  it("is nothing done of nothing", async () => {
    expect(await updateEach([], async () => {})).toEqual({ done: 0, failed: 0 });
  });
});

describe("the line Update all leaves", () => {
  it("says nothing where every one was updated, how many were where some were not", () => {
    expect(updatedSaid({ done: 3, failed: 0 })).toBeNull();
    expect(updatedSaid({ done: 0, failed: 0 })).toBeNull();
    expect(updatedSaid({ done: 2, failed: 1 })).toBe("2 of 3 updated; one did not - its card says why.");
    expect(updatedSaid({ done: 1, failed: 2 })).toBe("1 of 3 updated; 2 did not - its card says why.");
    expect(updatedSaid({ done: 0, failed: 4 })).toBe("0 of 4 updated; 4 did not - its card says why.");
  });
});

describe("updating one plugin", () => {
  const was = { id: "a", v: 1 };
  const now = { id: "a", v: 2 };
  const using = (setUp: string[]) => {
    const calls: string[] = [];
    return {
      calls,
      using: {
        get: async () => void calls.push("get"),
        now: () => now,
        setUp: async (ps: readonly { id: string }[]) => {
          calls.push(`setUp ${ps.map((p) => (p as typeof now).v).join()}`);
          return new Set(setUp);
        },
        add: async (p: { id: string }) => void calls.push(`add ${(p as typeof now).v}`),
      },
    };
  };
  it("gets the newer version, and sets an added plugin up again only where its environment no longer fits", async () => {
    const stale = using([]);
    await updateOne(entry("a"), "added", was, stale.using);
    expect(stale.calls).toEqual(["get", "setUp 2", "add 2"]);
    const fits = using(["a"]);
    await updateOne(entry("a"), "added", was, fits.using);
    expect(fits.calls).toEqual(["get", "setUp 2"]);
  });
  it("only gets one that is not added: nothing is set up", async () => {
    const absent = using([]);
    await updateOne(entry("a"), "absent", was, absent.using);
    expect(absent.calls).toEqual(["get"]);
  });
  it("is the plugin as it was where it is gone from the list after being got", async () => {
    const calls: string[] = [];
    await updateOne(entry("a"), "added", was, {
      get: async () => {},
      now: () => undefined,
      setUp: async (ps) => {
        calls.push(`setUp ${(ps[0] as typeof was).v}`);
        return new Set<string>();
      },
      add: async () => void calls.push("add"),
    });
    expect(calls).toEqual(["setUp 1", "add"]);
  });
});
