import { afterEach, describe, expect, it, vi } from "vitest";
import { useNetwork } from "./net/network";
import { EVERY_MS, lookDue, looksDaily, mayLook, noticeShown, readySaid, UPDATE_CONSENT, UPDATE_PURPOSE, useUpdate, useUpdateDownloads, type UpdateState } from "./update";

describe("keeping Meno up to date", () => {
  afterEach(() => {
    useNetwork.setState({ offline: false, granted: [], tasks: {} });
    useUpdate.setState(null, true);
    useUpdateDownloads.setState({ tasks: [] });
  });

  it("looks only when it is allowed to and Meno is online", () => {
    useNetwork.setState({ offline: false, granted: [] });
    expect(mayLook()).toBe(false);
    useNetwork.setState({ offline: false, granted: [UPDATE_PURPOSE] });
    expect(mayLook()).toBe(true);
    // offline mode wins over the leave given
    useNetwork.setState({ offline: true, granted: [UPDATE_PURPOSE] });
    expect(mayLook()).toBe(false);
  });

  it("looks once a day while Meno runs, and says so where the user is asked", () => {
    expect(EVERY_MS).toBe(24 * 60 * 60 * 1000);
    expect(UPDATE_CONSENT.detail).toContain("shortly after it starts and once a day while it runs");
  });

  it("goes by a purpose Meno's settings keep", () => {
    // (a purpose the settings file would drop is one never asked for again)
    expect(UPDATE_PURPOSE).toMatch(/^[a-z0-9:-]{1,64}$/);
  });

  it("says an update ready waits for the jobs installing it would stop", () => {
    expect(readySaid({ version: "0.1.12", held: 0 })).toBe("Meno 0.1.12 is ready. It goes in when you quit Meno.");
    expect(readySaid({ version: "0.1.12", held: 1 })).toBe(
      "Meno 0.1.12 is ready. It goes in when you quit Meno with no jobs waiting or running: installing it now would stop the job waiting or running.",
    );
    expect(readySaid({ version: "0.1.12", held: 3 })).toMatch(/would stop the 3 jobs waiting or running\.$/);
  });

  it("hides only a look's notice where the user turned it off - the look that finds a newer Meno shows its notice from the download's start; every other task's always shows", () => {
    const look = { id: "app-update-1", purpose: UPDATE_PURPOSE, label: "Keeping Meno up to date", started: 1 };
    const fetch = { id: "env-1", purpose: "plugin-env", label: "Setting up cclib", started: 1 };
    useNetwork.setState({ tasks: { [look.id]: look, [fetch.id]: fetch } });
    const phase = (p: UpdateState["phase"]) => useUpdate.setState({ current: "0.1.16", phase: p, version: p === "checking" ? null : "0.1.17", notes: null, checked: null, error: null, held: 0 }, true);
    // (looking: hidden where turned off, shown where not; the other task shown either way)
    phase("checking");
    expect(noticeShown(look, true)).toBe(true);
    expect(noticeShown(look, false)).toBe(false);
    expect(noticeShown(fetch, false)).toBe(true);
    // (a newer Meno found: the same task now downloads it - shown from its first byte, and after, done)
    phase("downloading");
    expect(noticeShown(look, false)).toBe(true);
    useNetwork.setState({ tasks: { [look.id]: { ...look, ended: 2, outcome: "done" } } });
    phase("ready");
    expect(noticeShown({ ...look, ended: 2 }, false)).toBe(true);
    // (a later look that finds nothing newer: hidden)
    const later = { id: "app-update-2", purpose: UPDATE_PURPOSE, label: "Keeping Meno up to date", started: 3 };
    useNetwork.setState({ tasks: { [later.id]: later } });
    phase("checking");
    phase("current");
    expect(noticeShown({ ...later, ended: 4 }, false)).toBe(false);
  });
});

