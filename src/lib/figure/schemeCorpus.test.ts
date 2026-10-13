import { describe, expect, it } from "vitest";
import corpus from "./fixtures/schemes.json";
import { readScheme } from "./scheme";
import type { FigureDrawn } from "./drawn";

// Reaction schemes drawn many ways (scripts/figure/schemes.py), each as Meno's
// pdf_figure read it from the PDF, and what each should read as.
type Expect = {
  arrows?: Record<string, unknown>[];
  atoms?: number;
  pluses?: number;
  down?: boolean;
  left?: boolean;
  words?: { over?: string[]; under?: string[]; bold?: string[] };
  italic?: string[];
};
const cases = (corpus as unknown as { cases: { name: string; expect: Expect; drawn: FigureDrawn }[] }).cases;

describe("reaction schemes drawn many ways", () => {
  it.each(cases.map((c) => [c.name, c] as const))("reads %s as drawn", (_name, c) => {
    const s = readScheme(c.drawn);
    const e = c.expect;
    if (e.arrows) {
      const forms = s.arrows.map((a) => JSON.stringify({ ...a.form, ...(a.color ? { color: a.color } : {}) })).sort();
      expect(forms).toEqual(e.arrows.map((a) => JSON.stringify(a)).sort());
    }
    if (e.atoms != null) expect(s.figure.atoms).toHaveLength(e.atoms);
    if (e.pluses != null) expect(s.pluses).toHaveLength(e.pluses);
    if (e.down) expect(s.arrows[0].point.y).toBeGreaterThan(s.arrows[0].tail.y + 10);
    if (e.left) expect(s.arrows[0].point.x).toBeLessThan(s.arrows[0].tail.x - 10);
    const onArrow = s.words.filter((w) => w.arrow != null).map((w) => w.text);
    for (const t of [...(e.words?.over ?? []), ...(e.words?.under ?? [])]) expect(onArrow).toContain(t);
    for (const t of e.words?.bold ?? []) expect(s.words.find((w) => w.text === t)?.marks.some((m) => m.bold)).toBe(true);
    for (const t of e.italic ?? []) expect(s.words.find((w) => w.text === t)?.marks.some((m) => m.italic)).toBe(true);
  });
});
