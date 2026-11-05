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
    expect(roleUndecided("pictures").map((p) => p.id)).toEqual(["picread", "picread2"]);
    useReaders.setState({ state: { picread2: "added", picread: "added" } });
    expect(rolePlugin("pictures")).toBeUndefined();
    useReaders.setState({ state: { picread2: "absent", picread: "added" } });
    expect(roleUndecided("pictures")).toEqual([]);
    expect(rolePlugin("pictures")?.id).toBe("picread");
    roles({ pictures: "picread2" });
    expect(rolePlugin("pictures")?.id).toBe("picread2");
    // (a choice no plugin fills is no choice)
    roles({ pictures: "sketchkit" });
    expect(rolePlugin("pictures")?.id).toBe("picread");
  });

  it("gives way, where the one chosen was taken away, to another added that fills the role - or, with none, stays the one chosen", () => {
    roles({ pictures: "picread2" });
    takenAway(["picread2"]);
    useReaders.setState({ state: { picread2: "absent", picread: "added" } });
    expect(rolePlugin("pictures")?.id).toBe("picread");
    // (none other added: the one chosen, which says to add it again)
    useReaders.setState({ state: { picread2: "absent", picread: "absent" } });
    expect(rolePlugin("pictures")?.id).toBe("picread2");
  });
});
