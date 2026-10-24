import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import tseslint from "typescript-eslint";
import { describe, expect, it } from "vitest";
import { measured } from "../../testing/timeouts";
import { colourCss } from "./colors";

type Rule = { selector: string; message: string };
type Rules = { nativeControls: Rule[]; colourLiterals: Rule[]; notYet: { nativeControls: Record<string, number>; colourLiterals: Record<string, number> } };

const root = fileURLToPath(new URL("../../../", import.meta.url));
const rules: Rules = JSON.parse(readFileSync(new URL("./lookRules.json", import.meta.url), "utf8"));

/** The look rules alone, as ESLint reads them. */
function lookLint(): ESLint {
  return new ESLint({
    cwd: root,
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ["**/*.{ts,tsx}"],
        languageOptions: { parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true } } },
        rules: { "no-restricted-syntax": ["error", ...rules.nativeControls, ...rules.colourLiterals] },
      },
    ],
  });
}

/** How many places of each listed file each look rule finds, read as ESLint reads them. */
async function counted(): Promise<{ nativeControls: Record<string, number>; colourLiterals: Record<string, number> }> {
  const eslint = lookLint();
  const files = [...new Set([...Object.keys(rules.notYet.nativeControls), ...Object.keys(rules.notYet.colourLiterals)])];
  const native = new Set(rules.nativeControls.map((r) => r.message));
  const out = { nativeControls: {} as Record<string, number>, colourLiterals: {} as Record<string, number> };
  for (const r of await eslint.lintFiles(files)) {
    const file = r.filePath.slice(root.length).split("\\").join("/");
    for (const m of r.messages) {
      if (m.ruleId !== "no-restricted-syntax") continue;
      const kind = native.has(m.message) ? out.nativeControls : out.colourLiterals;
      kind[file] = (kind[file] ?? 0) + 1;
    }
  }
  return out;
}

/** Each listed file's places past its count (refused), and those now fewer than it (its count to be lowered), in words. */
function againstCounts(found: Record<string, number>, listed: Record<string, number>): { over: string[]; under: string[] } {
  const over: string[] = [];
  const under: string[] = [];
  for (const [file, cap] of Object.entries(listed)) {
    const now = found[file] ?? 0;
    if (now > cap) over.push(`${file}: ${now} now, cap ${cap}: bring the new ones in line`);
    else if (now < cap) under.push(`${file}: ${now} now, cap ${cap}: lower the cap`);
  }
  return { over, under };
}

describe("the look rules' files not yet in line (docs/LOOK.md, Not yet)", () => {
  it(
    "each have no more places than listed: a new one is refused; fewer, and the count is to be lowered (said, not failed)",
    async () => {
      const found = await counted();
      const native = againstCounts(found.nativeControls, rules.notYet.nativeControls);
      const colour = againstCounts(found.colourLiterals, rules.notYet.colourLiterals);
      const under = [...native.under, ...colour.under];
      if (under.length) console.warn(`Look: lower these caps in src/ui/theme/lookRules.json:\n${under.join("\n")}`);
      expect([...native.over, ...colour.over]).toEqual([]);
    },
    measured(3_000),
  );

  it("counts a file's places against its cap: more is refused, fewer is said", () => {
    expect(againstCounts({ "a.tsx": 3, "b.tsx": 5 }, { "a.tsx": 5, "b.tsx": 4, "c.tsx": 1 })).toEqual({
      over: ["b.tsx: 5 now, cap 4: bring the new ones in line"],
      under: ["a.tsx: 3 now, cap 5: lower the cap", "c.tsx: 0 now, cap 1: lower the cap"],
    });
  });
});

describe("the look rules", () => {
  it(
    "refuse a control drawn by the browser or in place, and leave Meno's own",
    async () => {
      const [r] = await lookLint().lintText(
        ['const a = <select />;', 'const b = <input type="checkbox" />;', 'const c = <button role="switch" />;', 'const d = <Switch on label="x" onChange={() => {}} />;', 'const e = <input type="text" />;', 'const f = <input type="number" />;', 'const g = <input type={n ? "number" : "text"} />;', 'const h = <NumberField value={1} onChange={() => {}} />;'].join("\n"),
        { filePath: "src/ui/example.tsx" },
      );
      expect(r.messages.map((m) => [m.line, m.message.split(":")[0]])).toEqual([
        [1, "A native <select>"],
        [2, "A native radio or checkbox"],
        [3, "A switch drawn in place"],
        [6, "A native number field"],
        [7, "A native number field"],
      ]);
    },
    measured(3_000),
  );
});

describe("a colour made from data (colourCss)", () => {
  it("is written as CSS, its channels held to 0-255, its opacity said only where there is one", () => {
    expect(colourCss(30, 144, 255)).toBe("rgb(30 144 255)");
    expect(colourCss(300.4, -2, 12.6, 0.5)).toBe("rgb(255 0 13 / 0.5)");
  });
});
