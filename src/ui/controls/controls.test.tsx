import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import Checkbox from "./Checkbox";
import { nextChoice, nextLit } from "./keys";
import RadioGroup from "./Radio";
import Select from "./Select";

// Vitest runs in Node, with no page to mount on: the controls as the server's
// renderer writes them, as they first show, and the keys' moves on their own.

const LOOKS = [
  { value: "sticks", label: "Sticks" },
  { value: "balls", label: "Balls and sticks" },
  { value: "space", label: "Space-filling" },
  { value: "studio", label: "Studio" },
];

describe("the keys in an open list (Select)", () => {
  it("go a row up or down, held at the ends, and to the first or last", () => {
    const labels = LOOKS.map((o) => o.label);
    expect(nextLit("ArrowDown", 0, labels)).toBe(1);
    expect(nextLit("ArrowDown", 3, labels)).toBe(3);
    expect(nextLit("ArrowUp", 0, labels)).toBe(0);
    expect(nextLit("End", 1, labels)).toBe(3);
    expect(nextLit("Home", 2, labels)).toBe(0);
  });

  it("go by a letter to the next name it begins, round from the start, and nowhere for another key", () => {
    const labels = LOOKS.map((o) => o.label);
    expect(nextLit("s", 0, labels)).toBe(2);
    expect(nextLit("S", 2, labels)).toBe(3);
    expect(nextLit("s", 3, labels)).toBe(0);
    expect(nextLit("x", 1, labels)).toBe(null);
    expect(nextLit("Shift", 1, labels)).toBe(null);
    expect(nextLit("ArrowDown", 0, [])).toBe(null);
  });
});

describe("the arrows in a radio group", () => {
  it("go to the next or the one before, round from the ends", () => {
    expect(nextChoice("ArrowDown", 2, 3)).toBe(0);
    expect(nextChoice("ArrowRight", 0, 3)).toBe(1);
    expect(nextChoice("ArrowUp", 0, 3)).toBe(2);
    expect(nextChoice("End", 0, 3)).toBe(2);
    expect(nextChoice("Enter", 0, 3)).toBe(null);
  });
});

describe("Meno's own controls, as they first show", () => {
  it("a Select: a button showing the choice, its list not open", () => {
    const html = renderToString(<Select label="Look" value="balls" options={LOOKS} onChange={() => {}} />);
    expect(html).toContain('aria-haspopup="listbox"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-label="Look"');
    expect(html).toContain("Balls and sticks");
    expect(html).not.toContain("Space-filling");
    expect(html).not.toContain("<select");
  });

  it("a Select with nothing chosen: what it says instead, quieter", () => {
    const html = renderToString(<Select label="Carboxyl O4, O5" value={null} placeholder="Choose…" options={LOOKS} onChange={() => {}} />);
    expect(html).toMatch(/<span class="[^"]*text-gh-gray[^"]*">Choose…<\/span>/);
  });

  it("a radio group: the chosen one checked and the group's one stop of Tab, drawn in Meno's colour", () => {
    const html = renderToString(<RadioGroup label="Shape" value="balls" options={LOOKS.slice(0, 3)} onChange={() => {}} />);
    expect(html).toContain('role="radiogroup"');
    expect(html.match(/role="radio"/g)).toHaveLength(3);
    expect(html.match(/aria-checked="true"/g)).toHaveLength(1);
    expect(html.match(/tabindex="0"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-checked="true" tabindex="0"/);
    expect(html).toContain("border-accel-base");
    expect(html).not.toContain('type="radio"');
  });

  it("a radio group with nothing chosen: its first the stop of Tab", () => {
    const html = renderToString(<RadioGroup label="Shape" value={"none" as string} options={LOOKS.slice(0, 2)} onChange={() => {}} />);
    expect(html.match(/tabindex="0"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-checked="false" tabindex="0"[^>]*>.*Sticks/);
  });

  it("a checkbox: on in Meno's colour, or in the colour of attention where it accepts a warning; off, white", () => {
    const on = renderToString(<Checkbox checked onChange={() => {}}>Show these atoms as the label here</Checkbox>);
    expect(on).toContain('role="checkbox"');
    expect(on).toContain('aria-checked="true"');
    expect(on).toContain("bg-accel-base");
    expect(renderToString(<Checkbox checked tone="attention" onChange={() => {}} label="I understand" />)).toContain("bg-accel-accent");
    const off = renderToString(<Checkbox checked={false} onChange={() => {}} label="Place it" />);
    expect(off).toContain('aria-checked="false"');
    expect(off).toContain('aria-label="Place it"');
    expect(off).not.toContain("bg-accel-base");
    expect(off).not.toContain('type="checkbox"');
  });
});
