import { Router, Request, Response } from 'express';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { createMcpServer } from '../../mcp/server.js';

export const mcpRouter = Router();

// Track active transports by session ID
const activeTransports = new Map<string, SSEServerTransport>();

// 1. Establish SSE stream for MCP client
mcpRouter.get('/sse', async (req: Request, res: Response) => {
  const apiKey = (req.query.key as string) || (req.headers.authorization?.replace('Bearer ', '').trim());
  
  // Create transport directing client messages to /mcp/messages
  const transport = new SSEServerTransport('/mcp/messages', res);
  const server = createMcpServer(apiKey);

  activeTransports.set(transport.sessionId, transport);

  transport.onclose = () => {
    activeTransports.delete(transport.sessionId);
  };

  try {
    await server.connect(transport);
  } catch (err) {
    console.error('[MCP SSE] Connection error:', err);
    activeTransports.delete(transport.sessionId);
  }
});

// 2. Client sends JSON-RPC messages via POST
mcpRouter.post('/messages', async (req: Request, res: Response) => {
  const sessionId = req.query.sessionId as string;
  if (!sessionId) {
    res.status(400).send('Missing sessionId query parameter');
    return;
  }

  const transport = activeTransports.get(sessionId);
  if (!transport) {
    res.status(404).send(`Active MCP session not found for ID: ${sessionId}`);
    return;
  }

  try {
    await transport.handlePostMessage(req, res, req.body);
  } catch (err) {
    console.error('[MCP SSE] Error processing message:', err);
    if (!res.headersSent) {
      res.status(500).send((err as Error).message);
    }
  }
});
