import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { cornerRight } from "../pageCorner";
import NetworkToasts, { CornerBox } from "./NetworkToasts";

// Vitest runs in Node: the notices' container is drawn to a string, and
// where it is placed read from its style. (Drawn so, a store is read as it
// was made: the container with a panel beside it is drawn from its own part.)

const right = (html: string) => /bottom-3[^"]*"[^>]*style="right:([\d.]+)px"/.exec(html)?.[1];

describe("the notices in the corner", () => {
  it("sit in the window's corner, as ever, with no panel at its right side", () => {
    expect(right(renderToString(<NetworkToasts onOpen={() => {}} />))).toBe("12");
    expect(right(renderToString(<CornerBox right={cornerRight(0)} />))).toBe("12");
  });

  it("sit left of a panel standing at the window's right side, by the same distance", () => {
    expect(right(renderToString(<CornerBox right={cornerRight(360)} />))).toBe("372");
    expect(right(renderToString(<CornerBox right={cornerRight(512.5, 1280)} />))).toBe("524.5");
  });
});
