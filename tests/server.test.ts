import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { TOOLS, handleToolCall } from '../src/mcp/tools.js';
import { TokenStore } from '../src/storage/token-store.js';

describe('MCP Tools Definition', () => {
  test('registers all 6 expected tools', () => {
    const toolNames = TOOLS.map((t) => t.name);
    assert.deepEqual(toolNames, [
      'post_tweet',
      'reply_to_tweet',
      'get_tweet',
      'read_timeline',
      'search_tweets',
      'get_my_profile',
    ]);
  });

  test('validates post_tweet character length limits', async () => {
    // Over 280 chars
    const longText = 'a'.repeat(281);
    const result = await handleToolCall('post_tweet', { text: longText });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /exceeds 280 characters/);
  });

  test('validates post_tweet empty input', async () => {
    const result = await handleToolCall('post_tweet', { text: '   ' });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /cannot be empty/);
  });

  test('validates reply_to_tweet required fields', async () => {
    const result = await handleToolCall('reply_to_tweet', { tweet_id: '123' });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /Reply text cannot be empty/);
  });
});

describe('TokenStore', () => {
  test('generates valid API keys with ts_live_ prefix', () => {
    const store = TokenStore.getInstance();
    const key = store.generateApiKey();
    assert.ok(key.startsWith('ts_live_'));
    assert.ok(key.length > 20);
  });

  test('saves and retrieves user sessions', () => {
    const store = TokenStore.getInstance();
    const testKey = store.generateApiKey();
    const session = store.saveSession({
      apiKey: testKey,
      userId: 'test_user_123',
      username: 'test_handle',
      name: 'Test Account',
      accessToken: 'test_token',
      refreshToken: 'test_refresh',
    });

    assert.equal(session.apiKey, testKey);
    const retrieved = store.getSession(testKey);
    assert.ok(retrieved);
    assert.equal(retrieved.username, 'test_handle');
    assert.equal(retrieved.userId, 'test_user_123');
  });
});
