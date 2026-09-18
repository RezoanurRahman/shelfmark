const js = require('@eslint/js');
const configPrettier = require('eslint-config-prettier');
const pluginVue = require('eslint-plugin-vue');
const globals = require('globals');
const tseslint = require('typescript-eslint');

/**
 * Flat ESLint config for the Vue 3 client, the Express 5 server, and the
 * shared tooling files. Formatting is owned by Prettier, so the Vue
 * formatting rules are switched off at the end of this config.
 */
module.exports = tseslint.config(
  {
    ignores: ['dist/**', 'dist-server/**', 'coverage/**', 'node_modules/**', '*.min.js'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  {
    files: ['**/*.{js,cjs,mjs,ts,vue}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
        ecmaVersion: 'latest',
        sourceType: 'module',
        extraFileExtensions: ['.vue'],
      },
    },
  },
  {
    files: ['eslint.config.js', '*.cjs', '**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    // Prettier owns layout; do not let Vue's stylistic rules fight with it.
    files: ['**/*.vue'],
    rules: {
      'vue/attributes-order': 'off',
      'vue/first-attribute-linebreak': 'off',
      'vue/html-closing-bracket-newline': 'off',
      'vue/html-closing-bracket-spacing': 'off',
      'vue/html-indent': 'off',
      'vue/html-quotes': 'off',
      'vue/html-self-closing': 'off',
      'vue/max-attributes-per-line': 'off',
      'vue/multiline-html-element-content-newline': 'off',
      'vue/multi-word-component-names': 'off',
      'vue/singleline-html-element-content-newline': 'off',
    },
  },
  configPrettier,
);
