import type { ApiKeyHandle, ToolKey } from '../types.js';
import type { ServiceError } from '../errors.js';
import type { Result } from '../types.js';

/**
 * Abstraction for API key storage and retrieval
 * Implementation: load from environment at startup, return opaque handles
 *
 * KEY INVARIANT: ApiKeyHandle is opaque. The actual key value is hidden.
 * This prevents accidental logging, serialization, or exposure to agents.
 */
export interface KeyCustodyDriver {
  /**
   * Get the opaque API key handle for a specific tool
   * The actual key is loaded from .env at startup using the KeyRef
   *
   * On success: return ApiKeyHandle (opaque, can only be passed to inject())
   * On failure (missing env var): return ServiceError
   *
   * Used internally by proxy to get keys for key injection
   */
  getKey(tool: ToolKey): Result<ApiKeyHandle, ServiceError>;

  /**
   * Inject the actual API key into a request header
   * Takes the opaque handle from getKey() and returns the actual header value
   *
   * Only this method knows how to unwrap ApiKeyHandle
   * Everything else treats it as completely opaque
   */
  inject(handle: ApiKeyHandle): string;
}