describe("looking once a day, by the wall clock", () => {
  const DAY = EVERY_MS;
  const T0 = Date.UTC(2026, 9, 29, 9);
  const at = (checked: number | null, phase: UpdateState["phase"] = "current"): UpdateState => ({
    current: "0.1.20",
    phase,
    version: null,
    notes: null,
    checked,
    error: null,
    held: 0,
  });
  /** A window and its page, as far as the daily looks hear them. */
  const page = () => Object.assign(new EventTarget(), { visibilityState: "visible" as DocumentVisibilityState });

  afterEach(() => {
    vi.useRealTimers();
    useNetwork.setState({ offline: false, granted: [], tasks: {} });
    useUpdate.setState(null, true);
  });

  it("is due a day after GitHub was last asked - or never asked - and not while one is under way, with an update ready, nor where it may not", () => {
    expect(lookDue(at(T0), T0 + DAY - 1, true)).toBe(false);
    expect(lookDue(at(T0), T0 + DAY, true)).toBe(true);
    expect(lookDue(at(null, "idle"), T0, true)).toBe(true);
    expect(lookDue(at(T0), T0 + 3 * DAY, false)).toBe(false);
    for (const phase of ["checking", "downloading", "unavailable"] as const) expect(lookDue(at(null, phase), T0 + DAY, true)).toBe(false);
    // (an update ready: a look would only say so again - Meno asks GitHub no more until it is installed)
    expect(lookDue(at(T0, "ready"), T0 + 3 * DAY, true)).toBe(false);
    expect(lookDue(at(T0, "failed"), T0 + DAY, true)).toBe(true);
    expect(lookDue(null, T0, true)).toBe(false);
  });

  it("looks as a Mac wakes after a day, though no timer of the web view's has fired - and not before a day", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    vi.setSystemTime(T0);
    useNetwork.setState({ offline: false, granted: [UPDATE_PURPOSE] });
    useUpdate.setState(at(T0), true);
    const win = new EventTarget();
    const doc = page();
    let looks = 0;
    const stop = looksDaily(win, doc, async () => void looks++);
    // (asleep: the wall clock goes on, the web view's timers do not)
    vi.setSystemTime(T0 + DAY - 60_000);
    win.dispatchEvent(new Event("focus"));
    doc.dispatchEvent(new Event("visibilitychange"));
    expect(looks).toBe(0);
    vi.setSystemTime(T0 + DAY + 60_000);
    win.dispatchEvent(new Event("focus"));
    await Promise.resolve();
    expect(looks).toBe(1);
    stop();
  });

  it("looks on a page shown again, not on one hidden; and, awake, at the tick after a day", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    vi.setSystemTime(T0);
    useNetwork.setState({ offline: false, granted: [UPDATE_PURPOSE] });
    useUpdate.setState(at(T0), true);
    const win = new EventTarget();
    const doc = page();
    let looks = 0;
    const stop = looksDaily(win, doc, async () => {
      looks++;
      useUpdate.setState(at(Date.now()), true);
    });
    vi.setSystemTime(T0 + DAY);
    doc.visibilityState = "hidden";
    doc.dispatchEvent(new Event("visibilitychange"));
    expect(looks).toBe(0);
    doc.visibilityState = "visible";
    doc.dispatchEvent(new Event("visibilitychange"));
    expect(looks).toBe(1);
    // (awake all the next day: the 10-minute tick finds it due, once)
    await vi.advanceTimersByTimeAsync(DAY + 10 * 60_000);
    expect(looks).toBe(2);
    stop();
  });

  it("looks not at all offline, then once allowed again at the next tick - a look missed while offline", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    vi.setSystemTime(T0);
    useNetwork.setState({ offline: true, granted: [UPDATE_PURPOSE] });
    useUpdate.setState(at(null, "idle"), true);
    let looks = 0;
    const stop = looksDaily(new EventTarget(), page(), async () => void looks++);
    await vi.advanceTimersByTimeAsync(3 * 10 * 60_000);
    expect(looks).toBe(0);
    useNetwork.setState({ offline: false, granted: [UPDATE_PURPOSE] });
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(looks).toBe(1);
    stop();
  });

  it("looks once at a time, and hears nothing once stopped", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    vi.setSystemTime(T0 + DAY);
    useNetwork.setState({ offline: false, granted: [UPDATE_PURPOSE] });
    useUpdate.setState(at(T0), true);
    const win = new EventTarget();
    let looks = 0;
    let done = () => {};
    const stop = looksDaily(win, page(), () => {
      looks++;
      return new Promise<void>((r) => (done = r));
    });
    win.dispatchEvent(new Event("focus"));
    win.dispatchEvent(new Event("focus"));
    expect(looks).toBe(1);
    done();
    stop();
    await Promise.resolve();
    win.dispatchEvent(new Event("focus"));
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(looks).toBe(1);
  });
});
