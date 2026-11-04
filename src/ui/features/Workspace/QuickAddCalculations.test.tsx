import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import QuickAddCalculations from "./QuickAddCalculations";
import type { QuickGroup } from "./workflow/offered";

// Drawn by the server's renderer, as Quick Add is (./QuickAdd.test.tsx): who does steps, and the steps of the one open.

const none = () => {};

const STEPS: QuickGroup[] = [
  { by: "xtb", name: "xTB", steps: [{ kind: "optimise", name: "Optimise", icon: "curve" }] },
  {
    by: "meno",
    name: "Meno",
    steps: [
      { kind: "render", name: "Render", icon: "picture" },
      { kind: "energy", name: "Energy", icon: "level" },
      { kind: "as-conformers", name: "As conformers", icon: "grouped" },
    ],
  },
];

function drawn(procedures: { id: string; name: string; needs: string[] }[] = []) {
  const html = renderToString(<QuickAddCalculations steps={STEPS} procedures={procedures} width={260} shown onStep={none} />);
  const heads = [...html.matchAll(/<button[^>]*aria-expanded="(true|false)"[^>]*>(.*?)<\/button>/g)].map((m) => ({
    name: m[2].match(/title="([^"]+)"/)?.[1],
    count: +(m[2].match(/>(\d+)<\/span>/)?.[1] ?? NaN),
    open: m[1] === "true",
  }));
  return { html, heads };
}

describe("Quick Add's calculations", () => {
  it("list Meno's own first, then each plugin, then the procedures saved - each with how many it offers; Meno open the first time", () => {
    const { heads } = drawn([{ id: "p", name: "Screen", needs: [] }]);
    expect(heads).toEqual([
      { name: "Meno", count: 3, open: true },
      { name: "xTB", count: 1, open: false },
      { name: "Procedures", count: 1, open: false },
    ]);
  });

  it("put the steps of the one open in their families, in order, each family apart by a thin rule", () => {
    const { html } = drawn();
    const meno = html.slice(html.indexOf('aria-label="Meno"'), html.indexOf('aria-label="xTB"'));
    const order = [...meno.matchAll(/aria-label="([^"]+) · Meno"|role="separator"/g)].map((m) => m[1] ?? "|");
    expect(order).toEqual(["As conformers", "|", "Energy", "|", "Render"]);
  });
});
