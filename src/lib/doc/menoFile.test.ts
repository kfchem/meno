import { describe, expect, it } from "vitest";
import { strToU8, unzipSync, zipSync } from "fflate";
import { createHash } from "node:crypto";
import { isMenoFile, MENO_MEDIA_TYPE, menoFileBytes, NotMenoFile, readMenoFile } from "./menoFile";
import { writeMenoFile } from "./menoFileWriter";

const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const WORKSPACE = '{"format":"meno-workspace","version":1,"atoms":[],"bonds":[]}\n';
const output = strToU8(" Entering Gaussian System\n".repeat(2000));
const picture = Uint8Array.from({ length: 4096 }, (_, i) => (i * 7919) % 251);

describe("a workspace file", () => {
  const bytes = menoFileBytes(WORKSPACE, [
    { sha256: sha(output), name: "job.log", kind: "gaussian", media: "text/plain", data: output },
    { sha256: sha(picture), name: "figure.png", media: "image/png", data: picture },
  ]);

  it("is a zip that says what it is first, stored, as EPUB's and ODF's do", () => {
    expect(isMenoFile(bytes)).toBe(true);
    expect(isMenoFile(bytes.subarray(0, 80))).toBe(true);
    const names = Object.keys(unzipSync(bytes));
    expect(names[0]).toBe("mimetype");
    expect(names).toEqual(["mimetype", "workspace.json", "files.json", `files/${sha(output)}`, `files/${sha(picture)}`]);
    expect(new TextDecoder().decode(unzipSync(bytes).mimetype)).toBe(MENO_MEDIA_TYPE);
  });

  it("keeps its workspace as it is, the text it keeps compressed, and the rest as it was", () => {
    // (the workspace and the picture are in it byte for byte; the output's 52 KB of text is not)
    const text = new TextDecoder("latin1").decode(bytes);
    expect(text).toContain(WORKSPACE.trim());
    expect(bytes.length).toBeLessThan(output.length / 4);
    expect(Buffer.from(bytes).includes(Buffer.from(picture))).toBe(true);
  });

  it("is read for its workspace and the list of what it keeps; each file when wanted, by its SHA-256", () => {
    const file = readMenoFile(bytes);
    expect(file.workspace).toBe(WORKSPACE);
    expect(file.files).toEqual([
      { sha256: sha(output), name: "job.log", kind: "gaussian", media: "text/plain", size: output.length },
      { sha256: sha(picture), name: "figure.png", media: "image/png", size: picture.length },
    ]);
    expect(file.data(sha(output))).toEqual(output);
    expect(file.data(sha(picture))).toEqual(picture);
    expect(file.data("0".repeat(64))).toBeNull();
  });

  it("is written the same off the page", async () => {
    const written = await writeMenoFile(WORKSPACE, [{ sha256: sha(output), name: "job.log", media: "text/plain", data: output }]);
    expect(readMenoFile(written).data(sha(output))).toEqual(output);
  });

  it("cut short or damaged, is said to be so - not in the zip reader's words", () => {
    for (const broken of [bytes.slice(0, Math.floor(bytes.length / 2)), bytes.slice(0, bytes.length - 10)]) {
      expect(() => readMenoFile(broken)).toThrow(NotMenoFile);
      expect(() => readMenoFile(broken)).toThrow(/cut short or damaged/);
    }
  });

  it("is not just any zip, nor JSON: those are said not to be one", () => {
    const other = zipSync({ "workspace.json": strToU8(WORKSPACE) });
    expect(isMenoFile(other)).toBe(false);
    expect(() => readMenoFile(other)).toThrow(NotMenoFile);
    expect(isMenoFile(strToU8(WORKSPACE))).toBe(false);
    // (a list of files that does not read keeps nothing)
    const odd = zipSync({ mimetype: [strToU8(MENO_MEDIA_TYPE), { level: 0 }], "workspace.json": strToU8(WORKSPACE), "files.json": strToU8("[oops") });
    expect(readMenoFile(odd).files).toEqual([]);
  });
});
