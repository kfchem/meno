import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import type { ChartValue } from "../../../../lib/chart";
import type { DiagramValue } from "../../../../lib/energyDiagram";
import type { WorkflowSet } from "../store/types";
import SetFrame from "./SetFrame";

const none = () => {};
const frame = (set: WorkflowSet, compact: boolean) =>
  renderToString(<SetFrame set={set} name="Chart" count="3 points" hovered={false} chosen={false} compact={compact} onTabDown={none} onEdgeDown={none} onContextMenu={none} onHover={none} />);

const chart: ChartValue = {
  kind: "points",
  x: { name: "number", unit: "none" },
  y: { name: "energy", unit: "kcal/mol" },
  points: [
    { x: 1, y: 0, row: 0 },
    { x: 2, y: 1.5, row: 1 },
    { x: 3, y: 0.4, row: 2 },
  ],
  left: [],
};
const diagram: DiagramValue = {
  kind: "diagram",
  axis: { name: "ΔE", unit: "kcal/mol" },
  reference: "R",
  levels: [
    { name: "R", value: 0, lowestOf: 1, lowest: { row: 0 } },
    { name: "TS", value: 47.1, lowestOf: 1, lowest: { row: 1 } },
    { name: "P", value: 15, lowestOf: 1, lowest: { row: 2 } },
  ],
  links: [
    [0, 1],
    [1, 2],
  ],
  left: [],
};
const set = (c: ChartValue | DiagramValue): WorkflowSet => ({ id: 1, x0: 0, x1: 12, y0: 0, y1: 9, chart: c });

describe("a set holding a chart, at a zoom too small to read its words", () => {
  it("still draws its points and axes - never an empty frame - and leaves out its words alone", () => {
    for (const [c, mark] of [
      [chart, /<circle/g],
      [diagram, /stroke-gh-black/g],
    ] as const) {
      const near = frame(set(c), false);
      const far = frame(set(c), true);
      // (what it draws, the same at both: three points, or three levels' bars)
      expect([near.match(mark)?.length, far.match(mark)?.length]).toEqual([3, 3]);
      // (its body shown, faded with the zoom at neither; its words, each, faded with the zoom - utils/pageScale `wordsShown` - by the page,
      //  not left out at once)
      const body = (html: string) => html.match(/class="absolute overflow-hidden[^"]*"/)![0];
      expect([body(near).includes("meno-words"), body(far).includes("meno-words")]).toEqual([false, false]);
      expect([near.includes("meno-words-each"), far.includes("meno-words-each")]).toEqual([true, true]);
      expect(far).not.toContain("opacity-0");
    }
  });

  it("draws its axes and ticks in its numbers' grey, a screen pixel wide at least - never a frame's faint line", () => {
    for (const c of [chart, diagram]) {
      const svg = frame(set(c), true).match(/<svg[\s\S]*<\/svg>/)![0];
      expect(svg).not.toContain("stroke-gh-line");
      // (the plot's box or the axis, and each tick: three ticks at least, all as wide)
      expect(svg.match(/stroke-width:max\(1px, var\(--hair, 1px\)\)/g)!.length).toBeGreaterThanOrEqual(4);
    }
  });

  it("leaves a table out whole, as before: its words are all it is", () => {
    const table = { columns: [{ name: "x", kind: "number" as const, unit: "none" as const }], rows: [[1]], unread: [], left: [] };
    const far = frame({ id: 1, x0: 0, x1: 12, y0: 0, y1: 9, table }, true);
    expect(far.match(/class="[^"]*absolute overflow-hidden[^"]*"/)![0]).toContain("meno-words");
  });
});
