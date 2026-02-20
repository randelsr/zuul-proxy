import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import type { AppConfig } from '../config/types.js';
import { rpcHandler } from './handlers/rpc.js';
import { forwardHandler } from './handlers/forward.js';
import { healthHandler } from './handlers/health.js';
import {
  parseAuditSearchParams,
  performAuditSearch,
  performEmergencyRevoke,
} from './handlers/admin.js';
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
import type { Context } from 'hono';

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
  // MIDDLEWARE
  // ========================================================================

  /**
   * Localhost-only middleware for admin endpoints
   * Restricts access to requests from localhost/127.0.0.1/[::1]
   */
  function localhostOnly() {
    return async (context: Context, next: () => Promise<void>) => {
      const host = context.req.header('host') || '';

      // Accept localhost, 127.0.0.1, and IPv6 loopback
      const isLocalhost =
        host.startsWith('localhost:') ||
        host.startsWith('127.0.0.1:') ||
        host.startsWith('[::1]:');

      if (!isLocalhost) {
        logger.warn({ host }, 'Admin endpoint access from non-localhost address');
        context.status(403);
        return context.json({
          error: 'Admin endpoints only accessible from localhost',
          _governance: {
            request_id: (context as any).get('requestId') as string,
            timestamp: Math.floor(Date.now() / 1000),
            error_type: 'auth/localhost_only',
          },
        });
      }

      return next();
    };
  }

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
    forwardHandler(custody, executor, config.chain.chainId as any)
  );

  // Admin audit search endpoint (localhost-only)
  app.get(
    '/admin/audit/search',
    localhostOnly(),
    async (context: Context) => {
      const queryString = context.req.url.split('?')[1] || '';
      const paramsResult = parseAuditSearchParams(queryString);

      if (!paramsResult.ok) {
        logger.warn({ error: paramsResult.error.message }, 'Invalid audit search parameters');
        context.status(400);
        return context.json({
          error: paramsResult.error.message,
          _governance: {
            request_id: (context as any).get('requestId') as string,
            timestamp: Math.floor(Date.now() / 1000),
            error_type: 'request/invalid_params',
          },
        });
      }

      const searchResult = await performAuditSearch(
        paramsResult.value,
        chainDriver,
        encryptionService,
        config.chain.auditContractAddress
      );

      if (!searchResult.ok) {
        logger.error(
          { error: searchResult.error.message, code: searchResult.error.code },
          'Audit search failed'
        );
        context.status((searchResult.error.httpStatus || 500) as any);
        return context.json({
          jsonrpc: '2.0',
          id: null,
          error: {
            code: searchResult.error.code,
            message: searchResult.error.message,
            data: { error_type: 'service/audit_search_failed' },
          },
          _governance: {
            request_id: (context as any).get('requestId') as string,
            timestamp: Math.floor(Date.now() / 1000),
            error_type: 'service/audit_search_failed',
          },
        });
      }

      logger.info(
        { count: searchResult.value.count, query: searchResult.value.query },
        'Audit search completed'
      );

      return context.json({
        query: searchResult.value.query,
        count: searchResult.value.count,
        entries: searchResult.value.entries,
        _governance: {
          request_id: (context as any).get('requestId') as string,
          timestamp: Math.floor(Date.now() / 1000),
        },
      });
    }
  );

  // Admin emergency revoke endpoint (localhost-only)
  app.post(
    '/admin/rbac/revoke',
    localhostOnly(),
    async (context: Context) => {
      const body = await context.req.json<{ agent_address?: string }>();
      const agentAddress = body.agent_address;

      if (!agentAddress) {
        logger.warn('Emergency revoke request missing agent_address');
        context.status(400);
        return context.json({
          error: 'Missing required field: agent_address',
          _governance: {
            request_id: (context as any).get('requestId') as string,
            timestamp: Math.floor(Date.now() / 1000),
            error_type: 'request/invalid_params',
          },
        });
      }

      const revokeResult = await performEmergencyRevoke(
        agentAddress,
        chainDriver,
        config.chain.rbacContractAddress
      );

      if (!revokeResult.ok) {
        logger.error(
          { agent: agentAddress, error: revokeResult.error.message },
          'Emergency revoke failed'
        );
        context.status((revokeResult.error.httpStatus || 500) as any);
        return context.json({
          jsonrpc: '2.0',
          id: null,
          error: {
            code: revokeResult.error.code,
            message: revokeResult.error.message,
            data: { agent_address: agentAddress },
          },
          _governance: {
            request_id: (context as any).get('requestId') as string,
            timestamp: Math.floor(Date.now() / 1000),
            error_type: 'service/revoke_failed',
          },
        });
      }

      logger.info(
        { agent: agentAddress, txHash: revokeResult.value },
        'Agent revoked successfully'
      );

      return context.json({
        message: 'Agent revoked successfully',
        agent_address: agentAddress,
        tx_hash: revokeResult.value,
        _governance: {
          request_id: (context as any).get('requestId') as string,
          timestamp: Math.floor(Date.now() / 1000),
        },
      });
    }
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
