import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeGuide, guideNotice, nextStep, NOTICED_MS, showGuide, showGuidesDue, shownStep, useGuide } from "./guides";
import { useAppSettings } from "../settings/appSettings";
import { useReaders } from "../calc/workers";
import { MANIFESTS } from "./known";

const plugins = (p: Partial<{ removed: string[]; guided: string[] }> = {}) =>
  useAppSettings.setState({ loaded: true, plugins: { removed: [], roles: {}, programs: {}, guided: [], ...p } });

describe("a plugin's guide", () => {
  beforeEach(() => {
    useGuide.setState({ open: null });
    useReaders.setState({ state: {}, problem: {} });
    plugins();
  });
  afterEach(() => vi.useRealTimers());

  it("comes with Meno as a plugin that runs nothing: Getting started, its steps pointing at what Meno names", () => {
    const m = MANIFESTS.find((p) => p.id === "getting-started")!;
    expect(m.environment).toBeUndefined();
    expect(m.guide.map((s) => [s.at, s.until])).toEqual([
      ["page", "quick-add"],
      ["quick-add", undefined],
      ["structure", "selected"],
      ["menu", undefined],
      ["save", undefined],
      [undefined, undefined],
    ]);
    // (the plugins it suggests at its end, and all it suggests, are the plugins Meno carries)
    const carried = MANIFESTS.map((p) => p.id);
    expect(m.guide[m.guide.length - 1]?.suggest).toEqual(["rdkit", "cclib", "xtb"]);
    for (const s of m.suggests) expect(carried).toContain(s.plugin);
    // (its catalogue's kinds of file, kept in step with the plugins it suggests for them: each reads a kind of that id)
    expect(m.files.length).toBeGreaterThan(0);
    for (const f of m.files) {
      for (const id of f.suggest) expect(MANIFESTS.find((p) => p.id === id)?.reads, `${id} reads ${f.id}`).toContain(f.id);
    }
  });

  it("is shown once, the first time its plugin is there - not before the settings say which were shown", () => {
    useAppSettings.setState({ loaded: false });
    showGuidesDue();
    expect(useGuide.getState().open).toBeNull();
    plugins();
    showGuidesDue();
    expect(useGuide.getState().open).toEqual({ plugin: "getting-started", step: 0 });
    expect(shownStep()?.step.title).toBe("Welcome to Meno");
  });

  it("goes on a step at a time, and once closed - gone through or skipped - is kept as shown, and not shown again of itself", () => {
    showGuidesDue();
    nextStep();
    expect(useGuide.getState().open?.step).toBe(1);
    closeGuide();
    expect(useGuide.getState().open).toBeNull();
    expect(useAppSettings.getState().plugins.guided).toEqual(["getting-started"]);
    showGuidesDue();
    expect(useGuide.getState().open).toBeNull();
    // (shown again when asked: Settings, Plugins)
    showGuide("getting-started");
    expect(useGuide.getState().open).toEqual({ plugin: "getting-started", step: 0 });
    for (let i = 0; i < 6; i++) nextStep();
    expect(useGuide.getState().open).toBeNull();
  });

  it("is not shown where its plugin was taken away, and closes as it is", () => {
    plugins({ removed: ["getting-started"] });
    showGuidesDue();
    expect(useGuide.getState().open).toBeNull();
    plugins();
    showGuidesDue();
    useReaders.setState({ state: { "getting-started": "absent" } });
    expect(useGuide.getState().open).toBeNull();
    // (taken away, not kept as shown: it comes again with the plugin)
    expect(useAppSettings.getState().plugins.guided).toEqual([]);
  });

  it("goes on by itself, a moment after the chemist does what its step waits for - nothing else", () => {
    vi.useFakeTimers();
    showGuidesDue();
    guideNotice("menu");
    vi.advanceTimersByTime(NOTICED_MS + 1);
    expect(useGuide.getState().open?.step).toBe(0);
    guideNotice("quick-add");
    expect(useGuide.getState().open?.step).toBe(0);
    vi.advanceTimersByTime(NOTICED_MS + 1);
    expect(useGuide.getState().open?.step).toBe(1);
    // (a step gone on from by hand meanwhile is not gone on from again)
    nextStep();
    guideNotice("selected");
    nextStep();
    vi.advanceTimersByTime(NOTICED_MS + 1);
    expect(useGuide.getState().open?.step).toBe(3);
  });
});
