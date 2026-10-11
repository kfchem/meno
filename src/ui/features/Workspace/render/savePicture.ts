import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { pictureBytes } from "../../../../lib/picture/held";
import type { PictureItem } from "../store/types";

/** Each kind of picture as a file: what it is called, and the names its files go by. */
const KINDS: Record<PictureItem["media"], { name: string; extensions: string[] }> = {
  "image/png": { name: "PNG picture", extensions: ["png"] },
  "image/jpeg": { name: "JPEG picture", extensions: ["jpg", "jpeg"] },
  "video/mp4": { name: "MP4 film", extensions: ["mp4"] },
};

/**
 * A picture on the page saved as a file (docs/RENDER.md): a render's PNG,
 * or its film, an MP4 - or any picture, as it is - where the chemist says,
 * under its own name first. Nothing, where nothing was picked.
 */
export async function savePictureFile(p: Pick<PictureItem, "name" | "sha256" | "media">): Promise<void> {
  const bytes = pictureBytes(p.sha256);
  if (!bytes) throw new Error("its picture is not held any more");
  const kind = KINDS[p.media];
  const picked = await saveDialog({ title: p.media === "video/mp4" ? "Save film" : "Save picture", defaultPath: p.name, filters: [{ name: kind.name, extensions: kind.extensions }] });
  if (!picked) return;
  // (that kind, whatever it was called)
  const path = kind.extensions.some((e) => picked.toLowerCase().endsWith(`.${e}`)) ? picked : `${picked}.${kind.extensions[0]}`;
  await writeFile(path, bytes);
}
