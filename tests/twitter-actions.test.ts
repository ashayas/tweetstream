import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeTweetImage, postTweet } from '../src/twitter/actions.js';

const pngBase64 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString('base64');

test('validates image MIME type, encoding, and file signature without network access', () => {
  assert.equal(decodeTweetImage(pngBase64, 'image/png').length, 8);
  assert.throws(() => decodeTweetImage(pngBase64, 'image/svg+xml'), /PNG, JPEG, or GIF/);
  assert.throws(() => decodeTweetImage('not-base64!', 'image/png'), /standard base64/);
  assert.throws(() => decodeTweetImage(Buffer.from('not a png').toString('base64'), 'image/png'), /does not match/);
});

test('uploads the validated image and attaches its media ID to the post payload', async () => {
  let uploaded: Buffer | undefined;
  let payload: Record<string, unknown> | undefined;
  const client = {
    v2: {
      uploadMedia: async (buffer: Buffer, options: { media_type: string; media_category: string }) => {
        uploaded = buffer;
        assert.deepEqual(options, { media_type: 'image/png', media_category: 'tweet_image' });
        return 'media-123';
      },
      tweet: async (request: Record<string, unknown>) => {
        payload = request;
        return { data: { id: 'tweet-123', text: 'hello with image' } };
      },
    },
  } as never;

  const result = await postTweet(client, { text: 'hello with image', imageBase64: pngBase64, imageMimeType: 'image/png' });
  assert.equal(uploaded?.length, 8);
  assert.deepEqual(payload, { text: 'hello with image', media: { media_ids: ['media-123'] } });
  assert.equal(result.id, 'tweet-123');
});
