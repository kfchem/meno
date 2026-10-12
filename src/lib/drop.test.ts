import { describe, expect, it } from "vitest";
import { createRouter, pageDrags, type Drag, type DropZone, type Dropped } from "./drop";

type Place = { name: string; parentElement: Place | null };
const place = (name: string, parentElement: Place | null = null): Place => ({ name, parentElement });

/** A zone that notes what happens to it. */
function noting(name: string, log: string[], takes: (d: Drag) => boolean = () => true): DropZone {
  return {
    takes,
    enter: (d) => log.push(`${name} enter${d.files ? " files" : ""}`),
    leave: () => log.push(`${name} leave`),
    drop: (d) => log.push(`${name} drop ${d.x},${d.y}`),
  };
}

const dropped = (x: number, y: number): Dropped => ({ x, y, files: [], read: async () => null });

describe("the drop router", () => {
  const page = place("page");
  const canvas = place("canvas", page);
  const atom = place("atom", canvas);
  const tabs = place("tabs", page);
  const data: Drag = { files: false };

  it("enters a zone once, however it moves within it, and leaves it for another", () => {
    const log: string[] = [];
    const zones = new Map([
      [canvas, noting("canvas", log)],
      [tabs, noting("tabs", log)],
    ]);
    const r = createRouter<Place>((p) => (zones.has(p) ? () => zones.get(p)! : undefined));
    expect(r.over(atom, data)).toBe(true);
    expect(r.over(canvas, data)).toBe(true);
    expect(r.over(atom, data)).toBe(true);
    expect(r.over(tabs, { files: true })).toBe(true);
    expect(r.over(page, data)).toBe(false);
    expect(log).toEqual(["canvas enter", "canvas leave", "tabs enter files", "tabs leave"]);
  });

  it("hands the drop to the zone it lands on, which keeps what it began", () => {
    const log: string[] = [];
    const r = createRouter<Place>((p) => (p === canvas ? () => noting("canvas", log) : undefined));
    r.over(atom, data);
    expect(r.drop(atom, data, dropped(3, 4))).toBe(true);
    // (no leave between: whatever it started reading as the drag came is for this drop)
    expect(log).toEqual(["canvas enter", "canvas drop 3,4"]);
    // and a drag after it starts afresh
    r.over(canvas, data);
    expect(log[log.length - 1]).toBe("canvas enter");
  });

  it("does not hand a drag to a zone that does not take it, nor a drop", () => {
    const log: string[] = [];
    const r = createRouter<Place>((p) => (p === canvas ? () => noting("canvas", log, (d) => d.files) : undefined));
    expect(r.over(atom, data)).toBe(false);
    expect(r.drop(atom, data, dropped(0, 0))).toBe(false);
    expect(r.over(atom, { files: true })).toBe(true);
    expect(log).toEqual(["canvas enter files"]);
  });

  it("lets a zone go when the drag leaves the page, or drops outside it", () => {
    const log: string[] = [];
    const r = createRouter<Place>((p) => (p === canvas ? () => noting("canvas", log) : undefined));
    r.over(atom, data);
    r.leave();
    r.over(atom, data);
    expect(r.drop(tabs, data, dropped(0, 0))).toBe(false);
    expect(log).toEqual(["canvas enter", "canvas leave", "canvas enter", "canvas leave"]);
  });

  it("gives a drag to the nearest zone it is in", () => {
    const log: string[] = [];
    const zones = new Map([
      [page, noting("page", log)],
      [canvas, noting("canvas", log)],
    ]);
    const r = createRouter<Place>((p) => (zones.has(p) ? () => zones.get(p)! : undefined));
    r.over(atom, data);
    r.over(tabs, data);
    expect(log).toEqual(["canvas enter", "canvas leave", "page enter"]);
  });
});

describe("the page's own drags", () => {
  it("are not routed while they last; one the page prevented begins none, and files dropped after it are routed", () => {
    const own = pageDrags();
    own.started();
    own.settled({ defaultPrevented: false });
    expect(own.inside()).toBe(true);
    own.ended();
    expect(own.inside()).toBe(false);
    // (the workspace prevents the system's drag-and-drop: no dragend follows)
    own.started();
    own.settled({ defaultPrevented: true });
    expect(own.inside()).toBe(false);
  });
});
