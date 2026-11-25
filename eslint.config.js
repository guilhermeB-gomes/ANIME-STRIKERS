import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/generated/**', '**/playwright-report/**', '**/test-results/**', '**/coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { ...globals.node, ...globals.browser } },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      'no-empty': ['error', { allowEmptyCatch: false }],
      'no-alert': 'error',
      eqeqeq: ['error', 'always'],
    },
  },
  {
    files: ['apps/client/src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: { 'react-hooks/rules-of-hooks': 'error', 'react-hooks/exhaustive-deps': 'warn' },
  },
  {
    files: ['**/*.mjs', 'eslint.config.js'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    files: ['apps/server/scripts/**', 'apps/server/src/logger.ts', 'apps/server/prisma/seed.ts'],
    rules: { 'no-console': 'off' },
  },
);
