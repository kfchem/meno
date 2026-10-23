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

/** How many places of each listed file each look rule finds, read as ESLint reads them. */
async function counted(): Promise<{ nativeControls: Record<string, number>; colourLiterals: Record<string, number> }> {
  const eslint = new ESLint({
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

describe("the look rules' files not yet in line (docs/LOOK.md, Not yet)", () => {
  it(
    "each have exactly the places listed - none more (a new one is refused), none fewer (brought in line, the count comes down with it)",
    async () => {
      const found = await counted();
      expect(found.nativeControls).toEqual(rules.notYet.nativeControls);
      expect(found.colourLiterals).toEqual(rules.notYet.colourLiterals);
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
