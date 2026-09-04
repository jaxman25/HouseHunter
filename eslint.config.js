// ESLint flat config (ESLint 9).
// Uses the Expo preset (react, react-native, react-hooks, @typescript-eslint)
// so `npm run lint` works out of the box for .ts/.tsx sources.
const { defineConfig } = require('eslint/config');
const globals = require('globals');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: [
      'dist/**',
      '.expo/**',
      'android/**',
      'ios/**',
      'public/**',
      'node_modules/**',
    ],
  },
  {
    // Plain Node.js scripts (no browser/module bundler globals here).
    files: ['scripts/**/*.js'],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    rules: {
      // react-hooks v6 flags any effect that calls an async load helper that
      // sets state, even when every setState is behind an `await`. This app's
      // data-fetch pattern (load fn + effect) is the documented React pattern;
      // keep the rule on as a warning so genuinely synchronous setState in
      // effects still stands out without failing `npm run lint`.
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
]);
