import { describe, expect, it } from "vitest";
import { newTextName, shownText, textExportPath } from "./texts";

const t = (id: number, text = `text ${id}`) => ({ id, name: `${id}.txt`, text });

describe("the text the column shows", () => {
  it("is one that has come - the last of several - and the column opens for it", () => {
    const before = [t(1)];
    expect(shownText(before, [t(1), t(2), t(3)], 1)).toEqual({ shown: 3, open: true });
    expect(shownText([], [t(1)], null)).toEqual({ shown: 1, open: true });
  });

  it("is one whose words an undo changed while another was shown, the column opening", () => {
    const before = [t(1), t(2)];
    expect(shownText(before, [t(1), t(2, "undone")], 1)).toEqual({ shown: 2, open: true });
    // (typing in the one shown keeps it, the column as it is)
    expect(shownText(before, [t(1, "typed"), t(2)], 1)).toEqual({ shown: 1 });
  });

  it("is the one shown while it is there; gone, the one now where it was, or none", () => {
    const before = [t(1), t(2), t(3)];
    expect(shownText(before, [t(1), t(3)], 2)).toEqual({ shown: 3 });
    expect(shownText(before, [t(1), t(2)], 3)).toEqual({ shown: 2 });
    expect(shownText([t(1)], [], 1)).toEqual({ shown: null });
    expect(shownText(before, before, 2)).toEqual({ shown: 2 });
  });
});

describe("a new text", () => {
  it("is Untitled, numbered from 2 where the workspace holds one so called", () => {
    expect(newTextName([])).toBe("Untitled.txt");
    expect(newTextName([{ name: "untitled.txt" }])).toBe("Untitled-2.txt");
    expect(newTextName([{ name: "Untitled.txt" }, { name: "Untitled-2.txt" }])).toBe("Untitled-3.txt");
  });
});

describe("where Export suggests writing a text", () => {
  it("is never the file it was opened from: beside it, numbered from 2, the first not there", () => {
    expect(textExportPath({ name: "job.inp", path: "/runs/job.inp" })).toBe("/runs/job-2.inp");
    const there = new Set(["/runs/job-2.inp", "/runs/job-3.inp"]);
    expect(textExportPath({ name: "job.inp", path: "/runs/job.inp" }, (p) => there.has(p))).toBe("/runs/job-4.inp");
    expect(textExportPath({ name: "C:\\runs\\a.b.gjf", path: "C:\\runs\\a.b.gjf" })).toBe("C:\\runs\\a.b-2.gjf");
  });

  it("is its name where it was opened from nowhere Open said", () => {
    expect(textExportPath({ name: "notes.txt" })).toBe("notes.txt");
  });

  it("ends a Markdown text's name in .md where it does not, so that it is read again as Markdown", () => {
    expect(textExportPath({ name: "Aim", markdown: true })).toBe("Aim.md");
    expect(textExportPath({ name: "aim.md", markdown: true })).toBe("aim.md");
    expect(textExportPath({ name: "Aim" })).toBe("Aim");
  });

  it("numbers a name with no extension, or a folder with a dot, at its end", () => {
    expect(textExportPath({ name: "README", path: "/runs/README" })).toBe("/runs/README-2");
    expect(textExportPath({ name: "input", path: "/runs.d/input" })).toBe("/runs.d/input-2");
  });
});
