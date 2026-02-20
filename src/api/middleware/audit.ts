import type { MiddlewareHandler, Context } from 'hono';
import type { AuditQueue } from '../../audit/store.js';
import type { AuditEntry, Signature } from '../../types.js';
import { buildAuditPayload, hashPayload, hashBody } from '../../audit/payload.js';
import { EncryptionService } from '../../audit/encryption.js';
import { getLogger } from '../../logging.js';

const logger = getLogger('middleware:audit');

/**
 * Audit middleware (post-response)
 * Captures request + response context, encrypts payload, queues for blockchain
 * CRITICAL: Audit is always async (never blocks response path)
 *
 * Signs audit entries with proxy private key (optional)
 * Audits both success and failure flows:
 * - Success: 200 with response body
 * - Auth failure: 401 with error details
 * - Permission denial: 403 with allowed_actions
 * - Upstream error: 502/503/504 with upstream status
 */
export function auditMiddleware(
  auditQueue: AuditQueue,
  encryptionService: EncryptionService,
  proxyPrivateKey?: `0x${string}` // Optional proxy signing key
): MiddlewareHandler {
  return async (context: Context, next: () => Promise<void>) => {
    const requestId = context.get('requestId') as string;
    const recoveredAddress = context.get('recoveredAddress');
    const signedRequest = context.get('signedRequest');
    const toolKey = context.get('toolKey');
    const action = context.get('action');
    const startTime = Date.now();

    try {
      // Call next middleware (execute handlers)
      await next();

      // After response is sent, capture audit context
      const latencyMs = Date.now() - startTime;
      const status = context.res.status;
      const isSuccess = status >= 200 && status < 300;

      // If we have full context (successful auth + authz), capture full audit
      if (recoveredAddress && signedRequest && toolKey && action) {
        try {
          // Build audit payload
          const requestBody = context.req.raw.body;
          const responseBodyText = await context.res.clone().text();

          const requestHash = hashBody(requestBody);
          const responseHash = hashBody(responseBodyText);

          // Determine error type from semantic flags (set by prior middleware)
          // NOT from HTTP status code alone
          let errorType = '';
          if (!isSuccess) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const unknownTool = context.get('unknownTool') as any;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const agentRevoked = context.get('agentRevoked') as any;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const permissionDenied = context.get('permissionDenied') as any;

            if (unknownTool) {
              errorType = 'request/unknown_tool';
            } else if (agentRevoked) {
              errorType = 'permission/agent_revoked';
            } else if (permissionDenied) {
              errorType = 'permission/no_action_access';
            } else if (status >= 400 && status < 500) {
              // Client error (but not auth/authz): map to HTTP code
              errorType = `http_${status}`;
            } else if (status >= 500) {
              // Server error: upstream or internal
              errorType = `service/upstream_error`;
            } else {
              // Fallback
              errorType = `http_${status}`;
            }
          }

          const payload = buildAuditPayload(
            recoveredAddress,
            toolKey,
            action,
            signedRequest.targetUrl,
            signedRequest.method,
            status,
            errorType, // Now semantic error type, not just HTTP status
            latencyMs,
            requestHash,
            responseHash
          );

          // Encrypt payload
          const encryptResult = encryptionService.encrypt(payload);

          if (encryptResult.ok) {
            const payloadHash = hashPayload(payload);

            // Sign payload hash with proxy private key (if available)
            let proxySignature: Signature = '0x' as unknown as Signature;
            if (proxyPrivateKey) {
              try {
                const { privateKeyToAccount } = await import('viem/accounts');
                const viem = await import('viem');
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const signMessage = (viem as any).signMessage;
                const proxyAccount = privateKeyToAccount(proxyPrivateKey);
                const sig = await signMessage({
                  account: proxyAccount,
                  message: { raw: payloadHash as unknown as `0x${string}` },
                });
                proxySignature = sig as unknown as Signature;
              } catch (signError) {
                logger.warn(
                  { requestId, error: String(signError) },
                  'Failed to sign audit entry with proxy key'
                );
              }
            }

            // Queue for blockchain (non-blocking)
            // Privacy-first design: only agent, timestamp, encrypted payload, and hash are written
            // Tool, action, success, and error details are encrypted in the payload
            const auditEntry: AuditEntry = {
              auditId: payload.id,
              agent: recoveredAddress,
              timestamp: payload.timestamp,
              encryptedPayload: encryptResult.value,
              payloadHash,
              agentSignature: signedRequest.signature, // From X-Signature header
              proxySignature, // Proxy signature over payload hash
            };

            auditQueue.enqueue(auditEntry);

            logger.debug({ requestId, auditId: payload.id, status }, 'Audit entry queued');
          } else {
            logger.warn(
              { requestId, error: encryptResult.error.message },
              'Failed to encrypt audit payload'
            );
          }
        } catch (auditError) {
          logger.error({ requestId, error: String(auditError) }, 'Error building audit entry');
          // Do NOT re-throw; audit failures never block the response path
        }
      } else if (!recoveredAddress) {
        // Auth failure: limited context (no agent address available)
        logger.debug({ requestId, status }, 'Audit: auth failed, limited context');
      }
    } catch (error) {
      logger.error({ requestId, error: String(error) }, 'Audit middleware error');
      // Do NOT re-throw; audit failures never block the response path
    }
  };
}
