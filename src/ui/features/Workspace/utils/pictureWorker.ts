/**
 * Pictures read in a worker of their own (pictureOff.ts): one picture a
 * message, answered by its id.
 */
import { pictureRead, type PictureJob } from "./tracedPicture";

// (the app is typed against the DOM's window, not a worker's scope)
const scope = self as unknown as {
  onmessage: (e: MessageEvent<{ id: number; job: PictureJob }>) => void;
  postMessage: (message: unknown) => void;
};

scope.onmessage = (e) => {
  const { id, job } = e.data;
  try {
    scope.postMessage({ id, ok: true, read: pictureRead(job) });
  } catch (err) {
    scope.postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
