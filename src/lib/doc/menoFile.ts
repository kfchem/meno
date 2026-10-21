/**
 * The workspace file, `.meno` (docs/FILE-IO.md, *The workspace file*): a
 * zip, laid out as EPUB and ODF lay theirs out.
 *
 *   mimetype          first, stored: what the file is, for Meno to tell it by
 *   meno.json         stored, where there is one: what it holds (`MenoKind`) -
 *                     a workspace where there is none, as every file was before
 *   workspace.json    stored: the workspace (Workspace/utils/workspace)
 *   files.json        stored: each file kept - its name, kind, media type, size
 *   files/<sha256>    each file kept, as it was: text and a step's job files
 *                     deflated, the rest stored
 *
 * The workspace stays plain JSON, uncompressed, so that opening one costs
 * what reading the JSON costs and it reads as it is once unzipped. The files
 * kept - calculations' outputs opened, later PDFs and pictures - are read
 * only when wanted, each by its SHA-256, which is what the workspace knows
 * it by, and taken only if they are what it says. Nothing is ever unpacked
 * to the disk; what the file says of its sizes is held to limits before
 * anything is inflated, and nothing is inflated to more than it says, or
 * taken if it comes to less. A workspace is written only within the limits
 * it is read with.
 */
import { strFromU8, strToU8, zipSync, type Zippable } from "fflate";
import { sha256Hex } from "../binary/sha256";
import { entryBytes, zipEntries } from "../binary/zip";

export const MENO_MEDIA_TYPE = "application/vnd.kfchem.meno+zip";

/** The media type a step's job's file is kept as (Workspace/workflow/keptJobs): any file a program wrote, read by Meno only as it was. */
export const JOB_FILE_MEDIA = "application/octet-stream";

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

/** The most a workspace's own JSON may come to, any one file it keeps, and how many it keeps: read so, and written so. */
export const MOST_WORKSPACE = 256 * 1024 * 1024;
export const MOST_FILE = 1024 * 1024 * 1024;
export const MOST_FILES = 10_000;

const SHA = /^[0-9a-f]{64}$/;

/** A size as the limits are set in - megabytes, or gigabytes from one up - rounded up, so that one past a limit never reads as the limit. */
const sized = (n: number) => (n >= 2 ** 30 ? `${Math.ceil((n / 2 ** 30) * 10) / 10} GB` : `${Math.ceil(n / 2 ** 20)} MB`);

/** Whether `bytes` - a file's start will do - are a workspace file: a zip whose first entry, stored, says it is one. */
export function isMenoFile(bytes: Uint8Array): boolean {
  const at = (i: number) => bytes[i] | (bytes[i + 1] << 8);
  if (bytes.length < 30 || at(0) !== 0x4b50 || at(2) !== 0x0403 || at(8) !== 0) return false;
  const nameLength = at(26);
  const start = 30 + nameLength + at(28);
  const name = strFromU8(bytes.subarray(30, 30 + nameLength));
  return name === "mimetype" && strFromU8(bytes.subarray(start, start + MENO_MEDIA_TYPE.length)) === MENO_MEDIA_TYPE;
}

/**
 * A workspace written as its file, with the files it keeps - and those it
 * lists whose bytes are added to it after, from the disk (`listed`: a
 * step's job files, src-tauri keptjobs.rs). Throws, saying why, where it
 * would come to more than a workspace file is read with (`readMenoFile`):
 * a file that would not open again is not written.
 */
export function menoFileBytes(workspace: string, files: readonly KeptData[], listed: readonly KeptFile[] = []): Uint8Array {
  // (a string's UTF-8 is at least as long as the string: one far too long is not turned into bytes to be told so)
  const json = workspace.length <= MOST_WORKSPACE ? strToU8(workspace) : null;
  if (!json || json.length > MOST_WORKSPACE) {
    throw new Error(`A workspace file holds a workspace of at most ${sized(MOST_WORKSPACE)}; this one comes to ${sized(json?.length ?? workspace.length)}.`);
  }
  const index: Record<string, Omit<KeptFile, "sha256">> = {};
  const entries: Zippable = {
    mimetype: [strToU8(MENO_MEDIA_TYPE), { level: 0 }],
    "workspace.json": [json, { level: 0 }],
  };
  const kept: Zippable = {};
  let count = 0;
  for (const f of files) {
    if (!SHA.test(f.sha256) || index[f.sha256]) continue;
    if (f.data.length > MOST_FILE) throw new Error(`A workspace file keeps no file of more than ${sized(MOST_FILE)}; "${f.name}" comes to ${sized(f.data.length)}.`);
    index[f.sha256] = { name: f.name, ...(f.kind ? { kind: f.kind } : {}), media: f.media, size: f.data.length };
    kept[`files/${f.sha256}`] = [f.data, { level: f.media.startsWith("text/") || f.media === JOB_FILE_MEDIA ? 6 : 0 }];
    count++;
  }
  for (const f of listed) {
    if (!SHA.test(f.sha256) || index[f.sha256]) continue;
    if (f.size > MOST_FILE) throw new Error(`A workspace file keeps no file of more than ${sized(MOST_FILE)}; "${f.name}" comes to ${sized(f.size)}.`);
    index[f.sha256] = { name: f.name, media: f.media, size: f.size };
    count++;
  }
  if (count > MOST_FILES) throw new Error(`A workspace file keeps at most ${MOST_FILES.toLocaleString("en")} files; this workspace would keep ${count.toLocaleString("en")}.`);
  // (the list of them - a few hundred bytes a file - cannot come near the workspace's limit, which it is read with)
  entries["files.json"] = [strToU8(JSON.stringify(index, null, 1)), { level: 0 }];
  return zipSync({ ...entries, ...kept });
}

