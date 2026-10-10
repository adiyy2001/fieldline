import eslint from '@eslint/js';
import angular from 'angular-eslint';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

const layerRule = (forbidden, message) => ({
  'no-restricted-imports': [
    'error',
    { patterns: forbidden.map((group) => ({ group: [group], message })) },
  ],
});

export default defineConfig([
  globalIgnores([
    'dist/**',
    '.angular/**',
    'coverage/**',
    'node_modules/**',
    'playwright-report/**',
    'test-results/**',
    '.artifacts/**',
  ]),
  {
    files: ['**/*.ts'],
    extends: [
      eslint.configs.recommended,
      tseslint.configs.strictTypeChecked,
      tseslint.configs.stylisticTypeChecked,
      angular.configs.tsRecommended,
    ],
    languageOptions: {
      parserOptions: {
        project: [
          './tsconfig.app.json',
          './tsconfig.spec.json',
          './tsconfig.core.json',
          './tsconfig.worker.json',
          './tsconfig.tools.json',
        ],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    processor: angular.processInlineTemplates,
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      '@angular-eslint/prefer-on-push-component-change-detection': 'error',
      '@angular-eslint/prefer-standalone': 'error',
      '@angular-eslint/prefer-inject': 'error',
      '@angular-eslint/prefer-signals': 'error',
      '@angular-eslint/no-uncalled-signals': 'error',
      '@angular-eslint/computed-must-return': 'error',
      '@angular-eslint/inject-at-top': 'error',
      '@angular-eslint/component-selector': [
        'error',
        { type: 'element', prefix: 'fl', style: 'kebab-case' },
      ],
      '@angular-eslint/directive-selector': [
        'error',
        { type: 'attribute', prefix: 'fl', style: 'camelCase' },
      ],
      'no-console': ['error', { allow: ['error', 'warn'] }],
    },
  },
  {
    files: ['src/core/**/*.ts'],
    rules: layerRule(
      ['**/gpu/**', '**/app/**', '**/workers/**', '@angular/*'],
      'core must not depend on gpu, app, workers or Angular',
    ),
  },
  {
    files: ['src/gpu/**/*.ts'],
    rules: layerRule(['**/app/**', '**/workers/**', '@angular/*'], 'gpu may only depend on core'),
  },
  {
    files: ['src/workers/**/*.ts'],
    rules: layerRule(['**/gpu/**', '**/app/**', '@angular/*'], 'workers may only depend on core'),
  },
  {
    files: ['**/*.spec.ts'],
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/prefer-promise-reject-errors': 'off',
    },
  },
  {
    files: [
      'scripts/**/*.ts',
      'e2e/**/*.ts',
      'bench/**/*.ts',
      'playwright.config.ts',
      'vitest*.ts',
    ],
    rules: { 'no-console': 'off' },
  },
  {
    files: ['src/**/*.html'],
    extends: [angular.configs.templateRecommended, angular.configs.templateAccessibility],
    rules: {
      '@angular-eslint/template/prefer-control-flow': 'error',
      '@angular-eslint/template/no-negated-async': 'error',
    },
  },
  {
    files: ['**/*.js', '**/*.mjs'],
    extends: [eslint.configs.recommended, tseslint.configs.disableTypeChecked],
  },
]);
