import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import Switch from "./Switch";

// Vitest runs in Node, with no page to mount on: the switch as the server's
// renderer writes it.

describe("Meno's own switch", () => {
  it("on in Meno's colour; in the colour of attention only where asked; off, grey; its knob over to the side it is", () => {
    const on = renderToString(<Switch on label="Read labels as they are meant" onChange={() => {}} />);
    expect(on).toContain('role="switch"');
    expect(on).toContain('aria-checked="true"');
    expect(on).toContain('aria-label="Read labels as they are meant"');
    expect(on).toContain("bg-accel-base");
    expect(on).toContain("left-[1.375rem]");
    expect(renderToString(<Switch on tone="attention" label="Work offline" onChange={() => {}} />)).toContain("bg-accel-accent");
    const off = renderToString(<Switch on={false} tone="attention" label="Work offline" onChange={() => {}} />);
    expect(off).toContain('aria-checked="false"');
    expect(off).toContain("bg-gh-line");
    expect(off).not.toContain("bg-accel-accent");
    expect(off).toContain("left-0.5");
  });
});
