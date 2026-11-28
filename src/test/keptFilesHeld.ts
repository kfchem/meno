/**
 * A workspace's file as Save writes it, in tests that have no Meno backend:
 * `workspaceFile` with the backend's part stood in for here - where its own
 * files are (src-tauri keptjobs.rs `kept_where`: the file last saved to, as
 * the file system plugin reads it, each file in it taken only if it is what
 * its SHA-256 says), what the page sends set down, and each added to the
 * file the page wrote as Meno adds it (`append_job_files`: a text deflated,
 * the rest stored, in the order listed). Job files are left to their own
 * tests.
 */
import { readFile } from "@tauri-apps/plugin-fs";
import { unzipSync, zipSync, type Zippable } from "fflate";
import { readMenoFile, type MenoFile } from "../lib/doc/menoFile";
import type { FoundKeptFile, KeptFilesWhere } from "../lib/jobs";
import { sendPieces, type JobsKept } from "../ui/features/Workspace/workflow/keptJobs";
import { workspaceFile, type SavedFile } from "../ui/features/Workspace/utils/workspace";

type State = Parameters<typeof workspaceFile>[0];

/** The workspace file at `path`, read: none where it is not there; `false` where it does not read as one. */
async function opened(path: string): Promise<MenoFile | null | false> {
  const bytes = await readFile(path).catch(() => null);
  if (!bytes) return null;
  try {
    return readMenoFile(bytes);
  } catch {
    return false;
  }
}

export async function heldFile(state: State, jobs?: JobsKept): Promise<SavedFile> {
  const staged = new Map<string, Uint8Array>();
  const files = new Map<string, MenoFile | null | false>();
  const at = async (p: string) => (files.has(p) ? files.get(p)! : (files.set(p, await opened(p)), files.get(p)!));
  const where = async (_target: string, saved: string | null, places: readonly string[], asked: readonly { sha256: string }[]): Promise<KeptFilesWhere> => {
    const found: (FoundKeptFile | null)[] = [];
    for (const a of asked) {
      let hit = null;
      for (const p of places) {
        const f = await at(p);
        const data = f ? f.data(a.sha256) : null;
        if (data) {
          hit = { from: p, size: data.length, packed: data.length };
          break;
        }
      }
      found.push(hit);
    }
    const last = saved ? await at(saved) : null;
    const holds = last === false || (!!last && asked.some((a, k) => !found[k] && last.holds(a.sha256)));
    return { found, holds };
  };
  const file = await workspaceFile(state, jobs, { where });
  await sendPieces(file, async (_save, sha256, bytes) => void staged.set(sha256, bytes));
  const entries: Zippable = Object.fromEntries(Object.entries(unzipSync(file.bytes)).map(([name, data]) => [name, [data, { level: 0 }]]));
  for (const a of file.appended) {
    const from = a.from ? await at(a.from) : null;
    const data = a.staged ? staged.get(a.sha256) : from ? from.data(a.sha256) : null;
    if (data) entries[`files/${a.sha256}`] = [data, { level: a.media?.startsWith("text/") ? 6 : 0 }];
  }
  return { ...file, bytes: zipSync(entries) };
}
