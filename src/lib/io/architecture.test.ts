import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MENO_KINDS } from "./kinds";
import { WRITERS } from "./writers";

/**
 * ARCHITECTURE.md's table of the kinds of file (*File format support*),
 * drawn from the table of kinds - Meno's own and the kinds Meno writes -
 * and kept so: a kind of Meno's added or taken away there and not here, or
 * the other way round, fails. A row of a plugin's kinds (read or written by
 * a plugin) is the plugin's to keep, not checked here: Meno carries none.
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
  it("has every kind by its id - Meno's and those it writes - and no other but a plugin's", () => {
    const kinds = new Set<string>([...Object.values(MENO_KINDS).map((k) => k.id), ...Object.values(WRITERS).map((w) => w.id)]);
    // (a row of no kind of Meno's, read or written by a plugin: a plugin's)
    const plugins = (r: string[]) => !ticked(r[col("Id")]).some((id) => kinds.has(id)) && /plugin/i.test(`${r[col("Read by")]} ${r[col("Written by")]}`);
    const listed = body.filter((r) => !plugins(r)).flatMap((r) => ticked(r[col("Id")]));
    expect(new Set(listed)).toEqual(kinds);
    expect(listed.length).toBe(kinds.size);
  });

  it("gives each of Meno's kinds, and each kind written, the names its files go by", () => {
    const named = [
      ...Object.values(MENO_KINDS).map((k) => ({ id: k.id as string, extensions: k.extensions as readonly string[] })),
      ...Object.values(WRITERS),
    ];
    for (const k of named) {
      const files = ticked(rowOf(k.id)![col("Files")]);
      for (const ext of k.extensions) expect(files, `${k.id} ${ext}`).toContain(ext);
    }
  });
});
