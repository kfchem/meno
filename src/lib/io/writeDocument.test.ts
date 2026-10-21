import { describe, expect, it, vi } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const sent = vi.hoisted(() => [] as { cmd: string; body: unknown; headers: Record<string, string> }[]);
vi.mock("@tauri-apps/api/core", () => ({
  invoke: async (cmd: string, body: unknown, options?: { headers?: Record<string, string> }) => {
    sent.push({ cmd, body, headers: options?.headers ?? {} });
    // (where the file there was kept, as the app gives it back: only where asked)
    return cmd === "write_document" && options?.headers?.["keep-old"] === "1" ? `${decodeURIComponent(options.headers.path)}.bak` : null;
  },
}));

const { writeAppFile, writeDocument } = await import("./writeDocument");

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
    // (keeping the file there beside it never asked)
    expect(sent.map((s) => "keep-old" in s.headers)).toEqual([false, false]);
  });

  it("keeps the file there beside it only where asked, and says where", async () => {
    sent.length = 0;
    expect(await writeDocument("/w/a.meno", new Uint8Array([0x50, 0x4b]))).toBeNull();
    expect(await writeDocument("/w/a.meno", new Uint8Array([0x50, 0x4b]), true)).toBe("/w/a.meno.bak");
    expect(sent.map((s) => s.headers["keep-old"])).toEqual([undefined, "1"]);
  });
});

describe("Meno's own files", () => {
  it("go to Meno's writer as their bytes, by a path inside the folder named", async () => {
    sent.length = 0;
    await writeAppFile("settings.json", '{ "format": 1 }\n');
    await writeAppFile("uv/stamps/plugin-\u03b1.json", "{}", "local");
    expect(sent.map((s) => [s.cmd, decodeURIComponent(s.headers.rel), s.headers.base])).toEqual([
      ["write_app_file", "settings.json", "data"],
      ["write_app_file", "uv/stamps/plugin-\u03b1.json", "local"],
    ]);
    expect(new TextDecoder().decode(sent[0].body as Uint8Array)).toBe('{ "format": 1 }\n');
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
  it("writes every file through Meno's writer, whole or not at all - a chemist's documents and Meno's own alike: nothing through the file system plugin", () => {
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
    // (Meno's settings, and its environments' notes, too: writeAppFile)
    expect(writing).toEqual([]);
  });
});
