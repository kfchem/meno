import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// The round trip's stages that run Meno's own code (README.md): run as
// Vitest runs the tests, from the repository's root, so that the app's
// modules load as they do there - and one at a time, each writing its part.
const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../..");
export default defineConfig({
  root,
  test: {
    environment: "node",
    include: ["scripts/figure/roundtrip/*.stage.ts"],
    testTimeout: 60 * 60 * 1000,
    fileParallelism: false,
  },
});
