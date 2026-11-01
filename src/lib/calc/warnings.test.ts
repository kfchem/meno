import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { WARNING_KINDS, warningsOf } from "./warnings";

describe("a calculation's warnings", () => {
  it("are of the kinds the plugins' contract states, by what each says - any other is other, its words kept", () => {
    const contract = readFileSync(new URL("../../../docs/PLUGINS.md", import.meta.url), "utf8");
    for (const kind of WARNING_KINDS) expect(contract).toContain(`\`${kind}\``);
    expect(warningsOf([{ kind: "hessian-not-stationary", text: " not stationary " }, { kind: "a-program-s-own", text: "its words" }, { kind: "other", text: "" }])).toEqual([
      { kind: "hessian-not-stationary", text: "not stationary" },
      { kind: "other", text: "its words" },
    ]);
  });
});
