import eslint from "@eslint/js";
import stylistic from "@stylistic/eslint-plugin";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import prettierPlugin from "eslint-plugin-prettier";
import prettierConfig from "eslint-config-prettier";
import sonarjs from "eslint-plugin-sonarjs";
import importX from "eslint-plugin-import-x";
import jsdoc from "eslint-plugin-jsdoc";
import nodePlugin from "eslint-plugin-n";
import regexpPlugin from "eslint-plugin-regexp";
import securityPlugin from "eslint-plugin-security";
import unicorn from "eslint-plugin-unicorn";
import unusedImports from "eslint-plugin-unused-imports";
import globals from "globals";

export default [
  eslint.configs.recommended,
  sonarjs.configs.recommended,
  importX.flatConfigs.recommended,
  importX.flatConfigs.typescript,
  nodePlugin.configs["flat/recommended-module"],
  regexpPlugin.configs["flat/recommended"],
  unicorn.configs.recommended,
  securityPlugin.configs.recommended,
  jsdoc.configs["flat/recommended-typescript-error"],
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        ...globals.node,
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
      "@stylistic": stylistic,
      prettier: prettierPlugin,
      "unused-imports": unusedImports,
    },
    settings: {
      "import-x/resolver": {
        typescript: {
          alwaysTryTypes: true,
        },
        node: true,
      },
    },
    rules: {
      "no-inline-comments": "error",
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": [
        "error",
        { args: "after-used", argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unsafe-return": "error",
      "@typescript-eslint/no-unsafe-argument": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      "@typescript-eslint/prefer-readonly": "error",
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
      "@typescript-eslint/no-import-type-side-effects": "error",
      "@typescript-eslint/prefer-includes": "error",
      "@typescript-eslint/prefer-string-starts-ends-with": "error",
      "@typescript-eslint/prefer-optional-chain": "error",
      "@typescript-eslint/prefer-reduce-type-parameter": "error",
      "@typescript-eslint/restrict-template-expressions": "error",
      "@typescript-eslint/unbound-method": "error",
      "@typescript-eslint/array-type": ["error", { default: "array" }],
      "@typescript-eslint/consistent-indexed-object-style": "error",
      "@typescript-eslint/method-signature-style": ["error", "property"],

      "no-param-reassign": ["error", { props: true }],
      "no-await-in-loop": "error",
      "no-implicit-coercion": "error",
      "no-useless-concat": "error",
      "prefer-template": "error",
      curly: ["error", "all"],
      "default-case-last": "error",
      "no-fallthrough": "error",
      radix: "error",
      "no-else-return": ["error", { allowElseIf: false }],
      "prefer-object-spread": "error",
      "object-shorthand": "error",
      "no-lonely-if": "error",
      "no-nested-ternary": "error",
      "no-unneeded-ternary": "error",
      "prefer-destructuring": ["error", { object: true, array: false }],
      "no-throw-literal": "off",
      "@typescript-eslint/only-throw-error": "error",
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/no-empty-function": "error",
      "prettier/prettier": "error",
      "@typescript-eslint/prefer-nullish-coalescing": "error",
      "@typescript-eslint/no-unnecessary-condition": "error",
      "@typescript-eslint/strict-boolean-expressions": "error",
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/no-unsafe-member-access": "error",
      "@typescript-eslint/no-unsafe-call": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/consistent-type-assertions": "error",
      "@typescript-eslint/no-unused-expressions": "error",
      "no-console": "warn",
      "@typescript-eslint/promise-function-async": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/return-await": "error",
      "@typescript-eslint/no-unnecessary-type-constraint": "error",
      eqeqeq: "error",
      "@typescript-eslint/explicit-member-accessibility": "error",
      "@typescript-eslint/no-var-requires": "error",
      "prefer-const": "error",
      "no-shadow": "off",
      "@typescript-eslint/no-shadow": "error",
      "@typescript-eslint/naming-convention": [
        "error",
        {
          selector: "variable",
          format: ["camelCase", "UPPER_CASE", "PascalCase"],
        },
        {
          selector: "function",
          format: ["camelCase", "PascalCase"],
        },
        {
          selector: "typeLike",
          format: ["PascalCase"],
        },
      ],

      "sonarjs/cognitive-complexity": ["error", 15],
      "sonarjs/no-duplicate-string": ["error", { threshold: 4 }],
      "sonarjs/no-nested-template-literals": "error",
      "sonarjs/no-identical-functions": "error",
      "sonarjs/prefer-immediate-return": "error",
      "sonarjs/no-small-switch": "error",

      "import-x/no-cycle": ["error", { maxDepth: 3 }],
      "import-x/no-default-export": "error",
      "import-x/no-duplicates": "error",
      "import-x/newline-after-import": "error",
      "import-x/no-useless-path-segments": "error",
      "import-x/no-self-import": "error",
      "import-x/order": [
        "error",
        {
          groups: ["builtin", "external", "internal", "parent", "sibling", "index", "type"],
          "newlines-between": "always",
          alphabetize: { order: "asc", caseInsensitive: true },
        },
      ],

      "n/no-missing-import": "off",
      "n/no-unsupported-features/node-builtins": "error",

      "security/detect-object-injection": "off",
      "security/detect-non-literal-fs-filename": "off",

      "jsdoc/require-jsdoc": [
        "error",
        {
          publicOnly: false,
          require: {
            ArrowFunctionExpression: true,
            ClassDeclaration: true,
            ClassExpression: true,
            FunctionDeclaration: true,
            FunctionExpression: true,
            MethodDefinition: true,
          },
          contexts: [
            "TSInterfaceDeclaration",
            "TSTypeAliasDeclaration",
            "TSEnumDeclaration",
            "TSEnumMember",
            "TSPropertySignature",
            "TSMethodSignature",
            "PropertyDefinition",
            'ExportNamedDeclaration[declaration.type="VariableDeclaration"]',
            "ExportDefaultDeclaration",
          ],
          checkConstructors: true,
          checkGetters: true,
          checkSetters: true,
          enableFixer: false,
        },
      ],
      "jsdoc/require-description": ["error", { checkConstructors: false }],
      "jsdoc/require-description-complete-sentence": "error",
      "jsdoc/require-hyphen-before-param-description": ["error", "never"],
      "jsdoc/require-throws": "error",
      "jsdoc/require-asterisk-prefix": "error",
      "jsdoc/check-alignment": "error",
      "jsdoc/check-indentation": "error",
      "jsdoc/check-line-alignment": "error",
      "jsdoc/check-syntax": "error",
      "jsdoc/multiline-blocks": "error",
      "jsdoc/no-blank-block-descriptions": "error",
      "jsdoc/no-multi-asterisks": "error",
      "jsdoc/tag-lines": ["error", "any", { startLines: 1 }],

      "@stylistic/padding-line-between-statements": [
        "error",
        { blankLine: "never", prev: "*", next: "*" },
        { blankLine: "always", prev: "import", next: "*" },
        { blankLine: "any", prev: "import", next: "import" },
        { blankLine: "always", prev: "*", next: "return" },
        { blankLine: "always", prev: "block-like", next: "*" },
        { blankLine: "always", prev: "*", next: "block-like" },
        { blankLine: "always", prev: "*", next: "interface" },
        { blankLine: "always", prev: "interface", next: "*" },
      ],
    },
  },
  prettierConfig,
  {
    files: ["**/constants.ts", "**/types.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Program",
          message:
            "Files named `constants.ts` or `types.ts` are banned. Co-locate the declaration with the module that owns the behaviour, or pick a specific, themed file name (e.g. `bounds.ts`, `messages.ts`, `safe-search.ts`).",
        },
      ],
    },
  },
  {
    files: ["src/tools/**/*.ts"],
    ignores: ["src/tools/*-tool.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Program",
          message:
            "Files in `src/tools/` must be named `*-tool.ts` and contain a single `create*Tool` factory. Move non-tool code (helpers, errors, shared types, the tools provider) to a sibling module under `src/`.",
        },
      ],
    },
  },
  {
    files: ["src/tools/*-tool.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "FunctionDeclaration[id.name!=/^create[A-Z].*Tool$/]",
          message:
            "Functions declared in `src/tools/*-tool.ts` must be named `create<Name>Tool` (e.g. `createWebSearchTool`). Move helpers to a sibling module.",
        },
        {
          selector: "FunctionDeclaration:not([returnType.typeAnnotation.typeName.name='Tool'])",
          message:
            "Functions declared in `src/tools/*-tool.ts` must have an explicit `Tool` return type. Move helpers to a sibling module.",
        },
      ],
    },
  },
  {
    ignores: ["node_modules/", "dist/", "*.js"],
  },
];
