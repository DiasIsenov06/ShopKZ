const js = require('@eslint/js');
const globals = require('globals');
module.exports = [
  { ignores: ['node_modules/**', 'coverage/**', 'dist/**', 'practical5/**', 'verification/**', 'test-reports/**', 'test-results/**', 'playwright-report/**'] },
  { files: ['**/*.js', '**/*.cjs'], languageOptions: { ecmaVersion: 'latest', sourceType: 'commonjs', globals: {...globals.node, ...globals.browser, ...globals.jest} },
    rules: Object.fromEntries(['constructor-super', 'for-direction', 'getter-return', 'no-async-promise-executor', 'no-class-assign', 'no-compare-neg-zero', 'no-cond-assign', 'no-const-assign', 'no-dupe-args', 'no-dupe-class-members', 'no-dupe-else-if', 'no-dupe-keys', 'no-duplicate-case', 'no-ex-assign', 'no-func-assign', 'no-import-assign', 'no-loss-of-precision', 'no-promise-executor-return', 'no-setter-return', 'no-sparse-arrays', 'no-this-before-super', 'no-unreachable', 'no-unsafe-finally', 'use-isnan', 'valid-typeof'].map(k => [k, js.configs.recommended.rules[k] || 'error'])) }
];
