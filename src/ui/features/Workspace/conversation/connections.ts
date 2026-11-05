/**
 * Which connection a conversation talks through (docs/CONVERSATIONS.md,
 * *Connections*): a plugin's, never core's own. Core holds no way to a
 * model's service: until a plugin filling the language-model role is in
 * place, a conversation has none, and sends nothing. The one that fills it
 * gives its connection here (./modelConnection); so does a test, its
 * scripted test model.
 */
import type { Conversation } from "./types";
import type { Connection } from "./turn";
import { rolePlugin } from "../../../../lib/roles/worker";
import { MODEL_ROLE, modelConnection } from "./modelConnection";

/** The plugin that fills the language-model role, as chosen in Settings, Conversations - its connection; none, none. */
const byPlugin = (): Connection | null => {
  const p = rolePlugin(MODEL_ROLE);
  return p ? modelConnection(p) : null;
};

let maker: (c: Conversation) => Connection | null = byPlugin;

/** The connection `c` talks through, or none. */
export const connectionFor = (c: Conversation): Connection | null => maker(c);

/** How connections are found: the plugins added, or a test's scripted model. */
export function setConnectionMaker(next: (c: Conversation) => Connection | null): void {
  maker = next;
}
