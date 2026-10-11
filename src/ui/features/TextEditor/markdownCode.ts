/**
 * A Markdown text's code coloured (docs/PDF.md, *Markdown*): by the
 * language its block names, as a text's are (lib/text/colouring), its tones
 * in the column's colours.
 */
import { Lines } from "../../../lib/text/editing";
import { colouringFor, type Colouring } from "../../../lib/text/colouring";
import type { Kind, TextKind } from "../../../lib/io/kinds";
import type { CodeColours } from "./markdownLayout";
import { TONES } from "./linePictures";

/** The names a code block's language goes by, as a file's name would end - those another way of writing it does not say itself. */
const LANGUAGES: Record<string, string> = { python: ".py", py: ".py", python3: ".py", json: ".json", jsonc: ".json", xml: ".xml", html: ".xml", svg: ".xml" };

/**
 * A code block's colours, by its language: Lezer's grammar where it names
 * Python, JSON or XML, else a plugin's, by its language taken as a file's
 * name ends (`inp`, `gjf`) - as the text's colouring says, its tones in the
 * column's colours. `onReady` once a plugin's grammar has been made.
 */
export function codeColoursFor(kinds: readonly Kind[], texts: readonly TextKind[], onReady: () => void): CodeColours {
  // (each block's colouring kept: a plugin's grammar, made, colours the one that waited for it)
  const kept = new Map<string, Colouring | null>();
  return (lang, text) => {
    if (!lang || !/^[a-z0-9+#.-]{1,24}$/.test(lang)) return null;
    const key = `${lang}\u0000${text}`;
    let colouring = kept.get(key);
    if (colouring === undefined) {
      colouring = colouringFor(`code${LANGUAGES[lang] ?? `.${lang}`}`, text, kinds, texts, onReady);
      if (kept.size > 200) kept.clear();
      kept.set(key, colouring);
    }
    if (!colouring) return null;
    const lines = new Lines(text);
    return Array.from({ length: lines.count }, (_, i) => colouring.spans(lines, i).map((s) => ({ from: s.from, to: s.to, colour: TONES[s.tone] })));
  };
}
