import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// The figure script's one stage (draw.stage.ts) runs the app's own code as Vitest runs the tests, from the
// repository's root, so that its modules load as they do there.
const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../..");
export default defineConfig({
  root,
  test: { environment: "node", silent: false, include: ["scripts/figure/draw/draw.stage.ts"], testTimeout: 10 * 60 * 1000 },
});
