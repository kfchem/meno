import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import { writeDocument } from "../../../../lib/io/writeDocument";
import { pictureBytes } from "../../../../lib/picture/held";
import type { PictureItem } from "../store/types";
import { withEnding } from "../../../../lib/io/beside";

/** Each kind of picture as a file: what it is called, and the names its files go by. */
const KINDS: Record<PictureItem["media"], { name: string; extensions: string[] }> = {
  "image/png": { name: "PNG picture", extensions: ["png"] },
  "image/jpeg": { name: "JPEG picture", extensions: ["jpg", "jpeg"] },
  "video/mp4": { name: "MP4 film", extensions: ["mp4"] },
};

/** A film on a transparent background as a file: its film with transparency, in the save dialog's own words. */
const FOR_SLIDES = { name: "Film with transparency (QuickTime)", extensions: ["mov"] };

/**
 * What saving a picture writes, and its kind: a render's PNG, or its film,
 * an MP4 - or any picture, as it is - and, of a film on a transparent
 * background, its film with transparency alone (QuickTime, ProRes 4444,
 * its alpha kept): never its film for the page, which no other program
 * shows as Meno does.
 */
export function savedAs(p: Pick<PictureItem, "sha256" | "media" | "forSlides">): { sha256: string; kind: { name: string; extensions: string[] } } {
  return p.forSlides ? { sha256: p.forSlides, kind: FOR_SLIDES } : { sha256: p.sha256, kind: KINDS[p.media] };
}

/**
 * The name a picture is first offered to be saved under: its own, as the kind of file it is saved as - its
 * own ending gone, that kind's in its place (lib/io/beside `withEnding`): a film with transparency of
 * "ethanol.mp4" as "ethanol.mov".
 */
export function savedName(p: Pick<PictureItem, "name" | "media" | "forSlides">): string {
  const { extensions } = savedAs({ sha256: "", ...p }).kind;
  return extensions.some((e) => p.name.toLowerCase().endsWith(`.${e}`)) ? p.name : withEnding(p.name, extensions[0]);
}

/**
 * A picture on the page saved as a file (docs/RENDER.md): what `savedAs`
 * says, where the chemist says, under its own name first. Nothing, where
 * nothing was picked.
 */
export async function savePictureFile(p: Pick<PictureItem, "name" | "sha256" | "media" | "forSlides">): Promise<void> {
  const { sha256, kind } = savedAs(p);
  const bytes = pictureBytes(sha256);
  if (!bytes) throw new Error("its picture is not held any more");
  const picked = await saveDialog({ title: p.media === "video/mp4" ? "Save film" : "Save picture", defaultPath: savedName(p), filters: [{ name: kind.name, extensions: kind.extensions }] });
  if (!picked) return;
  // (that kind, whatever it was called)
  const path = kind.extensions.some((e) => picked.toLowerCase().endsWith(`.${e}`)) ? picked : `${picked}.${kind.extensions[0]}`;
  await writeDocument(path, bytes);
}
