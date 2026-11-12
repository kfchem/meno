/**
 * A conformer search's rounds judged in a worker of its own
 * (./conformerRounds `RoundsSeen`): thousands of conformers, each laid
 * over those found before, take most of a second, which the page is not to
 * wait on. One search a worker, kept while it goes on.
 */
import { RoundsSeen } from "./conformerRounds";

type Asked =
  | { kind: "start"; atoms: ConstructorParameters<typeof RoundsSeen>[0]; bonds: ConstructorParameters<typeof RoundsSeen>[1]; window: number }
  | { kind: "add"; frames: number[][]; energies: number[] };

// (the app is typed against the DOM's window, not a worker's scope)
const scope = self as unknown as {
  onmessage: (e: MessageEvent<Asked>) => void;
  postMessage: (message: unknown) => void;
};

let seen: RoundsSeen | null = null;

scope.onmessage = (e) => {
  try {
    if (e.data.kind === "start") seen = new RoundsSeen(e.data.atoms, e.data.bonds, e.data.window);
    else scope.postMessage({ kind: "added", fresh: seen ? seen.add(e.data.frames, e.data.energies) : 0 });
  } catch (err) {
    scope.postMessage({ kind: "failed", error: err instanceof Error ? err.message : String(err) });
  }
};
