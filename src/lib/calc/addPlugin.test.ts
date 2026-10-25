import { beforeEach, describe, expect, it, vi } from "vitest";

// Plugins added one after another: each set-up held until the test ends it, done or failed.
const asked: string[] = [];
const ends = new Map<string, { done: () => void; fail: (why: string) => void }>();
vi.mock("../plugins/process", () => ({ stopWorker: async () => undefined, workerOf: async () => ({}) }));
vi.mock("../pyEnv", () => ({
  ensurePyEnv: (profile: string) =>
    new Promise<string>((resolve, reject) => {
      asked.push(profile);
      ends.set(profile, { done: () => resolve(""), fail: (why) => reject(new Error(why)) });
    }),
  pyEnvReady: async () => false,
  removePyEnv: async () => undefined,
}));

const { addPlugin, addedReaders, settingUp, skipSetUp, useReaders } = await import("./workers");
const { PLUGINS } = await import("./catalog");

/** Lets what is due run: a set-up's end, and the next one's start. */
const settle = () => new Promise((r) => setTimeout(r, 0));
const [a, b, c] = ["crem", "molnextr", "molscribe"].map((id) => PLUGINS.find((p) => p.id === id)!);
const states = () => [a, b, c].map((p) => useReaders.getState().state[p.id]);

describe("plugins added one after another", () => {
  beforeEach(() => {
    asked.length = 0;
    ends.clear();
    useReaders.setState({ state: {}, problem: {} });
  });

  it("sets them up one at a time, in the order asked, the others waiting for it", async () => {
    const added = [a, b, c].map((p) => addPlugin(p));
    await settle();
    expect(asked).toEqual([a.profile]);
    expect(states()).toEqual(["adding", "waiting", "waiting"]);
    expect(settingUp()).toBe(a.id);
    ends.get(a.profile)!.done();
    await settle();
    expect(asked).toEqual([a.profile, b.profile]);
    expect(states()).toEqual(["added", "adding", "waiting"]);
    ends.get(b.profile)!.done();
    await settle();
    ends.get(c.profile)!.done();
    await Promise.all(added);
    expect(states()).toEqual(["added", "added", "added"]);
    expect(settingUp()).toBeUndefined();
  });

  it("goes on to the next where one fails - and says on it why it was not added, not taken away by looking again", async () => {
    const added = [a, b, c].map((p) => addPlugin(p).catch(() => "failed"));
    await settle();
    ends.get(a.profile)!.done();
    await settle();
    ends.get(b.profile)!.fail("uv pip install failed: Access is denied. (os error 5)");
    await settle();
    expect(asked).toEqual([a.profile, b.profile, c.profile]);
    ends.get(c.profile)!.done();
    expect(await Promise.all(added)).toEqual([undefined, "failed", undefined]);
    expect(states()).toEqual(["added", "absent", "added"]);
    const said = `${b.name} was not added: uv pip install failed: Access is denied. (os error 5)`;
    expect(useReaders.getState().problem[b.id]).toBe(said);
    // (Plugins shown again, a file read: the plugins looked at afresh - what went wrong still said)
    await addedReaders([a, b, c]);
    expect(useReaders.getState().problem[b.id]).toBe(said);
    expect(useReaders.getState().state[b.id]).toBe("absent");
    // (asked for again: said no more while it waits and is set up)
    const again = addPlugin(b);
    expect(useReaders.getState().problem[b.id]).toBeUndefined();
    await settle();
    ends.get(b.profile)!.done();
    await again;
    expect(useReaders.getState().state[b.id]).toBe("added");
  });

  it("sets one up once, asked again while it waits or is set up", async () => {
    const first = addPlugin(a);
    const second = addPlugin(a);
    await settle();
    expect(asked).toEqual([a.profile]);
    ends.get(a.profile)!.done();
    await Promise.all([first, second]);
    expect(asked).toEqual([a.profile]);
  });

  it("takes one waiting out of the line where it is skipped, saying so - the rest go on, and it can be asked for again", async () => {
    const added = [a, b, c].map((p) => addPlugin(p).catch((e: Error) => e.message));
    await settle();
    skipSetUp(b);
    skipSetUp(a); // (one being set up is not skipped)
    expect(states()).toEqual(["adding", "absent", "waiting"]);
    expect(useReaders.getState().problem[b.id]).toBe(`${b.name} was not added: skipped while it waited for ${a.name}'s set-up.`);
    // (asked for again before its turn came, and skipped again: still one turn, passed over)
    void addPlugin(b).catch(() => undefined);
    skipSetUp(b);
    ends.get(a.profile)!.done();
    await settle();
    // (its turn passed over: the next set up)
    expect(asked).toEqual([a.profile, c.profile]);
    ends.get(c.profile)!.done();
    expect(await Promise.all(added)).toEqual([undefined, `${b.name}'s set-up was skipped.`, undefined]);
    expect(states()).toEqual(["added", "absent", "added"]);
    const again = addPlugin(b);
    await settle();
    expect(asked).toEqual([a.profile, c.profile, b.profile]);
    ends.get(b.profile)!.done();
    await again;
    expect(useReaders.getState().state[b.id]).toBe("added");
  });

  it("ends one skipped at once - asked for again, it waits anew - while the set-up before it still holds the line", async () => {
    const first = addPlugin(a).catch(() => "failed");
    const skipped = addPlugin(b).catch((e: Error) => e.message);
    await settle();
    skipSetUp(b);
    // (ended now, not when a's set-up ends: what pressed Add may take it again)
    expect(await skipped).toBe(`${b.name}'s set-up was skipped.`);
    expect(asked).toEqual([a.profile]);
    const again = addPlugin(b);
    expect(useReaders.getState().state[b.id]).toBe("waiting");
    ends.get(a.profile)!.done();
    await settle();
    expect(asked).toEqual([a.profile, b.profile]);
    ends.get(b.profile)!.done();
    await Promise.all([first, again]);
    expect(states().slice(0, 2)).toEqual(["added", "added"]);
  });
});
