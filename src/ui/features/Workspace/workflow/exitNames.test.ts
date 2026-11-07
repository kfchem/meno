import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { COLORS } from "../../../theme/colors";
import { DURATION } from "../../../theme/motion";
import { exitNames, EXIT_NAME_OUT, EXIT_NAME_PX } from "./exitNames";
import { exitsOf } from "./kinds";
import { CARD_W, GAP, PORT_STEP, portDown, PX } from "./look";

describe("an exit's name beside its port (docs/WORKFLOWS.md, *Exit names*)", () => {
  // (an Atom map - three exits - and an Optimise - two - and a Number - one)
  const steps = [
    { id: 1, x: 0, y: 0, kind: "atom-map" as const },
    { id: 2, x: 20, y: -10, kind: "optimise" as const },
    { id: 3, x: 40, y: 0, kind: "number" as const },
  ];

  it("names each exit whose set is on no page beside it, where its step has more than one - one on the page is named by its frame", () => {
    const named = exitNames(steps, (step, exit) => !(step === 1 && exit === "rest"));
    expect(named.map((t) => t.key)).toEqual(["exit:1:out", "exit:1:changes", "exit:2:out", "exit:2:failed"]);
    expect(named.map((t) => t.text)).toEqual([...exitsOf("atom-map").filter((x) => x.id !== "rest"), ...exitsOf("optimise")].map((x) => x.name));
    // (a step of one exit names none, whatever its set)
    expect(exitNames([steps[2]], () => true)).toEqual([]);
  });

  it("stands outside the card's right side, half a port's step above its port, in the quiet words an input's name is in - the first cut short of where its frame would stand", () => {
    const [first, second] = exitNames([steps[1]], () => true);
    expect([first.x, first.y, second.y]).toEqual([20 + CARD_W + EXIT_NAME_OUT * PX, -10 - portDown(0) + PORT_STEP / 2, -10 - portDown(1) + PORT_STEP / 2]);
    expect([first.anchor, first.baseline, first.sizePx, first.color, EXIT_NAME_PX]).toEqual(["start", "middle", 10, COLORS.quiet, 10]);
    expect(first.maxWidthPx).toBe(GAP / PX - 2 * EXIT_NAME_OUT);
    expect(second.maxWidthPx).toBeUndefined();
  });

  it("is drawn by WebGL, as the page's words are, from the sets on the page (Workflow2D)", () => {
    const layer = readFileSync(join(__dirname, "../components/Workflow2D.tsx"), "utf8");
    expect(layer).toMatch(/exitNames\(steps, \(step, exit\) => \{\s*const b = exitSets\.get\(`\$\{step\}:\$\{exit\}`\);\s*return !!b && !shown\.has\(b\.id\);/);
    expect(layer).toMatch(/<PagePlaced>\s*<ExitNames items=\{names\} \/>\s*<\/PagePlaced>/);
    expect(layer).toMatch(/usePlaced\(anchor \? \{ key: "exit-names", anchor, words: true, control: true,/);
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
