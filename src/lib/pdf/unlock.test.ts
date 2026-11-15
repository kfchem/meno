import { describe, expect, it } from "vitest";
import { openLocked } from "./unlock";
import { createEditorStore, connectStoreToDocument } from "../../ui/features/Workspace/store";
import { createWorkspaceDocument } from "../../ui/features/Workspace/document";

const sha = "a".repeat(64);
const PASSWORD = "meno-test-word";

describe("a PDF opened with the password typed", () => {
  it("is given its pages, and nothing comes back: the password goes no further than the reader", async () => {
    const sent: unknown[][] = [];
    const given: unknown[] = [];
    const said = await openLocked(
      sha,
      PASSWORD,
      (...args) => given.push(args),
      async (...args) => (sent.push(args), { sha256: sha, size: 9, pages: [[300, 400]] }),
    );
    expect(said).toBeNull();
    expect(sent).toEqual([[sha, PASSWORD]]);
    // (what is handed on holds the pages, and the PDF it is of)
    expect(given).toEqual([[sha, [[300, 400]]]]);
    expect(JSON.stringify(given)).not.toContain(PASSWORD);
  });

  it("is refused in words where the password is wrong, and tried again as often as there is need", async () => {
    let tries = 0;
    const opened: string[] = [];
    const unlock = async (_: string, p: string) => {
      tries++;
      if (p !== "right") throw "That is not its password";
      return { sha256: sha, size: 9, pages: [[300, 400]] as [number, number][] };
    };
    for (const wrong of ["one", "two", "three", "four"]) expect(await openLocked(sha, wrong, () => opened.push("x"), unlock)).toBe("That is not its password");
    expect(opened).toEqual([]);
    expect(await openLocked(sha, "right", () => opened.push("x"), unlock)).toBeNull();
    expect(tries).toBe(5);
    expect(opened).toEqual(["x"]);
  });

  it("never says the password back, whatever the words that refused it were", async () => {
    const said = await openLocked(sha, PASSWORD, () => {}, async () => Promise.reject(new Error(`could not open with ${PASSWORD}`)));
    expect(said).not.toContain(PASSWORD);
    expect(said).toBe("could not open with");
  });

  it("leaves nothing of the password in the workspace: its state, and the file it is saved to, hold the PDF's pages alone", async () => {
    const doc = createWorkspaceDocument();
    const store = createEditorStore(doc);
    connectStoreToDocument(store, doc);
    store.getState().addPdfs([{ name: "paper.pdf", sha256: sha, pages: [[595, 842]] }], { x: 0, y: 0 });
    await openLocked(sha, PASSWORD, (s, pages) => store.getState().setPdfPages(s, pages), async () => ({ sha256: sha, size: 9, pages: [[300, 400]] }));
    const state = store.getState();
    expect(state.pdfs[0].pages).toEqual([[300, 400]]);
    const whole = JSON.stringify(doc.getState(), (_, v) => (v instanceof Set ? [...v] : v));
    expect(whole).not.toContain(PASSWORD);
    expect(JSON.stringify(Object.values(state).filter((v) => typeof v !== "function"), (_, v) => (v instanceof Set ? [...v] : v instanceof Map ? [...v] : typeof v === "function" ? undefined : v))).not.toContain(PASSWORD);
  });
});
