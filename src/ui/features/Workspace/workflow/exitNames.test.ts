import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { COLORS } from "../../../theme/colors";
import { DURATION } from "../../../theme/motion";
import { exitChip, exitNames, EXIT_CHIP_OUT, EXIT_NAME_OUT, EXIT_NAME_PX } from "./exitNames";
import { pagePx } from "../pageGl/units";
import { CARD_W, GAP, PORT_STEP, portDown, PX } from "./look";

describe("an exit's name beside its port (docs/WORKFLOWS.md, *Exit names*)", () => {
  // (an Atom map - three exits - and an Optimise - two - and a Number - one)
  const steps = [
    { id: 1, x: 0, y: 0, kind: "atom-map" as const },
    { id: 2, x: 20, y: -10, kind: "optimise" as const },
    { id: 3, x: 40, y: 0, kind: "number" as const },
  ];

  it("names each exit whose set is on no page beside it, where its step has more than one - one on the page is named by its frame", () => {
    // (each by the name its frame would have: here its step and exit, said)
    const named = exitNames(steps, (step, exit) => (step === 1 && exit === "rest" ? null : `${exit} of ${step}`));
    expect(named.map((t) => t.key)).toEqual(["exit:1:out", "exit:1:changes", "exit:2:out", "exit:2:failed"]);
    expect(named.map((t) => t.text)).toEqual(["out of 1", "changes of 1", "out of 2", "failed of 2"]);
    // (a step of one exit names none, whatever its set)
    expect(exitNames([steps[2]], () => "x")).toEqual([]);
  });

  it("stands outside the card's right side, half a port's step above its port, in the quiet words an input's name is in - the first cut short of where its frame would stand", () => {
    const [first, second] = exitNames([steps[1]], () => "x");
    expect([first.x, first.y, second.y]).toEqual([20 + CARD_W + EXIT_NAME_OUT * PX, -10 - portDown(0) + PORT_STEP / 2, -10 - portDown(1) + PORT_STEP / 2]);
    expect([first.anchor, first.baseline, first.sizePx, first.color, EXIT_NAME_PX]).toEqual(["start", "middle", 10, COLORS.quiet, 10]);
    expect(first.maxWidthPx).toBe(GAP / PX - 2 * EXIT_NAME_OUT);
    expect(second.maxWidthPx).toBeUndefined();
  });

  it("is drawn by WebGL, as the page's words are, from the sets on the page (Workflow2D)", () => {
    const layer = readFileSync(join(__dirname, "../components/Workflow2D.tsx"), "utf8");
    expect(layer).toMatch(/exitNames\([\s\S]*?\(step, exit\) => \{\s*const b = exitSets\.get\(`\$\{step\}:\$\{exit\}`\);\s*return b && !shown\.has\(b\.id\) \? setName\(b, steps\) : null;/);
    expect(layer).toMatch(/<PagePlaced>\s*<ExitNames items=\{names\} chip=\{chip\} \/>\s*<\/PagePlaced>/);
    expect(layer).toMatch(/usePlaced\(\s*anchor\s*\? \{\s*key: "exit-names",\s*anchor,\s*words: true,\s*control: true,/);
  });
});

describe("a step's result set folding into its exit's port, and out of it (docs/WORKFLOWS.md, *Held results*)", () => {
  const layer = readFileSync(join(__dirname, "../components/Workflow2D.tsx"), "utf8");
  const css = readFileSync(join(__dirname, "../../../../App.css"), "utf8");

  it("folds into the port as it is held - about the port, where it stands on the layer - and grows out of it as it is shown", () => {
    expect(layer).toMatch(/const p = exitGives\(b\);[\s\S]*?transformOrigin: `\$\{at\.left\}px \$\{at\.top\}px`/);
    expect(layer).toMatch(/const fold = set\?\.made && isHeld\(\{ sets, wires \}, set\) \? foldAbout\(set\) : undefined;/);
    expect(layer).toMatch(/className=\{fold \? "meno-fold-out" : "meno-fade-out"\} style=\{fold\}/);
    expect(layer).toMatch(/className=\{b\.made && growing\(b\.id\) \? "meno-fold-in" : undefined\} style=\{b\.made \? foldAbout\(b\) : undefined\}/);
  });

  it("takes Meno's base time with its ease, and is kept on the page as long", () => {
    const ms = DURATION.base * 1000;
    expect(css).toMatch(new RegExp(`\\.meno-fold-out \\{\\s*animation: meno-fold-out ${ms}ms var\\(--ease-meno\\) both;`));
    expect(css).toMatch(new RegExp(`\\.meno-fold-in \\{\\s*animation: meno-fold-in ${ms}ms var\\(--ease-meno\\) both;`));
    expect(layer).toMatch(/usePresence\(parts, \(el\) => String\(el\.key\), DURATION\.base \* 1000\)/);
    expect(layer).toMatch(/now - \(cameAt\.current\.get\(id\) \?\? -Infinity\) < DURATION\.base \* 1000/);
  });
});

describe("what a held exit's set holds, said beside its port as the pointer is on it (docs/WORKFLOWS.md, *Held results*)", () => {
  it("is its name and its count in a large set's words, in a chip out to the right of the port, level with it, taking no pointer", () => {
    const port = { x: 10, y: -2 };
    const chip = exitChip("exit-chip:7", "Failed", "3 molecules", port);
    expect(chip.texts.map((t) => t.text).join("")).toBe("Failed · 3 molecules");
    const box = chip.shapes[0] as { x0: number; x1: number; y0: number; y1: number };
    expect(box.x0).toBeCloseTo(port.x + pagePx(EXIT_CHIP_OUT));
    expect((box.y0 + box.y1) / 2).toBeCloseTo(port.y);
    expect(chip.regions).toEqual([]);
    // (whole, not let through: its port's wire runs under it)
    expect([(chip.shapes[0] as { opacity?: number }).opacity, (chip.shapes[0] as { fillAlpha?: number }).fillAlpha, ...chip.texts.map((t) => t.opacity)]).toEqual([1, 1, 1, 1]);
  });

  it("is told by the port, whatever draws it (store `exitPortHovered`), and said only for a held set that holds anything - its step's names gone meanwhile", () => {
    const layer = readFileSync(join(__dirname, "../components/Workflow2D.tsx"), "utf8");
    expect(layer).toMatch(/onHover=\{\(on\) => store\.getState\(\)\.exitPortHovered\(b\.id, on\)\}/);
    expect(layer).toMatch(/b\?\.made && \(b\.collection\?\.length \|\| b\.drawnCollection\?\.length\) && !onPage\.some\(\(x\) => x\.id === b\.id\) \? b : undefined/);
    expect(layer).toMatch(/steps\.filter\(\(s\) => s\.id !== saying\?\.made\?\.step\)/);
    expect(layer).toMatch(/exitChip\(`exit-chip:\$\{saying\.id\}`, info\.name, `\$\{info\.summary\.count\} \$\{info\.summary\.nouns\}`, p\)/);
  });
});
