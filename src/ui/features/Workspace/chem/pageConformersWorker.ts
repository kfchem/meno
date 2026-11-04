/**
 * A structure's conformers made the page's in a worker of their own
 * (./pageConformers `asThePageShows`): thousands of them take most of a
 * second to keep once each, lay over and settle, which the page is not to
 * wait on. One structure's stereoisomers a worker.
 */
import type { Conformers } from "../../../../lib/roles/client";
import { asThePageShows } from "./pageConformers";

// (the app is typed against the DOM's window, not a worker's scope)
const scope = self as unknown as {
  onmessage: (e: MessageEvent<{ isomers: Conformers[] }>) => void;
  postMessage: (message: unknown) => void;
};

scope.onmessage = (e) => {
  try {
    scope.postMessage({ kind: "done", isomers: e.data.isomers.map(asThePageShows) });
  } catch (err) {
    scope.postMessage({ kind: "failed", error: err instanceof Error ? err.message : String(err) });
  }
};
