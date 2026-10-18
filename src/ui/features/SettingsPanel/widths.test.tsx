import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import SettingsPanel from "./SettingsPanel";
import type { SettingsSection } from "./section";
import { COLUMN_WIDTH, PROSE_WIDTH, SECTION_WIDTH } from "./widths";

// (the section shown, as the test asks: the server's renderer reads a store as it began, so the store is stood in for)
const shown = vi.hoisted(() => ({ section: "general" as string }));
vi.mock("./section", async (actual) => {
  const real = await actual<typeof import("./section")>();
  const hook = Object.assign(<T,>(pick: (s: { section: string }) => T) => pick(shown), { setState: () => {}, getState: () => shown });
  return { ...real, useSettingsSection: hook };
});

// Vitest runs in Node, with no page to mount on: the server's renderer
// draws each section, and its widths are read off that.

const NAMES: Record<SettingsSection, string> = {
  general: "General",
  style: "Drawing style",
  style3d: "Molecules in 3D",
  chemistry: "Chemistry",
  files: "Files",
  calculations: "Calculations",
  plugins: "Plugins",
  abbreviations: "Dictionary",
  network: "Network",
};
const SECTIONS = Object.keys(NAMES) as SettingsSection[];

/** The section `id` of Settings, drawn. */
function drawn(id: SettingsSection): string {
  shown.section = id;
  const html = renderToString(<SettingsPanel />);
  expect(html, id).toMatch(new RegExp(`role="tab" aria-selected="true"[^>]*>${NAMES[id]}<`));
  return html;
}

/** Each block's classes, as drawn: what lays a section out (a control - a button, a field, a menu - keeps its own size, as words beside one do). */
const classesOf = (html: string) => [...html.matchAll(/<(div|section|p|ul|ol|form)\b[^>]*?class="([^"]*)"/g)].map((m) => m[2].split(/\s+/));

describe("Settings' widths", () => {
  it("are one width for every section, and one measure for every explanatory word in it", () => {
    for (const id of SECTIONS) {
      const html = drawn(id);
      const classes = classesOf(html);
      // (the section itself: the one width)
      expect(html, id).toMatch(new RegExp(`<section class="mt-6 ${SECTION_WIDTH}"`));
      // (no other limit on a width but the measure, the page's own and a thing's room in its row)
      const limits = new Set(classes.flat().filter((c) => c.startsWith("max-w-")));
      for (const l of limits) expect([COLUMN_WIDTH, SECTION_WIDTH, PROSE_WIDTH, "max-w-full", "max-w-[10rem]"], `${id}: ${l}`).toContain(l);
      // (a card - bordered, rounded - never narrower or wider than the section on its own)
      for (const c of classes.filter((cs) => cs.includes("rounded-lg") && cs.includes("border"))) {
        expect(c.filter((x) => /^(max-)?w-(\d|\[|xs|sm|md|lg|xl|fit|max)/.test(x)), `${id}: ${c.join(" ")}`).toEqual([]);
      }
      // (a setting's account of itself, under its name: at the measure)
      for (const c of classes.filter((cs) => cs.includes("text-xs") && cs.includes("text-gh-gray") && (cs.includes("mt-0.5") || cs.includes("mt-1")) && !cs.includes("text-center"))) {
        expect(c, `${id}: ${c.join(" ")}`).toContain(PROSE_WIDTH);
      }
      // (a section's own account of itself: at the same measure)
      for (const c of classes.filter((cs) => cs.includes("text-sm") && cs.includes("text-gh-gray") && cs.includes("mt-1"))) {
        expect(c, `${id}: ${c.join(" ")}`).toContain(PROSE_WIDTH);
      }
    }
  });

  it("lay the tabs and every section out as one column, centred with equal margins in a wide window and padded in a narrow one", () => {
    // (the column: as wide as a section and the padding either side - 64rem and 1.5rem each, max-w-5xl and px-6 - and no wider)
    expect(SECTION_WIDTH).toBe("max-w-5xl");
    expect(Number(/max-w-\[(\d+(?:\.\d+)?)rem\]/.exec(COLUMN_WIDTH)?.[1])).toBe(64 + 2 * 1.5);
    for (const id of SECTIONS) {
      const html = drawn(id);
      // (centred: margins left and right alike; narrow, the padding either side and the window's width - nothing set wider)
      const column = new RegExp(`<div class="${COLUMN_WIDTH.replace(/[[\]]/g, "\\$&")} mx-auto px-6 py-6">(.*)</div></div>$`).exec(html);
      expect(column, id).not.toBeNull();
      const inside = column![1];
      // (the tabs first in it and the section after, neither moved off its left edge nor given a width of its own but the section's)
      const row = /^<div class="([^"]*)"><h1/.exec(inside);
      expect(row, id).not.toBeNull();
      expect(row![1].split(/\s+/).filter((c) => /^(m[lrx]?|p[lrx]?)-|^(min-|max-)?w-/.test(c)), id).toEqual([]);
      expect(inside.indexOf('role="tablist"'), id).toBeLessThan(inside.indexOf(`<section class="mt-6 ${SECTION_WIDTH}"`));
    }
  });

  it("let the Dictionary's search and its cards run the section's width", () => {
    const html = drawn("abbreviations");
    expect(html).toMatch(/aria-label="Find a label"[^>]*class="[^"]*\bw-full\b/);
  });
});
