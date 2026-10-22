import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { PORTS_Z } from "./look";

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

  it("are drawn on their own layer, not in a set's frame or a step's card, under the chips", () => {
    const frame = readFileSync(join(__dirname, "SetFrame.tsx"), "utf8");
    const card = readFileSync(join(__dirname, "StepCard.tsx"), "utf8");
    expect(frame).not.toContain("data-give-set");
    expect(card).not.toContain("data-take");
    expect(readFileSync(join(__dirname, "../components/Workflow2D.tsx"), "utf8")).toMatch(/zIndexRange=\{\[PORTS_Z, PORTS_Z\]\}[\s\S]*data-give-set[\s\S]*data-take/);
  });
});
