import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

// How Meno looks (docs/LOOK.md): the interface draws Meno's own controls
// (src/ui/controls), never the browser's, and takes its colours from the
// tokens (src/App.css @theme, src/ui/theme/colors.ts), never as literals or
// Tailwind's default palette. Each rule names the files written before it
// that do not keep to it yet (docs/LOOK.md, *Not yet*); a new file keeps to
// it, and a file brought in line leaves its list.
const NATIVE_CONTROLS = [
  { selector: "JSXOpeningElement[name.name='select']", message: "A native <select>: use Select from src/ui/controls (docs/LOOK.md)." },
  {
    selector: "JSXOpeningElement[name.name='input']:has(JSXAttribute[name.name='type'][value.value=/^(radio|checkbox)$/])",
    message: "A native radio or checkbox: use Radio, Checkbox or Choice from src/ui/controls (docs/LOOK.md).",
  },
];
const COLOUR = String.raw`(#[0-9a-fA-F]{3}([0-9a-fA-F]{3}([0-9a-fA-F]{2})?)?\b|rgba?\(|hsla?\(|\b(bg|text|border|ring|fill|stroke|outline|divide|accent|from|via|to|shadow|decoration|placeholder|caret)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-[0-9]{2,3}\b)`;
const COLOUR_LITERALS = [
  { selector: `Literal[value=/${COLOUR}/]`, message: "A colour written out: use a token (docs/LOOK.md, *Colours*)." },
  { selector: `TemplateElement[value.raw=/${COLOUR}/]`, message: "A colour written out: use a token (docs/LOOK.md, *Colours*)." },
];
/** Files written before the look rules that still draw a native control. */
const NATIVE_CONTROLS_NOT_YET = [
  "src/ui/features/SettingsPanel/FileSettings.tsx",
  "src/ui/features/SettingsPanel/RoleChoices.tsx",
  "src/ui/features/StyleEditor/HideHydrogensAsk.tsx",
  "src/ui/features/StyleEditor/StyleEditor.tsx",
  "src/ui/features/Workspace/CoordinatesCard.tsx",
  "src/ui/features/Workspace/ProtonationCard.tsx",
  "src/ui/features/Workspace/SaveAbbreviationPanel.tsx",
  "src/ui/options/OptionRows.tsx",
  "src/ui/options/OptionsForm.tsx",
];
/** Files written before the look rules that still write a colour out. */
const COLOUR_LITERALS_NOT_YET = [
  "src/ui/features/SettingsPanel/ColourSettings.tsx",
  "src/ui/features/SettingsPanel/DefaultAppSettings.tsx",
  "src/ui/features/StyleEditor/AtomColours.tsx",
  "src/ui/features/StyleEditor/HideHydrogensAsk.tsx",
  "src/ui/features/StyleEditor/StyleEditor.tsx",
  "src/ui/features/StyleEditor/StyleFileAsk.tsx",
  "src/ui/features/StyleEditor/StylePicker3D.tsx",
  "src/ui/features/TextEditor/linePictures.ts",
  "src/ui/features/TextEditor/markdownLayout.ts",
  "src/ui/features/TextEditor/markdownPictures.ts",
  "src/ui/features/Workspace/Ask3D.tsx",
  "src/ui/features/Workspace/ColourCard.tsx",
  "src/ui/features/Workspace/CoordinatesCard.tsx",
  "src/ui/features/Workspace/ExportCard.tsx",
  "src/ui/features/Workspace/LargeWorkspaceAsk.tsx",
  "src/ui/features/Workspace/PenCard.tsx",
  "src/ui/features/Workspace/SettingsStyleAsk.tsx",
  "src/ui/features/Workspace/Workspace.tsx",
  "src/ui/features/Workspace/components/AromaticCircles2D.tsx",
  "src/ui/features/Workspace/components/Arrows2D.tsx",
  "src/ui/features/Workspace/components/Bonds2D.tsx",
  "src/ui/features/Workspace/components/CalcList3D.tsx",
  "src/ui/features/Workspace/components/CaptionTyping2D.tsx",
  "src/ui/features/Workspace/components/Captions2D.tsx",
  "src/ui/features/Workspace/components/ChemMarks2D.tsx",
  "src/ui/features/Workspace/components/ColumnText.tsx",
  "src/ui/features/Workspace/components/Cycles2D.tsx",
  "src/ui/features/Workspace/components/Fills2D.tsx",
  "src/ui/features/Workspace/components/Frames3D.tsx",
  "src/ui/features/Workspace/components/Inks2D.tsx",
  "src/ui/features/Workspace/components/JoinCaps2D.tsx",
  "src/ui/features/Workspace/components/LabelTyping2D.tsx",
  "src/ui/features/Workspace/components/MarkdownRows.tsx",
  "src/ui/features/Workspace/components/Molecule3DView.tsx",
  "src/ui/features/Workspace/components/Overlay3D.tsx",
  "src/ui/features/Workspace/components/PdfColumn.tsx",
  "src/ui/features/Workspace/components/Pdfs2D.tsx",
  "src/ui/features/Workspace/components/PictureFlight.tsx",
  "src/ui/features/Workspace/components/Pictures2D.tsx",
  "src/ui/features/Workspace/components/PushArrows2D.tsx",
  "src/ui/features/Workspace/components/Selection2D.tsx",
  "src/ui/features/Workspace/components/SelectionShade2D.tsx",
  "src/ui/features/Workspace/components/Shapes2D.tsx",
  "src/ui/features/Workspace/components/Slides2D.tsx",
  "src/ui/features/Workspace/components/TextFlight.tsx",
  "src/ui/features/Workspace/components/TextSheets2D.tsx",
  "src/ui/features/Workspace/components/Wedges2D.tsx",
  "src/ui/features/Workspace/components/Workflow2D.tsx",
  "src/ui/features/Workspace/components/notHadCross.ts",
  "src/ui/features/Workspace/components/pdfMarks.ts",
  "src/ui/features/Workspace/components/pdfPictures.tsx",
  "src/ui/features/Workspace/fileActions.ts",
  "src/ui/features/Workspace/hooks/useCanvasSetup.ts",
  "src/ui/features/Workspace/presenting/PresentLayer.tsx",
  "src/ui/features/Workspace/presenting/Presenter.tsx",
  "src/ui/features/Workspace/render/RenderCard.tsx",
  "src/ui/features/Workspace/render/renderScene.ts",
  "src/ui/features/Workspace/utils/atomNumbers.ts",
  "src/ui/features/Workspace/utils/glyphShapes.ts",
  "src/ui/features/Workspace/utils/occlusionMaterial.ts",
  "src/ui/features/Workspace/utils/ribbon.ts",
  "src/ui/guide/GuideCard.tsx",
  "src/ui/layouts/ConfirmDiscard.tsx",
  "src/ui/layouts/NameDialog.tsx",
  "src/ui/layouts/TopBar.tsx",
  "src/ui/layouts/WindowButtons.tsx",
  "src/ui/network/ConsentDialog.tsx",
  "src/ui/network/OfflineToggle.tsx",
  "src/ui/options/OptionsForm.tsx",
];

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
