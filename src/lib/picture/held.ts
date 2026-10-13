/**
 * Pictures held this session (docs/PDF.md, *A picture*): each image's bytes,
 * by their SHA-256 - what a picture on the page is drawn from, what its
 * workspace's file keeps (`files/<sha256>`), and what a copy and a paste
 * carry it by. A workspace's file opened holds the pictures it keeps, each
 * read from it only when first wanted.
 */
import type { MenoFile } from "../doc/menoFile";
import { imageInfo, isMp4, PICTURE_MEDIA, type ImageInfo, type PictureMedia } from "./image";

/** A picture held: what it is known by, and what it is. */
export type HeldPicture = ImageInfo & { sha256: string };

const held = new Map<string, { bytes?: Uint8Array; read?: () => Uint8Array | null }>();

/** Bytes' SHA-256, in hex. */
export async function sha256OfBytes(bytes: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>);
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** An image's bytes held for the session: what it is, and what it is known by; none, where they are no PNG or JPEG. */
export async function holdPicture(bytes: Uint8Array): Promise<HeldPicture | null> {
  const info = imageInfo(bytes);
  if (!info) return null;
  const sha256 = await sha256OfBytes(bytes);
  if (!held.get(sha256)?.bytes) held.set(sha256, { bytes });
  return { ...info, sha256 };
}

/** A film's bytes held for the session - an MP4 a render made, its size in pixels as it said - and what they are known by; none, where they are no MP4. */
export async function holdFilm(bytes: Uint8Array): Promise<{ sha256: string } | null> {
  if (!isMp4(bytes)) return null;
  const sha256 = await sha256OfBytes(bytes);
  if (!held.get(sha256)?.bytes) held.set(sha256, { bytes });
  return { sha256 };
}

/**
 * A picture's bytes, held this session; read from its workspace's file the
 * first time - and taken only if they are what its SHA-256 says (the file
 * reads them so: lib/doc/menoFile); none where it is held nowhere.
 */
export function pictureBytes(sha256: string): Uint8Array | null {
  const h = held.get(sha256);
  if (!h) return null;
  if (!h.bytes) {
    const bytes = h.read?.() ?? null;
    if (!bytes) {
      // (one that does not read, or is not what it says, is held no more: not read again each time it is drawn, and free to be held from elsewhere)
      held.delete(sha256);
      return null;
    }
    h.bytes = bytes;
    h.read = undefined;
  }
  return h.bytes;
}

/** Each picture a workspace's file keeps, held - its bytes read from the file when first wanted. */
export function holdPicturesOf(file: Pick<MenoFile, "files" | "data">): void {
  for (const f of file.files) {
    if (!PICTURE_MEDIA.includes(f.media as PictureMedia) || held.has(f.sha256)) continue;
    held.set(f.sha256, { read: () => file.data(f.sha256) });
  }
}
