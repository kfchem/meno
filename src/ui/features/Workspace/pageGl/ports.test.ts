import { describe, expect, it } from "vitest";
import { COLORS } from "../../../theme/colors";
import { dropOn, portColours, portControl, portCount, portOfKey, portParts, sourcesSaid } from "./ports";

describe("a workflow's port as WebGL draws it", () => {
  it("is 9 page pixels, nor more than a sixth of what it is on, but never under 5 screen pixels", () => {
    expect(portControl()).toEqual({ leastScreenPx: 5, onPagePx: 9 });
    expect(portControl(30)).toEqual({ leastScreenPx: 5, onPagePx: 9, leastOfPx: { of: 30, share: 1 / 6 } });
  });

  it("is white with a grey line at rest, Meno's light colour pointed at, Meno's colour lit", () => {
    expect(portColours(0)).toEqual({ fill: COLORS.background, line: COLORS.quiet });
    expect(portColours(1)).toEqual({ fill: COLORS.lightBase, line: COLORS.base });
    expect(portColours(2)).toEqual({ fill: COLORS.base, line: COLORS.base });
  });

  it("is taken hold of over 12 screen pixels about its middle, over the cards - but one only drawn takes nothing", () => {
    const p = portParts({ key: "port:give:3", x: 1, y: 2, label: "Out of Input" }, 0);
    expect(p.region).toMatchObject({ key: "port:give:3", part: "port", circle: { x: 1, y: 2, diameterPx: 12 }, z: 5, cursor: "crosshair" });
    expect(portParts({ key: "port:into:3", x: 1, y: 2, label: "Into", noHits: true }, 0).region).toBeNull();
  });

  it("says by its key what it is", () => {
    expect(portOfKey("port:take:12:mols")).toEqual({ take: { step: 12, port: "mols" } });
    // (a port's id may hold a colon)
    expect(portOfKey("port:take:12:a:b")).toEqual({ take: { step: 12, port: "a:b" } });
    expect(portOfKey("port:give:4")).toEqual({ give: { set: 4 } });
    expect(portOfKey("port:exit:12:kept")).toEqual({ exit: { step: 12, exit: "kept" } });
    expect(portOfKey("port:selection")).toEqual({ selection: true });
    expect(portOfKey("step:4")).toBeNull();
  });
});

describe("where a wire let go lands", () => {
  const exitSet = (x: { step: number; exit: string }) => (x.step === 4 && x.exit === "kept" ? 9 : undefined);
  it("is a port the page's WebGL draws, found by its shape - an exit's taken as its set's giving", () => {
    expect(dropOn("port:take:12:a:b", {}, exitSet)).toEqual({ take: { step: 12, port: "a:b" } });
    expect(dropOn("port:give:3", {}, exitSet)).toEqual({ give: { set: 3 } });
    expect(dropOn("port:exit:4:kept", {}, exitSet)).toEqual({ give: { set: 9 } });
    // (it wins over what lies under it in the page's HTML)
    expect(dropOn("port:give:3", { take: "5:mols" }, exitSet)).toEqual({ give: { set: 3 } });
  });

  it("or else one in the page's HTML - an opened card's own ports - or nothing", () => {
    expect(dropOn(null, { take: "5:a:b" }, exitSet)).toEqual({ take: { step: 5, port: "a:b" } });
    expect(dropOn(null, { give: "7" }, exitSet)).toEqual({ give: { set: 7 } });
    // (an exit with no set, and nothing under it: nothing)
    expect(dropOn("port:exit:4:failed", {}, exitSet)).toBeNull();
    expect(dropOn(null, {}, exitSet)).toBeNull();
    expect(dropOn("port:selection", {}, exitSet)).toBeNull();
  });
});

describe("an input several wires come into", () => {
  const port = { key: "port:take:4:in", x: 10, y: 20, label: "Into Duplicates" };

  it("says how many beside its port - small, up and to its left where they come in, in its line's colour as it is lit - and nothing for one wire", () => {
    expect(portCount(port, 1, 0)).toBeNull();
    const at = portCount(port, 3, 0)!;
    expect(at).toMatchObject({ key: "port:take:4:in:count", text: "3", anchor: "end", sizePx: 9, color: portColours(0).line });
    expect([at.x < port.x, at.y > port.y]).toEqual([true, true]);
    expect(portCount(port, 2, 2, 0.5)).toMatchObject({ color: portColours(2).line, opacity: 0.5 });
  });

  it("lists, pointed at, the sets wired in, numbered in the order it takes them", () => {
    expect(sourcesSaid(["Round 1", "Round 2", "Trans already"])).toBe("1 Round 1 \u00b7 2 Round 2 \u00b7 3 Trans already");
  });
});
