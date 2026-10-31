import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MENO_MEDIA_TYPE } from "./doc/menoFile";
import { watchOpenedFiles } from "./openedFiles";

const settle = () => new Promise((go) => setTimeout(go, 0));

describe("workspace files opened from outside Meno", () => {
  it("opens those opened before the page was up, then each lot the app says there is - each once", async () => {
    const kept = [["/a.meno"]];
    let told: (() => void) | undefined;
    const opened: string[][] = [];
    const stop = watchOpenedFiles(
      (paths) => opened.push(paths),
      async () => kept.shift() ?? [],
      (async (_name: string, handler: () => void) => ((told = handler), () => (told = undefined))) as never,
    );
    await settle();
    expect(opened).toEqual([["/a.meno"]]);
    kept.push(["/b.meno", "/c.meno"]);
    told!();
    await settle();
    // (told again with none left: nothing opened twice)
    told!();
    await settle();
    expect(opened).toEqual([["/a.meno"], ["/b.meno", "/c.meno"]]);
    stop();
    expect(told).toBeUndefined();
  });
});

describe("Meno as the app for its workspace files", () => {
  // (read from the app's own configuration, as the bundler reads it)
  const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

  it("is the same type, by the same names, on each system - .meno alone; the formats it opens, a viewer's, with their own icons", () => {
    const windows = JSON.parse(read("src-tauri/tauri.windows.conf.json")).bundle;
    expect(windows.fileAssociations).toEqual([
      { ext: ["meno"], name: "Meno.Workspace", description: "Meno workspace", role: "Editor", mimeType: MENO_MEDIA_TYPE },
    ]);
    // (the installer's hook gives that ProgID the document's icon, which Windows' bundle carries)
    expect(read("src-tauri/windows/hooks.nsh")).toContain('"Software\\Classes\\Meno.Workspace\\DefaultIcon" "" "$INSTDIR\\icons\\document\\meno-document.ico"');
    expect(windows.resources).toContain("icons/document/meno-document.ico");
    // (macOS: the type exported, with its extension and media type; opened as its owner; its icon in the app's Resources)
    const plist = read("src-tauri/Info.plist");
    for (const s of ["<string>dev.kfchem.meno.workspace</string>", "<string>meno</string>", `<string>${MENO_MEDIA_TYPE}</string>`, "<string>Owner</string>", "<string>meno-document.icns</string>"]) expect(plist).toContain(s);
    expect(plist).not.toContain("<string>public.zip-archive</string>");
    // (Owner of .meno alone: every other document type - a format Meno opens, with its own icon - a Viewer, an Alternate)
    expect(plist.match(/<string>Owner<\/string>/g)).toHaveLength(1);
    const types = [...plist.matchAll(/<key>CFBundleTypeRole<\/key>\s*<string>(\w+)<\/string>\s*<key>LSHandlerRank<\/key>\s*<string>(\w+)<\/string>/g)].map((m) => `${m[1]} ${m[2]}`);
    expect(types[0]).toBe("Editor Owner");
    expect(new Set(types.slice(1))).toEqual(new Set(["Viewer Alternate"]));
    const files: Record<string, string> = JSON.parse(read("src-tauri/tauri.macos.conf.json")).bundle.macOS.files;
    expect(files["Resources/meno-document.icns"]).toBe("icons/document/meno-document.icns");
    // (the others, the formats' icons: each from icons/formats, by its name)
    for (const [to, from] of Object.entries(files)) if (to !== "Resources/meno-document.icns") expect(from).toBe(`icons/formats/${/^Resources\/meno-(\w+)\.icns$/.exec(to)![1]}.icns`);
    // (no other kind of file is claimed anywhere)
    expect(JSON.parse(read("src-tauri/tauri.conf.json")).bundle.fileAssociations).toBeUndefined();
  });
});
