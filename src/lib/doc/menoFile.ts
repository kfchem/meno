/**
 * The workspace file, `.meno` (docs/FILE-IO.md, *The workspace file*): a
 * zip, laid out as EPUB and ODF lay theirs out.
 *
 *   mimetype          first, stored: what the file is, for Meno to tell it by
 *   workspace.json    stored: the workspace (Workspace/utils/workspace)
 *   files.json        stored: each file kept - its name, kind, media type, size
 *   files/<sha256>    each file kept, as it was: text deflated, the rest stored
 *
 * The workspace stays plain JSON, uncompressed, so that opening one costs
 * what reading the JSON costs and it reads as it is once unzipped. The files
 * kept - calculations' outputs opened, later PDFs and pictures - are read
 * only when wanted, each by its SHA-256, which is what the workspace knows
 * it by. Nothing is ever unpacked to the disk; what the file says of its
 * sizes is held to limits before anything is inflated.
 */
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from "fflate";

export const MENO_MEDIA_TYPE = "application/vnd.kfchem.meno+zip";

/** A file a workspace keeps: what it is known by, called, and is. */
export type KeptFile = {
  sha256: string;
  /** Its name, as it was opened. */
  name: string;
  /** Its kind (lib/io/kinds), where it is one. */
  kind?: string;
  /** Its media type: text/plain for a calculation's output. */
  media: string;
  /** Its size, in bytes. */
  size: number;
};

/** A file kept, with its bytes, as a workspace is written with it. */
export type KeptData = Omit<KeptFile, "size"> & { data: Uint8Array };

/** The most a workspace's own JSON may come to, and any one file it keeps. */
const MOST_WORKSPACE = 256 * 1024 * 1024;
const MOST_FILE = 1024 * 1024 * 1024;
const MOST_FILES = 10_000;

const SHA = /^[0-9a-f]{64}$/;

/** Whether `bytes` - a file's start will do - are a workspace file: a zip whose first entry, stored, says it is one. */
export function isMenoFile(bytes: Uint8Array): boolean {
  const at = (i: number) => bytes[i] | (bytes[i + 1] << 8);
  if (bytes.length < 30 || at(0) !== 0x4b50 || at(2) !== 0x0403 || at(8) !== 0) return false;
  const nameLength = at(26);
  const start = 30 + nameLength + at(28);
  const name = strFromU8(bytes.subarray(30, 30 + nameLength));
  return name === "mimetype" && strFromU8(bytes.subarray(start, start + MENO_MEDIA_TYPE.length)) === MENO_MEDIA_TYPE;
}

/** A workspace written as its file, with the files it keeps. */
export function menoFileBytes(workspace: string, files: readonly KeptData[]): Uint8Array {
  const index: Record<string, Omit<KeptFile, "sha256">> = {};
  const entries: Zippable = {
    mimetype: [strToU8(MENO_MEDIA_TYPE), { level: 0 }],
    "workspace.json": [strToU8(workspace), { level: 0 }],
  };
  const kept: Zippable = {};
  for (const f of files) {
    if (!SHA.test(f.sha256) || index[f.sha256]) continue;
    index[f.sha256] = { name: f.name, ...(f.kind ? { kind: f.kind } : {}), media: f.media, size: f.data.length };
    kept[`files/${f.sha256}`] = [f.data, { level: f.media.startsWith("text/") ? 6 : 0 }];
  }
  entries["files.json"] = [strToU8(JSON.stringify(index, null, 1)), { level: 0 }];
  return zipSync({ ...entries, ...kept });
}

/** A workspace file read: its workspace, the files it keeps, and each one's bytes, read when wanted. */
export type MenoFile = {
  workspace: string;
  files: KeptFile[];
  /** A file kept, by its SHA-256: its bytes; none where it keeps none such, or it will not read. */
  data(sha256: string): Uint8Array | null;
};

/** What a file not one Meno reads as a workspace is said to be. */
export class NotMenoFile extends Error {}

/**
 * A workspace file read: its workspace's JSON and the list of files it
 * keeps, nothing else inflated. Throws, saying why, where it is not one, or
 * says of itself more than Meno takes in.
 */
export function readMenoFile(bytes: Uint8Array): MenoFile {
  if (!isMenoFile(bytes)) throw new NotMenoFile("It is not a Meno workspace.");
  let entries = 0;
  let head: ReturnType<typeof unzipSync>;
  try {
    head = unzipSync(bytes, {
      filter: (f) => {
        entries++;
        if (f.name === "workspace.json" && f.originalSize > MOST_WORKSPACE) throw new NotMenoFile("Its workspace is larger than Meno takes in.");
        return f.name === "workspace.json" || (f.name === "files.json" && f.originalSize <= MOST_WORKSPACE);
      },
    });
  } catch (e) {
    if (e instanceof NotMenoFile) throw e;
    // (begun as a workspace, but not read through: said so, not in the zip reader's words)
    throw new NotMenoFile("It is a Meno workspace cut short or damaged, and cannot be read.");
  }
  if (entries > MOST_FILES + 3) throw new NotMenoFile("It holds more files than Meno takes in.");
  const json = head["workspace.json"];
  if (!json) throw new NotMenoFile("It holds no workspace.");
  const files: KeptFile[] = [];
  try {
    const index = JSON.parse(strFromU8(head["files.json"] ?? strToU8("{}"))) as Record<string, Partial<KeptFile>>;
    for (const [sha256, f] of Object.entries(index ?? {})) {
      if (!SHA.test(sha256) || typeof f?.name !== "string" || typeof f.media !== "string" || typeof f.size !== "number") continue;
      files.push({ sha256, name: f.name.slice(0, 260), ...(typeof f.kind === "string" ? { kind: f.kind } : {}), media: f.media, size: f.size });
    }
  } catch {
    // (a list that does not read keeps nothing that can be had)
  }
  const known = new Set(files.map((f) => f.sha256));
  return {
    workspace: strFromU8(json),
    files,
    data: (sha256) => {
      if (!known.has(sha256)) return null;
      const name = `files/${sha256}`;
      try {
        return unzipSync(bytes, { filter: (f) => f.name === name && f.originalSize <= MOST_FILE })[name] ?? null;
      } catch {
        return null;
      }
    },
  };
}
