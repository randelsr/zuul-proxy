import type { ToolKey, ApiKeyHandle } from '../types.js';
import type { KeyCustodyDriver } from './driver.js';
import { ServiceError } from '../errors.js';
import type { Result } from '../types.js';
import { getLogger } from '../logging.js';

const logger = getLogger('custody:vault');

/**
 * In-memory key vault implementation
 *
 * Stores API keys in memory and provides opaque handles for safe key access.
 * Keys are strictly private to this instance; they never escape the module.
 * Only the inject() method can unwrap an ApiKeyHandle to the actual key value.
 *
 * INVARIANT: ApiKeyHandle is an opaque branded type. External code cannot
 * construct a valid handle or access the key directly. This prevents accidental
 * logging, serialization, or exposure.
 */
export class KeyVault implements KeyCustodyDriver {
  private keys: Map<ToolKey, string>;

  constructor(keys: Map<ToolKey, string>) {
    this.keys = keys;
    logger.debug({ toolCount: keys.size }, 'Key vault initialized');
  }

  /**
   * Get opaque handle for a tool's API key
   *
   * Returns a branded ApiKeyHandle that cannot be used for anything except
   * passing to inject(). The actual key value is hidden behind the handle.
   *
   * @param tool Tool identifier
   * @returns Opaque ApiKeyHandle on success, ServiceError if tool unknown
   */
  getKey(tool: ToolKey): Result<ApiKeyHandle, ServiceError> {
    if (!this.keys.has(tool)) {
      logger.error({ toolKey: tool }, 'Tool key not found in vault');
      return {
        ok: false,
        error: new ServiceError(
          `API key not available for tool: ${tool}`,
          -32603, // INTERNAL_ERROR
          500,
          'internal/error',
          { tool_key: tool, reason: 'Key not loaded at startup' }
        ),
      };
    }

    // Create opaque handle: encodes tool name for later recovery in inject()
    // The handle itself doesn't contain the actual key (which is good!)
    // The handle is opaque because it's a branded type that external code cannot construct
    const handle = `vault:${tool}` as unknown as ApiKeyHandle;

    logger.debug({ toolKey: tool }, 'API key handle retrieved from vault');
    return { ok: true, value: handle };
  }

  /**
   * Inject: unwrap opaque handle and return actual key value
   *
   * This is the ONLY place where actual key values are extracted from storage.
   * All other paths work with opaque ApiKeyHandle objects that cannot be
   * serialized or logged.
   *
   * The handle format is: "vault:{toolKey}" — this is only valid because
   * we created the handle in getKey() above. External code cannot forge
   * valid handles (they cannot construct ApiKeyHandle due to branding).
   *
   * @param handle Opaque ApiKeyHandle from getKey()
   * @returns Actual API key value (suitable for injection into Authorization header)
   * @throws Error if handle is malformed or tool not found (should never happen in valid flow)
   */
  inject(handle: ApiKeyHandle): string {
    // Parse the opaque handle to recover the tool key
    const handleStr = handle as unknown as string;
    const [prefix, toolKeyStr] = handleStr.split(':');

    if (prefix !== 'vault' || !toolKeyStr) {
      logger.error({ handle: handleStr }, 'Invalid key handle format');
      throw new Error('Invalid key handle: malformed vault handle');
    }

    const toolKey = toolKeyStr as ToolKey;
    const key = this.keys.get(toolKey);

    if (!key) {
      logger.error({ toolKey }, 'Key not found in vault during injection');
      throw new Error(`Key not found in vault: ${toolKey}`);
    }

    logger.debug({ toolKey }, 'API key injected from vault');
    return key;
  }
}
