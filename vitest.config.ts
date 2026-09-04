import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Until now every test imported with a relative path and needed no config at all. Testing
// anything that lives beside the app's own code does need one: `@/…` is how the app imports,
// and a library written to be imported by a route cannot be rewritten to relative paths just
// to be testable.
export default defineConfig({
  test: {
    // Only this repository's tests. Vitest's default include is the whole tree, and an
    // abandoned worktree under `.claude/worktrees/` — a copy of the repo from some earlier
    // state, with its own `tests/` — was being collected along with them. It passed, so it
    // never announced itself; what it did was run a stale copy of the code beside the real
    // one, which is a way to be told everything is fine by something that is not the thing
    // under test. CI never saw it, because `.claude/` is not committed.
    include: ["tests/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
});
