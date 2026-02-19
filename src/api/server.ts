import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import type { AppConfig } from '../config/types.js';
import { rpcHandler } from './handlers/rpc.js';
import { forwardHandler } from './handlers/forward.js';
import { healthHandler } from './handlers/health.js';
import { signatureMiddleware } from './middleware/signature.js';
import { rbacMiddleware } from './middleware/rbac.js';
import { auditMiddleware } from './middleware/audit.js';
import { NonceValidator, TimestampValidator } from '../auth/signature.js';
import { ToolRegistry } from '../proxy/tool-registry.js';
import { PermissionCache } from '../rbac/cache.js';
import { EncryptionService } from '../audit/encryption.js';
import { AuditQueue } from '../audit/store.js';
import type { ChainDriver } from '../chain/driver.js';
import type { KeyCustodyDriver } from '../custody/driver.js';
import type { ProxyExecutor } from '../proxy/executor.js';
import { getLogger } from '../logging.js';

const logger = getLogger('api:server');

/**
 * Create Hono app with full middleware pipeline
 */
export function createServer(
  config: AppConfig,
  chainDriver: ChainDriver,
  custody: KeyCustodyDriver,
  auditQueue: AuditQueue,
  executor: ProxyExecutor
): Hono {
  const app = new Hono();

  // Initialize components
  const nonceValidator = new NonceValidator();
  const timestampValidator = new TimestampValidator();
  const toolRegistry = new ToolRegistry(config);
  const permissionCache = new PermissionCache(config.cache.ttlSeconds);
  const encryptionService = new EncryptionService();

  // ========================================================================
  // GLOBAL MIDDLEWARE
  // ========================================================================

  // 1. Request ID generation (UUID v4)
  app.use('*', (context, next) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (context as any).set('requestId', randomUUID());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    logger.debug({ requestId: (context as any).get('requestId') }, 'Request started');
    return next();
  });

  // ========================================================================
  // ROUTES
  // ========================================================================

  // Health check (no auth required)
  app.get('/health', healthHandler);

  // RPC endpoint (discovery: tools/list, tools/describe)
  app.post('/rpc', rpcHandler(toolRegistry, permissionCache, chainDriver, config));

  // Forward endpoint (all HTTP methods, full middleware pipeline)
  app.all(
    '/forward/*',
    signatureMiddleware(nonceValidator, timestampValidator),
    rbacMiddleware(toolRegistry, permissionCache, chainDriver),
    auditMiddleware(auditQueue, encryptionService),
    forwardHandler(custody, executor)
  );

  // ========================================================================
  // GLOBAL ERROR HANDLER
  // ========================================================================

  app.onError((error, context) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const requestId = (context as any).get('requestId') as string;
    logger.error(
      {
        requestId,
        error: String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
      'Unhandled error'
    );

    context.status(500);
    return context.json({
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32603,
        message: 'Internal server error',
      },
      _governance: {
        request_id: requestId,
        timestamp: Math.floor(Date.now() / 1000),
        error_type: 'service/internal_error',
      },
    });
  });

  // ========================================================================
  // GRACEFUL SHUTDOWN
  // ========================================================================

  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, initiating graceful shutdown');
    // Drain audit queue to ensure all entries are written before exit
    await auditQueue.drain();
    nonceValidator.destroy();
    logger.info('Server shutdown complete');
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    logger.info('SIGINT received, initiating graceful shutdown');
    // Drain audit queue to ensure all entries are written before exit
    await auditQueue.drain();
    nonceValidator.destroy();
    logger.info('Server shutdown complete');
    process.exit(0);
  });

  return app;
}

/**
 * Start server
 */
export async function startServer(
  config: AppConfig,
  chainDriver: ChainDriver,
  custody: KeyCustodyDriver,
  auditQueue: AuditQueue,
  executor: ProxyExecutor
): Promise<void> {
  const { serve } = await import('@hono/node-server');
  const app = createServer(config, chainDriver, custody, auditQueue, executor);

  logger.info({ port: config.server.port, host: config.server.host }, 'Starting HTTP server');

  serve(
    {
      fetch: app.fetch,
      port: config.server.port,
      hostname: config.server.host,
    },
    () => {
      logger.info(
        {
          url: `http://${config.server.host}:${config.server.port}`,
        },
        'Server listening'
      );
    }
  );

  return new Promise(() => {
    // Keep server running
  });
}
