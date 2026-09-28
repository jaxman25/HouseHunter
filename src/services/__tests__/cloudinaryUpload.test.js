/**
 * Contract tests for the Cloudinary unsigned upload path.
 *
 * Mirrors the request/response logic of src/services/storageService.ts
 * (postToCloudinary / validateUploadUri / resize decision) without importing
 * the TS source — same convention as the other tests in this directory, since
 * the Node test runner has no TS loader. Keeps the Cloudinary contract locked:
 *   - endpoint: https://api.cloudinary.com/v1_1/<cloud>/<image|video>/upload
 *   - FormData: file ({ uri, type, name } for RN fetch) + upload_preset
 *   - success → response.secure_url is returned
 *   - failure → JSON error message or status text, thrown
 *
 * Run with:  node src/services/__tests__/cloudinaryUpload.test.js
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

// ── Mirrored constants (keep in sync with storageService.ts) ──────────────

const CLOUD_NAME = 'qrbmp96d';
const IMAGE_PRESET = 'househunter_unsigned';
const VIDEO_PRESET = 'househunter_unsigned';
const MAX_IMAGE_DIMENSION = 2000;

// ── Mirrored logic under test ─────────────────────────────────────────────

function validateUploadUri(uri) {
  if (!uri) throw new Error('Upload URI is required');
  if (!/^(https?|data):/.test(uri)) {
    throw new Error('Invalid upload source');
  }
}

function buildEndpoint(resource) {
  return `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${resource}/upload`;
}

function buildPreset(resource) {
  return resource === 'image' ? IMAGE_PRESET : VIDEO_PRESET;
}

function buildFileField(uri, type, name) {
  return { uri, type, name };
}

/** Whether the resize action should scale the image (never upscale). */
function shouldResize(width) {
  return width > MAX_IMAGE_DIMENSION;
}

/** Extract secure_url from an ok response body. */
function extractSecureUrl(data) {
  if (!data?.secure_url) {
    throw new Error('Cloudinary upload failed: missing secure_url in response');
  }
  return data.secure_url;
}

/** Build the error thrown for a non-ok Cloudinary response. */
function buildUploadError(status, statusText, bodyText) {
  let detail = `${status} ${statusText}`;
  try {
    const body = JSON.parse(bodyText);
    if (body?.error?.message) detail = body.error.message;
    else if (typeof body?.error === 'string') detail = body.error;
  } catch {
    // non-JSON error body — keep the status text
  }
  return new Error(`Cloudinary upload failed: ${detail}`);
}

/** Minimal mirror of postToCloudinary's happy path + error mapping. */
async function postToCloudinary(resource, fileField) {
  const formData = { file: fileField, upload_preset: buildPreset(resource) };
  const response = await fetch(buildEndpoint(resource), {
    method: 'POST',
    body: formData,
  });
  if (!response.ok) {
    const bodyText = await response.text();
    throw buildUploadError(response.status, response.statusText, bodyText);
  }
  const data = await response.json();
  return extractSecureUrl(data);
}

// ── fetch mock ────────────────────────────────────────────────────────────

const realFetch = globalThis.fetch;
let fetchCalls;

