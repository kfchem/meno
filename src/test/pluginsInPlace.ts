// Tests: Meno's made-up test plugins (./plugins: invented programs, hand-written, standing for any a chemist adds)
// taken as if put in place (lib/plugins/known) - each folder's manifest and grammars, at plugins/<id>/<version> of a
// data folder of no computer's - before any test reads them. Meno carries no plugin.
import { setInstalled } from "../lib/plugins/known";

const manifests = import.meta.glob<string>("/src/test/plugins/*/manifest.json", { eager: true, query: "?raw", import: "default" });
const grammars = import.meta.glob<string>("/src/test/plugins/*/*.grammar", { eager: true, query: "?raw", import: "default" });

setInstalled(
  Object.entries(manifests).map(([path, manifest]) => {
    const id = path.split("/").slice(-2)[0];
    const version = String((JSON.parse(manifest) as { version?: unknown }).version ?? "");
    const own = Object.entries(grammars).filter(([g]) => g.split("/").slice(-2)[0] === id);
    return { id, version, dir: `/data/plugins/${id}/${version}`, manifest, grammars: Object.fromEntries(own.map(([g, text]) => [g.split("/").pop()!, text])) };
  }),
);
