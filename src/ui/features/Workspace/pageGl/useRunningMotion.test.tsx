import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { act } from "react";
import { createRoot, extend } from "@react-three/fiber";

// A running mark's frame-asker mounted as the page mounts it - in a renderer that draws nothing - with the app's bridge stood in for:
// the back end's word heard from the first (its listener on, its state asked once), and a `window:seen` false then true resting the
// mark and setting it going again through the gate itself; its tab hidden and shown, the same.

const tauri = vi.hoisted(() => ({ asks: 0, heard: null as ((e: { payload: boolean }) => void) | null, event: "" }));
vi.mock("@tauri-apps/api/core", () => ({
  isTauri: () => true,
  invoke: async () => {
    tauri.asks++;
    return true;
  },
}));
vi.mock("@tauri-apps/api/event", () => ({
  listen: async (event: string, f: (e: { payload: boolean }) => void) => {
    tauri.event = event;
    tauri.heard = f;
    return () => {};
  },
}));

import { useRunningMotion } from "./useRunningMotion";
import { tellWindowSeen, type RunningTick } from "./runningTick";
import { hearWindowSeen, WINDOW_SEEN_EVENT } from "./windowSeen";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// (the canvas's own frames, on demand, as a browser would give them: none of them draws anything here)
globalThis.requestAnimationFrame ??= (f: FrameRequestCallback) => setTimeout(() => f(performance.now()), 16) as unknown as number;
globalThis.cancelAnimationFrame ??= (id: number) => clearTimeout(id);
extend(THREE as never);

const unmounts: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const u of unmounts.splice(0)) await u();
  tellWindowSeen(null);
});

async function mounted(marks: number) {
  const ticks: RunningTick[] = [];
  function Mark({ i }: { i: number }) {
    ticks[i] = useRunningMotion(true);
    return null;
  }
  const none = () => undefined;
  const canvas = { style: {}, width: 10, height: 10, addEventListener: none, removeEventListener: none } as unknown as HTMLCanvasElement;
  const root = createRoot(canvas);
  const gl = new Proxy({ render: none, getPixelRatio: () => 1, domElement: { style: {}, addEventListener: none, removeEventListener: none }, xr: { enabled: false, addEventListener: none, removeEventListener: none, setAnimationLoop: none } }, {
    get: (t, k) => (k in t ? (t as Record<string | symbol, unknown>)[k] : k === "then" ? undefined : none),
  });
  const configure = (frameloop: "demand" | "never") => root.configure({ gl: gl as never, size: { width: 10, height: 10, top: 0, left: 0 }, frameloop });
  await act(async () => {
    await configure("demand");
    root.render(
      <>
        {Array.from({ length: marks }, (_, i) => (
          <Mark key={i} i={i} />
        ))}
      </>,
    );
  });
  await act(async () => void (await hearWindowSeen()));
  unmounts.push(() => act(async () => void root.unmount()));
  const tab = (shown: boolean) =>
    act(async () => {
      await configure(shown ? "demand" : "never");
      root.render(
        <>
          {Array.from({ length: marks }, (_, i) => (
            <Mark key={i} i={i} />
          ))}
        </>,
      );
    });
  return { ticks, tab };
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("a running mark on the page, by the back end's word", () => {
  it("hears it from the first, asks its state once however many marks there are, and rests and goes on as the window is minimised and restored", async () => {
    const { ticks } = await mounted(3);
    expect(tauri.event).toBe(WINDOW_SEEN_EVENT);
    expect(tauri.heard).not.toBeNull();
    expect(tauri.asks).toBe(1);
    const tick = ticks[0];
    const invalidate = vi.fn(() => tick.ask(invalidate));
    tick.ask(invalidate);
    await wait(120);
    expect(invalidate.mock.calls.length).toBeGreaterThan(0);
    // (minimised: none asked)
    tauri.heard!({ payload: false });
    const before = invalidate.mock.calls.length;
    await wait(200);
    expect(invalidate).toHaveBeenCalledTimes(before);
    // (restored: one at once, and more after)
    tauri.heard!({ payload: true });
    expect(invalidate).toHaveBeenCalledTimes(before + 1);
    await wait(120);
    expect(invalidate.mock.calls.length).toBeGreaterThan(before + 1);
    for (const t of ticks) t.stop();
  });

  it("rests while its tab is not the one shown, and goes on as it is shown again", async () => {
    const { ticks, tab } = await mounted(1);
    const tick = ticks[0];
    const invalidate = vi.fn(() => tick.ask(invalidate));
    tick.ask(invalidate);
    await wait(80);
    await tab(false);
    const before = invalidate.mock.calls.length;
    await wait(200);
    expect(invalidate).toHaveBeenCalledTimes(before);
    await tab(true);
    expect(invalidate.mock.calls.length).toBeGreaterThan(before);
    tick.stop();
  });
});
