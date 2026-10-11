import { afterEach, describe, expect, it } from "vitest";
import { rolePlugin } from "./worker";
import { useReaders } from "../calc/workers";
import { useAppSettings } from "../settings/appSettings";

const roles = (r: Record<string, string>) => useAppSettings.setState((s) => ({ plugins: { ...s.plugins, roles: r } }));

describe("the plugin that fills a role", () => {
  afterEach(() => {
    roles({});
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
});