/** A workspace file read: its workspace, the files it keeps, and each one's bytes, read when wanted. */
export type MenoFile = {
  workspace: string;
  files: KeptFile[];
  /** A file kept, by its SHA-256: its bytes; none where it keeps none such, it will not read, or it is not what its SHA-256 says. */
  data(sha256: string): Uint8Array | null;
};

/** What a file not one Meno reads as a workspace is said to be. */
export class NotMenoFile extends Error {}

/** What a Meno file of a kind this Meno does not know - made by a newer one - is said to be. */
export class NewerMenoFile extends NotMenoFile {}

/**
 * What a Meno file holds, as its `meno.json` says (docs/FILE-IO.md, *What a
 * .meno holds*): a workspace - every file with none says so - or styles,
 * the user's own, to be added to theirs. A template, later, will be a
 * workspace opened as a new, untitled copy.
 */
export type MenoKind = "workspace" | "style";
const KINDS: readonly string[] = ["workspace", "style"];

/** The most a file's own description, or its styles, may come to. */
const MOST_SMALL = 1024 * 1024;
/** The most a style file's picture may come to. */
const MOST_PICTURE = 8 * 1024 * 1024;

/**
 * What a Meno file holds: a workspace, where it does not say. Throws, as
 * `NewerMenoFile`, where it says a kind this Meno does not know; as
 * `NotMenoFile` where it is not a Meno file, or damaged.
 */
export function menoKindOf(bytes: Uint8Array): MenoKind {
  if (!isMenoFile(bytes)) throw new NotMenoFile("It is not a Meno file.");
  const entries = zipEntries(bytes);
  if (!entries) throw new NotMenoFile("It is a Meno file cut short or damaged, and cannot be read.");
  const head = entries.find((e) => e.name === "meno.json");
  if (!head) return "workspace";
  const json = head.size <= MOST_SMALL ? entryBytes(head) : null;
  let kind: unknown;
  try {
    kind = json ? (JSON.parse(strFromU8(json)) as { kind?: unknown }).kind : undefined;
  } catch {
    kind = undefined;
  }
  if (typeof kind !== "string") throw new NotMenoFile("It is a Meno file that does not say what it holds.");
  if (!KINDS.includes(kind)) throw new NewerMenoFile("It was made by a newer Meno, and holds what this Meno cannot open.");
  return kind as MenoKind;
}

/** Styles written as a Meno file (`MenoKind` "style"): their JSON (lib/chem/styleFile) and, where there is one, a picture of them. */
export function styleFileBytes(styles: string, picture?: Uint8Array | null): Uint8Array {
  const json = strToU8(styles);
  if (json.length > MOST_SMALL) throw new Error(`A style file holds styles of at most ${sized(MOST_SMALL)}; these come to ${sized(json.length)}.`);
  const entries: Zippable = {
    mimetype: [strToU8(MENO_MEDIA_TYPE), { level: 0 }],
    "meno.json": [strToU8(JSON.stringify({ kind: "style" })), { level: 0 }],
    "style.json": [json, { level: 0 }],
  };
  if (picture && picture.length <= MOST_PICTURE) entries["picture.png"] = [picture, { level: 0 }];
  return zipSync(entries);
}

/** A style file read: its styles' JSON, and its picture where it has one. Throws, saying why, where it is no style file or does not read. */
export function readStyleFile(bytes: Uint8Array): { styles: string; picture: Uint8Array | null } {
  if (menoKindOf(bytes) !== "style") throw new NotMenoFile("It is not a style file.");
  const entries = zipEntries(bytes)!;
  const named = new Map(entries.map((e) => [e.name, e]));
  const head = named.get("style.json");
  const json = head && head.size <= MOST_SMALL ? entryBytes(head) : null;
  if (!json) throw new NotMenoFile("It is a style file that holds no styles.");
  const pic = named.get("picture.png");
  return { styles: strFromU8(json), picture: pic && pic.size <= MOST_PICTURE ? entryBytes(pic) : null };
}

/**
 * A workspace file read: its workspace's JSON and the list of files it
 * keeps, nothing else inflated. Throws, saying why, where it is not one, or
 * says of itself more than Meno takes in.
 */
export function readMenoFile(bytes: Uint8Array): MenoFile {
  if (!isMenoFile(bytes)) throw new NotMenoFile("It is not a Meno workspace.");
  // (begun as a workspace, but not read through: said so, not in the zip reader's words)
  const damaged = () => new NotMenoFile("It is a Meno workspace cut short or damaged, and cannot be read.");
  const entries = zipEntries(bytes);
  if (!entries) throw damaged();
  if (entries.length > MOST_FILES + 3) throw new NotMenoFile("It holds more files than Meno takes in.");
  const named = new Map(entries.map((e) => [e.name, e]));
  const head = named.get("workspace.json");
  if (!head) throw new NotMenoFile("It holds no workspace.");
  if (head.size > MOST_WORKSPACE) throw new NotMenoFile("Its workspace is larger than Meno takes in.");
  const json = entryBytes(head);
  if (!json) throw damaged();
  const list = named.get("files.json");
  const listed = list && list.size <= MOST_WORKSPACE ? entryBytes(list) : null;
  const files: KeptFile[] = [];
  try {
    const index = JSON.parse(strFromU8(listed ?? strToU8("{}"))) as Record<string, Partial<KeptFile>>;
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
      const entry = known.has(sha256) ? named.get(`files/${sha256}`) : undefined;
      if (!entry || entry.size > MOST_FILE) return null;
      const data = entryBytes(entry);
      // every file kept - an output, a text, a PDF, a picture - is "taken only if they are what it says"
      // (docs/FILE-IO.md, *The workspace file*): bytes that are not what their SHA-256 says are no such file
      return data && sha256Hex(data) === sha256 ? data : null;
    },
  };
}
