import { describe, expect, it } from "vitest";
import type { CatalogueEntry, Offer } from "../../../lib/plugins/catalogue";
import { updatable, updateEach } from "./updateAll";

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
