import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { addCaption, createWorkspaceDocument } from "./document";
import { EditorProvider } from "./store";
import WordsFont from "./WordsFont";

// Vitest runs in Node, with no page to mount on: the rows as the server's
// renderer writes them, as the menu first shows them.

const none = () => {};

/** The rows for words set as `set` says, the labels at 10 points in Arial. */
function rows(set: { size?: number; lines?: number; font?: string }): string {
  const doc = createWorkspaceDocument();
  doc.reset(addCaption(doc.getState(), { x: 0, y: 0, text: "Three\nlines\nhere", ...set }));
  return renderToString(
    <EditorProvider tabId="words-font" document={doc}>
      <WordsFont id={1} label={10} drawing="Arial" onSize={none} onLines={none} onFont={none} />
    </EditorProvider>,
  );
}

/** The chips of the group named `name`: each one's text, and whether it is lit. */
function chips(html: string, name: string): { text: string; lit: boolean }[] {
  const start = html.indexOf(`aria-label="${name}"`);
  expect(start, name).toBeGreaterThanOrEqual(0);
  const end = html.indexOf("<input", start);
  return [...html.slice(start, end).matchAll(/<button[^>]*class="([^"]*)"[^>]*>([^<]*)<\/button>/g)].map((m) => ({ text: m[2], lit: m[1].includes("border-accel-base") }));
}

describe("a text box's size, line spacing and typeface, in its menu", () => {
  it("offers sizes in points alone and the four line spacings, the ones the words have lit, and each in its field", () => {
    const html = rows({ size: 14, lines: 1.5 });
    expect(chips(html, "Sizes").map((c) => c.text)).toEqual(["8", "10", "12", "14", "18", "24"]);
    expect(chips(html, "Sizes").filter((c) => c.lit).map((c) => c.text)).toEqual(["14"]);
    expect(html).toMatch(/aria-label="Size in points"[^>]*value="14"/);
    expect(chips(html, "Line spacings").map((c) => c.text)).toEqual(["1", "1.15", "1.5", "2"]);
    expect(chips(html, "Line spacings").filter((c) => c.lit).map((c) => c.text)).toEqual(["1.5"]);
    expect(html).toMatch(/aria-label="Line spacing"[^>]*value="1.5"/);
  });

  it("lights the labels' size and single spacing for words with none of their own, and names their typeface or the drawing's", () => {
    const plain = rows({});
    expect(chips(plain, "Sizes").filter((c) => c.lit).map((c) => c.text)).toEqual(["10"]);
    expect(chips(plain, "Line spacings").filter((c) => c.lit).map((c) => c.text)).toEqual(["1"]);
    expect(plain).toContain("Arial");
    // (an odd size typed: no chip lit, the field saying it)
    const odd = rows({ size: 11, font: "IBM Plex Sans" });
    expect(chips(odd, "Sizes").filter((c) => c.lit)).toEqual([]);
    expect(odd).toMatch(/aria-label="Size in points"[^>]*value="11"/);
    expect(odd).toContain("IBM Plex Sans");
  });
});
