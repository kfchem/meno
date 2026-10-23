import { readFileSync } from "node:fs";
import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

// How Meno looks (docs/LOOK.md): the interface draws Meno's own controls
// (src/ui/controls), never the browser's, and takes its colours from the
// tokens (src/App.css @theme, src/ui/theme/colors.ts), never as literals or
// Tailwind's default palette. What is refused, and the files written before
// the rule that do not keep to it yet - each with its count, which
// src/ui/theme/lookRules.test.ts keeps exact - are in lookRules.json.
const LOOK = JSON.parse(readFileSync(new URL("./src/ui/theme/lookRules.json", import.meta.url), "utf8"));
const NATIVE_CONTROLS = LOOK.nativeControls;
const COLOUR_LITERALS = LOOK.colourLiterals;
/** Files written before the look rules that still draw a native control. */
const NATIVE_CONTROLS_NOT_YET = Object.keys(LOOK.notYet.nativeControls);
/** Files written before the look rules that still write a colour out. */
const COLOUR_LITERALS_NOT_YET = Object.keys(LOOK.notYet.colourLiterals);

export default tseslint.config(
  { ignores: ["dist", "src-tauri"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      // The rules of hooks, as before. Version 7's recommended set adds the
      // React Compiler's rules - no refs read or written while rendering,
      // and the like - which the canvas's three.js parts break on purpose;
      // they are for when Meno takes up the compiler, not before.
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      "@typescript-eslint/no-explicit-any": "off",
      // This codebase consistently uses `catch {}` to intentionally swallow
      // best-effort/parsing errors (file import, canvas setup, etc).
      "no-empty": ["error", { allowEmptyCatch: true }],
      // `cond && fn()` / `cond ? a() : b()` are used intentionally for their
      // side effects throughout the Workspace interaction code.
      "@typescript-eslint/no-unused-expressions": [
        "error",
        { allowShortCircuit: true, allowTernary: true },
      ],
      // `const { [id]: _, ...rest } = obj` is used to drop a key immutably;
      // the leading-underscore name marks it as intentionally unused.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { varsIgnorePattern: "^_", argsIgnorePattern: "^_" },
      ],
    },
  }
,
  ...lookRules()
);

/**
 * The look rules as blocks of the config (a later block's no-restricted-syntax
 * takes the place of an earlier one's for the same file, so each file gets one
 * block): both rules for the interface; the colour rule alone for Meno's own
 * controls and for the files that still draw a native control; the control
 * rule alone for those that still write a colour out; neither for those that
 * still do both. Tokens (src/ui/theme) and tests are exempt.
 */
function lookRules() {
  const files = ["src/ui/**/*.{ts,tsx}"];
  const exempt = ["src/ui/theme/**", "**/*.test.{ts,tsx}"];
  const both = NATIVE_CONTROLS_NOT_YET.filter((f) => COLOUR_LITERALS_NOT_YET.includes(f));
  const nativeOnly = NATIVE_CONTROLS_NOT_YET.filter((f) => !both.includes(f));
  const colourOnly = COLOUR_LITERALS_NOT_YET.filter((f) => !both.includes(f));
  const rule = (...selectors) => ({ "no-restricted-syntax": ["error", ...selectors] });
  return [
    { files, ignores: [...exempt, "src/ui/controls/**", ...NATIVE_CONTROLS_NOT_YET, ...COLOUR_LITERALS_NOT_YET], rules: rule(...NATIVE_CONTROLS, ...COLOUR_LITERALS) },
    { files: ["src/ui/controls/**/*.{ts,tsx}", ...nativeOnly], ignores: exempt, rules: rule(...COLOUR_LITERALS) },
    ...(colourOnly.length ? [{ files: colourOnly, ignores: exempt, rules: rule(...NATIVE_CONTROLS) }] : []),
  ];
}
