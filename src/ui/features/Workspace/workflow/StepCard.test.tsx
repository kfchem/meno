import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { Port } from "./StepCard";

// Vitest runs in Node, with no page to mount on: the server's renderer draws the port.

describe("a port", () => {
  it("begins no selection of the page's text when pressed", () => {
    // (one left over - a wire pulled out of a selection's port - turned a later
    // drag on the drawing into the system's own drag-and-drop, which took the
    // pointer's moves and its release from the gesture under way)
    const html = renderToString(<Port look="plain" label="Set as input" data={{}} onPointerDown={() => {}} style={{}} />);
    expect(html).toMatch(/class="[^"]*\bselect-none\b/);
  });
});
