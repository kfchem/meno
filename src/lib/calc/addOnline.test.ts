import { describe, expect, it } from "vitest";
import type { CatalogueEntry } from "../plugins/catalogue";
import type { Plugin } from "./catalog";
import { addOnline, type AddSteps } from "./addOnline";

const entry = { id: "far", name: "Far interface" } as CatalogueEntry;
const far = { id: "far", name: "Far interface" } as Plugin;

/** The steps, each saying it was taken; `fails` the one that fails, `none` where what was got is not found. */
function steps(fails?: "get" | "add", none = false) {
  const did: string[] = [];
  const s: AddSteps = {
    get: async (e) => {
      did.push(`get ${e.id}`);
      if (fails === "get") throw new Error("Far interface was not got.");
    },
    find: (id) => {
      did.push(`find ${id}`);
      return none ? undefined : far;
    },
    add: async (p) => {
      did.push(`add ${p.id}`);
      if (fails === "add") throw new Error("Far interface was not added.");
    },
  };
  return { s, did };
}

describe("a plugin added from the list online", () => {
  it("is got, then found among the plugins in place, then added - in that order", async () => {
    const { s, did } = steps();
    await addOnline(entry, s);
    expect(did).toEqual(["get far", "find far", "add far"]);
  });

  it("stops at the step that fails, saying why - one got but not found, too", async () => {
    for (const [fails, none, why, did0] of [
      ["get", false, "was not got", ["get far"]],
      [undefined, true, "Far interface was got, but Meno could not read it.", ["get far", "find far"]],
      ["add", false, "was not added", ["get far", "find far", "add far"]],
    ] as const) {
      const { s, did } = steps(fails, none);
      await expect(addOnline(entry, s)).rejects.toThrow(why);
      expect(did).toEqual(did0);
    }
  });

  it("never gets one the list says is a newer Meno's; and says so of one whose manifest is, once got - not that it could not be read", async () => {
    const listed = steps();
    await expect(addOnline({ ...entry, newer: "It says a role this Meno does not know" }, listed.s)).rejects.toThrow("Far interface is for a newer Meno: update Meno, then add it.");
    expect(listed.did).toEqual([]);
    const got = steps(undefined, true);
    await expect(addOnline(entry, got.s, (id) => (id === "far" ? { why: "It says a role this Meno does not know" } : undefined))).rejects.toThrow("Far interface is for a newer Meno: update Meno, then add it.");
    expect(got.did).toEqual(["get far", "find far"]);
  });
});

