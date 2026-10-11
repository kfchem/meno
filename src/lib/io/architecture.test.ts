import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MENO_KINDS } from "./kinds";
import { WRITERS } from "./writers";
import { MANIFESTS } from "../plugins/known";

/**
 * ARCHITECTURE.md's table of the kinds of file (*File format support*),
 * drawn from the table of kinds - Meno's own, the kinds Meno writes, and
 * those the plugins Meno carries bring and write - and kept so: a kind
 * added or taken away there and not here, or the other way round, fails.
 */
const doc = readFileSync(join(process.cwd(), "docs/ARCHITECTURE.md"), "utf8");
const section = doc.slice(doc.indexOf("## File format support"), doc.indexOf("## Verification commands"));
const rows = section
  .split("\n")
  .filter((l) => l.startsWith("|") && !/^\|\s*-/.test(l))
  .map((l) => l.split("|").slice(1, -1).map((c) => c.trim()));
const [head, ...body] = rows;
const col = (name: string) => head.indexOf(name);
const ticked = (cell: string) => [...cell.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
const rowOf = (id: string) => body.find((r) => ticked(r[col("Id")]).includes(id));

describe("ARCHITECTURE.md's table of kinds", () => {
  it("has every kind by its id - Meno's, those it writes, and the plugins' it carries - and no other", () => {
    const kinds = new Set<string>([
      ...Object.values(MENO_KINDS).map((k) => k.id),
      ...Object.values(WRITERS).map((w) => w.id),
      ...MANIFESTS.flatMap((m) => m.kinds.map((k) => k.id)),
    ]);
    const listed = body.flatMap((r) => ticked(r[col("Id")]));
    expect(new Set(listed)).toEqual(kinds);
    expect(listed.length).toBe(kinds.size);
  });

  it("gives each of Meno's kinds, and each kind written, the names its files go by", () => {
    const named = [
      ...Object.values(MENO_KINDS).map((k) => ({ id: k.id as string, extensions: k.extensions as readonly string[] })),
      ...Object.values(WRITERS),
      ...MANIFESTS.flatMap((m) => m.writes),
      ...MANIFESTS.flatMap((m) => m.kinds).filter((k) => k.id === "molden"),
    ];
    for (const k of named) {
      const files = ticked(rowOf(k.id)![col("Files")]);
      for (const ext of k.extensions) expect(files, `${k.id} ${ext}`).toContain(ext);
    }
  });
});
