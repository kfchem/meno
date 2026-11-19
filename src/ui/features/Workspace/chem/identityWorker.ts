/**
 * A structure's identity (lib/chem/identity `identity`) worked out in a worker of its own: a large symmetric one takes it
 * seconds - Pd(PPh3)4 - which the drawing is not to wait on. One structure a message, answered by its id (./identityOff);
 * asked for its constitution, its `constitutionKey` as the answer's text.
 */
import { constitutionKey, identity, type IdentityInput } from "../../../../lib/chem/identity";

// (the app is typed against the DOM's window, not a worker's scope)
const scope = self as unknown as {
  onmessage: (e: MessageEvent<{ id: number; input: IdentityInput; kind?: "constitution" }>) => void;
  postMessage: (message: unknown) => void;
};

scope.onmessage = (e) => {
  const { id, input, kind } = e.data;
  try {
    scope.postMessage({ id, ok: true, found: kind === "constitution" ? { text: constitutionKey(input), complete: true } : identity(input) });
  } catch (err) {
    scope.postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
