/**
 * A figure's structures read in a worker of its own (structuresOff.ts): one
 * figure a message - a picture's PNG decoded here - answered by its id.
 */
import { figureRead, type FigurePngJob } from "./structuresRead";
import { pixelsOfPng } from "./pngPixels";

// (the app is typed against the DOM's window, not a worker's scope)
const scope = self as unknown as {
  onmessage: (e: MessageEvent<{ id: number; job: FigurePngJob }>) => void;
  postMessage: (message: unknown) => void;
};

scope.onmessage = async (e) => {
  const { id, job } = e.data;
  try {
    const { picture, ...rest } = job;
    const decoded = picture ? (({ png, ...p }) => pixelsOfPng(png).then((px) => ({ ...p, ...px })))(picture) : null;
    scope.postMessage({ id, ok: true, read: figureRead({ ...rest, ...(decoded ? { picture: await decoded } : {}) }) });
  } catch (err) {
    scope.postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
