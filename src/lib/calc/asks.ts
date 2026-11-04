/**
 * Promises (./results `Ask`) asked for, and kept: the outputs opened this
 * session, by their SHA-256, to send again to the reader that gave a
 * promise when it is wanted - readers keep nothing between - and what each
 * promise came to, once given. None of it is saved: a workspace saves the
 * values a molecule is showing (`calcShowing`), and a promise not yet given
 * is asked for from its output. The outputs are kept in the workspace file
 * as it is saved (`outputsToKeep`), and held again as it is opened, each
 * read from it only when wanted (`holdOutputsOf`). One held nowhere is read
 * again where it was (its source's `path`) - where Meno may still read it,
 * and only if it is unchanged - and else the chemist is asked for it
 * (`findOutput`), the file chosen taken only if it is the same.
 */
import { create } from "zustand";
import { isTauri } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import type { KeptData, MenoFile } from "../doc/menoFile";
import { readerById, readerIdOfLine, type ReaderPlugin } from "./catalog";
import { kindOf } from "../io/kinds";
import { textOf } from "../io/text";
import type { Reader } from "./client";
import type { GridPlace } from "./grids";
import type { CalcInfo, CalcSource } from "./output";
import { isAsk, resultKey, resultsOn, type ListResult } from "./results";
import { readerClient } from "./workers";

/** The outputs held this session, by SHA-256: each its name and text - or, held in a workspace file opened, how to read its text. */
const outputs = new Map<string, { name: string; text?: string; kind?: string; read?: () => string | null }>();
const given = new Map<string, unknown>();
const underWay = new Map<string, Promise<unknown>>();

/** What went wrong asking for a promise; `missing`, where it is that its output is not to be had - the chemist may find it. */
export type AskError = { error: string; missing?: true };

/** Each promise asked for, by key: being worked out, given, or what went wrong. */
export const useAsks = create<{ state: Record<string, "asking" | "given" | AskError> }>(() => ({ state: {} }));

