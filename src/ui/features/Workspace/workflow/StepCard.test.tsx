import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { Port, stateLine } from "./StepCard";
import { PORT_SHARE, portSize } from "./look";

// Vitest runs in Node, with no page to mount on: the server's renderer draws the port.

describe("a port", () => {
  it("begins no selection of the page's text when pressed", () => {
    // (one left over - a wire pulled out of a selection's port - turned a later
    // drag on the drawing into the system's own drag-and-drop, which took the
    // pointer's moves and its release from the gesture under way)
    const html = renderToString(<Port look="plain" label="Set as input" data={{}} onPointerDown={() => {}} style={{}} />);
    expect(html).toMatch(/class="[^"]*\bselect-none\b/);
  });

  it("is 9 page px, nor more than a sixth of its set's height, but never under 5 screen px: round, its ring at most a fifth of it", () => {
    // (a set 300 px tall: its own 9 px - as many of the screen's pixels as the layer's scale makes them)
    expect(portSize(300)).toBe("max(5px, calc(var(--scale, 1) * 9.00px))");
    // (a set 36 px tall: a sixth of it, 6 px)
    expect(portSize(36)).toBe(`max(5px, calc(var(--scale, 1) * ${(36 * PORT_SHARE).toFixed(2)}px))`);
    const html = renderToString(<Port look="plain" label="Into Filter" data={{}} onPointerDown={() => {}} style={{}} of={36} />);
    expect(html).toContain("width:max(5px, calc(var(--scale, 1) * 6.00px))");
    expect(html).toContain("height:max(5px, calc(var(--scale, 1) * 6.00px))");
    expect(html).toContain("border-width:min(1px, calc(max(5px, calc(var(--scale, 1) * 6.00px)) / 5))");
    expect(html).toMatch(/class="[^"]*\brounded-full\b/);
  });

  it("is laid out in the screen's pixels, the layer's scale undone on it, and centred by the same transform - not by margins", () => {
    // (laid out in the layer's pixels, Chromium rounds its size, edges and ring each to a whole one of them, magnified zoomed in: ovals and dots on Windows)
    const html = renderToString(<Port look="plain" label="Into Filter" data={{}} onPointerDown={() => {}} style={{ left: 0, top: 28 }} />);
    expect(html).toContain("transform:scale(calc(1 / var(--scale, 1))) translate(-50%, -50%)");
    expect(html).toContain("transform-origin:0 0");
    expect(html).not.toContain("margin");
    expect(html).toContain("top:28px");
  });
});

describe("a running step's line", () => {
  it("says how long its quietest running job has written nothing, where that is past what Settings says - said only", () => {
    expect(stateLine("running", undefined, { ended: 1, total: 4, quiet: 47 }, 0).text).toBe("Running \u00b7 1 of 4 \u00b7 no output for 47 min");
    expect(stateLine("running", undefined, { ended: 0, total: 1, since: 0, quiet: 125 }, 3_600_000).text).toBe("Running 1:00:00 \u00b7 no output for 2 h 5 min");
    expect(stateLine("running", undefined, { ended: 1, total: 4 }, 0).text).toBe("Running \u00b7 1 of 4");
  });
});
