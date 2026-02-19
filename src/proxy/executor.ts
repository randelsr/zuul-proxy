import type { HttpMethod, ApiKeyHandle } from '../types.js';
import { ServiceError, ERRORS } from '../errors.js';
import type { Result } from '../types.js';
import type { KeyCustodyDriver } from '../custody/driver.js';
import { getLogger } from '../logging.js';

const logger = getLogger('proxy:executor');

/**
 * Result of proxy execution
 */
export type ExecutorResult = Readonly<{
  status: number;
  headers: Record<string, string>;
  body: unknown; // JSON, binary, or SSE stream
  contentType: 'json' | 'binary' | 'sse' | 'text';
}>;

/**
 * Forward request to upstream tool
 */
export type ForwardRequest = Readonly<{
  method: HttpMethod;
  targetUrl: string;
  headers: Record<string, string>;
  body?: unknown;
}>;

/**
 * Proxy executor: forward HTTP requests with key injection
 * - Inject Authorization header with API key
 * - Stream body unchanged (no buffering)
 * - Do NOT follow 3xx redirects (pass back to agent)
 * - Read timeout: 30s, write timeout: 60s
 * - Response handling: JSON (parse) vs binary (passthrough) vs SSE (inject first event)
 */
export class ProxyExecutor {
  constructor(
    private custody: KeyCustodyDriver,
    private readTimeoutMs: number = 30000,
    private writeTimeoutMs: number = 60000
  ) {
    logger.info({ readTimeoutMs, writeTimeoutMs }, 'Proxy executor initialized');
  }

  /**
   * Execute forward request
   *
   * @param req ForwardRequest with method, URL, headers, body
   * @param keyHandle Opaque API key handle (from custody)
   * @returns ExecutorResult or ServiceError
   */
  async execute(
    req: ForwardRequest,
    keyHandle: ApiKeyHandle
  ): Promise<Result<ExecutorResult, ServiceError>> {
    const startTime = Date.now();

    try {
      logger.debug({ method: req.method, targetUrl: req.targetUrl }, 'Executing proxy request');

      // Step 1: Inject Authorization header
      const headers = { ...req.headers };
      try {
        const apiKey = this.custody.inject(keyHandle);
        headers['Authorization'] = `Bearer ${apiKey}`;
      } catch (error) {
        logger.error({ error: String(error) }, 'Failed to inject API key');
        return {
          ok: false,
          error: new ServiceError(
            'Failed to inject API key',
            ERRORS.INTERNAL_ERROR.code,
            ERRORS.INTERNAL_ERROR.httpStatus,
            ERRORS.INTERNAL_ERROR.errorType
          ),
        };
      }

      // Step 2: Prepare request
      const timeoutMs =
        req.method === 'GET' || req.method === 'HEAD' ? this.readTimeoutMs : this.writeTimeoutMs;
      const controller = new AbortController();
      const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

      const fetchOptions: RequestInit = {
        method: req.method,
        headers,
        redirect: 'manual', // Do NOT follow redirects
        signal: controller.signal,
      };

      if (req.body) {
        if (typeof req.body === 'string') {
          fetchOptions.body = req.body;
        } else if (Buffer.isBuffer(req.body)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          fetchOptions.body = req.body as any;
        } else {
          fetchOptions.body = JSON.stringify(req.body);
        }
      }

      // Step 3: Make upstream call
      let response: Response;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        response = await (global.fetch as any)(req.targetUrl, fetchOptions);
      } finally {
        clearTimeout(timeoutHandle);
      }

      const latencyMs = Date.now() - startTime;

      // Step 4: Parse response based on content type
      const contentType = response.headers.get('content-type') || '';
      const status = response.status;
      let body: unknown;
      let parsedContentType: 'json' | 'binary' | 'sse' | 'text' = 'binary';

      if (contentType.includes('application/json')) {
        try {
          body = await response.json();
          parsedContentType = 'json';
        } catch {
          body = await response.text();
          parsedContentType = 'text';
        }
      } else if (contentType.includes('text/event-stream')) {
        body = response.body; // Return readable stream for SSE
        parsedContentType = 'sse';
      } else if (contentType.includes('text/')) {
        body = await response.text();
        parsedContentType = 'text';
      } else {
        // Binary: use arrayBuffer() on native Response, convert to Buffer
        const arrayBuffer = await response.arrayBuffer();
        body = Buffer.from(arrayBuffer);
        parsedContentType = 'binary';
      }

      logger.info(
        {
          targetUrl: req.targetUrl,
          status,
          contentType: parsedContentType,
          latencyMs,
        },
        'Proxy request completed'
      );

      return {
        ok: true,
        value: {
          status,
          headers: Object.fromEntries(response.headers.entries()),
          body,
          contentType: parsedContentType,
        },
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;

      // Distinguish timeout from other errors
      // AbortSignal.abort() throws an AbortError
      const isTimeout = error instanceof Error && error.name === 'AbortError';
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (isTimeout) {
        logger.warn({ targetUrl: req.targetUrl, latencyMs }, 'Proxy request timeout');

        return {
          ok: false,
          error: new ServiceError(
            'Upstream timeout',
            ERRORS.SERVICE_TIMEOUT.code,
            ERRORS.SERVICE_TIMEOUT.httpStatus,
            ERRORS.SERVICE_TIMEOUT.errorType,
            { timeout_ms: latencyMs }
          ),
        };
      }

      // Other errors (network, DNS, etc.)
      logger.error(
        { targetUrl: req.targetUrl, latencyMs, error: errorMessage },
        'Proxy request failed'
      );

      return {
        ok: false,
        error: new ServiceError(
          'Upstream error',
          ERRORS.UPSTREAM_ERROR.code,
          ERRORS.UPSTREAM_ERROR.httpStatus,
          ERRORS.UPSTREAM_ERROR.errorType,
          { reason: errorMessage }
        ),
      };
    }
  }
}
