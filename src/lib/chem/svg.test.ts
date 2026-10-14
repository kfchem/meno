import { describe, expect, it } from "vitest";
import {
  createSVG,
  fontStack,
  layoutMolecule,
  placeLabel,
  type Atom,
  type Bond,
  type Layout,
  type MeasureMark,
} from "./layout2d";
import { acsWorldOptions, NOMINAL_BOND_LENGTH } from "./acs";
import { ACS_1996, layoutOptionsFor } from "./style";
import { arrowSampleSvg } from "./styleSamples";

const atoms: Atom[] = [
  { id: 1, x: 0, y: 0, el: "C" },
  { id: 2, x: 1.5, y: 0, el: "C" },
  { id: 3, x: 2.3, y: 1.3, el: "N" },
];
const bonds: Bond[] = [
  { a1: 0, a2: 1, order: 1, stereo: "up" },
  { a1: 1, a2: 2, order: 1, stereo: "none" },
];

const opts = (over = {}) =>
  acsWorldOptions(atoms, bonds, { units: "world", ...over });

const numbers = (svg: string, attr: string) =>
  [...svg.matchAll(new RegExp(`${attr}="([-\\d.e]+)"`, "g"))].map((m) =>
    Number(m[1]),
  );

describe("createSVG", () => {
  // the canvas converts the layout's pixel sizes with the zoom it drew at;
  // the SVG has to land on the same numbers or the two drift apart
  it("writes sizes in the coordinates the drawing is in", () => {
    const o = opts();
    const zoom = 60;
    const layout = layoutMolecule(atoms, bonds, o, zoom);
    const svg = createSVG(layout, o);
    const expected = layout.lines.map((l) => l.widthPx / zoom);
    expect(numbers(svg, "stroke-width").sort()).toEqual(
      [...new Set(expected)].sort(),
    );
    // and nothing is pinned to the screen, so it scales as one drawing
    expect(svg).not.toContain("non-scaling-stroke");
  });

  it("keeps a bond the same width in the drawing at any zoom", () => {
    // world sizes do not depend on the zoom, so neither may the SVG's; only
    // the padding does, being a margin in screen pixels
    const o = opts();
    for (const zoom of [30, 300]) {
      const svg = createSVG(layoutMolecule(atoms, bonds, o, zoom), o);
      expect(numbers(svg, "stroke-width")[0]).toBeCloseTo(o.lineWidthPx, 9);
    }
  });

  it("pads by the padding asked for, in pixels", () => {
    const o = opts();
    const zoom = 60;
    const layout = layoutMolecule(atoms, bonds, o, zoom);
    const box = /viewBox="([-\d.e ]+)"/
      .exec(createSVG(layout, o))![1]
      .split(" ")
      .map(Number);
    const pad = o.paddingPx / zoom;
    expect(box[0]).toBeCloseTo(layout.bounds.min.x - pad, 9);
    expect(box[2]).toBeCloseTo(
      layout.bounds.max.x - layout.bounds.min.x + pad * 2,
      9,
    );
  });

  it("says how big it was meant to be drawn", () => {
    const o = opts();
    const zoom = 60;
    const svg = createSVG(layoutMolecule(atoms, bonds, o, zoom), o);
    const box = /viewBox="([-\d.e ]+)"/.exec(svg)![1].split(" ").map(Number);
    expect(Number(/width="([\d.e]+)"/.exec(svg)![1])).toBeCloseTo(
      box[2] * zoom,
      6,
    );
  });

  it("names, after a typeface, the nearest most readers have - IBM Plex Sans, which Meno carries, Arial or Helvetica", () => {
    expect(fontStack("IBM Plex Sans")).toBe("'IBM Plex Sans', Arial, Helvetica, 'IBM Plex Sans JP', sans-serif");
    expect(fontStack("Arial")).toBe("Arial, Helvetica, 'IBM Plex Sans JP', sans-serif");
    expect(fontStack("Helvetica")).toBe("Helvetica, Arial, 'IBM Plex Sans JP', sans-serif");
    const o = opts({ fontFamily: "IBM Plex Sans", labelSet: { ...opts().labelSet, fontFamily: "IBM Plex Sans" } });
    const svg = createSVG(layoutMolecule(atoms, bonds, o, 60), o);
    expect(svg).toContain(`font-family="'IBM Plex Sans', Arial, Helvetica, 'IBM Plex Sans JP', sans-serif"`);
  });

  it("sets a label as the canvas does: in Arial, run by run, on its baseline", () => {
    const o = opts();
    const layout = layoutMolecule(atoms, bonds, o, 60);
    const svg = createSVG(layout, o);
    const label = layout.texts.find((t) => t.text.startsWith("N"))!;
    // the count is a subscript, so it is its own smaller piece
    expect(label.runs?.some((r) => r.sub)).toBe(true);
    const runs = placeLabel(label, o.fontPx);
    const texts = [
      ...svg.matchAll(
        /<text x="([-\d.e]+)" y="([-\d.e]+)" font-family="([^"]*)" font-size="([-\d.e]+)"[^>]*>([^<]*)</g,
      ),
    ];
    expect(texts.map((m) => m[5])).toEqual(runs.map((r) => r.text));
    texts.forEach((m, i) => {
      expect(Number(m[1])).toBeCloseTo(runs[i].x, 9);
      // SVG's y runs down
      expect(Number(m[2])).toBeCloseTo(-runs[i].y, 9);
      expect(m[3].startsWith("Arial")).toBe(true);
      expect(Number(m[4])).toBeCloseTo(runs[i].size, 9);
    });
  });
});

