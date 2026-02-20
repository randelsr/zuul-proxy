import type { Context } from 'hono';
import type { KeyCustodyDriver } from '../../custody/driver.js';
import type { ProxyExecutor, ForwardRequest } from '../../proxy/executor.js';
import type { AgentAddress, ToolKey, PermissionAction } from '../../types.js';
import { getLogger } from '../../logging.js';

const logger = getLogger('handlers:forward');

/**
 * Forward handler: execute upstream request with key injection
 * Middleware has already verified signature + RBAC
 *
 * On success: wrap response with _governance
 * - JSON: { result: body, _governance }
 * - Binary: body + X-Governance header
 * - SSE: inject _governance as first event
 *
 * On error: already handled by middleware, but forward errors handled here
 */
export function forwardHandler(custody: KeyCustodyDriver, executor: ProxyExecutor, chainId: ChainId) {
  return async (context: Context) => {
    const requestId = context.get('requestId') as string;
    const recoveredAddress = context.get('recoveredAddress') as AgentAddress;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const signedRequest = context.get('signedRequest') as any;
    const toolKey = context.get('toolKey') as ToolKey;
    const action = context.get('action') as PermissionAction;

    if (!recoveredAddress || !signedRequest || !toolKey || !action) {
      logger.error({ requestId }, 'Forward handler: missing context');
      context.status(500);
      return context.json({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32603, message: 'Internal server error' },
        _governance: {
          request_id: requestId,
          timestamp: Math.floor(Date.now() / 1000),
          error_type: 'service/internal_error',
        },
      });
    }

    try {
      const startTime = Date.now();

      // Get API key handle from custody (will be injected in executor)
      const keyHandleResult = custody.getKey(toolKey);

      if (!keyHandleResult.ok) {
        logger.error(
          { requestId, tool: toolKey, error: keyHandleResult.error.message },
          'Failed to get API key'
        );
        context.status(500);
        return context.json({
          jsonrpc: '2.0',
          id: null,
          error: { code: -32603, message: 'Internal server error' },
          _governance: {
            request_id: requestId,
            agent: recoveredAddress,
            tool: toolKey,
            action,
            timestamp: Math.floor(Date.now() / 1000),
            error_type: 'service/internal_error',
          },
        });
      }

      // Build forward request
      const forwardReq: ForwardRequest = {
        method: signedRequest.method,
        targetUrl: signedRequest.targetUrl,
        headers: Object.fromEntries(context.req.raw.headers.entries()),
        body: await context.req.raw.clone().text(),
      };

      // Execute forward (key injection happens in executor)
      const execResult = await executor.execute(forwardReq, keyHandleResult.value);

      if (!execResult.ok) {
        // Upstream error
        const latencyMs = Date.now() - startTime;

        logger.warn(
          {
            requestId,
            agent: recoveredAddress,
            tool: toolKey,
            action,
            error: execResult.error.message,
            latencyMs,
          },
          'Upstream request failed'
        );

        // Determine HTTP status and error code
        let httpStatus: 502 | 504 = 502; // Default: bad gateway
        let errorCode = execResult.error.code; // Use error code directly from executor

        if (execResult.error.code === -32021) {
          // Timeout: use 504 status code
          httpStatus = 504;
        }

        context.status(httpStatus);
        return context.json({
          jsonrpc: '2.0',
          id: null,
          error: {
            code: errorCode,
            message: execResult.error.message,
            data: execResult.error.data,
          },
          _governance: {
            request_id: requestId,
            agent: recoveredAddress,
            tool: toolKey,
            action,
            target_url: signedRequest.targetUrl,
            latency_ms: latencyMs,
            timestamp: Math.floor(Date.now() / 1000),
            error_type: 'service/upstream_error',
          },
        });
      }

      const result = execResult.value;
      const latencyMs = Date.now() - startTime;

      // ====================================================================
      // Response wrapping based on content type
      // ====================================================================

      const governance = {
        request_id: requestId,
        agent: recoveredAddress,
        tool: toolKey,
        action,
        target_url: signedRequest.targetUrl,
        latency_ms: latencyMs,
        chain_id: chainId,
        // audit_tx would be added once audit entry is written (async)
        timestamp: Math.floor(Date.now() / 1000),
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      context.status(result.status as any);

      if (result.contentType === 'json') {
        // JSON response: wrap in result envelope
        return context.json({
          result: result.body,
          _governance: governance,
        });
      } else if (result.contentType === 'sse') {
        // SSE response: inject _governance as first event
        const { streamSSE } = await import('hono/streaming');

        return streamSSE(context, async (stream) => {
          // First event: _governance metadata
          await stream.writeSSE({
            event: '_governance',
            data: JSON.stringify(governance),
          });

          // Then stream the rest of the response
          if (result.body && typeof result.body === 'object' && 'pipe' in result.body) {
            // If result.body is a Node Readable stream, convert it
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const readable = result.body as any;
            await new Promise<void>((resolve, reject) => {
              readable.on('data', (chunk: Buffer) => {
                stream.write(chunk.toString('utf-8'));
              });
              readable.on('end', resolve);
              readable.on('error', reject);
            });
          }
        });
      } else {
        // Binary/text response: inject _governance in header
        const governanceHeader = Buffer.from(JSON.stringify(governance)).toString('base64');
        context.header('X-Governance', governanceHeader);

        // Copy upstream headers
        for (const [key, value] of Object.entries(result.headers)) {
          context.header(key, value as string);
        }

        if (typeof result.body === 'string') {
          context.text(result.body);
        } else if (Buffer.isBuffer(result.body)) {
          context.body(result.body as unknown as ArrayBuffer);
        } else {
          context.text(JSON.stringify(result.body));
        }

        return;
      }
    } catch (error) {
      logger.error({ requestId, error: String(error) }, 'Forward handler error');

      context.status(500);
      return context.json({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32603, message: 'Internal server error' },
        _governance: {
          request_id: requestId,
          agent: recoveredAddress,
          tool: toolKey,
          action,
          timestamp: Math.floor(Date.now() / 1000),
          error_type: 'service/internal_error',
        },
      });
    }
  };
}
