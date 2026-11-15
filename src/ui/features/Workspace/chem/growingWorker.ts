/**
 * A 3D structure's search that goes on, judged and made the page's in a
 * worker of its own (./growing `Growing`): each round's frames handed over
 * whole, and only what the page shows sent back. One search a worker, kept
 * while it goes on.
 */
import { Growing, roundTaken, type RoundSent, type ShownWith } from "./growing";
import type { Conformers } from "../../../../lib/roles/client";

type Asked =
  | { kind: "start"; atoms: Conformers["atoms"]; bonds: Conformers["bonds"]; window: number; w: ShownWith }
  | { kind: "add"; round: RoundSent }
  | { kind: "shown"; more: { label: string; text: string }[] };

// (the app is typed against the DOM's window, not a worker's scope)
const scope = self as unknown as {
  onmessage: (e: MessageEvent<Asked>) => void;
  postMessage: (message: unknown) => void;
};

let growing: Growing | null = null;

scope.onmessage = (e) => {
  try {
    if (e.data.kind === "start") growing = new Growing(e.data.atoms, e.data.bonds, e.data.window, e.data.w);
    else if (e.data.kind === "add") {
      const { got, energies } = roundTaken(e.data.round);
      scope.postMessage({ kind: "added", fresh: growing ? growing.add(got, energies) : 0 });
    } else scope.postMessage({ kind: "shown", shown: growing?.shown(e.data.more) ?? null });
  } catch (err) {
    scope.postMessage({ kind: "failed", error: err instanceof Error ? err.message : String(err) });
  }
};
