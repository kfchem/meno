import { afterEach, describe, expect, it, vi } from "vitest";
import type { PythonPlugin } from "../calc/catalog";

// (two plugins that read pictures, as the catalogue may list them; none added, none chosen, until a test says)
const A = { id: "reader-a", name: "Reader A" } as PythonPlugin;
const B = { id: "reader-b", name: "Reader B" } as PythonPlugin;
const filling = vi.hoisted(() => ({ current: [] as PythonPlugin[] }));
vi.mock("../calc/catalog", async (actual) => ({ ...(await actual<typeof import("../calc/catalog")>()), pluginsFilling: () => filling.current }));

const { roleChosen, rolePlugin } = await import("./worker");
const { useAppSettings } = await import("../settings/appSettings");
const { useReaders } = await import("../calc/workers");

const plugins = (roles: Record<string, string>, removed: string[] = []) =>
  useAppSettings.setState((s) => ({ ...s, plugins: { ...s.plugins, roles, removed } }));

describe("the plugin chosen for a role", () => {
  afterEach(() => {
    plugins({});
    useReaders.setState({ state: {} });
  });

  it("is none where the catalogue only could fill it - one the chemist took no step for - though it would be used if asked", () => {
    filling.current = [A];
    expect(rolePlugin("pictures")).toBe(A);
    expect(roleChosen("pictures")).toBeUndefined();
  });

  it("is the one chosen in Settings, or the one added - not one taken away", () => {
    filling.current = [A, B];
    plugins({ pictures: "reader-b" });
    expect(roleChosen("pictures")).toBe(B);
    plugins({ pictures: "reader-b" }, ["reader-b"]);
    expect(roleChosen("pictures")).toBeUndefined();
    plugins({});
    useReaders.setState({ state: { "reader-a": "added" } });
    expect(roleChosen("pictures")).toBe(A);
  });
});
