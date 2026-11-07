import { describe, expect, it } from "vitest";
import { COLORS } from "../../../theme/colors";
import { PORT, PX } from "../workflow/look";
import { portColours, portControl, portOfKey, portParts, PORT_PX } from "./ports";

describe("a workflow's port as WebGL draws it", () => {
  it("is as large as a hand takes it: 9 screen pixels near, never more than its own size on the page nor a sixth of what it is on", () => {
    expect(portControl()).toEqual({ screenPx: 9, mostPagePx: PORT / PX });
    expect(portControl(30)).toEqual({ screenPx: 9, mostPagePx: PORT / PX, leastOfPx: { of: 30, share: 1 / 6 } });
  });

  it("is white with a grey line at rest, Meno's light colour pointed at, Meno's colour lit", () => {
    expect(portColours(0)).toEqual({ fill: COLORS.background, line: COLORS.quiet });
    expect(portColours(1)).toEqual({ fill: COLORS.lightBase, line: COLORS.base });
    expect(portColours(2)).toEqual({ fill: COLORS.base, line: COLORS.base });
  });

  it("is taken hold of over 12 screen pixels about its middle, over the cards - but one only drawn takes nothing", () => {
    const p = portParts({ key: "port:give:3", x: 1, y: 2, label: "Out of Input" }, 0);
    expect(p.region).toMatchObject({ key: "port:give:3", part: "port", circle: { x: 1, y: 2, diameterPx: PORT_PX.taken }, z: 5, cursor: "crosshair" });
    expect(portParts({ key: "port:into:3", x: 1, y: 2, label: "Into", noHits: true }, 0).region).toBeNull();
  });

  it("says by its key what it is", () => {
    expect(portOfKey("port:take:12:mols")).toEqual({ take: { step: 12, port: "mols" } });
    expect(portOfKey("port:give:4")).toEqual({ give: { set: 4 } });
    expect(portOfKey("port:exit:12:kept")).toEqual({ exit: { step: 12, exit: "kept" } });
    expect(portOfKey("port:selection")).toEqual({ selection: true });
    expect(portOfKey("step:4")).toBeNull();
  });
});
