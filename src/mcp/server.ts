import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { TOOLS, handleToolCall } from './tools.js';
import { MCP_ICON } from './brand.js';

export function createMcpServer(apiKeyOverride?: string): Server {
  const server = new Server(
    {
      name: 'tweet-stream',
      version: '0.1.0',
      title: 'tweet.stream',
      websiteUrl: 'https://tweet.stream',
      icons: [MCP_ICON],
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: TOOLS,
    };
  });

  // Call tool handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    return await handleToolCall(name, args, apiKeyOverride);
  });

  return server;
}
