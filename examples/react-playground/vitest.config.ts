import { defineConfig } from "vitest/config";

// Tests of the app's own logic. Node environment: no DOM is needed.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
