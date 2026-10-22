import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import { writeDocument } from "../../../lib/io/writeDocument";
import { styleFileName, styleFileText, type StyleFile } from "../../../lib/chem/styleFile";
import { styleFileBytes } from "../../../lib/doc/menoFile";

/**
 * Styles written out as a Meno file of kind "style" (docs/FILE-IO.md, *What
 * a .meno holds*), where the chemist chooses - with `picture` (a PNG data
 * URL), where there is one, for what it looks like. False where it was not
 * written: not chosen where; throws where it could not be.
 */
export async function exportStyles(styles: StyleFile, picture?: string | null): Promise<boolean> {
  const name = styleFileName(styles).replace(/[\\/:*?"<>|]+/g, " ").trim() || "Style";
  const picked = await saveDialog({ title: "Export style", defaultPath: `${name}.meno`, filters: [{ name: "Meno style", extensions: ["meno"] }] });
  if (!picked) return false;
  await writeDocument(/\.meno$/i.test(picked) ? picked : `${picked}.meno`, styleFileBytes(styleFileText(styles), pngOf(picture)));
  return true;
}

/** A PNG data URL's bytes; none for any other. */
function pngOf(url?: string | null): Uint8Array | null {
  const m = url ? /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(url) : null;
  if (!m) return null;
  const bin = atob(m[1]);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
