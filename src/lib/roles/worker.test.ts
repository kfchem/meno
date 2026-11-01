import { afterEach, describe, expect, it } from "vitest";
import { rolePlugin, roleUndecided } from "./worker";
import { useReaders } from "../calc/workers";
import { useAppSettings } from "../settings/appSettings";

const roles = (r: Record<string, string>) => useAppSettings.setState((s) => ({ plugins: { ...s.plugins, roles: r } }));
const takenAway = (ids: string[]) => useAppSettings.setState((s) => ({ plugins: { ...s.plugins, removed: ids } }));

describe("the plugin that fills a role", () => {
  afterEach(() => {
    roles({});
    takenAway([]);
    useReaders.setState({ state: {} });
  });

  it("is the one chosen; else the one added that fills it - the one the chemist added; else, of several, none: the chemist chooses, never the first by its name", () => {
    // (two read pictures, none added and none chosen: none - both to choose among)
    expect(rolePlugin("pictures")).toBeUndefined();
    expect(roleUndecided("pictures").map((p) => p.id)).toEqual(["molnextr", "molscribe"]);
    useReaders.setState({ state: { molnextr: "added", molscribe: "added" } });
    expect(rolePlugin("pictures")).toBeUndefined();
    useReaders.setState({ state: { molnextr: "absent", molscribe: "added" } });
    expect(roleUndecided("pictures")).toEqual([]);
    expect(rolePlugin("pictures")?.id).toBe("molscribe");
    roles({ pictures: "molnextr" });
    expect(rolePlugin("pictures")?.id).toBe("molnextr");
    // (a choice no plugin fills is no choice)
    roles({ pictures: "rdkit" });
    expect(rolePlugin("pictures")?.id).toBe("molscribe");
  });

  it("gives way, where the one chosen was taken away, to another added that fills the role - or, with none, stays the one chosen", () => {
    roles({ pictures: "molnextr" });
    takenAway(["molnextr"]);
    useReaders.setState({ state: { molnextr: "absent", molscribe: "added" } });
    expect(rolePlugin("pictures")?.id).toBe("molscribe");
    // (none other added: the one chosen, which says to add it again)
    useReaders.setState({ state: { molnextr: "absent", molscribe: "absent" } });
    expect(rolePlugin("pictures")?.id).toBe("molnextr");
  });
});
