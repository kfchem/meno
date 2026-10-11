/**
 * A CIF's data blocks, read as the IUCr's "CIF 1.1 working specification,
 * File syntax" lays them out (the paragraphs cited are its): data names
 * with their values, and tables of values (`loop_`). What Meno reads in this
 * form - the wwPDB's Chemical Component Dictionary (./ccd) - is a data
 * file, so save frames, which only dictionaries hold, are taken as an
 * error, as a parser for data files may (5, *Implementation note*).
 */

/** A value: as written, quotes and text-field delimiters taken away; null for an unquoted `.` or `?` - inapplicable, or unknown (57). */
export type CifValue = string | null;

/** A table of values: its data names, and its rows, each a value for each name in turn (63). */
export type CifLoop = { tags: string[]; rows: CifValue[][] };

/** A data block: its code (`data_foo`: foo, 2.9), its data items not in a table, and its tables. Data names in lower case: they are case-insensitive (26). */
export type CifBlock = { name: string; items: Map<string, CifValue>; loops: CifLoop[] };

type Token = { text: string; quoted: boolean };

const isBlank = (c: string | undefined) => c === " " || c === "\t" || c === "\n";

/**
 * The tokens of a CIF: data names, reserved words and values, white space
 * and comments taken away. Every end of line read as one line feed (42,
 * *Implementation note*).
 */
function tokens(source: string): Token[] {
  const text = source.replace(/\r\n?/g, "\n");
  const out: Token[] = [];
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (isBlank(c)) {
      i++;
      continue;
    }
    const lineStart = i === 0 || text[i - 1] === "\n";
    // A comment, from # to the end of the line - only after white space or at a line's start, as here (21, 45)
    if (c === "#") {
      const end = text.indexOf("\n", i);
      i = end < 0 ? text.length : end;
      continue;
    }
    // A text field: from a semicolon at the start of a line to the next line that starts with one; the end of line before that one is not part of it (17, 18)
    if (c === ";" && lineStart) {
      const end = text.indexOf("\n;", i);
      if (end < 0) throw new Error("a text field is not closed");
      out.push({ text: text.slice(i + 1, end), quoted: true });
      i = end + 2;
      continue;
    }
    // A quoted string: closed by its own quote followed by white space - one not so followed is part of it ('a dog's life', 15, 56). It ends within its line (AnyPrintChar, 48).
    if (c === "'" || c === '"') {
      let k = i + 1;
      while (k < text.length && !(text[k] === c && (k + 1 === text.length || isBlank(text[k + 1])))) {
        if (text[k] === "\n") throw new Error(`a quoted string is not closed on its line: ${text.slice(i, k)}`);
        k++;
      }
      if (k >= text.length) throw new Error("a quoted string is not closed");
      out.push({ text: text.slice(i + 1, k), quoted: true });
      i = k + 1;
      continue;
    }
    // Anything else runs to the next white space: a data name, a reserved word, an unquoted value
    let k = i;
    while (k < text.length && !isBlank(text[k])) k++;
    out.push({ text: text.slice(i, k), quoted: false });
    i = k;
  }
  return out;
}

const word = (t: Token, reserved: string) => !t.quoted && t.text.toLowerCase() === reserved;
const startsWord = (t: Token, reserved: string) => !t.quoted && t.text.slice(0, reserved.length).toLowerCase() === reserved;
const isTag = (t: Token) => !t.quoted && t.text.startsWith("_");

/** A value token as its value: an unquoted `.` or `?` null (57); anything quoted as written - a quoted '.' is the string (10, 13). */
function valueOf(t: Token): CifValue {
  if (!t.quoted && (t.text === "." || t.text === "?")) return null;
  // (an unquoted value begins with an ordinary character: not a bracket, kept for delimiters to come (19), nor $, kept for save frame references (32, 50))
  if (!t.quoted && /^[[\]$]/.test(t.text)) throw new Error(`a value may not begin with an unquoted ${t.text[0]}`);
  return t.text;
}

/** Whether a token ends a table's values: a data name, a block, a table, or a reserved word. */
const endsValues = (t: Token) => isTag(t) || startsWord(t, "data_") || startsWord(t, "save_") || word(t, "loop_") || word(t, "stop_") || word(t, "global_");

/** A CIF's data blocks, in order. Throws where it does not follow the syntax. */
export function readCif(text: string): CifBlock[] {
  const ts = tokens(text);
  const blocks: CifBlock[] = [];
  let block: CifBlock | null = null;
  let i = 0;
  while (i < ts.length) {
    const t = ts[i];
    if (startsWord(t, "data_")) {
      // (a block code of one character at least: 60)
      if (t.text.length <= 5) throw new Error("a data block heading has no block code");
      block = { name: t.text.slice(5), items: new Map(), loops: [] };
      blocks.push(block);
      i++;
      continue;
    }
    if (startsWord(t, "save_")) throw new Error("save frames belong in dictionaries, not data files");
    if (word(t, "global_") || word(t, "stop_")) throw new Error(`${t.text} is reserved (8, 33)`);
    if (!block) throw new Error("data before the first data block");
    if (word(t, "loop_")) {
      i++;
      const tags: string[] = [];
      while (i < ts.length && isTag(ts[i])) tags.push(ts[i++].text.toLowerCase());
      if (!tags.length) throw new Error("a loop_ with no data names");
      const values: CifValue[] = [];
      while (i < ts.length && !endsValues(ts[i])) values.push(valueOf(ts[i++]));
      // (as many values as make whole rows: 63)
      if (values.length % tags.length) throw new Error(`a loop of ${tags.join(", ")} has a row cut short`);
      const rows: CifValue[][] = [];
      for (let k = 0; k < values.length; k += tags.length) rows.push(values.slice(k, k + tags.length));
      block.loops.push({ tags, rows });
      continue;
    }
    if (isTag(t)) {
      const v = ts[i + 1];
      if (!v || endsValues(v)) throw new Error(`${t.text} has no value`);
      block.items.set(t.text.toLowerCase(), valueOf(v));
      i += 2;
      continue;
    }
    throw new Error(`a value with no data name: ${t.text}`);
  }
  return blocks;
}

/**
 * A category's rows in a block - `_chem_comp_atom`, say - each by its
 * data names' keywords (`atom_id`): a table's rows, or the one row its
 * items make where it is not in a table. None where the block has none.
 */
export function categoryRows(block: CifBlock, category: string): Record<string, CifValue>[] {
  const prefix = `${category.toLowerCase()}.`;
  const loop = block.loops.find((l) => l.tags.every((t) => t.startsWith(prefix)));
  if (loop) return loop.rows.map((row) => Object.fromEntries(loop.tags.map((t, k) => [t.slice(prefix.length), row[k]])));
  const row: Record<string, CifValue> = {};
  for (const [tag, v] of block.items) if (tag.startsWith(prefix)) row[tag.slice(prefix.length)] = v;
  return Object.keys(row).length ? [row] : [];
}
