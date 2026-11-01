import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { WARNING_KINDS, warningsOf } from "./warnings";

describe("a calculation's warnings", () => {
  it("are of the kinds the plugins' contract states, by what each says - any other is other, its words kept", () => {
    const contract = readFileSync(new URL("../../../docs/PLUGINS.md", import.meta.url), "utf8");
    // (in the sentence that states them, not anywhere in the document)
    const said = contract.slice(contract.indexOf("A kind is what the warning says")).replace(/\s+/g, " ");
    const sentence = said.slice(0, said.indexOf("A warning never moves an entry"));
    expect(sentence.length).toBeGreaterThan(0);
    for (const kind of WARNING_KINDS) expect(sentence).toContain(`\`${kind}\``);
    expect(warningsOf([{ kind: "hessian-not-stationary", text: " not stationary " }, { kind: "a-program-s-own", text: "its words" }, { kind: "other", text: "" }])).toEqual([
      { kind: "hessian-not-stationary", text: "not stationary" },
      { kind: "other", text: "its words" },
    ]);
  });
});
