import { defineConfig } from "vitest/config";

// Unit tests cover pure TypeScript (parsers, reducers, stores), the
// website's build script, and the third-party notices against the lock files. They run in Node without the Vite app plugins; GUI
// behaviour still needs manual checks.
export default defineConfig({
  test: {
    environment: "node",
    // (the plugins Meno carries, for now, as if put in place: src/test/pluginsInPlace)
    setupFiles: ["src/test/pluginsInPlace.ts"],
    include: ["src/**/*.test.{ts,tsx}", "scripts/site/**/*.test.mjs", "scripts/licenses/**/*.test.mjs"],
  },
});
