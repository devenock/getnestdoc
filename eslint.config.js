// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import importPlugin from "eslint-plugin-import-x";

export default tseslint.config(
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ["src/**/*.ts"],
    plugins: { "import-x": importPlugin },
    rules: {
      // core/ is the extractable generic engine; nest/ holds Nest-specific
      // knowledge. See ARCHITECTURE.md §3.
      "import-x/no-restricted-paths": [
        "error",
        {
          zones: [
            {
              target: "./src/core",
              from: "./src/nest",
              message: "core/ must not import from nest/ — see ARCHITECTURE.md §3.",
            },
          ],
        },
      ],
    },
  },
  {
    ignores: ["dist/**", "data/**", "test/fixtures/**"],
  },
);
