import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { mcpRouter } from '../src/server/routes/mcp-sse.js';

test('Node remote MCP rejects API keys in URL query strings', async () => {
  const app = express();
  app.use('/mcp', mcpRouter);
  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Test server did not bind a TCP port.');
    const response = await fetch(`http://127.0.0.1:${address.port}/mcp/sse?key=ts_live_query_secret`);
    assert.equal(response.status, 401);
    assert.match(await response.text(), /Authorization: Bearer/);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
