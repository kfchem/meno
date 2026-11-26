import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// The still-picture script's tests and its one stage (README.md): run as
// Vitest runs the tests, from the repository's root, so that the app's
// modules load as they do there.
const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../..");
export default defineConfig({
  root,
  test: {
    environment: "node",
    include: ["scripts/figure/still/*.test.ts", "scripts/figure/still/*.stage.ts"],
    testTimeout: 10 * 60 * 1000,
  },
});
