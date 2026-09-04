import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Until now every test imported with a relative path and needed no config at all. Testing
// anything that lives beside the app's own code does need one: `@/…` is how the app imports,
// and a library written to be imported by a route cannot be rewritten to relative paths just
// to be testable.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
});
