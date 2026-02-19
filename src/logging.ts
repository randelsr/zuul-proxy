import pino, { type Logger } from 'pino';

/**
 * Logger factory: creates loggers without global state
 * Each module gets its own logger instance via dependency injection
 */
function createLogger(module: string, options?: pino.LoggerOptions): Logger {
  const loggerOptions: pino.LoggerOptions = {
    level: process.env.LOG_LEVEL || 'info',
    serializers: {
      // Redact sensitive fields at serializer level (pino mechanism)
      apiKey: () => '[REDACTED]',
      apiKeyHandle: () => '[REDACTED]',
      encryptedPayload: () => '[REDACTED]',
      signature: () => '[REDACTED]',
      agentSignature: () => '[REDACTED]',
      proxySignature: () => '[REDACTED]',
      privateKey: () => '[REDACTED]',
      encryptionKey: () => '[REDACTED]',
      error: pino.stdSerializers.err,
    },
    ...options,
  };

  const transportConfig =
    process.env.NODE_ENV === 'production'
      ? pino.transport({
          target: 'pino/file',
          options: { destination: 1 },
        })
      : pino.transport({
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        });

  return pino(loggerOptions, transportConfig).child({ module });
}

/**
 * Initialize root logger (call once at application startup)
 * For testing and production, this creates the root logger configuration
 */
export function initLogger(options?: pino.LoggerOptions): Logger {
  return createLogger('app', options);
}

/**
 * Get a logger for a module
 * Each call creates a new logger instance scoped to the module
 * Module name is used to categorize log output
 *
 * @param module Module name (e.g., "auth:signature", "rbac:cache")
 * @returns Logger scoped to this module
 */
export function getLogger(module: string): Logger {
  return createLogger(module);
}

/**
 * Create a request-scoped child logger with tracing context
 * Automatically propagates across async operations
 *
 * @param module Module name
 * @param context Request context (requestId, agentAddress, tool, action, etc.)
 * @returns Logger with context attached to all messages
 */
export function getLoggerWithContext(module: string, context: Record<string, unknown>): Logger {
  return getLogger(module).child(context);
}

/**
 * Type-safe context builder for common fields
 * Ensures consistent field names across all logs
 */
export interface LogContext {
  requestId?: string;
  agentAddress?: string;
  tool?: string;
  action?: string;
  latencyMs?: number;
  auditTx?: string;
  chainId?: number;
  errorType?: string;
}

/**
 * Helper to create log context from governance metadata
 */
export function createLogContext(metadata: Partial<LogContext>): LogContext {
  const context: LogContext = {};
  if (metadata.requestId !== undefined) {
    context.requestId = metadata.requestId;
  }
  if (metadata.agentAddress !== undefined) {
    context.agentAddress = metadata.agentAddress;
  }
  if (metadata.tool !== undefined) {
    context.tool = metadata.tool;
  }
  if (metadata.action !== undefined) {
    context.action = metadata.action;
  }
  if (metadata.latencyMs !== undefined) {
    context.latencyMs = metadata.latencyMs;
  }
  if (metadata.auditTx !== undefined) {
    context.auditTx = metadata.auditTx;
  }
  if (metadata.chainId !== undefined) {
    context.chainId = metadata.chainId;
  }
  if (metadata.errorType !== undefined) {
    context.errorType = metadata.errorType;
  }
  return context;
}
