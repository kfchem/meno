/**
 * Meno as the default app for the files it is offered for, one format at a
 * time, from Settings, Files (docs/FILE-IO.md, *Meno as the default app*;
 * src-tauri/src/defaults.rs). Nothing is changed until a format's button is
 * pressed. On macOS 12 and later Meno asks the system itself; on Windows the
 * user chooses in Windows' own Settings, where Meno offers itself for that
 * format first.
 */
import { invoke, isTauri } from "@tauri-apps/api/core";

/** A format, and the app that opens it now. */
export type FormatDefault = {
  /** Its extension, without the dot. */
  ext: string;
  /** The app that opens it now, by name, where the system names one. */
  app: string | null;
  path: string | null;
  meno: boolean;
  /** Windows: whether Meno offers itself for it in Default apps. */
  offered: boolean;
};

export type DefaultsState = {
  /** `here`: chosen in Meno; `system`: in the system's Settings, which Meno opens; `none`: neither. */
  can: "here" | "system" | "none";
  /** Windows: whether Settings opens at Meno's own entry. */
  ownPage: boolean;
  formats: FormatDefault[];
};

/** The app a format opened with before Meno was made its default (macOS): offered back by name. */
export type Before = { name: string; path: string };

const NONE: DefaultsState = { can: "none", ownPage: false, formats: [] };

export const defaultsState = (): Promise<DefaultsState> => (isTauri() ? invoke<DefaultsState>("defaults_state") : Promise.resolve(NONE));
/** macOS: Meno, or the app at `app`, made the default for `ext`; the system may ask the user first. */
export const makeDefault = (ext: string, app?: string) => invoke<void>("defaults_use", { ext, app: app ?? null });
/** Windows: Meno offered for `ext`, and its page in Default apps opened. */
export const offerMeno = (ext: string) => invoke<void>("defaults_offer", { ext });
export const openDefaultApps = () => invoke<void>("defaults_open_settings");
/** Windows: Meno no longer offered for `ext`. */
export const withdrawMeno = (ext: string) => invoke<void>("defaults_withdraw", { ext });

/** What `makeDefault` is refused with where the app asked for is no longer where it was (defaults.rs `APP_GONE`). */
export const APP_GONE = "app-gone";

/**
 * macOS: the app `ext` opened with before Meno made the default again, as
 * recorded in `before`: the records then, that one gone from them once it
 * is the default again - or once the app is no longer there to be made it,
 * which is then said. Refused otherwise, the record stays, to be pressed
 * again.
 */
export async function makeDefaultAgain(
  ext: string,
  before: Readonly<Record<string, Before>> | undefined,
  make: (ext: string, app?: string) => Promise<void> = makeDefault,
): Promise<{ before: Record<string, Before>; said?: string }> {
  const { [ext]: was, ...rest } = before ?? {};
  if (!was) return { before: rest };
  try {
    await make(ext, was.path);
  } catch (e) {
    if (String(e) !== APP_GONE) throw e;
    return { before: rest, said: `${was.name} is no longer on this Mac, so .${ext} still opens with Meno.` };
  }
  return { before: rest };
}

/** What a format's row says, and the buttons it has. */
export type Row = {
  /** What opens it now, in words. */
  opens: string;
  /** What follows, where something does: what Windows does next, say. */
  note?: string;
  actions: { id: "use" | "back" | "offer" | "settings" | "withdraw"; label: string }[];
};

/**
 * A format's row, from what the system says now and the app recorded before
 * Meno, where there is one - and, on Windows, whether it is the last format
 * Meno is offered for.
 */
export function rowFor(can: DefaultsState["can"], f: FormatDefault, before?: Before, lastOffered = false): Row {
  const opens = f.meno ? "Opens with Meno" : f.app ? `Opens with ${f.app}` : "No app opens it yet";
  if (can === "here") {
    if (!f.meno) return { opens, actions: [{ id: "use", label: "Use Meno" }] };
    // (offered back by name, and only an app other than Meno)
    return { opens, actions: before && before.name !== "Meno" ? [{ id: "back", label: `Use ${before.name} again` }] : [] };
  }
  if (can === "system") {
    if (!f.offered) return { opens, actions: f.meno ? [] : [{ id: "offer", label: "Use Meno" }] };
    if (f.meno)
      return {
        opens,
        // (the last: stopping takes Meno out of Default apps, and what Windows opened it with with it)
        ...(lastOffered
          ? { note: `This is the last format Meno is offered for. Stopping takes Meno out of Windows' Default apps, so Windows asks which app to use the next time a .${f.ext} file is opened.` }
          : {}),
        actions: [{ id: "withdraw", label: "Stop offering Meno" }],
      };
    return {
      opens,
      note: `Meno is offered for .${f.ext} in Windows' Default apps. Until an app is chosen there, Windows asks which to use the next time a .${f.ext} file is opened.`,
      actions: [
        { id: "settings", label: "Choose in Settings" },
        { id: "withdraw", label: "Stop offering Meno" },
      ],
    };
  }
  return { opens, actions: [] };
}

/** What the section says under its rows, for what can be done here. */
export function defaultsNote(state: DefaultsState): string {
  if (state.can === "here") return "The system may ask before it changes a default.";
  if (state.can === "system")
    return state.ownPage
      ? "Windows lets only its own Settings choose a default: Use Meno opens Meno's page there, where each format is chosen."
      : "Windows lets only its own Settings choose a default: Use Meno opens Default apps, where Meno is in the list of apps; choose it there for each format.";
  return "Meno can be made the default here when it runs as an installed app on macOS 12 or later. Otherwise choose it in the Finder: Get Info on a file, then Open with, then Change All.";
}