describe("the drawing's bounds", () => {
  it("take in what the bonds draw past their atoms, so an export does not clip it", () => {
    // a lone triple bond: its outer lines lie a spacing either side of the atoms
    const a: Atom[] = [
      { id: 1, x: 0, y: 0, el: "C" },
      { id: 2, x: 1.8, y: 0, el: "C" },
    ];
    const triple: Bond[] = [{ a1: 0, a2: 1, order: 3 }];
    const o = acsWorldOptions(a, triple, { units: "world", paddingPx: 0 });
    const layout = layoutMolecule(a, triple, o, 60);
    const outer = Math.max(...layout.lines.map((l) => Math.abs(l.y1)));
    expect(outer).toBeGreaterThan(0.3);
    const reach = outer + o.lineWidthPx / 2;
    expect(layout.bounds.max.y).toBeCloseTo(reach, 9);
    expect(layout.bounds.min.y).toBeCloseTo(-reach, 9);
    // and a wedge's broad end
    const wedge: Bond[] = [{ a1: 0, a2: 1, order: 1, stereo: "up" }];
    const w = layoutMolecule(a, wedge, o, 60);
    expect(w.bounds.max.y).toBeGreaterThanOrEqual(o.wedgeWidthPx / 2 - 1e-9);
  });
});

/** The elements an SVG is written with. */
const SVG_ELEMENTS: ReadonlySet<string> = new Set(["svg", "defs", "radialGradient", "stop", "path", "line", "circle", "ellipse", "rect", "text", "image"]);

/**
 * What keeps `xml` from being a well-formed document of `elements` alone -
 * nothing, where it is one: a character XML cannot hold, an & that is no
 * reference, a tag that does not read (an attribute unquoted, a < in a
 * value) or is not closed in order, an element or an event handler the
 * writer never writes.
 */
