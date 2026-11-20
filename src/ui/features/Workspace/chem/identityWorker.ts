/**
 * A structure's identity (lib/chem/identity `identity`) worked out in a worker of its own: a large symmetric one takes it
 * seconds - Pd(PPh3)4 - which the drawing is not to wait on. One structure a message, answered by its id (./identityOff);
 * asked for its constitution, its `constitutionKey` as the answer's text; asked for its cage labels, which of its cage atoms the
 * CIP labels (./cageLabelled).
 */
import { constitutionKey, identity, type IdentityInput } from "../../../../lib/chem/identity";
import { cageLabelled } from "./cageLabelled";

// (the app is typed against the DOM's window, not a worker's scope)
const scope = self as unknown as {
  onmessage: (e: MessageEvent<{ id: number; input: IdentityInput; kind?: "constitution" | "cage labels" }>) => void;
  postMessage: (message: unknown) => void;
};

scope.onmessage = (e) => {
  const { id, input, kind } = e.data;
  try {
    const found = kind === "constitution" ? { text: constitutionKey(input), complete: true } : kind === "cage labels" ? { text: cageLabelled(input), complete: true } : identity(input);
    scope.postMessage({ id, ok: true, found });
  } catch (err) {
    scope.postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
