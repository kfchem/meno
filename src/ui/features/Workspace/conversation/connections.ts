/**
 * Which connection a conversation talks through (docs/CONVERSATIONS.md,
 * *Connections*): a plugin's, never core's own. Core holds no way to a
 * model's service: until a plugin of the language-model kind is added - and
 * Meno has no such kind yet - a conversation has none, and sends nothing.
 * The plugins' side gives connections here; so does a test, its scripted
 * test model.
 */
import type { Conversation } from "./types";
import type { Connection } from "./turn";

let maker: (c: Conversation) => Connection | null = () => null;

/** The connection `c` talks through, or none. */
export const connectionFor = (c: Conversation): Connection | null => maker(c);

/** How connections are found: the plugins added, or a test's scripted model. */
export function setConnectionMaker(next: (c: Conversation) => Connection | null): void {
  maker = next;
}
