import { invoke, isTauri } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { create } from "zustand";
import plexSans from "../../assets/fonts/IBMPlexSans-Regular.ttf?url";
import plexSansJp from "../../assets/fonts/IBMPlexSansJP-Regular.ttf?url";
import { drawableByTextRenderer } from "./drawable";
import "./textRenderer";
import {
  addFallbackGlyphs,
  DEFAULT_LABEL_FAMILY,
  readGlyphs,
  registerGlyphs,
} from "../../lib/chem/labelFonts";
import { isTypefaceName } from "../../lib/chem/styleFields";

/**
 * The font files atom labels are drawn from, and the letters the layout
 * places them by. A typeface is read once, when first used: from Meno's own
 * files for the ones that come with it, from the system's for any other.
 * Nothing is fetched. What a label's typeface lacks - Japanese, in a Latin
 * typeface - comes from IBM Plex Sans JP, and a typeface that cannot be had
 * is drawn, and placed, in IBM Plex Sans.
 */

/** The typefaces that come with Meno, by their files. */
export const BUNDLED_TYPEFACES: Readonly<Record<string, string>> = {
  "IBM Plex Sans": plexSans,
  "IBM Plex Sans JP": plexSansJp,
};

/** Where a label's characters its own typeface lacks come from. */
export const FALLBACK_TYPEFACE = "IBM Plex Sans JP";

/**
 * Typefaces drawn to Arial's widths, tried in turn when a system has not
 * the one asked for: Arial's table places them all alike.
 */
const STAND_INS: Readonly<Record<string, readonly string[]>> = {
  arial: ["Liberation Sans", "Arimo", "Helvetica"],
  helvetica: ["Arial", "Liberation Sans", "Arimo"],
};

export type TypefaceState = "loading" | "ready" | "missing" | "unreadable";

type LabelFontsState = {
  /** Goes up whenever a typeface's letters are added, so layouts redo themselves. */
  version: number;
  /** How reading each typeface went, by the name it was asked for. */
  state: Readonly<Record<string, TypefaceState>>;
  /** The file each typeface is drawn from. */
  urls: Readonly<Record<string, string>>;
};

export const useLabelFonts = create<LabelFontsState>(() => ({
  version: 0,
  state: {},
  urls: {},
}));

const started = new Set<string>();

/** Starts reading `family`, once. */
export function requestTypeface(family: string): void {
  if (started.has(family)) return;
  started.add(family);
  const settle = (state: TypefaceState, url?: string) =>
    useLabelFonts.setState((s) => ({
      version: s.version + (state === "ready" ? 1 : 0),
      state: { ...s.state, [family]: state },
      urls: url ? { ...s.urls, [family]: url } : s.urls,
    }));
  useLabelFonts.setState((s) => ({
    state: { ...s.state, [family]: "loading" },
  }));
  void (async () => {
    const bytes = await typefaceBytes(family);
    if (!bytes) return settle("missing");
    // One the canvas could not draw from is as good as none.
    if (!drawableByTextRenderer(bytes)) return settle("unreadable");
    const url =
      BUNDLED_TYPEFACES[family] ??
      URL.createObjectURL(new Blob([bytes], { type: "font/ttf" }));
    try {
      const letters = readGlyphs(await readFont(bytes));
      registerGlyphs(family, letters);
      if (family === FALLBACK_TYPEFACE) addFallbackGlyphs(letters);
      settle("ready", url);
    } catch {
      settle("unreadable");
    }
  })();
}

/**
 * A font file read, a letter at a time as asked for - a Japanese font has
 * tens of thousands. The reader logs every table it passes over, a line
 * each; that is kept out of the console.
 */
async function readFont(bytes: ArrayBuffer) {
  const { parse } = await import("opentype.js/dist/opentype.mjs");
  const log = console.log;
  console.log = () => {};
  try {
    return parse(bytes, { lowMemory: true });
  } finally {
    console.log = log;
  }
}

async function typefaceBytes(family: string): Promise<ArrayBuffer | null> {
  const bundled = BUNDLED_TYPEFACES[family];
  if (bundled) {
    const response = await fetch(bundled).catch(() => null);
    return response?.ok ? response.arrayBuffer() : null;
  }
  if (!isTauri()) return null;
  for (const name of [family, ...(STAND_INS[family.toLowerCase()] ?? [])]) {
    const bytes = await invoke<ArrayBuffer>("font_file", {
      family: name,
    }).catch(() => null);
    if (bytes) return bytes;
  }
  return null;
}

/**
 * Once reading `family` - started now, if it was not - has come to an end,
 * as it went: ready, or not to be had (then drawn in the default typeface,
 * which is read too).
 */
export function typefaceRead(family: string): Promise<void> {
  requestTypeface(family);
  const read = () => {
    const state = useLabelFonts.getState().state[family];
    return state !== undefined && state !== "loading";
  };
  if (read()) return Promise.resolve();
  return new Promise((done) => {
    const stop = useLabelFonts.subscribe(() => {
      if (!read()) return;
      stop();
      done();
    });
  });
}

/** Whether any of `texts` has a character outside printable ASCII. */
export function needsFallback(texts: Iterable<string>): boolean {
  for (const t of texts) if (/[^\x20-\x7e]/.test(t)) return true;
  return false;
}

/**
 * Reads what labels in `family` need - and IBM Plex Sans JP too when
 * `fallback` is set - and gives the version of the letters known so far,
 * for a layout to redo itself by.
 */
export function useTypefaces(family: string, fallback = false): number {
  const state = useLabelFonts((s) => s.state[family]);
  useEffect(() => {
    requestTypeface(family);
    if (fallback) requestTypeface(FALLBACK_TYPEFACE);
    // a typeface that cannot be had is drawn in the default one
    if (state === "missing" || state === "unreadable")
      requestTypeface(DEFAULT_LABEL_FAMILY);
  }, [family, fallback, state]);
  return useLabelFonts((s) => s.version);
}

/**
 * The file labels in `family` are drawn from - the text renderer takes what
 * it lacks from IBM Plex Sans JP (see ui/fonts/textRenderer.ts) - or null
 * until it and, when `fallback` is set, IBM Plex Sans JP's letters are
 * known, so that a label is not drawn one way and then jumps.
 */
export function useLabelFontUrl(
  family: string,
  fallback: boolean,
): string | null {
  useTypefaces(family, fallback);
  return useLabelFonts((s) => {
    const own = s.state[family];
    if (own === undefined || own === "loading") return null;
    if (fallback) {
      const extra = s.state[FALLBACK_TYPEFACE];
      if (extra === undefined || extra === "loading") return null;
    }
    return (
      (own === "ready" ? s.urls[family] : s.urls[DEFAULT_LABEL_FAMILY]) ?? null
    );
  });
}

let systemFamilies: Promise<string[]> | undefined;

/**
 * The typefaces installed on this computer; none outside the app. Only
 * those a style keeps (`isTypefaceName`): one picked is read back from the
 * settings and from files.
 */
export function systemTypefaces(): Promise<string[]> {
  systemFamilies ??= isTauri()
    ? invoke<string[]>("font_families").then((names) => names.filter(isTypefaceName)).catch(() => [])
    : Promise.resolve([]);
  return systemFamilies;
}

/** `systemTypefaces`, for a component: empty until known. */
export function useSystemTypefaces(): string[] {
  const [families, setFamilies] = useState<string[]>([]);
  useEffect(() => {
    let live = true;
    void systemTypefaces().then((f) => live && setFamilies(f));
    return () => {
      live = false;
    };
  }, []);
  return families;
}

