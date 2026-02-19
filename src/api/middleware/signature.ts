import type { MiddlewareHandler, Context } from 'hono';
import { verifySignedRequest, NonceValidator, TimestampValidator } from '../../auth/signature.js';
import { isRawSignatureHeaders } from '../../auth/guards.js';
import type { SignedRequest, AgentAddress, HttpMethod } from '../../types.js';
import { getLogger } from '../../logging.js';
import { isHttpMethod } from '../../auth/guards.js';

const logger = getLogger('middleware:signature');

/**
 * Signature verification middleware
 * Recovers signer from X-Signature header, validates nonce and timestamp
 * Attaches recovered address to context (NOT claimed address)
 *
 * On failure: return JSON-RPC error (-32001 to -32005)
 * On success: attach recoveredAddress and signedRequest to context
 *
 * CRITICAL: Use recovered address, NOT claimed address, for all future checks
 */
export function signatureMiddleware(
  nonceValidator: NonceValidator,
  timestampValidator: TimestampValidator
): MiddlewareHandler {
  return async (context: Context, next: () => Promise<void>) => {
    const requestId = context.get('requestId') as string;
    const startTime = Date.now();

    logger.debug({ requestId }, 'Signature verification middleware');

    try {
      // Step 1: Extract headers (case-insensitive)
      const rawHeaders = context.req.raw.headers;
      const headers: Record<string, string> = {};

      rawHeaders.forEach((value, key) => {
        headers[key.toLowerCase()] = value;
      });

      if (!isRawSignatureHeaders(headers)) {
        logger.warn(
          { requestId, claimedAgent: headers['x-agent-address'] },
          'Missing or invalid signature headers'
        );

        context.status(401);
        context.json({
          jsonrpc: '2.0',
          id: null,
          error: {
            code: -32001,
            message: 'Missing signature headers',
            data: {
              required_headers: ['X-Agent-Address', 'X-Signature', 'X-Nonce', 'X-Timestamp'],
            },
          },
          _governance: {
            request_id: requestId,
            timestamp: Math.floor(Date.now() / 1000),
            error_type: 'auth/missing_signature',
          },
        });
        return;
      }

      // Step 2: Extract target URL from path
      const pathMatch = context.req.path.match(/^\/forward\/(.+)$/);
      if (!pathMatch || !pathMatch[1]) {
        logger.warn({ requestId, path: context.req.path }, 'Invalid forward path');
        context.status(400);
        context.json({
          jsonrpc: '2.0',
          id: null,
          error: {
            code: -32600,
            message: 'Invalid request path',
          },
          _governance: {
            request_id: requestId,
            timestamp: Math.floor(Date.now() / 1000),
            error_type: 'request/malformed',
          },
        });
        return;
      }

      const targetUrl = decodeURIComponent(pathMatch[1]);
      const method = context.req.method as string;

      if (!isHttpMethod(method)) {
        logger.warn({ requestId, method }, 'Invalid HTTP method');
        context.status(400);
        context.json({
          jsonrpc: '2.0',
          id: null,
          error: {
            code: -32600,
            message: 'Invalid HTTP method',
          },
          _governance: {
            request_id: requestId,
            timestamp: Math.floor(Date.now() / 1000),
            error_type: 'request/malformed',
          },
        });
        return;
      }

      // Step 3: Build signed request
      const signedRequest: SignedRequest = {
        agentAddress: headers['x-agent-address'] as AgentAddress,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        signature: headers['x-signature'] as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        nonce: headers['x-nonce'] as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        timestamp: parseInt(headers['x-timestamp'] as string) as any,
        method: method as HttpMethod,
        targetUrl,
      };

      // Step 4: Verify signature
      const verifyResult = await verifySignedRequest(
        signedRequest,
        nonceValidator,
        timestampValidator
      );

      if (!verifyResult.ok) {
        const latencyMs = Date.now() - startTime;
        logger.warn(
          {
            requestId,
            claimedAgent: signedRequest.agentAddress,
            error: verifyResult.error.message,
            latencyMs,
          },
          'Signature verification failed'
        );

        context.status(401);
        context.json({
          jsonrpc: '2.0',
          id: null,
          error: {
            code: verifyResult.error.code,
            message: verifyResult.error.message,
            data: verifyResult.error.data,
          },
          _governance: {
            request_id: requestId,
            timestamp: Math.floor(Date.now() / 1000),
            error_type: 'auth/invalid_signature',
          },
        });
        return;
      }

      // Step 5: Attach recovered address to context (NOT claimed)
      context.set('recoveredAddress', verifyResult.value);
      context.set('signedRequest', signedRequest);

      logger.info({ requestId, agent: verifyResult.value }, 'Signature verified');

      await next();
    } catch (error) {
      logger.error({ requestId, error: String(error) }, 'Signature middleware error');

      context.status(500);
      context.json({
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
    }
  };
}
