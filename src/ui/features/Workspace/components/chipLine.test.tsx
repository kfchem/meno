import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { FramesChip } from "./Frames3D";

// Vitest runs in Node, with no page to mount on: the server's renderer
// draws the chip, and how it is laid out is read off that.

const LONG = "A generative model 4.8.24 · sampled from its prior (priors v2), seed 7, on the CPU; its stereo, unspecified in the SMILES, enumerated";

describe("a single geometry's chip", () => {
  it("wraps a long line within a reasonable width, rather than running on past the window", () => {
    const html = renderToString(<FramesChip count={1} frame={0} open about={LONG} onFrame={() => {}} />);
    expect(html).toContain(LONG.slice(0, 40));
    expect(html).toMatch(/class="[^"]*max-w-\[20rem\][^"]*"/);
    expect(html).not.toMatch(/class="[^"]*whitespace-nowrap[^"]*"[^>]*>A generative/);
  });

  it("lets the pointer through but for what it shows: hidden, it covers nothing - a set's port beside it", () => {
    const html = renderToString(<FramesChip count={1} frame={0} open={false} about={LONG} onFrame={() => {}} />);
    // (its root, and its box while hidden, take no pointer)
    expect(html).toMatch(/^<div[^>]*style="[^"]*pointer-events:none/);
    expect(html.match(/pointer-events:auto/g) ?? []).toEqual([]);
  });
});
