/**
 * A PDF page's tile, decoded off the drawing's thread: its PNG made a picture, every pixel of it decoded here - drawn once onto a small
 * canvas, so that WebKit, which may leave a picture's decoding to its first use, does it now and not as the tile goes on the graphics card.
 */
self.onmessage = async (e: MessageEvent<{ id: number; body: Uint8Array }>) => {
  const { id, body } = e.data;
  try {
    const bitmap = await createImageBitmap(new Blob([body as BlobPart], { type: "image/png" }), { imageOrientation: "flipY", premultiplyAlpha: "none" });
    const c = new OffscreenCanvas(1, 1);
    c.getContext("2d")?.drawImage(bitmap, 0, 0, 1, 1);
    (self as unknown as Worker).postMessage({ id, bitmap }, [bitmap]);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: String(err) });
  }
};
