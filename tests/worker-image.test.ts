import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker, { uploadImage } from '../worker-api/src/index.js';

const pngBase64 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString('base64');

test('Worker image uploader validates input before network access', async () => {
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = (async () => {
    requests += 1;
    return Response.json({ data: { id: 'media-456' } });
  }) as typeof fetch;
  try {
    await assert.rejects(uploadImage(pngBase64, 'image/svg+xml', 'mock-token'), /PNG, JPEG, or GIF/);
    await assert.rejects(uploadImage(Buffer.from('not png').toString('base64'), 'image/png', 'mock-token'), /does not match/);
    assert.equal(requests, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Worker image uploader builds the X media upload request without calling X', async () => {
  const originalFetch = globalThis.fetch;
  let requestUrl = '';
  let requestHeaders: Headers | undefined;
  let requestBody: Record<string, unknown> | undefined;
  globalThis.fetch = (async (input, init) => {
    requestUrl = String(input);
    requestHeaders = new Headers(init?.headers);
    requestBody = JSON.parse(String(init?.body));
    return Response.json({ data: { id: 'media-456' } });
  }) as typeof fetch;
  try {
    assert.equal(await uploadImage(pngBase64, 'image/png', 'mock-token'), 'media-456');
    assert.equal(requestUrl, 'https://api.x.com/2/media/upload');
    assert.equal(requestHeaders?.get('authorization'), 'Bearer mock-token');
    assert.deepEqual(requestBody, { media: pngBase64, media_category: 'tweet_image' });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Worker API rejects an API key supplied in the query string', async () => {
  const response = await worker.fetch(
    new Request('http://localhost/api/v1/me?key=ts_live_query_secret'),
    {} as never,
  );
  assert.equal(response.status, 401);
  assert.match(await response.text(), /Authorization: Bearer/);
});
