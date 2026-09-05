import js from "@eslint/js";
import globals from "globals";

export default [
  {
    ignores: ["dist/**", "node_modules/**", ".erp-local-storage/**", "docs/*", "!docs/prototypes/", "docs/prototypes/*", "!docs/prototypes/raw-material-roll-inventory-review/", "docs/prototypes/raw-material-roll-inventory-review/*", "!docs/prototypes/raw-material-roll-inventory-review/src/"],
  },
  {
    files: ["src/**/*.{js,jsx}", "server/**/*.mjs", "scripts/**/*.mjs", "vite.config.mjs", "shared/printJobPresentation.js", "docs/prototypes/raw-material-roll-inventory-review/src/**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      "no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          // Redacted-report branches intentionally discard the original caught exception.
          caughtErrors: "none",
          // Security response sanitizers intentionally omit secret fields through rest destructuring.
          ignoreRestSiblings: true,
        },
      ],
      // Redacted operational reports intentionally replace caught errors with safe messages.
      "preserve-caught-error": "off",
      // Existing shell / SQL regular expressions retain escaping for source readability.
      "no-useless-escape": "off",
      // Some runner reports populate a fallback before a guarded external call.
      "no-useless-assignment": "off",
    },
  },
];
