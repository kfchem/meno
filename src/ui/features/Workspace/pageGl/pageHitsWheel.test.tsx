/**
 * What the page's regions listen for (PageHits), drawn into a scene without WebGL: a wheel - and two fingers - on the page always
 * zooms and moves the view, over a conversation's card as anywhere, so no region hears either (the maintainer, 2026-11-11: the
 * card is scrolled by its track, its chips and keys).
 */
import { afterEach, describe, expect, it } from "vitest";
import * as THREE from "three";
import { act } from "react";
import { createRoot, extend } from "@react-three/fiber";
import PageHits from "./PageHits";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
extend(THREE as never);

/** A renderer that draws nothing, its canvas noting each kind of event it is told to listen for. */
function nothingDrawn(heard: string[]): object {
  const none = () => undefined;
  const handler: ProxyHandler<object> = {
    get(target, key) {
      if (key === "then" || typeof key === "symbol") return undefined;
      if (key in target) return (target as Record<string, unknown>)[key];
      return new Proxy(none, handler);
    },
    apply: () => undefined,
  };
  const dom = { style: {}, dataset: {}, addEventListener: (type: string) => void heard.push(type), removeEventListener: none, getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) };
  const own = { render: none, getPixelRatio: () => 1, domElement: dom, xr: { enabled: false, isPresenting: false, addEventListener: none, removeEventListener: none, setAnimationLoop: none } };
  return new Proxy(own, handler);
}

const mounted: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const unmount of mounted.splice(0)) await unmount();
});

describe("the page's regions", () => {
  it("hear the pointer pressed, moved, clicked, left and a menu asked for - and no wheel, no touch: those are the view's", async () => {
    const heard: string[] = [];
    const canvas = { style: {}, width: 800, height: 600, addEventListener: () => undefined, removeEventListener: () => undefined } as unknown as HTMLCanvasElement;
    const root = createRoot(canvas);
    await act(async () => {
      await root.configure({ gl: nothingDrawn(heard) as never, size: { width: 800, height: 600, top: 0, left: 0 }, frameloop: "never", orthographic: true });
      root.render(<PageHits />);
    });
    mounted.push(() => act(async () => void root.unmount()));
    expect([...new Set(heard)].sort()).toEqual(["click", "contextmenu", "dblclick", "pointerdown", "pointerleave", "pointermove"]);
    expect(heard.filter((t) => /wheel|touch|scroll/.test(t))).toEqual([]);
  });
});
