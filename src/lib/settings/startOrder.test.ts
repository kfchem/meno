import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// What Meno starts a workspace in: Settings' style as it is made, so Settings
// are read before the first one is (main.tsx). The store holds the defaults
// until then, and the module reads once, so each test has it fresh.

const SAVED = JSON.stringify({ drawingStyle: { preset: "rsc", changes: {} } });

beforeEach(() => {
  vi.resetModules();
  const held = new Map<string, string>([["meno.settings", SAVED]]);
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => held.get(k) ?? null,
    setItem: (k: string, v: string) => void held.set(k, v),
  });
});
afterEach(() => vi.unstubAllGlobals());

async function started(read: boolean) {
  const { loadAppSettings, useAppSettings } = await import("./appSettings");
  const { workspace3dOf } = await import("../chem/workspaceStyle3d");
  const { createWorkspaceDocument } = await import("../../ui/features/Workspace/document");
  if (read) await loadAppSettings();
  const s = useAppSettings.getState();
  // (as the registry makes a workspace's document: ui/views/registry)
  const doc = createWorkspaceDocument(undefined, s.drawingStyle, workspace3dOf(s.style3d));
  return { s, doc };
}

describe("the first workspace", () => {
  it("is made in the style Settings has saved, where they are read first", async () => {
    const { s, doc } = await started(true);
    expect(s.loaded).toBe(true);
    expect(doc.getState().style).toEqual({ preset: "rsc", changes: {} });
  });

  it("is made after Settings are read, whatever the plugins do: Meno draws nothing before", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { useAppSettings } = await import("./appSettings");
    const { beforeFirstDraw } = await import("../../startUp");
    expect(useAppSettings.getState().loaded).toBe(false);
    await beforeFirstDraw(() => Promise.reject(new Error("no plugins")));
    expect(useAppSettings.getState().loaded).toBe(true);
    expect(useAppSettings.getState().drawingStyle).toEqual({ preset: "rsc", changes: {} });
  });
});
