import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { createWorkspaceDocument } from "./document";
import LockedPdf from "./LockedPdf";
import { EditorProvider } from "./store";
import type { PdfItem } from "./store/types";

// (Vitest runs in Node, with no page to mount on: the card as the server's renderer writes it)
const pdf: PdfItem = { id: 1, name: "paper.pdf", sha256: "a".repeat(64), pages: [[595, 842]], x: 0, y: 0, page: 0 };

describe("a PDF locked with a password, in the column", () => {
  const html = renderToString(
    <EditorProvider tabId="locked-pdf" document={createWorkspaceDocument()}>
      <LockedPdf pdf={pdf} />
    </EditorProvider>,
  );

  it("says what it is, whose it is, and asks for the password in a field of Meno's own that shows none of what is typed", () => {
    expect(html).toContain("Locked with a password");
    expect(html).toContain("paper.pdf");
    expect(html).toMatch(/<input[^>]*type="password"/);
    expect(html).toMatch(/<input[^>]*autoComplete="off"|<input[^>]*autocomplete="off"/i);
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*>Open<\/button>/);
  });

  it("opens with nothing typed, and with no word said of a wrong try that has not been made", () => {
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*type="submit"|<button[^>]*type="submit"[^>]*disabled=""/);
    expect(html).not.toContain("role=\"alert\"");
  });
});
