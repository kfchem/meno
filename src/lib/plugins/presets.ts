/**
 * What a preset plugin brings another plugin through that one's interface
 * (docs/PLUGINS.md, *Presets*), in words: Meno reads its manifest alone,
 * and never the files it hands over.
 */
import type { PresetsDecl } from "./manifest";

/** How many of a thing, in words: "1 look", "12 looks". */
const many = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

/** What a preset plugin brings, as its card in Settings says it: "For Tool: 12 looks, 2 studios and 8 motions." `forName`: the plugin it brings them to, by name. */
export function presetsSaid(p: PresetsDecl, forName: string): string {
  const parts = [p.looks.length && many(p.looks.length, "look"), p.studios.length && many(p.studios.length, "studio"), p.motions.length && many(p.motions.length, "motion")].filter(
    (x): x is string => !!x,
  );
  const said = parts.length < 2 ? parts.join("") : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  return `For ${forName}: ${said}.`;
}
