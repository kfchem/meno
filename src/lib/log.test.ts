import { describe, expect, it } from "vitest";
import { logSender, logText, MOST_A_MINUTE, type Level } from "./log";

const SMILES = "CC(=O)Oc1ccccc1C(=O)O";
const FILE = "secret-compound.mol";

describe("a line of the page's for Meno's log (lib/log)", () => {
  it("says what went wrong: Meno's own message, an error's name and frames, a code error's message, numbers", () => {
    const e = new TypeError("undefined is not an object (evaluating 'state.model')");
    e.stack = "draw@app.js:10:4\nrender@app.js:20:8";
    expect(logText(["Meno: the canvas stopped working.", e, 3, null])).toBe(
      "Meno: the canvas stopped working. TypeError: undefined is not an object (evaluating '…')\ndraw@app.js:10:4\nrender@app.js:20:8 3 null",
    );
    // (a stack that begins with the error's name and message: not said again)
    const v = new RangeError("Invalid array length");
    v.stack = "RangeError: Invalid array length\n    at f (app.js:1:1)";
    expect(logText([v])).toBe("RangeError: Invalid array length\nat f (app.js:1:1)");
    // (where in React's tree, as the boundary logs it)
    expect(logText(["\n    at Workspace (app.js:5:6)\n    at div"])).toBe("at Workspace (app.js:5:6)\n    at div");
    // (how many atom numbers a picture left out: a count, kept)
    const left = "Meno: a picture of molecules in 3D left out 12 of their atom numbers, too small to read in it or with no room on their balls.";
    expect(logText([left])).toBe(left);
  });

  it("never what a document holds, nor a file's name - a SMILES and a file's name in a message are left out", () => {
    const parse = new SyntaxError(`JSON Parse error: Unexpected identifier "${SMILES}"`);
    // (a stack that repeats the message, over two lines, before its frames)
    const read = new Error(`${FILE} could not be read:\n${SMILES}`);
    read.stack = `Error: ${FILE} could not be read:\n${SMILES}\n    at readFile (app.js:3:1)`;
    const url = new TypeError(`"${FILE}" cannot be parsed as a URL.`);
    const text = logText([
      parse,
      read,
      url,
      `could not read ${FILE}`,
      `Meno: the tab "${FILE}" stopped working.`,
      `${SMILES} import failed`,
      { atoms: [{ el: "C" }], smiles: SMILES },
      new Map([[FILE, 1]]),
      [SMILES],
    ]);
    expect(text).not.toContain("CC(=O)");
    expect(text).not.toContain("secret-compound");
    expect(text).toContain("SyntaxError");
    expect(text).toContain("Error\nat readFile (app.js:3:1)");
    expect(text).toContain('TypeError: "…" cannot be parsed as a URL.');
    expect(text).toContain('[text] Meno: the tab "…" stopped working. [text] [Object] [Map] [Array]');
  });

  it("of a code error's message, what it quotes in single quotes left out too - an apostrophe in a word kept", () => {
    // (the message's line only, without the frames)
    const head = (e: Error) => logText([e]).split("\n")[0];
    const read = new TypeError(`Cannot read properties of undefined (reading '${FILE}')`);
    expect.soft(head(read)).toBe("TypeError: Cannot read properties of undefined (reading '…')");
    const twice = new TypeError("Failed to execute 'querySelector' on 'Document'");
    expect.soft(head(twice)).toBe("TypeError: Failed to execute '…' on '…'");
    // (a contraction and a possessive are not quotes: only the quoted span between them is left out)
    const words = new TypeError(`can't take '${SMILES}' from Meno's model`);
    expect.soft(head(words)).toBe("TypeError: can't take '…' from Meno's model");
    // (an apostrophe inside what is quoted does not end it early; a plural's after it is no contraction's: the line cut, failing closed)
    const name = new RangeError("no room for 'O'Brien's compound.mol' in the users' list");
    expect.soft(head(name)).toBe("RangeError: no room for …");
  });

  it("of a code error's message, a quote mark left once its quoted spans are out cuts the line from its first quote - failing closed", () => {
    const head = (e: Error) => logText([e]).split("\n")[0];
    // (a quote never closed)
    expect.soft(head(new TypeError(`bad '${SMILES}`))).toBe("TypeError: bad …");
    // (a quote after a letter that is no contraction's)
    expect.soft(head(new TypeError(`file'${SMILES}'`))).toBe("TypeError: file…");
    // (an inner quote followed by what is not a letter, past the span it ended)
    expect.soft(head(new TypeError("'a' b' c"))).toBe("TypeError: …");
    // (curly quotes, a backtick)
    expect.soft(head(new TypeError(`no ‘${SMILES}’ here`))).toBe("TypeError: no …");
    expect.soft(head(new TypeError(`no “${SMILES}” here`))).toBe("TypeError: no …");
    expect.soft(head(new TypeError(`no \`${FILE}\` here`))).toBe("TypeError: no …");
    // (a word's apostrophe, straight or curly, is none of these)
    expect.soft(head(new TypeError("Meno’s model can't be read; we'll try"))).toBe("TypeError: Meno’s model can't be read; we'll try");
  });

  it("sends at most a hundred lines a minute, and says how many it left out", () => {
    const got: [Level, string][] = [];
    let t = 0;
    const send = logSender((level, text) => got.push([level, text]), () => t);
    for (let i = 0; i < MOST_A_MINUTE + 5; i++) send("error", [i]);
    expect(got).toHaveLength(MOST_A_MINUTE);
    t = 60_000;
    send("warn", [1]);
    expect(got[got.length - 1]).toEqual(["warn", "(5 lines left out)\n1"]);
    send("warn", [2]);
    expect(got[got.length - 1]).toEqual(["warn", "2"]);
  });
});
