import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PATH_FRAME, REFINED_SAID, STARTED_SAID } from "./paths";

describe("a path's words", () => {
  it("are the ones the plugins' contract states, for any plugin that works out a path", () => {
    const contract = readFileSync(new URL("../../../docs/PLUGINS.md", import.meta.url), "utf8");
    // (in the paragraph that states them, not anywhere in the document)
    const said = contract.slice(contract.indexOf("The words of a path are Meno's"));
    const paragraph = said.slice(0, said.indexOf("\n\n"));
    expect(paragraph.length).toBeGreaterThan(0);
    for (const word of [PATH_FRAME, REFINED_SAID, STARTED_SAID]) expect(paragraph.replace(/\s+/g, " ")).toContain(word);
    expect([PATH_FRAME, REFINED_SAID, STARTED_SAID]).toEqual(["path.frame", "highest point refined", "the point it started from"]);
  });
});
