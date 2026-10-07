/* global __dirname */
// Lightweight babel-register shim for running the app's .ts/.tsx tests under
// Node's built-in test runner without a bundler. Parses TS with @babel/parser
// (using the @babel/plugin-syntax-typescript plugin object, since the string-form
// 'typescript' plugin resolves `babel-plugin-typescript` which is not installed),
// strips types with @babel/plugin-transform-flow-strip-types (used as a plugin,
// not a preset), and compiles to CommonJS with @babel/plugin-transform-modules-commonjs
// plus the narrow JS transforms the service needs (async -> generator, optional
// chaining, object rest spread, nullish coalescing). No babel-preset-expo required.
const babel = require('@babel/core');
const fs = require('fs');
const path = require('path');

// Syntax plugin object (avoids string-form resolution of babel-plugin-typescript).
const TS_SYNTAX_PLUGIN = require('@babel/plugin-syntax-typescript');
const ASYNC_STORAGE_ID = require.resolve('@react-native-async-storage/async-storage');

// JS transforms the service needs. Class-properties is omitted because it requires
// a matching `loose` mode that conflicts with private-methods/private-props;
// the service has no class properties.
const JS_PLUGINS = [
  require('@babel/plugin-transform-async-to-generator'),
  require('@babel/plugin-transform-optional-chaining'),
  require('@babel/plugin-transform-object-rest-spread'),
  require('@babel/plugin-transform-nullish-coalescing-operator'),
  require('@babel/plugin-transform-modules-commonjs'),
];

const compiledCache = new Map();

function compile(filePath) {
  if (compiledCache.has(filePath)) return compiledCache.get(filePath);
  const code = fs.readFileSync(filePath, 'utf8');
  const ast = babel.parseSync(code, {
    sourceType: 'module',
    plugins: [TS_SYNTAX_PLUGIN],
  });
  const result = babel.transformFromAstSync(ast, code, {
    filename: filePath,
    plugins: [
      require('@babel/plugin-transform-flow-strip-types'),
      ...JS_PLUGINS,
    ],
  });
  const compiled = result.code;
  compiledCache.set(filePath, compiled);
  return compiled;
}

/** In-memory AsyncStorage shim used to drive the TTL window deterministically. */
class MemoryAsyncStorage {
  constructor() {
    this.store = new Map();
  }

  async getItem(key) {
    return this.store.has(key) ? this.store.get(key) : null;
  }

  async setItem(key, value) {
    this.store.set(key, String(value));
  }

  async removeItem(key) {
    this.store.delete(key);
  }
}

// One shim per test. `currentShim` is reset by the test's beforeEach so the
// compiled service reads the fresh test's shim. We patch
// `require.cache[require.resolve('@react-native-async-storage/async-storage')].
// exports` so the service's compiled `require()` resolves the shim instead of
// the real native implementation (which references `window` and fails under
// Node). Using the resolved file path as the cache key (not the package name).

// The real module's index.js does `exports.default = AsyncStorage` (loads
// AsyncStorage.js and assigns to `exports.default`), so patching exports at
// the resolved path short-circuits the real module before it touches window.
let currentShim = null;

function installShim(shim) {
  currentShim = shim;
  // Resolve the real module's file path to use as the require() cache key.
  const entry = require.cache[ASYNC_STORAGE_ID];
  if (entry) {
    // Update the existing entry so the service reads the shim.
    entry.exports = shim;
  } else {
    // Pre-create the cache entry at the resolved module path so the service's
    // compiled require() returns the shim instead of loading the real module.
    require.cache[ASYNC_STORAGE_ID] = {
      id: ASYNC_STORAGE_ID,
      filename: 'shim',
      loaded: true,
      exports: shim,
    };
  }
}

function ensureShimInstalled() {
  if (!require.cache['@react-native-async-storage/async-storage']) {
    installShim(currentShim);
  }
}

/**
 * Resolve + execute the compiled service against the CURRENT shim.
 *
 * The module is re-executed on every call (the babel parse/transform stays
 * cached in `compile`) because the service's top-level
 * `require('@react-native-async-storage/async-storage')` binds the shim's
 * exports object at execution time — caching the module would pin it to the
 * first test's shim while later tests swap in a fresh store.
 */
function loadService() {
  ensureShimInstalled();
  const filePath = path.resolve(__dirname, '..', 'recentlyViewedService.ts');
  const id = 'data:' + filePath;
  const compiled = compile(filePath);
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', '__dirname', '__filename', compiled)(
    mod, mod.exports, require, path.dirname(filePath), filePath
  );
  require.cache[id] = { id: id, filename: filePath, loaded: true, exports: mod.exports };
  return mod.exports;
}

module.exports = { compile, loadService, installShim, MemoryAsyncStorage };
