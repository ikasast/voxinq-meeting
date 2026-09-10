import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // React-Compiler-powered rules flag legitimate patterns here (state initialized
      // from localStorage/navigator in effects, DOM dataset writes in event handlers).
      // Keep them visible as warnings but non-blocking for CI.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/immutability": "warn",
      // Every `window.location.href = …` in this app crosses an authentication boundary:
      // signing in, signing out, signing out everywhere, or the first account being created.
      // The rule's advice — `router.push()` — is wrong for all of them. A client-side
      // navigation keeps the router cache and the server components already rendered against
      // the *previous* answer, and `proxy.ts` never re-runs, so the gate that decides what this
      // browser may see is not consulted. A full load is the point, not an oversight.
      //
      // Turned off rather than warned so a real warning is not buried in seven false ones.
      // `tests/auth-reload.test.ts` keeps the list of files allowed to do it, which is what the
      // rule was actually guarding.
      "@next/next/no-location-assign-relative-destination": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Python services (do not lint bundled JS inside their venvs)
    "stt-service/**",
    "diarization/**",
    // Worktrees the agent tooling leaves behind: a copy of this repo from some earlier state,
    // whose warnings are reported as if they were this one's. Eight of twenty-four were coming
    // from an abandoned one. Same reason vitest.config.ts pins its include to tests/.
    ".claude/**",
    // The launcher has its own dependencies and its own config.
    "cli/node_modules/**",
  ]),
]);

export default eslintConfig;