beforeEach(() => {
  fetchCalls = [];
  globalThis.fetch = async (url, init) => {
    fetchCalls.push({ url, init });
    return { ok: true, status: 200, statusText: 'OK', json: async () => ({}) };
  };
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

// ── validateUploadUri ─────────────────────────────────────────────────────

describe('validateUploadUri', () => {
  test('accepts https URIs', () => {
    assert.doesNotThrow(() => validateUploadUri('https://example.com/photo.jpg'));
  });
  test('accepts data URIs (picker output)', () => {
    assert.doesNotThrow(() => validateUploadUri('data:image/jpeg;base64,abc'));
  });
  test('rejects file:// URIs', () => {
    assert.throws(() => validateUploadUri('file:///storage/img.jpg'), /Invalid upload source/);
  });
  test('rejects content:// URIs (Android)', () => {
    assert.throws(() => validateUploadUri('content://media/images/1'), /Invalid upload source/);
  });
  test('rejects empty URIs', () => {
    assert.throws(() => validateUploadUri(''), /URI is required/);
  });
});

// ── request contract ──────────────────────────────────────────────────────

describe('Cloudinary request contract', () => {
  test('image endpoint URL', () => {
    assert.equal(
      buildEndpoint('image'),
      'https://api.cloudinary.com/v1_1/qrbmp96d/image/upload'
    );
  });
  test('video endpoint URL', () => {
    assert.equal(
      buildEndpoint('video'),
      'https://api.cloudinary.com/v1_1/qrbmp96d/video/upload'
    );
  });
  test('file field keeps the RN fetch shape { uri, type, name }', () => {
    const f = buildFileField('file:///tmp/x.jpg', 'image/jpeg', 'upload.jpg');
    assert.deepEqual(f, { uri: 'file:///tmp/x.jpg', type: 'image/jpeg', name: 'upload.jpg' });
  });
  test('POSTs multipart fields: file + upload_preset (image preset)', async () => {
    let captured;
    globalThis.fetch = async (url, init) => {
      captured = { url, init };
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ secure_url: 'https://res.cloudinary.com/x.jpg' }),
      };
    };
    await postToCloudinary('image', buildFileField('u', 'image/jpeg', 'upload.jpg'));
    assert.equal(captured.init.method, 'POST');
    assert.equal(captured.init.body.file.type, 'image/jpeg');
    assert.equal(captured.init.body.upload_preset, 'househunter_unsigned');
  });
  test('video resource posts the video preset', async () => {
    let captured;
    globalThis.fetch = async (url, init) => {
      captured = { url, init };
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ secure_url: 'https://res.cloudinary.com/v.mp4' }),
      };
    };
    await postToCloudinary('video', buildFileField('u', 'video/mp4', 'upload.mp4'));
    assert.equal(captured.url, buildEndpoint('video'));
    assert.equal(captured.init.body.upload_preset, 'househunter_unsigned');
  });
});

// ── response handling ─────────────────────────────────────────────────────

describe('Cloudinary response handling', () => {
  test('returns secure_url from a success body', () => {
    assert.equal(
      extractSecureUrl({ secure_url: 'https://res.cloudinary.com/demo/image/upload/a.jpg' }),
      'https://res.cloudinary.com/demo/image/upload/a.jpg'
    );
  });
  test('throws when secure_url is missing from a 2xx body', () => {
    assert.throws(
      () => extractSecureUrl({ public_id: 'x' }),
      /missing secure_url/
    );
  });
  test('maps JSON error bodies to their message', async () => {
    globalThis.fetch = async () => ({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: async () =>
        JSON.stringify({ error: { message: 'Upload preset not found' } }),
    });
    await assert.rejects(
      postToCloudinary('image', buildFileField('u', 'image/jpeg', 'upload.jpg')),
      /Cloudinary upload failed: Upload preset not found/
    );
  });
  test('falls back to status text for non-JSON error bodies', async () => {
    globalThis.fetch = async () => ({
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
      text: async () => '<html>gateway error</html>',
    });
    await assert.rejects(
      postToCloudinary('image', buildFileField('u', 'image/jpeg', 'upload.jpg')),
      /Cloudinary upload failed: 502 Bad Gateway/
    );
  });
});

// ── resize decision ───────────────────────────────────────────────────────

describe('resize decision (never upscale)', () => {
  test('resizes images wider than the cap', () => {
    assert.equal(shouldResize(4000), true);
  });
  test('leaves images at or under the cap untouched', () => {
    assert.equal(shouldResize(2000), false);
    assert.equal(shouldResize(800), false);
  });
  test('cap matches MAX_IMAGE_DIMENSION', () => {
    assert.equal(MAX_IMAGE_DIMENSION, 2000);
  });
});
