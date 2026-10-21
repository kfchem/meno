import { describe, expect, it } from "vitest";
import { APP_GONE, defaultsNote, makeDefaultAgain, rowFor, type FormatDefault } from "./defaultApps";
import { acceptAppSettings } from "./settings/appSettings";

const format = (f: Partial<FormatDefault>): FormatDefault => ({ ext: "sdf", app: null, path: null, meno: false, offered: false, ...f });
const ids = (r: ReturnType<typeof rowFor>) => r.actions.map((a) => a.id);

describe("a format's row on macOS, where Meno chooses", () => {
  it("offers Meno where another app or none opens it, and names that app", () => {
    const r = rowFor("here", format({ app: "Some Viewer", path: "/Applications/Some Viewer.app" }));
    expect(r.opens).toBe("Opens with Some Viewer");
    expect(ids(r)).toEqual(["use"]);
    expect(rowFor("here", format({})).opens).toBe("No app opens it yet");
  });

  it("offers the app it replaced back by name, once Meno opens it - and nothing where none was recorded", () => {
    const meno = format({ app: "Meno", path: "/Applications/Meno.app", meno: true });
    const back = rowFor("here", meno, { name: "Some Viewer", path: "/Applications/Some Viewer.app" });
    expect(back.opens).toBe("Opens with Meno");
    expect(back.actions).toEqual([{ id: "back", label: "Use Some Viewer again" }]);
    expect(rowFor("here", meno).actions).toEqual([]);
  });

  it("shows what opens it now, changed elsewhere, rather than what was recorded", () => {
    // (made Meno's here, then another app chosen in the Finder)
    const r = rowFor("here", format({ app: "Other App", path: "/Applications/Other App.app" }), { name: "Some Viewer", path: "/x" });
    expect(r.opens).toBe("Opens with Other App");
    expect(ids(r)).toEqual(["use"]);
  });
});

describe("a format's row on Windows, where Windows' Settings chooses", () => {
  it("offers Meno for the format alone, and says what Windows does next once it is offered", () => {
    expect(ids(rowFor("system", format({ app: "Another App" })))).toEqual(["offer"]);
    const offered = rowFor("system", format({ app: "Another App", offered: true }));
    expect(ids(offered)).toEqual(["settings", "withdraw"]);
    expect(offered.note).toContain("Windows asks which to use the next time a .sdf file is opened");
  });

  it("can stop offering Meno once it opens it", () => {
    const r = rowFor("system", format({ app: "Meno", meno: true, offered: true }));
    expect(r.opens).toBe("Opens with Meno");
    expect(ids(r)).toEqual(["withdraw"]);
    expect(r.note).toBeUndefined();
  });

  it("says, of the last format Meno is offered for, that stopping takes Meno out and Windows asks next time", () => {
    const last = rowFor("system", format({ app: "Meno", meno: true, offered: true }), undefined, true);
    expect(ids(last)).toEqual(["withdraw"]);
    expect(last.note).toBe("This is the last format Meno is offered for. Stopping takes Meno out of Windows' Default apps, so Windows asks which app to use the next time a .sdf file is opened.");
  });
});

describe("the app a format opened with before, made the default again (macOS)", () => {
  const before = { sdf: { name: "Some Viewer", path: "/Applications/Some Viewer.app" }, pdb: { name: "Other App", path: "/Applications/Other App.app" } };

  it("is made the default by its path, and its record goes", async () => {
    const asked: [string, string | undefined][] = [];
    const got = await makeDefaultAgain("sdf", before, async (ext, app) => void asked.push([ext, app]));
    expect(asked).toEqual([["sdf", "/Applications/Some Viewer.app"]]);
    expect(got).toEqual({ before: { pdb: before.pdb } });
  });

  it("no longer there: its record goes all the same, and it is said - the button does not stay to fail again", async () => {
    const got = await makeDefaultAgain("sdf", before, async () => {
      throw APP_GONE;
    });
    expect(got.before).toEqual({ pdb: before.pdb });
    expect(got.said).toBe("Some Viewer is no longer on this Mac, so .sdf still opens with Meno.");
    // (its row then offers nothing back)
    expect(rowFor("here", format({ app: "Meno", meno: true }), got.before.sdf).actions).toEqual([]);
  });

  it("refused for another reason, keeps its record, to be pressed again", async () => {
    await expect(makeDefaultAgain("sdf", before, async () => Promise.reject(new Error("The system said no.")))).rejects.toThrow("The system said no.");
    // (nothing recorded: nothing asked)
    let called = false;
    expect(await makeDefaultAgain("xyz", before, async () => void (called = true))).toEqual({ before });
    expect(called).toBe(false);
  });
});

describe("what the section says", () => {
  it("says where a default is chosen, for each way", () => {
    expect(defaultsNote({ can: "system", ownPage: true, formats: [] })).toContain("opens Meno's page there");
    expect(defaultsNote({ can: "system", ownPage: false, formats: [] })).toContain("Meno is in the list of apps");
    expect(defaultsNote({ can: "none", ownPage: false, formats: [] })).toContain("macOS 12 or later");
    expect(rowFor("none", format({ app: "X" })).actions).toEqual([]);
  });
});

describe("the apps recorded before Meno, in the settings file", () => {
  it("reads those with a name and an absolute path, and nothing else", () => {
    const s = acceptAppSettings({
      files: {
        read: {},
        also: {},
        before: { sdf: { name: "Some Viewer", path: "/Applications/Some Viewer.app" }, pdb: { name: "", path: "/x" }, mol: { name: "A", path: "relative" }, "../x": { name: "A", path: "/a" } },
      },
    });
    expect(s.files.before).toEqual({ sdf: { name: "Some Viewer", path: "/Applications/Some Viewer.app" } });
    expect(acceptAppSettings({ files: { read: {}, also: {} } }).files.before).toBeUndefined();
  });
});
