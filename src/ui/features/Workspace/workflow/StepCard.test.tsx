import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { Port } from "./StepCard";
import { PORT, PORT_SHARE, portSize, PX } from "./look";

// Vitest runs in Node, with no page to mount on: the server's renderer draws the port.

describe("a port", () => {
  it("begins no selection of the page's text when pressed", () => {
    // (one left over - a wire pulled out of a selection's port - turned a later
    // drag on the drawing into the system's own drag-and-drop, which took the
    // pointer's moves and its release from the gesture under way)
    const html = renderToString(<Port look="plain" label="Set as input" data={{}} onPointerDown={() => {}} style={{}} />);
    expect(html).toMatch(/class="[^"]*\bselect-none\b/);
  });

  it("is 9 px on the screen near, never more than its own 11 page px zoomed out, nor a sixth of its set's height: round, its ring at most a fifth of it", () => {
    expect(PORT / PX).toBeCloseTo(11, 9);
    // (a set 300 px tall: its own 11 px the most - as many of the screen's pixels as the layer's scale makes them)
    expect(portSize(300)).toBe("min(9px, calc(var(--scale, 1) * 11.00px))");
    // (a set 36 px tall: a sixth of it, 6 px)
    expect(portSize(36)).toBe(`min(9px, calc(var(--scale, 1) * ${(36 * PORT_SHARE).toFixed(2)}px))`);
    const html = renderToString(<Port look="plain" label="Into Filter" data={{}} onPointerDown={() => {}} style={{}} of={36} />);
    expect(html).toContain("width:min(9px, calc(var(--scale, 1) * 6.00px))");
    expect(html).toContain("height:min(9px, calc(var(--scale, 1) * 6.00px))");
    expect(html).toContain("border-width:min(1px, calc(min(9px, calc(var(--scale, 1) * 6.00px)) / 5))");
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
