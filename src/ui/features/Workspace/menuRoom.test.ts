import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { menuHolds, roomAsked, roomFreed, type MenuRoom, type ViewAt } from "./menuRoom";

/**
 * A view as the canvas keeps it: where it is, and where it is going while it
 * eases there (the pan for a menu is taken from where it is, as the canvas
 * takes it), let go on arrival at exactly the numbers it was sent to.
 */
class View {
  at: ViewAt;
  goal: ViewAt | undefined;
  room: MenuRoom = null;
  constructor(at: ViewAt) {
    this.at = { ...at };
  }
  /** A menu asks for so much, in the page's units. */
  ask(dx: number, dy: number) {
    const to = { x: this.at.x + dx, y: this.at.y + dy, zoom: this.at.zoom };
    this.room = roomAsked(this.room, this.at, this.goal, to);
    this.goal = to;
  }
  /** Every menu has shut. */
  free() {
    const back = roomFreed(this.room, this.at, this.goal);
    this.room = null;
    if (back) this.goal = back;
  }
  /** The ease, a share of the way at a time. */
  ease(share = 0.37) {
    if (!this.goal) return;
    const g = this.goal;
    this.at = { x: this.at.x + (g.x - this.at.x) * share, y: this.at.y + (g.y - this.at.y) * share, zoom: this.at.zoom };
  }
  arrive() {
    if (!this.goal) return;
    this.at = { ...this.goal };
    this.goal = undefined;
  }
  /** The chemist's own pan or zoom: it lets the goal go, and the view is where they put it. */
  own(to: ViewAt) {
    this.goal = undefined;
    this.at = { ...to };
  }
}

const start: ViewAt = { x: 12.3, y: -4.56, zoom: 37.1 };

describe("roomAsked and roomFreed", () => {
  it("gives back exactly what one menu took: open, move, shut", () => {
    const v = new View(start);
    v.ask(-3.17, 1.9);
    v.arrive();
    expect(v.at).not.toEqual(start);
    v.free();
    v.arrive();
    expect(v.at).toEqual(start);
  });

  it("gives back both moves of a menu that grew twice, at once", () => {
    const v = new View(start);
    v.ask(-2.5, 0);
    v.arrive();
    v.ask(0, 1.25);
    v.ease();
    v.ask(-0.75, 0.5);
    v.arrive();
    v.free();
    v.arrive();
    expect(v.at).toEqual(start);
  });

  it("counts a chain as one: the second menu asks from where the first left the view, and the end is the view before the first", () => {
    const v = new View(start);
    v.ask(-4, 0);
    v.ease();
    // (the first shut, a new one opened elsewhere before it was all let go: nothing freed in between)
    v.ask(0, 2.2);
    v.arrive();
    v.free();
    v.arrive();
    expect(v.at).toEqual(start);
  });

  it("forgets, and gives nothing back, once the chemist has moved the view themself", () => {
    const v = new View(start);
    v.ask(-3, 0);
    v.arrive();
    const theirs = { x: 40, y: 2, zoom: 37.1 };
    v.own(theirs);
    v.free();
    expect(v.goal).toBeUndefined();
    expect(v.at).toEqual(theirs);
  });

  it("forgets the chemist's zoom too, though the middle has not moved", () => {
    const v = new View(start);
    v.ask(-3, 0);
    v.arrive();
    v.own({ ...v.at, zoom: 50 });
    v.free();
    expect(v.goal).toBeUndefined();
  });

  it("counts from the chemist's view where they moved it and a menu then asked again", () => {
    const v = new View(start);
    v.ask(-3, 0);
    v.arrive();
    const theirs = { x: 40, y: 2, zoom: 37.1 };
    v.own(theirs);
    v.ask(0, 1);
    v.arrive();
    v.free();
    v.arrive();
    expect(v.at).toEqual(theirs);
  });

  it("forgets where a row moves the view on purpose - a fit on its way, or there", () => {
    const fit = { x: 0, y: 0, zoom: 20 };
    const v = new View(start);
    v.ask(-3, 0);
    v.ease();
    v.goal = { ...fit };
    v.free();
    expect(v.goal).toEqual(fit);
    v.arrive();
    v.free();
    expect(v.at).toEqual(fit);
    expect(v.goal).toBeUndefined();
  });

  it("gives nothing back for a menu that never moved the view", () => {
    const v = new View(start);
    v.free();
    expect(v.goal).toBeUndefined();
    expect(v.at).toEqual(start);
    expect(roomFreed(null, start, undefined)).toBeNull();
  });

  it("gives back what had been asked when the menu shuts during the opening ease", () => {
    const v = new View(start);
    v.ask(-5.5, 3.3);
    v.ease();
    v.ease();
    v.free();
    v.arrive();
    expect(v.at).toEqual(start);
  });

  it("drifts not at all over ten rounds: the view returns to the same numbers", () => {
    const v = new View(start);
    for (let i = 0; i < 10; i++) {
      v.ask(-1.1 - i * 0.37, 0.3 * i);
      if (i % 2) v.ease();
      else v.arrive();
      v.ask(0.01, -0.07);
      v.ease(0.5);
      v.free();
      v.ease(0.21);
      v.arrive();
      expect(v.at).toStrictEqual(start);
    }
  });

  it("starts from where the view is going back to, where a menu opens again during the ease back", () => {
    const v = new View(start);
    v.ask(-3, 0);
    v.arrive();
    v.free();
    v.ease();
    v.ask(-1, 0);
    v.arrive();
    v.free();
    v.arrive();
    expect(v.at).toEqual(start);
  });
});

describe("menuHolds", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("frees once the last has shut and none opened again meanwhile", () => {
    const free = vi.fn();
    const { hold } = menuHolds(free, 60);
    const menu = hold();
    const card = hold();
    menu();
    vi.advanceTimersByTime(100);
    expect(free).not.toHaveBeenCalled();
    card();
    vi.advanceTimersByTime(59);
    expect(free).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(free).toHaveBeenCalledTimes(1);
  });

  it("holds on as one where a row shuts its menu and opens a card in the same place", () => {
    const free = vi.fn();
    const { hold } = menuHolds(free, 60);
    const menu = hold();
    menu();
    vi.advanceTimersByTime(10);
    const card = hold();
    vi.advanceTimersByTime(200);
    expect(free).not.toHaveBeenCalled();
    card();
    vi.advanceTimersByTime(60);
    expect(free).toHaveBeenCalledTimes(1);
  });

  it("counts a letting go twice as once", () => {
    const free = vi.fn();
    const { hold } = menuHolds(free, 60);
    const a = hold();
    const b = hold();
    a();
    a();
    vi.advanceTimersByTime(100);
    expect(free).not.toHaveBeenCalled();
    b();
    vi.advanceTimersByTime(60);
    expect(free).toHaveBeenCalledTimes(1);
  });
});
