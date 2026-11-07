import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { PORTS_Z, underCard } from "./look";

/** Every `zIndexRange={[a, b]}` laid over the page under `dir`, but the ports' own: its file and its greatest. */
function ranges(dir: string): { file: string; most: number }[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return ranges(path);
    if (!/\.tsx$/.test(name) || /\.test\./.test(name)) return [];
    const text = readFileSync(path, "utf8");
    return [...text.matchAll(/zIndexRange=\{\[([^\]]+)\]\}/g)]
      .filter((m) => !m[1].includes("PORTS_Z"))
      .map((m) => ({ file: name, most: Math.max(...m[1].split(",").map((v) => Number(v.trim())).filter(Number.isFinite)) }));
  });
}

describe("the workflow's ports", () => {
  it("lie over all else laid on the page - a molecule's chip, its card - so a port is pressed whatever lies over it", () => {
    const all = ranges(join(__dirname, ".."));
    expect(all.length).toBeGreaterThan(5);
    expect(all.filter((r) => r.most >= PORTS_Z)).toEqual([]);
  });

  it("are drawn by WebGL on a layer of their own, over the cards and the chips, not in a set's frame or a step's card", () => {
    const frame = readFileSync(join(__dirname, "SetFrame.tsx"), "utf8");
    const card = readFileSync(join(__dirname, "StepCard.tsx"), "utf8");
    expect(frame).not.toContain("Port");
    expect(card).not.toContain("data-take");
    const layer = readFileSync(join(__dirname, "../components/Workflow2D.tsx"), "utf8");
    expect(layer).toMatch(/<PageLayer shapes=\{portRings\}[^>]*order=\{PORTS_ORDER\}/);
    expect(layer).toMatch(/const PORTS_ORDER = PAGE_GL_ORDER \+ 4;/);
    // (a wire let go on one finds it by its shape, as the page's WebGL takes the pointer: no element under the pointer asked)
    expect(layer).toMatch(/hitAt\(\{ x: ev\.clientX, y: ev\.clientY \}, \(key\) => key\.startsWith\("port:"\)\)/);
  });

  it("are not drawn under a step's card opened over the rest - inside it, or half over its border - and are elsewhere", () => {
    const card = { x0: 0, x1: 8, y0: -10, y1: 0 };
    expect(underCard({ x: 4, y: -5 }, card, 0.2)).toBe(true);
    // (half over its right border, and its foot)
    expect(underCard({ x: 8.1, y: -5 }, card, 0.2)).toBe(true);
    expect(underCard({ x: 4, y: -10.1 }, card, 0.2)).toBe(true);
    // (clear of it, or no card open)
    expect(underCard({ x: 8.3, y: -5 }, card, 0.2)).toBe(false);
    expect(underCard({ x: 4, y: 0.3 }, card, 0.2)).toBe(false);
    expect(underCard({ x: 4, y: -5 }, null, 0.2)).toBe(false);
    // (and the layer asks it of every port it draws - sets', and steps' inputs and exits - the open step's own excepted)
    const layer = readFileSync(join(__dirname, "../components/Workflow2D.tsx"), "utf8");
    expect(layer.match(/!underOpened\(/g)).toHaveLength(4);
  });
});
