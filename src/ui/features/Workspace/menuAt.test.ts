import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MENU_MARGIN, MENU_OFF, placeMenu } from "./menuAt";
import { ICONS_WIDEST } from "./menuIconLines";
import { standMenu, type MenuAnchor } from "./useMenuAt";

const view = { width: 1000, height: 700 };
const menu = { width: 200, height: 100 };

describe("placeMenu", () => {
  it("stands up and to the right of its point where it fits, margin and all", () => {
    expect(placeMenu({ x: 400, y: 300 }, menu, view, 0)).toEqual({ left: 400 + MENU_OFF, top: 300 - MENU_OFF, up: false, leftward: false });
  });

  it("opens upward where it would lie past the foot: its foot as far below the point as its top would have been above it", () => {
    const p = placeMenu({ x: 400, y: 650 }, menu, view, 0);
    expect(p).toEqual({ left: 400 + MENU_OFF, top: 650 + MENU_OFF - 100, up: true, leftward: false });
  });

  it("opens to the left where it would lie past the right edge, or under the column", () => {
    expect(placeMenu({ x: 900, y: 300 }, menu, view, 0)).toEqual({ left: 900 - MENU_OFF - 200, top: 300 - MENU_OFF, up: false, leftward: true });
    expect(placeMenu({ x: 650, y: 300 }, menu, view, 300)).toEqual({ left: 650 - MENU_OFF - 200, top: 300 - MENU_OFF, up: false, leftward: true });
    expect(placeMenu({ x: 650, y: 300 }, menu, view, 0).leftward).toBe(false);
  });

  it("in the bottom right corner, opens up and to the left", () => {
    const p = placeMenu({ x: 990, y: 690 }, menu, view, 0);
    expect(p.up && p.leftward).toBe(true);
    expect(p.left + menu.width).toBeLessThanOrEqual(view.width - MENU_MARGIN);
    expect(p.top + menu.height).toBeLessThanOrEqual(view.height - MENU_MARGIN);
  });

  it("with room neither way, is slid in just clear of the edge it lay past", () => {
    const tall = { width: 200, height: 600 };
    const p = placeMenu({ x: 400, y: 350 }, tall, view, 0);
    expect(p).toEqual({ left: 400 + MENU_OFF, top: view.height - MENU_MARGIN - 600, up: false, leftward: false });
  });

  it("larger than the canvas, keeps its top left corner in (it scrolls inside)", () => {
    expect(placeMenu({ x: 100, y: 300 }, { width: 200, height: 900 }, view, 0).top).toBe(MENU_MARGIN);
    expect(placeMenu({ x: 300, y: 300 }, { width: 1200, height: 100 }, view, 0).left).toBe(MENU_MARGIN);
  });

  it("is always seen whole where it can be, wherever its point is", () => {
    for (const x of [0, 5, 200, 500, 790, 999]) {
      for (const y of [0, 10, 300, 600, 690, 700]) {
        const p = placeMenu({ x, y }, menu, view, 0);
        expect(p.left).toBeGreaterThanOrEqual(MENU_MARGIN);
        expect(p.top).toBeGreaterThanOrEqual(MENU_MARGIN);
        expect(p.left + menu.width).toBeLessThanOrEqual(view.width - MENU_MARGIN);
        expect(p.top + menu.height).toBeLessThanOrEqual(view.height - MENU_MARGIN);
      }
    }
  });
});

describe("the menu's numbers", () => {
  it("stands 14 px up and to the right of its point, and keeps 16 px clear of the canvas's edges", () => {
    expect(MENU_OFF).toBe(14);
    expect(MENU_MARGIN).toBe(16);
  });
});

describe("a menu as wide as its fullest line of icons", () => {
  // (ten icons on one line, the icons' margins and the border: the widest a line of icons makes a menu)
  const widest = { width: ICONS_WIDEST + 2 * 4 + 2, height: 200 };

  it("opened by the right edge, opens to the left of its point", () => {
    const p = placeMenu({ x: view.width - 100, y: 300 }, widest, view, 0);
    expect(p.leftward).toBe(true);
    expect(p.left + widest.width).toBe(view.width - 100 - MENU_OFF);
  });

  it("on a canvas narrower than it, keeps its left edge in", () => {
    expect(placeMenu({ x: 200, y: 300 }, widest, { width: widest.width - 40, height: 700 }, 0).left).toBe(MENU_MARGIN);
  });
});

describe("a menu stood on the canvas (standMenu)", () => {
  // (the canvas's px are the page's here: the view as it is, unless a test moves it)
  let shift = { x: 0, y: 0 };
  const anchor = (room: { width: number; height: number; cover: number }) => {
    const a: MenuAnchor = {
      project: (p) => ({ x: p.x + shift.x, y: p.y + shift.y }),
      world: (px) => ({ x: px.x - shift.x, y: px.y - shift.y }),
      room: () => room,
    };
    return a;
  };
  // (a stand-in for the menu's element: the tests run with no DOM)
  const element = (width: number, height: number) => ({ offsetWidth: width, offsetHeight: height, style: { left: "", top: "", transformOrigin: "" } }) as unknown as HTMLElement;
  let frames: FrameRequestCallback[] = [];
  beforeEach(() => {
    shift = { x: 0, y: 0 };
    frames = [];
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
    vi.stubGlobal("requestAnimationFrame", (f: FrameRequestCallback) => frames.push(f));
    vi.stubGlobal("cancelAnimationFrame", () => {});
  });
  afterEach(() => vi.unstubAllGlobals());
  const nextFrame = () => {
    const now = frames;
    frames = [];
    now.forEach((f) => f(0));
  };

  it("opened low in the window, opens upward over its point - and asks nothing of the view", () => {
    const el = element(220, 300);
    const a = anchor({ width: 800, height: 600, cover: 0 });
    const pan = vi.fn();
    const stop = standMenu(el, { x: 300, y: 560 }, { ...a, pan, hold: () => () => {} } as MenuAnchor);
    expect(el.style.top).toBe(`${560 + MENU_OFF - 300}px`);
    expect(el.style.left).toBe(`${300 + MENU_OFF}px`);
    expect(el.style.transformOrigin).toBe("bottom left");
    expect(pan).not.toHaveBeenCalled();
    stop();
  });

  it("a tall menu with room below stands where it was asked for, the view as it is", () => {
    const el = element(240, 420);
    const pan = vi.fn();
    standMenu(el, { x: 200, y: 160 }, { ...anchor({ width: 800, height: 600, cover: 0 }), pan, hold: () => () => {} } as MenuAnchor)();
    expect(el.style.top).toBe(`${160 - MENU_OFF}px`);
    expect(el.style.transformOrigin).toBe("top left");
    expect(pan).not.toHaveBeenCalled();
  });

  it("goes with the page as the chemist moves the view, still seen whole", () => {
    const el = element(200, 100);
    const stop = standMenu(el, { x: 300, y: 300 }, anchor({ width: 800, height: 600, cover: 0 }));
    expect(el.style.top).toBe(`${300 - MENU_OFF}px`);
    // (the chemist's own pan: the page, and the menu on it, 40 px down)
    shift = { x: 0, y: 40 };
    nextFrame();
    expect(el.style.top).toBe(`${340 - MENU_OFF}px`);
    // (on down, until there is no room below: it turns upward over its point)
    shift = { x: 0, y: 260 };
    nextFrame();
    expect(el.style.top).toBe(`${560 + MENU_OFF - 100}px`);
    stop();
  });
});
