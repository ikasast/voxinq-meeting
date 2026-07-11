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
  ]),
]);

export default eslintConfig;