/** A text's SHA-256, of its UTF-8, in hex: what an output - or a workspace's text - is known by. */
export async function sha256Of(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Keeps an opened output for the session: what its promises are asked for from - its name, its kind, its SHA-256, and where it is, where Open said. */
export async function rememberOutput(name: string, text: string, kind: string, path?: string): Promise<CalcSource> {
  const hash = await sha256Of(text);
  outputs.set(hash, { name, text, kind });
  return { name, sha256: hash, kind, ...(path ? { path } : {}) };
}

/** An output held this session, its text read where it was held in a file - and taken only if it is what its SHA-256 says. */
export async function heldOutput(hash: string): Promise<{ name: string; text: string } | undefined> {
  const held = outputs.get(hash);
  if (!held) return undefined;
  if (held.text != null) return { name: held.name, text: held.text };
  const text = held.read?.() ?? null;
  if (text == null || (await sha256Of(text)) !== hash) {
    outputs.delete(hash);
    return undefined;
  }
  held.text = text;
  delete held.read;
  return { name: held.name, text };
}

/** The outputs a workspace file keeps, held for the session as it is opened - each read from it only when wanted. */
export function holdOutputsOf(file: MenoFile): void {
  // (its bytes as they were written, a byte-order mark kept: a text from Notepad
  // began with one, and without it its SHA-256 was not its own - it was lost)
  const decoder = new TextDecoder("utf-8", { ignoreBOM: true });
  for (const f of file.files) {
    if (!f.media.startsWith("text/") || outputs.has(f.sha256)) continue;
    outputs.set(f.sha256, {
      name: f.name,
      ...(f.kind ? { kind: f.kind } : {}),
      read: () => {
        const bytes = file.data(f.sha256);
        return bytes ? decoder.decode(bytes) : null;
      },
    });
  }
}

/** A file's text, read where it is: none where Meno may not read it there, or it is not there. */
export type ReadAt = (path: string) => Promise<string | null>;

const readAt: ReadAt = async (path) => {
  if (!isTauri()) return null;
  // (as Open reads: bytes, as lib/io/text reads them - the text its hash was taken of)
  return readFile(path).then((bytes) => textOf(bytes), () => null);
};

/** An output kept where it was, read again: its text, where it is there and unchanged - the same SHA-256 - and kept for the session; else none. */
async function foundAt(source: CalcSource, read: ReadAt): Promise<{ name: string; text: string } | null> {
  if (!source.path) return null;
  const text = await read(source.path);
  if (text == null || (await sha256Of(text)) !== source.sha256) return null;
  const output = { name: source.name, text };
  outputs.set(source.sha256, { ...output, ...(source.kind ? { kind: source.kind } : {}) });
  return output;
}

/**
 * An output a molecule was read from, as it can be had now: held this
 * session - opened, or kept in a workspace opened - or read again where it
 * was; none where it cannot be had.
 */
export async function outputOf(source: CalcSource, read: ReadAt = readAt): Promise<{ name: string; text: string } | undefined> {
  return (await heldOutput(source.sha256)) ?? (await foundAt(source, read)) ?? undefined;
}

/**
 * The outputs a workspace's molecules were read from, as its file keeps
 * them: each once, as text - held this session, or read again where it was
 * (`outputOf`) - and each that could be had neither way (`notKept`).
 */
export async function outputsToKeep(sources: readonly CalcSource[], read: ReadAt = readAt): Promise<{ kept: KeptData[]; notKept: CalcSource[] }> {
  const encoder = new TextEncoder();
  const kept: KeptData[] = [];
  const notKept: CalcSource[] = [];
  for (const s of new Map(sources.map((x) => [x.sha256, x])).values()) {
    const had = await outputOf(s, read);
    if (had) kept.push({ sha256: s.sha256, name: had.name, ...(s.kind ? { kind: s.kind } : {}), media: "text/plain", data: encoder.encode(had.text) });
    else notKept.push(s);
  }
  return { kept, notKept };
}

/** The chosen file, as asked for: its path and its text; none where none was chosen. */
export type Pick = (source: CalcSource) => Promise<{ path: string; text: string } | null>;

const pickWithDialog: Pick = async (source) => {
  const picked = await openDialog({ title: `Find ${source.name}`, defaultPath: source.path ?? source.name, multiple: false });
  if (typeof picked !== "string") return null;
  const text = await readAt(picked);
  return text == null ? null : { path: picked, text };
};

/**
 * The chemist asked for an output that is not to be had - not opened this
 * session, not where it was: the file chosen is taken if it is that output,
 * unchanged, and the promises that waited on it are asked for again.
 * Whether one was taken; throws, saying why, where the file chosen is
 * another.
 */
export async function findOutput(source: CalcSource, pick: Pick = pickWithDialog): Promise<boolean> {
  const chosen = await pick(source);
  if (!chosen) return false;
  // (what failed for want of it: said again, or asked for again as it is next wanted)
  const waited = `${source.sha256}\u0000`;
  const waiting = ([k, s]: [string, unknown]) => k.startsWith(waited) && typeof s === "object";
  if ((await sha256Of(chosen.text)) !== source.sha256) {
    const error = `That is not the ${source.name} this molecule was read from: it has changed since, or it is another file.`;
    useAsks.setState((was) => ({ state: Object.fromEntries(Object.entries(was.state).map(([k, s]) => [k, waiting([k, s]) ? { error, missing: true as const } : s])) }));
    throw new Error(error);
  }
  outputs.set(source.sha256, { name: source.name, text: chosen.text, ...(source.kind ? { kind: source.kind } : {}) });
  useAsks.setState((was) => ({ state: Object.fromEntries(Object.entries(was.state).filter((e) => !waiting(e))) }));
  return true;
}

/** What a promise is known by, among every molecule's: its output, the reader that gave it - by id - and its key. */
export const askKey = (source: CalcSource | undefined, from: string | undefined, key: string) => `${source?.sha256 ?? "-"}\u0000${from ?? ""}\u0000${key}`;

/** What a promise came to, where it has been given. */
export function givenValue(source: CalcSource | undefined, from: string | undefined, key: string): unknown {
  return given.get(askKey(source, from, key));
}

const setState = (k: string, s: "asking" | "given" | AskError) => useAsks.setState((was) => ({ state: { ...was.state, [k]: s } }));

/**
 * Asks the reader that gave a promise (`from`, its id) what it stands for,
 * sending the output again, and its kind; resolved once given. Where the
 * output is not open this session, it is read again where it was, if it is
 * there unchanged; where it is not, says so, as `missing`.
 */
export function askFor(
  calc: CalcInfo,
  from: string | undefined,
  key: string,
  /** The reader a plugin is asked through: its worker, or the one that comes with Meno (tests hand in their own). */
  readerOf: (p: ReaderPlugin) => Promise<Reader> = readerClient,
  /** How an output is read again where it was (tests hand in their own). */
  read: ReadAt = readAt,
  /** The grid Meno lays the molecule's values on, where the promise may be some (./grids `gridAbout`). */
  grid?: GridPlace,
): Promise<unknown> {
  const k = askKey(calc.source, from, key);
  if (given.has(k)) return Promise.resolve(given.get(k));
  // (asked for twice while it is worked out: worked out once)
  if (!underWay.has(k)) underWay.set(k, ask(calc, from, key, k, readerOf, read, grid).finally(() => underWay.delete(k)));
  return underWay.get(k)!;
}

async function ask(
  calc: CalcInfo,
  from: string | undefined,
  key: string,
  k: string,
  readerOf: (p: ReaderPlugin) => Promise<Reader>,
  read: ReadAt,
  grid: GridPlace | undefined,
): Promise<unknown> {
  const output = calc.source ? await outputOf(calc.source, read) : undefined;
  if (!calc.source || !output) {
    const error = `Open ${calc.source?.name ?? "the calculation's output"} again to show this.`;
    setState(k, { error, ...(calc.source ? { missing: true as const } : {}) });
    throw new Error(error);
  }
  const who = from ?? readerIdOfLine(calc.readers[0] ?? "");
  const plugin = readerById(who);
  // (its kind as it was told; or, kept before kinds were, told again)
  const kind = calc.source.kind ?? kindOf(output.name, output.text)?.id;
  if (!plugin || !kind) {
    const error = plugin ? `What ${output.name} is cannot be told.` : `${who} is not a reader Meno knows of.`;
    setState(k, { error });
    throw new Error(error);
  }
  setState(k, "asking");
  try {
    const value = await (await readerOf(plugin)).ask(kind, key, output.name, output.text, grid);
    given.set(k, value);
    setState(k, "given");
    return value;
  } catch (e) {
    setState(k, { error: e instanceof Error ? e.message : String(e) });
    throw e;
  }
}

/**
 * A molecule's calculation with the promises of the row its list shows -
 * its motion, its surface - given where they have been: what a workspace
 * saves of it, so that it opens showing what it showed. `list` is the
 * list's `resultKey`.
 */
export function calcShowing(calc: CalcInfo, list: string, row: number | null): CalcInfo {
  if (row == null || !calc.results) return calc;
  const target = resultsOn(calc.results, "list").find((r) => resultKey(r) === list);
  const shown = target?.rows[row];
  if (!target || !shown) return calc;
  const swap = (v: unknown) => (isAsk(v) && givenValue(calc.source, target.from, v.ask) !== undefined ? givenValue(calc.source, target.from, v.ask) : v);
  const rows = target.rows.map((r, i) =>
    i === row
      ? { ...r, ...(r.move ? { move: swap(r.move) } : {}), ...(r.surface ? { surface: swap(r.surface) } : {}), ...(r.colour ? { colour: { ...r.colour, by: swap(r.colour.by) } } : {}) }
      : r,
  );
  return { ...calc, results: calc.results.map((r) => (r === target ? ({ ...target, rows } as ListResult) : r)) } as CalcInfo;
}
