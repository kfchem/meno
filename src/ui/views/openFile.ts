import type { TabKind } from "../../lib/core";
import { cataloguedKinds, kindOf, kinds, MARK_REACH, MENO_KINDS, textKinds, type Kind } from "../../lib/io/kinds";
import { opensAsText } from "../features/Workspace/utils/io";
import { keptNamedIn, workspaceProblem } from "../features/Workspace/utils/workspace";
import { holdOutputsOf } from "../../lib/calc/asks";
import { holdPdfsOf } from "../../lib/pdf/reader";
import { holdPicturesOf } from "../../lib/picture/held";
import { holdJobFilesOf, type OpenedFrom } from "../features/Workspace/workflow/keptJobs";
import { isMenoFile, menoKindOf, NotMenoFile, readMenoFile, readStyleFile } from "../../lib/doc/menoFile";
import { readStyleFileText, type StyleFile } from "../../lib/chem/styleFile";
import { useNotices } from "../notices";
import { listOnline, onlineEntry, useOnline } from "../../lib/plugins/online";
import type { CatalogueEntry } from "../../lib/plugins/catalogue";
import { anyPluginById, type Plugin } from "../../lib/calc/catalog";
import { addPlugin } from "../../lib/calc/workers";
import { addOnline } from "../../lib/calc/addOnline";
import type { OpenedText } from "./texts";

/** What a file opens as: a tab of `kind`, named for the file, holding `data`. */
export type Opened = { kind: TabKind; label: string; data: Record<string, unknown> };

const EXT_TEXT = new Set([
  "txt", "md", "markdown", "json", "csv", "tsv", "yaml", "yml", "ini", "cfg", "log",
  "js", "ts", "tsx", "py", "c", "cpp", "css", "html",
]);

/**
 * Files nothing told, opened as texts while the plugins online are not
 * listed (lib/plugins/online): one of them may read them. Said in the
 * corner, once for those opened together, with the button that lists them
 * - nothing fetched without it. Once they are listed, the same notice says,
 * in its place, what each now told is and which plugin reads it, with Add:
 * the plugin added - got first, where it is on offer online - and the file
 * read again as what it is (`again`). A text of a plain kind - a note, a
 * table, code - is not said; a log is.
 */
export function sayNoneTold(names: readonly string[], again: (told: string[]) => void, tell: (name: string) => Promise<Kind | null>): void {
  const said = names.filter((n) => !EXT_TEXT.has(n.split(".").pop()?.toLowerCase() ?? "") || /\.log$/i.test(n));
  if (!said.length || useOnline.getState().state === "listed") return;
  const notices = useNotices.getState();
  const id = "none-told";
  const title = "Opened as text";
  notices.show({
    id,
    title,
    text: `No plugin added reads ${said.join(", ")}.`,
    stays: true,
    action: {
      label: "List the plugins online",
      keeps: true,
      run: () => {
        notices.show({ id, title, text: "Listing the plugins online…", stays: true });
        void listOnline(true).then(async () => {
          const s = useOnline.getState();
          if (s.state !== "listed") return notices.show({ id, title, text: s.problem ?? `No plugin added reads ${said.join(", ")}.` });
          const offers = (await Promise.all(said.map(async (name) => ({ name, kind: await tell(name) })))).flatMap(({ name, kind }) => {
            const by = kind ? whoWouldRead(kind) : null;
            return kind && by ? [{ name, kind, by }] : [];
          });
          if (!offers.length) return notices.show({ id, title, text: `No plugin online reads ${said.join(", ")}.` });
          // (each file told with the plugin that reads it: the first in the notice's place, the others beside it)
          offers.forEach(({ name, kind, by }, k) => {
            const its = k === 0 ? id : `${id} ${name}`;
            notices.show({
              id: its,
              title,
              text: `${name} is ${kind.name}: the ${by.name} plugin reads it.`,
              stays: true,
              action: {
                label: `Add ${by.name}`,
                keeps: true,
                run: () => {
                  notices.show({ id: its, title, text: `Adding ${by.name}…`, stays: true });
                  (by.plugin ? addPlugin(by.plugin) : addOnline(by.entry!)).then(
                    () => {
                      notices.dismiss(its);
                      again([name]);
                    },
                    (e: unknown) => notices.show({ id: its, title, text: e instanceof Error ? e.message : String(e) }),
                  );
                },
              },
            });
          });
        });
      },
    },
  });
}

/** The plugin that reads a kind only plugins not added read: the first it names (lib/io/kinds `offeredKinds`) - here, or on offer online. */
function whoWouldRead(kind: Kind): { name: string; plugin?: Plugin; entry?: CatalogueEntry } | null {
  for (const id of kind.suggest ?? []) {
    const plugin = anyPluginById(id);
    if (plugin) return { name: plugin.name, plugin };
    const entry = onlineEntry(id);
    if (entry) return { name: entry.name, entry };
  }
  return null;
}

/**
 * The files Open offers, as it is asked: every kind Meno takes in
 * (lib/io/kinds) - its own, those the plugins added bring, and those only
 * plugins not added read, so that one of them can be suggested - and text: what the plugins added know besides - a
 * calculation's input they write, or colour - to be read and changed in a
 * workspace's column.
 */
