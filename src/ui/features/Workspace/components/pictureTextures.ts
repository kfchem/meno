/**
 * The textures pictures on the page are drawn with (components/Pictures2D),
 * each decoded once and shared by the pictures of the same image - and a
 * film's video, playing where it lies, paused or played from its menu.
 */
import * as THREE from "three";

/** Each picture's texture, decoded once and shared, by its SHA-256 - a film's, its video playing - let go once none draws it. */
export type Shared = { texture: THREE.Texture | null; users: number; waiting: Set<() => void>; video?: HTMLVideoElement; drawn?: Set<() => void> };
export const textures = new Map<string, Shared>();

/** Whether a film on the page is playing; none where it is not one shown. */
export const filmPlaying = (sha256: string): boolean | null => {
  const v = textures.get(sha256)?.video;
  return v ? !v.paused : null;
};

/** A film on the page played, or paused where it is. */
export function playFilm(sha256: string, on: boolean): void {
  const v = textures.get(sha256)?.video;
  if (!v) return;
  if (on) void v.play().catch(() => undefined);
  else v.pause();
}

/** A film on the page played from its beginning: as a talk comes to the slide it lies on (docs/PRESENTING.md). */
export function restartFilm(sha256: string): void {
  const v = textures.get(sha256)?.video;
  if (!v) return;
  v.currentTime = 0;
  void v.play().catch(() => undefined);
}

/** A film's bytes as a video, playing over and over without sound, its texture made once its first frame is there; each new frame it shows drawn (`drawn`). */
export function filmTexture(made: Shared, bytes: Uint8Array): () => void {
  const url = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "video/mp4" }));
  const video = document.createElement("video");
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.preload = "auto";
  made.video = video;
  made.drawn = new Set();
  let live = true;
  // (a frame drawn for each frame of the film, as it comes - nothing drawn while it is paused)
  const each = () => {
    if (!live) return;
    for (const d of made.drawn!) d();
    if (frames) video.requestVideoFrameCallback(each);
  };
  const frames = typeof video.requestVideoFrameCallback === "function";
  const timer = frames ? null : window.setInterval(() => !video.paused && each(), 1000 / 30);
  video.addEventListener(
    "loadeddata",
    () => {
      if (!live) return;
      const t = new THREE.VideoTexture(video);
      t.colorSpace = THREE.SRGBColorSpace;
      t.minFilter = THREE.LinearFilter;
      t.magFilter = THREE.LinearFilter;
      t.generateMipmaps = false;
      made.texture = t;
      for (const w of made.waiting) w();
      if (frames) video.requestVideoFrameCallback(each);
      void video.play().catch(() => undefined);
    },
    { once: true },
  );
  video.src = url;
  return () => {
    live = false;
    if (timer != null) window.clearInterval(timer);
    video.pause();
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  };
}
