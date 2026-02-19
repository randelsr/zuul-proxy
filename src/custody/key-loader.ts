import type { ToolKey } from '../types.js';
import { ServiceError } from '../errors.js';
import type { Result } from '../types.js';
import type { AppConfig } from '../config/types.js';
import { getLogger } from '../logging.js';

const logger = getLogger('custody:key-loader');

/**
 * Load API keys from environment variables at startup
 *
 * For each tool in config, reads the environment variable specified by keyRef
 * and stores it in the returned Map. Keys are never exposed directly; they're
 * wrapped in opaque ApiKeyHandle for safe handling.
 *
 * Fail-fast: if any key is missing, returns ServiceError immediately.
 * This ensures all keys are available before proxy starts.
 *
 * @param config Application configuration (defines which keys are needed)
 * @returns Map from ToolKey to actual key value (for storage in vault)
 */
export function loadKeysFromEnv(config: AppConfig): Result<Map<ToolKey, string>, ServiceError> {
  const keys = new Map<ToolKey, string>();

  for (const tool of config.tools) {
    const keyValue = process.env[tool.keyRef];

    if (!keyValue) {
      logger.error({ keyRef: tool.keyRef, toolKey: tool.key }, 'Missing API key in environment');
      return {
        ok: false,
        error: new ServiceError(
          `Missing required environment variable: ${tool.keyRef} (for tool: ${tool.key})`,
          -32603, // INTERNAL_ERROR
          500,
          'internal/error',
          { missing_env_var: tool.keyRef, tool_key: tool.key }
        ),
      };
    }

    keys.set(tool.key, keyValue);
    logger.debug({ toolKey: tool.key, keyRef: tool.keyRef }, 'API key loaded from environment');
  }

  logger.info({ toolCount: keys.size }, 'All API keys loaded successfully from environment');
  return { ok: true, value: keys };
}
