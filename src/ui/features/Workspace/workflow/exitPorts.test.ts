import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { emptyWorkspaceDocument } from "../document";
import { resultOf } from "./flow";
import { exitPlace, exitsOf, inputsOf, KINDS } from "./kinds";
import { CARD_H, CARD_W, portDown, setTakes, stepGives, stepTakes } from "./look";
import { addStep } from "./model";

describe("a step's exits' ports (docs/WORKFLOWS.md, *Exit ports*)", () => {
  it("stand down the card's right edge, each as far down as the input of its place on the left, all on the card shut - for every kind", () => {
    const s = { x: 120, y: -40 };
    for (const { kind } of KINDS) {
      const exits = exitsOf(kind);
      exits.forEach((x, k) => {
        const p = stepGives(s, exitPlace(kind, x.id));
        expect(p).toEqual({ x: s.x + CARD_W, y: stepTakes(s, k).y });
        expect(p.y).toBeGreaterThan(s.y - CARD_H);
        expect(p.y).toBeLessThan(s.y);
      });
      // (no more of them than a card shut has room for, as inputs)
      expect(Math.max(exits.length, inputsOf(kind).length)).toBeLessThanOrEqual(3);
    }
  });

  it("are placed by an exit's place among its kind's - the first's for one the kind has not", () => {
    expect(exitsOf("atom-map").map((x) => exitPlace("atom-map", x.id))).toEqual([0, 1, 2]);
    expect(exitPlace("optimise", "failed")).toBe(1);
    expect(exitPlace("optimise", "no-such-exit")).toBe(0);
    expect(stepGives({ x: 0, y: 0 })).toEqual(stepGives({ x: 0, y: 0 }, 0));
    expect(stepGives({ x: 0, y: 0 }, 1).y - stepGives({ x: 0, y: 0 }, 0).y).toBe(portDown(0) - portDown(1));
  });

  it("are where each exit's set's line leaves: a step put down has its second exit's set below its first, each line from its own port, level or going down", () => {
    const doc = addStep(emptyWorkspaceDocument(), "optimise", 0, 0);
    const s = doc.steps![0];
    const first = resultOf(doc, s.id, exitsOf("optimise")[0].id)!;
    const failed = resultOf(doc, s.id, "failed")!;
    expect(failed.y1).toBeLessThan(first.y0);
    // (each line from its own port to its set's left side: the second's lower down than the first's, as its set is)
    const from = [stepGives(s, exitPlace(s.kind, first.made!.exit)), stepGives(s, exitPlace(s.kind, failed.made!.exit))];
    expect(from[1].y).toBeLessThan(from[0].y);
    expect(setTakes(failed).y).toBeLessThanOrEqual(from[1].y);
  });

  it("are drawn on the ports layer, one for each exit with a set, its set's - a wire drawn out of it drawn out of that set, from the card", () => {
    const layer = readFileSync(join(__dirname, "../components/Workflow2D.tsx"), "utf8");
    expect(layer).toMatch(/exits\.map\(\(x, k\) =>[\s\S]*data-give-set[\s\S]*drawFrom\(e, \{ set: b\.id \}\)[\s\S]*left: CARD_W \/ PX, top: portDown\(k\) \/ PX/);
  });
});
