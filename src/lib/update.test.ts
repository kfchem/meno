import { afterEach, describe, expect, it } from "vitest";
import { useNetwork } from "./net/network";
import { EVERY_MS, mayLook, noticeShown, readySaid, UPDATE_CONSENT, UPDATE_PURPOSE, useUpdate, useUpdateDownloads, type UpdateState } from "./update";

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
    expect(UPDATE_CONSENT.detail).toContain("as it starts and once a day while it runs");
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
