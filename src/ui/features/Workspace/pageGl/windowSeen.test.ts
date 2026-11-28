import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const tauri = vi.hoisted(() => ({ inApp: true, answer: null as Promise<boolean> | null, heard: null as ((e: { payload: boolean }) => void) | null }));
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => tauri.inApp, invoke: () => tauri.answer }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: async (_: string, f: (e: { payload: boolean }) => void) => {
    tauri.heard = f;
    return () => {};
  },
}));

/** The page's gate, fresh: none of a word heard before. */
async function fresh() {
  vi.resetModules();
  const tick = await import("./runningTick");
  const seen = await import("./windowSeen");
  return { ...tick, ...seen };
}

describe("the back end's word on the window", () => {
  beforeEach(() => {
    tauri.inApp = true;
    tauri.heard = null;
  });
  afterEach(() => vi.restoreAllMocks());

  it("is asked once as the page starts: a window started minimised is unseen from the first", async () => {
    tauri.answer = Promise.resolve(false);
    const { hearWindowSeen, pageMotion } = await fresh();
    expect(pageMotion.seen()).toBe(true);
    await hearWindowSeen();
    expect(pageMotion.seen()).toBe(false);
    // (and told at each change after)
    tauri.heard!({ payload: true });
    expect(pageMotion.seen()).toBe(true);
    tauri.heard!({ payload: false });
    expect(pageMotion.seen()).toBe(false);
  });

  it("drops the answer to its ask where an event came after it was sent: started minimised and restored meanwhile, it is seen", async () => {
    let answer!: (seen: boolean) => void;
    tauri.answer = new Promise<boolean>((r) => (answer = r));
    const { hearWindowSeen, pageMotion } = await fresh();
    const heard = hearWindowSeen();
    // (the ask on its way, the listener on: the window restored - the event first, the late answer, unseen, after it)
    await vi.waitFor(() => expect(tauri.heard).not.toBeNull());
    tauri.heard!({ payload: true });
    answer(false);
    await heard;
    expect(pageMotion.seen()).toBe(true);
  });

  it("missing - asking fails, or outside the app - leaves the window taken as seen", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    tauri.answer = Promise.reject(new Error("no such command"));
    const a = await fresh();
    await a.hearWindowSeen();
    expect(a.pageMotion.seen()).toBe(true);
    tauri.inApp = false;
    tauri.heard = null;
    const b = await fresh();
    await b.hearWindowSeen();
    expect(b.pageMotion.seen()).toBe(true);
    expect(tauri.heard).toBeNull();
  });

  it("is heard by the names the back end says it by", async () => {
    const { WINDOW_SEEN_COMMAND, WINDOW_SEEN_EVENT } = await fresh();
    const rust = readFileSync(new URL("../../../../../src-tauri/src/windowseen.rs", import.meta.url), "utf8");
    expect(rust).toContain(`const EVENT: &str = "${WINDOW_SEEN_EVENT}";`);
    expect(rust).toContain(`pub fn ${WINDOW_SEEN_COMMAND}(`);
    expect(readFileSync(new URL("../../../../../src-tauri/src/lib.rs", import.meta.url), "utf8")).toContain(`windowseen::${WINDOW_SEEN_COMMAND},`);
  });
});
