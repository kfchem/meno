import { afterEach, describe, expect, it } from "vitest";
import { rolePlugin } from "./worker";
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

  it("is the one chosen; else the first added that fills it - the one the chemist added; else the first", () => {
    // (two read pictures, MolNexTR first in Meno's order)
    expect(rolePlugin("pictures")?.id).toBe("molnextr");
    useReaders.setState({ state: { molnextr: "absent", molscribe: "added" } });
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
