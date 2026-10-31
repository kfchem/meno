import type { TabKind } from "../../lib/core";
import { cataloguedKinds, kindOf, kinds, MARK_REACH, textKinds, type Kind } from "../../lib/io/kinds";
import { opensAsText } from "../features/Workspace/utils/io";
import { keptNamedIn } from "../features/Workspace/utils/workspace";
import { holdOutputsOf } from "../../lib/calc/asks";
import { holdPdfsOf } from "../../lib/pdf/reader";
import { holdPicturesOf } from "../../lib/picture/held";
import { holdJobFilesOf, type OpenedFrom } from "../features/Workspace/workflow/keptJobs";
import { isMenoFile, menoKindOf, NotMenoFile, readMenoFile, readStyleFile } from "../../lib/doc/menoFile";
import { readStyleFileText, type StyleFile } from "../../lib/chem/styleFile";
import { useNotices } from "../notices";
import type { OpenedText } from "./texts";

/** What a file opens as: a tab of `kind`, named for the file, holding `data`. */
export type Opened = { kind: TabKind; label: string; data: Record<string, unknown> };

const EXT_TEXT = new Set([
  "txt", "md", "markdown", "json", "csv", "tsv", "yaml", "yml", "ini", "cfg", "log",
  "js", "ts", "tsx", "py", "c", "cpp", "css", "html",
]);

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