function xmlProblems(xml: string, elements: ReadonlySet<string>): string[] {
  const problems: string[] = [];
  if (/[^\t\n\r\u{20}-\u{D7FF}\u{E000}-\u{FFFD}\u{10000}-\u{10FFFF}]/u.test(xml)) problems.push("a character XML cannot hold");
  if (xml.replace(/&(?:amp|lt|gt|quot|apos|#[0-9]+|#x[0-9a-fA-F]+);/g, "").includes("&")) problems.push("an & that is no reference");
  const token = /<(\/?)([A-Za-z][\w:-]*)((?:\s+[\w:-]+="[^"<]*")*)\s*(\/?)>|[^<]+/y;
  const open: string[] = [];
  let roots = 0;
  while (token.lastIndex < xml.length) {
    const at = token.lastIndex;
    const m = token.exec(xml);
    if (!m) {
      problems.push(`markup that does not read: ${xml.slice(at, at + 40)}`);
      break;
    }
    const [, closing, name, attributes = "", empty] = m;
    if (!name) {
      if (!open.length) problems.push("text outside the root");
      continue;
    }
    if (!elements.has(name)) problems.push(`a <${name}>`);
    const names = [...attributes.matchAll(/\s+([\w:-]+)="/g)].map((a) => a[1]);
    if (new Set(names).size !== names.length) problems.push(`an attribute twice in a <${name}>`);
    if (names.some((n) => /^on/i.test(n))) problems.push(`an event handler on a <${name}>`);
    if (closing) {
      if (names.length || empty) problems.push(`</${name}> with more in it`);
      if (open.pop() !== name) problems.push(`</${name}> closing what is not open`);
    } else {
      if (!open.length) roots++;
      if (!empty) open.push(name);
    }
  }
  if (open.length) problems.push(`<${open[open.length - 1]}> left open`);
  if (roots !== 1) problems.push(`${roots} roots`);
  return problems;
}

/** An attribute's value as a reader takes it back. */
const unescaped = (value: string) =>
  value.replace(/&(amp|lt|gt|quot|apos);/g, (_, n: string) => ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" })[n]!);

/** A value that would close the attribute it is written into, then its tag, and add its own. */
const HOSTILE = `x" onload="alert(1)"/><script>alert(2)</script><text a='\\&amp;`;

const measure: MeasureMark = {
  lines: [[{ x: 0, y: 0 }, { x: 1, y: 0 }]],
  width: 0.05,
  fan: [[{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }]],
  fanOpacity: 0.2,
  label: { x: 0.5, y: 0.5 },
  text: "1.50 Å",
  size: 0.4,
  color: "#336699",
};

describe("an SVG of what a document gives it", () => {
  it("writes every value into its attribute escaped - a typeface's name, a colour, an image - so nothing is added to the markup", () => {
    // as a file's own style, or a typeface picked, might hold them, unchecked
    const style = { ...ACS_1996, fontFamily: HOSTILE, bondColor: HOSTILE, labelColor: HOSTILE };
    const o = layoutOptionsFor(style, NOMINAL_BOND_LENGTH);
    const layout: Layout = {
      ...layoutMolecule(atoms, bonds, o, 60),
      measures: [{ ...measure, text: `1.50 Å <b>"&"</b>`, color: HOSTILE }],
      solids: [
        { kind: "ball", c: { x: 0, y: 0 }, r: 0.3, color: HOSTILE },
        { kind: "stick", a: { x: 0, y: 0 }, b: { x: 1, y: 0 }, width: 0.1, color: HOSTILE },
      ],
    };
    layout.texts.push({ x: 0, y: 2, text: "a", fontPx: o.fontPx, runs: [{ text: "a", color: HOSTILE }], color: HOSTILE });
    const marks = createSVG(layout, o);
    const image = createSVG({ ...layout, solidsImage: { href: HOSTILE, bounds: { min: { x: 0, y: 0 }, max: { x: 1, y: 1 } } } }, o);
    for (const svg of [marks, image, arrowSampleSvg(style)]) {
      expect(xmlProblems(svg, SVG_ELEMENTS)).toEqual([]);
      expect(svg).not.toContain("<script");
    }
    // and each reads back as it was given: the typeface's name in its stack
    const families = [...marks.matchAll(/font-family="([^"]*)"/g)].map((m) => unescaped(m[1]));
    expect(families.length).toBeGreaterThan(1);
    for (const f of families) expect(f).toBe(fontStack(HOSTILE));
    const colours = [...marks.matchAll(/ (?:fill|stroke|stop-color)="([^"]*)"/g)].map((m) => unescaped(m[1]));
    expect(colours).toContain(HOSTILE);
    expect(unescaped(/ href="([^"]*)"/.exec(image)![1])).toBe(HOSTILE);
    // (the measurement's value, as text)
    expect(marks).toContain(">1.50 Å &lt;b&gt;&quot;&amp;&quot;&lt;/b&gt;</text>");
  });

  it("quotes a typeface's name with an apostrophe in it as CSS reads it", () => {
    expect(fontStack("O'Neil Sans")).toBe(`'O\\'Neil Sans', 'IBM Plex Sans JP', sans-serif`);
  });

  it("draws what XML cannot hold - controls, a surrogate alone, U+FFFE and U+FFFF - as the replacement character, and keeps the rest", () => {
    // as words pasted from elsewhere bring them
    const pasted = "a\x00b\x01c\x0Bd\x0Ce\x1Bf\u{FFFE}g\u{FFFF}h\u{D83D}i\u{DE00}j\u{1F600}k\tl";
    const o = opts();
    const layout = layoutMolecule(atoms, bonds, o, 60);
    layout.texts.push({ x: 0, y: 2, text: pasted, fontPx: o.fontPx, runs: [{ text: pasted }] });
    const svg = createSVG(
      { ...layout, measures: [{ ...measure, text: pasted }] },
      { ...o, labelSet: { ...o.labelSet!, fontFamily: "Arial\x01Black" } },
    );
    expect(xmlProblems(svg, SVG_ELEMENTS)).toEqual([]);
    expect(svg).toContain(">a\u{FFFD}b\u{FFFD}c\u{FFFD}d\u{FFFD}e\u{FFFD}f\u{FFFD}g\u{FFFD}h\u{FFFD}i\u{FFFD}j\u{1F600}k\tl</text>");
    expect(svg).toContain(`font-family="'Arial\u{FFFD}Black', `);
  });
});
