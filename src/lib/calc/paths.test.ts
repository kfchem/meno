import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PATH_FRAME, REFINED_SAID, STARTED_SAID } from "./paths";

describe("a path's words", () => {
  it("are the ones the plugins' contract states, for any plugin that works out a path", () => {
    const contract = readFileSync(new URL("../../../docs/PLUGINS.md", import.meta.url), "utf8");
    for (const word of [PATH_FRAME, REFINED_SAID, STARTED_SAID]) expect(contract).toContain(word);
    expect([PATH_FRAME, REFINED_SAID, STARTED_SAID]).toEqual(["path.frame", "highest point refined", "the point it started from"]);
  });
});
