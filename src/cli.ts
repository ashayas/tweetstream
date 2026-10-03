#!/usr/bin/env node

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from './mcp/server.js';

async function main() {
  const server = createMcpServer();
  const transport = new StdioServerTransport();

  process.stderr.write('[tweet-stream] MCP Server starting over Stdio...\n');

  await server.connect(transport);

  process.stderr.write('[tweet-stream] MCP Server connected and ready to accept requests.\n');
}

main().catch((err) => {
  process.stderr.write(`[tweet-stream] Fatal error: ${err.message}\n`);
  process.exit(1);
});
