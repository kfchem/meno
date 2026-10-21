/**
 * Who perceives configurations now (workflow/configurations): the plugin that
 * fills the role, asked in its worker - apart from the rest, which is plain
 * data and is read where no worker runs.
 */
import { pluginWorker, rolePlugin } from "../../../../lib/roles/worker";
import type { Asker } from "./configurations";

/** Who answers now: the plugin that fills the role, where one does - asked in its worker, set up first where it must be, as any role's. */
export function askerFor(): Asker {
  const plugin = rolePlugin("configurations");
  if (!plugin) return { none: "Nothing added tells stereoisomers apart" };
  return {
    plugin: plugin.id,
    version: plugin.version,
    ask: async (molblocks) => (await (await pluginWorker(plugin)).request("configurations", { molblocks })).molecules,
  };
}
