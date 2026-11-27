import { describe, expect, it } from "vitest";
import { onItsWay, waitedFor, whileOnItsWay } from "./onItsWay";

describe("what is on its way to a page", () => {
  it("keeps the page it goes to waiting until all of it has arrived - each said arrived once, however often", () => {
    const one = onItsWay("tab-a");
    const two = onItsWay("tab-a");
    expect(waitedFor("tab-a")).toBe(true);
    expect(waitedFor("tab-b")).toBe(false);
    one();
    one();
    expect(waitedFor("tab-a")).toBe(true);
    two();
    expect(waitedFor("tab-a")).toBe(false);
  });

  it("where it is not yet known which page it goes to, keeps every page waiting", () => {
    const arrived = onItsWay(null);
    expect(waitedFor("tab-a")).toBe(true);
    expect(waitedFor("tab-b")).toBe(true);
    arrived();
    expect(waitedFor("tab-a")).toBe(false);
  });

  it("is on its way while the work bringing it goes on, and arrived when it is done or has failed", async () => {
    let finish!: () => void;
    const going = whileOnItsWay("tab-c", () => new Promise<void>((done) => (finish = done)));
    expect(waitedFor("tab-c")).toBe(true);
    finish();
    await going;
    expect(waitedFor("tab-c")).toBe(false);
    await expect(whileOnItsWay("tab-c", async () => Promise.reject(new Error("unreadable")))).rejects.toThrow();
    expect(waitedFor("tab-c")).toBe(false);
  });
});