export function openable(): string[] {
  return [
    ...new Set([
      ...kinds().flatMap((k) => k.extensions),
      ...cataloguedKinds().flatMap((k) => k.extensions),
      ...textKinds().flatMap((k) => k.extensions),
      ...[...EXT_TEXT].map((ext) => `.${ext}`),
      // (a PDF goes on the page: docs/PDF.md - and a picture)
      ".pdf",
      ".png",
      ".jpg",
      ".jpeg",
    ]),
  ];
}

/** A Meno file of styles, as it opens: what it holds, and its picture. */
export type OpenedStyles = { styles: StyleFile; picture: Uint8Array | null };

/**
 * A Meno file's styles, where `bytes` are a Meno file of kind "style"; none
 * for any other. Throws, saying why, where they are one that does not read
 * - or a Meno file of a kind made by a newer Meno.
 */
export function stylesOfFile(bytes: Uint8Array): OpenedStyles | null {
  if (!isMenoFile(bytes) || menoKindOf(bytes) !== "style") return null;
  const file = readStyleFile(bytes);
  const styles = readStyleFileText(file.styles);
  if (!styles) throw new NotMenoFile("It is a style file whose styles do not read.");
  return { styles, picture: file.picture };
}

/**
 * Why a file told to be a Meno workspace - by its name, or what it holds -
 * is not opened: none where it reads, or `bytes` were no zip but a text
 * that is the workspace's JSON. Said as "<name> could not be read: ...",
 * so that a `.meno` that is none (cut short, not a Meno file at all, saved
 * by a newer Meno) is never dropped without a word.
 */
export function unreadWorkspaceSaid(name: string, text: string, kind: Kind | null): string | null {
  if (kind?.id !== MENO_KINDS.workspace.id) return null;
  const problem = workspaceProblem(text);
  return problem ? `${name} could not be read: ${problem}.` : null;
}

/**
 * A workspace file's workspace, its JSON - where `bytes` are one - with the
 * outputs it keeps held for the session, each read from it when wanted
 * (lib/calc/asks). None where they are no workspace file; throws, saying
 * why, where they are one that does not read. Its list of the files it
 * keeps damaged or gone, they are had as its workspace names them, and the
 * list is said to be damaged, the file by its `name`. Where it was opened
 * from (`from`), its steps' job files are read from there as it is saved
 * again, while it is as it was (workflow/keptJobs).
 */
export function workspaceOfFile(bytes: Uint8Array, name = "This workspace", from?: OpenedFrom): string | null {
  if (!isMenoFile(bytes)) return null;
  // (a Meno file says what it holds: a workspace where it does not - a kind this Meno does not know, said so)
  if (menoKindOf(bytes) !== "workspace") return null;
  const file = readMenoFile(bytes, keptNamedIn);
  if (file.listDamaged) useNotices.getState().show({ id: `files-list-damaged:${name}`, title: "Part of a workspace is damaged", text: `${name}: its list of the files it keeps is damaged. Its files were opened without it.` });
  holdOutputsOf(file);
  // (a PDF it keeps that cannot be held would be blank: said, by its name)
  holdPdfsOf(file, (name, why) => useNotices.getState().show({ id: `pdf-not-held:${name}`, title: "A PDF could not be opened", text: `${name}, in this workspace: ${why}.` }));
  holdPicturesOf(file);
  // (its steps' jobs' files: written back out only when wanted, where their folders are not on this computer)
  holdJobFilesOf(file, from);
  return file.workspace;
}

/**
 * The canvas a file opens on, by what it is (lib/io/kinds): a Meno
 * workspace, a structure, a calculation's output - told what it is so that
 * it is not asked again; and anything else as text, held in the workspace
 * and shown in its column (`textsOf`: the app gives texts to the canvas in
 * front, where there is one - ui/views/texts). `path`, where the file has
 * one, goes with it; `kind`, where it was told otherwise - by a plugin, asked.
 */
export function openedAs(name: string, text: string, path?: string, kind: Kind | null = kindOf(name, text)): Opened {
  if (kind) return { kind: "workspace", label: name, data: { filename: name, payload: text, kind: kind.id, ...(path ? { path } : {}) } };
  // (not a text - bytes, or a kind Meno says it does not read yet: read as a drop reads it, and said so as it says it - utils/io `opensAsText`)
  if (!opensAsText(name, text.slice(0, MARK_REACH))) return { kind: "workspace", label: name, data: { filename: name, payload: text, ...(path ? { path } : {}) } };
  return openedTexts([{ name, text, ...(path ? { path } : {}) }]);
}

/** Texts opened, on a canvas of their own where none takes them: named for the first, as for any file opened. */
export function openedTexts(texts: OpenedText[]): Opened {
  const [first] = texts;
  return {
    kind: "workspace",
    label: first?.name || "Untitled.txt",
    data: { texts, ...(first?.name ? { filename: first.name } : {}), ...(first?.path ? { path: first.path } : {}) },
  };
}

/** The texts a file opened is, where it is text. */
export function textsOf(opened: Opened): OpenedText[] | undefined {
  return (opened.data as { texts?: OpenedText[] }).texts;
}
