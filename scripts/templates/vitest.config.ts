import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// The template builder's one stage (`write.stage.ts`) runs as Vitest runs the tests, from the repository's root, so that the app's modules
// load as they do there: it writes the templates to `templates/`.
const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
export default defineConfig({
  root,
  test: { environment: "node", setupFiles: ["src/test/pluginsInPlace.ts"], include: ["scripts/templates/write.stage.ts"], testTimeout: 10 * 60 * 1000 },
});
