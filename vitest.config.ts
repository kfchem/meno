import { defineConfig } from "vitest/config";

// Unit tests cover pure TypeScript (parsers, reducers, stores), and the
// website's build script. They run in Node without the Vite app plugins; GUI
// behaviour still needs manual checks.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}", "scripts/site/**/*.test.mjs"],
  },
});
