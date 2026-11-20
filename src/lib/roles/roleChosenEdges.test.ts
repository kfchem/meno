/**
 * The edges held beside roleChosen.test.ts: of two plugins the chemist added for a role, none is the chosen one - nothing says which
 * (`roleChosen`, as `rolePlugin`). (Found in review.)
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PythonPlugin } from "../calc/catalog";

const A = { id: "reader-a", name: "Reader A" } as PythonPlugin;
const B = { id: "reader-b", name: "Reader B" } as PythonPlugin;
const filling = vi.hoisted(() => ({ current: [] as PythonPlugin[] }));
vi.mock("../calc/catalog", async (actual) => ({ ...(await actual<typeof import("../calc/catalog")>()), pluginsFilling: () => filling.current }));

const { roleChosen, rolePlugin } = await import("./worker");
const { useAppSettings } = await import("../settings/appSettings");
const { useReaders } = await import("../calc/workers");

describe("the plugin chosen for a role, of two added", () => {
  afterEach(() => {
    useAppSettings.setState((s) => ({ ...s, plugins: { ...s.plugins, roles: {}, removed: [] } }));
    useReaders.setState({ state: {} });
  });

  it("is none: nothing says which, as the plugin used is none", () => {
    filling.current = [A, B];
    useAppSettings.setState((s) => ({ ...s, plugins: { ...s.plugins, roles: {}, removed: [] } }));
    useReaders.setState({ state: { "reader-a": "added", "reader-b": "added" } });
    expect(rolePlugin("pictures")).toBeUndefined();
    expect(roleChosen("pictures")).toBeUndefined();
  });
});
