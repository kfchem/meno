/**
 * A model plugin's key for its service (docs/CONVERSATIONS.md,
 * *Connections*): kept by the backend in the system's keychain
 * (src-tauri/src/model.rs), never read back by the page - only whether one
 * is kept. Given once, in Settings, Conversations; forgotten there.
 */
import { invoke } from "@tauri-apps/api/core";

/** Whether a key is kept for `plugin`; or, where the system has nowhere safe to keep one, why not. */
export async function keyHeld(plugin: string, ask: typeof invoke = invoke): Promise<{ held: boolean } | { why: string }> {
  try {
    return { held: await ask<boolean>("model_key_held", { plugin }) };
  } catch (e) {
    return { why: e instanceof Error ? e.message : String(e) };
  }
}

/** The key kept for `plugin`, as typed - its spaces at either end let go; or why not, in words. */
export async function keepKey(plugin: string, key: string, ask: typeof invoke = invoke): Promise<string | null> {
  try {
    await ask("model_key_set", { plugin, key: key.trim() });
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

/** The key kept for `plugin` forgotten; or why not, in words. */
export async function forgetKey(plugin: string, ask: typeof invoke = invoke): Promise<string | null> {
  try {
    await ask("model_key_forget", { plugin });
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}
