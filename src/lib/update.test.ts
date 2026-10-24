import { afterEach, describe, expect, it } from "vitest";
import { useNetwork } from "./net/network";
import { mayLook, noticeShown, readySaid, UPDATE_PURPOSE } from "./update";

describe("keeping Meno up to date", () => {
  afterEach(() => useNetwork.setState({ offline: false, granted: [] }));

  it("looks only when it is allowed to and Meno is online", () => {
    useNetwork.setState({ offline: false, granted: [] });
    expect(mayLook()).toBe(false);
    useNetwork.setState({ offline: false, granted: [UPDATE_PURPOSE] });
    expect(mayLook()).toBe(true);
    // offline mode wins over the leave given
    useNetwork.setState({ offline: true, granted: [UPDATE_PURPOSE] });
    expect(mayLook()).toBe(false);
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

  it("shows each look's notice unless the user turned it off - the one notice that can be; every other task's always shows", () => {
    expect(noticeShown(UPDATE_PURPOSE, true)).toBe(true);
    expect(noticeShown(UPDATE_PURPOSE, false)).toBe(false);
    // (a download, a plugin's set-up, anything else: shown either way)
    for (const purpose of ["plugin-env", "ccd", "python-code", "web-view"]) {
      expect(noticeShown(purpose, false)).toBe(true);
      expect(noticeShown(purpose, true)).toBe(true);
    }
  });
});
