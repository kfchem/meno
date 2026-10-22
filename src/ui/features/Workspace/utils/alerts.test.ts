import { describe, expect, it } from "vitest";
import { canvasAlerts } from "./alerts";

const none = () => {};

describe("the canvas's alerts", () => {
  it("says what Save could not keep while what opening could not read is still said", () => {
    const shown = canvasAlerts({
      import: { text: "lost-notes.txt could not be read from the workspace.", dismiss: none },
      files: { text: "Saved, but lost-notes.txt is not in the file: it could not be read.", dismiss: none },
      chem: { text: null, dismiss: none },
    });
    expect(shown.map((a) => a.text)).toEqual([
      "lost-notes.txt could not be read from the workspace.",
      "Saved, but lost-notes.txt is not in the file: it could not be read.",
    ]);
  });

  it("dismisses each by itself", () => {
    const gone: string[] = [];
    const shown = canvasAlerts({
      import: { text: "a", dismiss: () => gone.push("import") },
      files: { text: "b", dismiss: () => gone.push("files") },
      chem: { text: "c", dismiss: () => gone.push("chem") },
    });
    shown[1].dismiss();
    expect(gone).toEqual(["files"]);
    expect(shown.map((a) => a.key)).toEqual(["import", "files", "chem"]);
  });

  it("says nothing where there is nothing to say", () => {
    expect(canvasAlerts({ import: null, files: { text: null, dismiss: none }, chem: { text: null, dismiss: none } })).toEqual([]);
  });
});
