/**
 * Pictures read in a worker of their own (pictureOff.ts): one picture a
 * message, its PNG decoded here, answered by its id.
 */
import { pictureRead, type PicturePngJob } from "./tracedPicture";
import { pixelsOfPng } from "./pngPixels";

// (the app is typed against the DOM's window, not a worker's scope)
const scope = self as unknown as {
  onmessage: (e: MessageEvent<{ id: number; job: PicturePngJob }>) => void;
  postMessage: (message: unknown) => void;
};

scope.onmessage = async (e) => {
  const { id, job } = e.data;
  try {
    const { png, ...rest } = job;
    scope.postMessage({ id, ok: true, read: pictureRead({ ...rest, ...(await pixelsOfPng(png)) }) });
  } catch (err) {
    scope.postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
