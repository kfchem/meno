import { describe, expect, it, vi } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const sent = vi.hoisted(() => [] as { cmd: string; body: unknown; headers: Record<string, string> }[]);
vi.mock("@tauri-apps/api/core", () => ({
  invoke: async (cmd: string, body: unknown, options?: { headers?: Record<string, string> }) => {
    sent.push({ cmd, body, headers: options?.headers ?? {} });
  },
}));

const { writeDocument } = await import("./writeDocument");

describe("a document written where the chemist chose", () => {
  it("goes to Meno's writer as its bytes, text as UTF-8, the path named apart", async () => {
    sent.length = 0;
    await writeDocument("/Users/k/r\u00e9sultats/\u03b1-pinene 2.sdf", "\u03b1-pinene\n  80 \u00b0C\n$$$$\n");
    await writeDocument("C:\\work\\w.meno", new Uint8Array([0x50, 0x4b, 3, 4]));
    expect(sent.map((s) => s.cmd)).toEqual(["write_document", "write_document"]);
    expect(decodeURIComponent(sent[0].headers.path)).toBe("/Users/k/r\u00e9sultats/\u03b1-pinene 2.sdf");
    expect(new TextDecoder().decode(sent[0].body as Uint8Array)).toBe("\u03b1-pinene\n  80 \u00b0C\n$$$$\n");
    expect(decodeURIComponent(sent[1].headers.path)).toBe("C:\\work\\w.meno");
    expect([...(sent[1].body as Uint8Array)]).toEqual([0x50, 0x4b, 3, 4]);
  });
});

/** Every source file under `dir`. */
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sources(path) : /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("what writes files", () => {
  it("writes a chemist's documents through writeDocument alone: the file system plugin writes only Meno's own files", () => {
    const src = join(process.cwd(), "src");
    // (what of the plugin's writes, or may: all of it, imported whole)
    const writes = new Set(["writeFile", "writeTextFile", "create", "open", "truncate", "copyFile", "rename"]);
    const imported = (text: string) =>
      [...text.matchAll(/import\s*(\*\s*as\s*\w+|\{[^}]*\})\s*from\s*"@tauri-apps\/plugin-fs"/g)].flatMap((m) =>
        m[1].startsWith("*") ? ["*"] : m[1].slice(1, -1).split(",").map((n) => n.trim().split(/\s+/)[0].replace(/^type$/, "")),
      );
    const writing = sources(src)
      .filter((path) => imported(readFileSync(path, "utf8")).some((name) => name === "*" || writes.has(name)))
      .map((path) => relative(src, path).split("\\").join("/"))
      .sort();
    // (Meno's settings, and its environments' notes, in its own folders)
    expect(writing).toEqual(["lib/pyEnv.ts", "lib/settings/appSettings.ts"]);
  });
});
