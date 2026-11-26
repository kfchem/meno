/**
 * A text's sheet seen from far off (docs/PDF.md, *A text*): its own words,
 * scaled down as on paper seen from afar - drawn once to a picture, at the
 * size the sheet has on the screen where its live words take over, and
 * that picture drawn while it is smaller than that; nearer, the words
 * themselves. The picture is made again only as what it shows changes - the
 * words, their type, the sheet's width - never as the view zooms; made in
 * idle time, never while the view moves or a press is held.
 */

/** How large the sheet's type is on the screen, in pixels, where its live words begin to come up over its picture, and where they have quite. */
export const LIVE_FROM_PX = 4.5;
export const LIVE_AT_PX = 6;
/** The most a picture is on either side, in device pixels: a sheet larger than that at the hand-over is drawn a little softer far out. */
export const PICTURE_MOST_PX = 2048;
/** How long the view must have been still, in ms, before a picture is made. */
export const STILL_MS = 250;
/** How long a picture whose words are not laid out yet waits before it is tried again, in ms. */
const NOT_READY_MS = 100;

/** How much of a sheet is its live words, 0 to 1, its type `typePx` large on the screen. */
export function liveShare(typePx: number): number {
  return Math.min(1, Math.max(0, (typePx - LIVE_FROM_PX) / (LIVE_AT_PX - LIVE_FROM_PX)));
}

/**
 * A sheet's picture's size in device pixels - its size on the screen where
 * its live words have taken over (`LIVE_AT_PX`), at `dpr` device pixels a
 * screen pixel, `w` x `h` page units, its type `type` page units large -
 * kept within `PICTURE_MOST_PX` a side; and its bytes, its smaller copies
 * (mip-maps) with it.
 */
export function pictureSize(w: number, h: number, type: number, dpr: number): { width: number; height: number; bytes: number } {
  const per = (LIVE_AT_PX / type) * dpr;
  const fit = Math.min(1, PICTURE_MOST_PX / Math.max(w * per, h * per, 1));
  const width = Math.max(1, Math.min(PICTURE_MOST_PX, Math.ceil(w * per * fit)));
  const height = Math.max(1, Math.min(PICTURE_MOST_PX, Math.ceil(h * per * fit)));
  return { width, height, bytes: Math.round((width * height * 4 * 4) / 3) };
}

/**
 * What a picture is of: what changes the sheet's look on the page - its
 * words, their type and point, its size - and never the zoom it is seen at.
 */
export function pictureKey(text: string, w: number, h: number, point: number, typeKnown: boolean): string {
  return `${w}|${h}|${point}|${typeKnown ? 1 : 0}|${text}`;
}

/**
 * How a sheet is drawn: its picture over its live words, the picture as
 * much as `picture` (0 to 1), the live words there at all where `live`.
 * Being edited, or with no picture of its words as they are, it is its
 * live words; else its picture far off, its words near, and between, the
 * picture fading over the words as they take over. `shown` is how far the
 * picture has come in since it was made (0 to 1), eased - so it never
 * appears at once.
 */
export function sheetDrawing(typePx: number, editing: boolean, made: boolean, shown = 1): { picture: number; live: boolean } {
  if (editing || !made) return { picture: 0, live: true };
  const picture = (1 - liveShare(typePx)) * shown;
  return { picture, live: picture < 1 };
}

/** Whether a picture is made now: the view still `STILL_MS` since it last moved, at `movedAt`, and no press held. */
export function makesNow(now: number, movedAt: number, pressed: boolean): boolean {
  return !pressed && now - movedAt >= STILL_MS;
}

/**
 * The pictures waiting to be made, one at a time, each in an idle slot
 * while the view is still (`makesNow`): a job gives true once made, false
 * when what it shows is not ready yet (it waits its turn again).
 */
export function pictureQueue(
  still: () => boolean,
  later: (work: () => void, ms: number) => void,
): { ask: (id: number, job: () => boolean) => void; drop: (id: number) => void; size: () => number } {
  const jobs = new Map<number, () => boolean>();
  let pumping = false;
  const pump = () => {
    if (!jobs.size) {
      pumping = false;
      return;
    }
    if (!still()) {
      later(pump, STILL_MS);
      return;
    }
    const [id, job] = jobs.entries().next().value as [number, () => boolean];
    jobs.delete(id);
    const done = job();
    if (!done) jobs.set(id, job);
    later(pump, done ? 0 : NOT_READY_MS);
  };
  return {
    ask: (id, job) => {
      jobs.delete(id);
      jobs.set(id, job);
      if (!pumping) {
        pumping = true;
        later(pump, 0);
      }
    },
    drop: (id) => void jobs.delete(id),
    size: () => jobs.size,
  };
}
