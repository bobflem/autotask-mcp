#!/usr/bin/env node

// Main Entry Point for Autotask MCP Server
// Initializes configuration, logging, and starts the MCP server

import { AutotaskMcpServer } from './mcp/server.js';
import { Logger } from './utils/logger.js';
import { loadEnvironmentConfig, mergeWithMcpConfig } from './utils/config.js';
import { createHttpServer } from './http/server.js';

async function main() {
  let logger: Logger | undefined;

  try {
    // Load configuration
    const envConfig = loadEnvironmentConfig();
    const mcpConfig = mergeWithMcpConfig(envConfig);

    // Initialize logger
    logger = new Logger(envConfig.logging.level, envConfig.logging.format);
    logger.info('Starting Autotask MCP Server (Streamable HTTP)...');
    logger.debug('Configuration loaded', {
      serverName: mcpConfig.name,
      serverVersion: mcpConfig.version,
      hasCredentials: !!(
        mcpConfig.autotask.username &&
        mcpConfig.autotask.secret &&
        mcpConfig.autotask.integrationCode
      ),
    });

    // Validate required configuration
    if (
      !mcpConfig.autotask.username ||
      !mcpConfig.autotask.secret ||
      !mcpConfig.autotask.integrationCode
    ) {
      throw new Error(
        'Missing required Autotask credentials.\n' +
          'Please set AUTOTASK_USERNAME, AUTOTASK_SECRET, and AUTOTASK_INTEGRATION_CODE environment variables.',
      );
    }

    // Create the MCP server (handlers + Autotask integration)
    const server = new AutotaskMcpServer(mcpConfig, logger);

    // Build the HTTP app around the MCP server
    const mcpCoreServer = server.getServer();
    const app = createHttpServer(mcpCoreServer, logger);

    // Choose port/host (you can change defaults as you like)
    const port = Number(process.env.PORT ?? 3000);
    const host = process.env.HOST ?? '0.0.0.0';

    const httpServer = app.listen(port, host, () => {
      logger!.info(
        `Autotask MCP Streamable HTTP server listening on http://${host}:${port}/mcp`,
      );
    });

    // Graceful shutdown
    process.on('SIGINT', async () => {
      logger!.info('Received SIGINT, shutting down gracefully...');
      httpServer.close();
      await server.stop();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      logger!.info('Received SIGTERM, shutting down gracefully...');
      httpServer.close();
      await server.stop();
      process.exit(0);
    });
  } catch (error) {
    if (logger) {
      logger.error('Failed to start Autotask MCP Server:', error);
    } else {
      console.error('Failed to start Autotask MCP Server:', error);
    }
    process.exit(1);
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

// Start the server
main().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
}); 