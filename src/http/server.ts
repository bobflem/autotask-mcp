import express, { type Request, type Response } from 'express';
import cors from 'cors';
import type { Server as McpServer } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { Logger } from '../utils/logger.js';


export function createHttpServer(mcpServer: McpServer, logger: Logger) {
  const app = express();

  // CORS so a variety of clients can reach it (you can restrict as needed)
  app.use(
    cors({
      origin: '*',
      exposedHeaders: ['Mcp-Session-Id'],
      allowedHeaders: ['*'],
    }),
  );

  // Parse JSON request bodies
  app.use(
    express.json({
      limit: '10mb',
    }),
  );

  // Health check endpoint
  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  });

  // Main MCP endpoint (Streamable HTTP)
  app.post('/mcp', async (req: Request, res: Response) => {
    try {
      // Stateless mode: no session IDs, each request is independent
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });

      // Basic logging / error handling
      transport.onerror = (err) => {
        logger.error('Streamable HTTP transport error', err);
      };

      // Clean up when the HTTP response closes
      res.on('close', () => {
        try {
          transport.close();
        } catch (err) {
          logger.error('Error closing Streamable HTTP transport', err);
        }
      });

      // Wire the MCP server to this transport
      await mcpServer.connect(transport);

      // Handle the MCP JSON-RPC request; this will stream back
      // the response over the same HTTP connection.
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      logger.error('Failed to handle MCP request', err);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal server error',
          },
          id: null,
        });
      }
    }
  });

  return app;
}
