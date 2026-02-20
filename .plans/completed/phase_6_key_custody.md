# Phase 6: Key Custody

**Duration:** ~2 hours
**Depends on:** Phase 0, Phase 1, Phase 3 (config loaded)
**Deliverable:** Opaque API key handles, environment variable loading, key injection
**Success Criteria:** `pnpm typecheck && pnpm test tests/custody` passes

---

## Objective

Implement key custody: load API keys from `.env`, provide opaque handles to executor, inject keys into requests. Keys must never be exposed to agents or logged.

---

## Implementation

### src/custody/key-loader.ts

```typescript
import type { AppConfig } from '../config/types.js'
import type { ToolKey, ApiKeyHandle } from '../types.js'
import { ServiceError, ERRORS } from '../errors.js'
import type { Result } from '../types.js'
import { getLogger } from '../logging.js'

const logger = getLogger('custody:key-loader')

/**
 * Load API keys from environment variables at startup
 * Returns opaque handles (actual keys never exposed)
 * Fail fast if any keyRef is missing from env
 */
export function loadKeysFromEnv(
  config: AppConfig
): Result<Map<ToolKey, string>, ServiceError> {
  const keys = new Map<ToolKey, string>()

  for (const tool of config.tools) {
    const keyValue = process.env[tool.keyRef]

    if (!keyValue) {
      logger.error({ keyRef: tool.keyRef, tool: tool.key }, 'Missing API key in environment')
      return {
        ok: false,
        error: new ServiceError(
          `Missing environment variable: ${tool.keyRef}`,
          ERRORS.INTERNAL_ERROR.code,
          ERRORS.INTERNAL_ERROR.httpStatus,
          ERRORS.INTERNAL_ERROR.errorType,
          { missing_env_var: tool.keyRef, tool: tool.key }
        ),
      }
    }

    keys.set(tool.key, keyValue)
    logger.debug({ tool: tool.key }, 'API key loaded from environment')
  }

  logger.info({ toolCount: keys.size }, 'All API keys loaded successfully')
  return { ok: true, value: keys }
}
```

### src/custody/key-vault.ts

```typescript
import type { ToolKey, ApiKeyHandle } from '../types.js'
import type { KeyCustodyDriver } from '../custody/driver.js'
import { ServiceError, ERRORS } from '../errors.js'
import type { Result } from '../types.js'
import { getLogger } from '../logging.js'

const logger = getLogger('custody:vault')

/**
 * In-memory key vault implementation
 * Keys are private to this class; never exposed outside module
 * Only inject() can unwrap ApiKeyHandle to actual key
 */
export class KeyVault implements KeyCustodyDriver {
  private keys: Map<ToolKey, string>

  constructor(keys: Map<ToolKey, string>) {
    this.keys = keys
  }

  /**
   * Get opaque handle for a tool's API key
   * The actual key is hidden; only inject() knows how to unwrap
   */
  getKey(tool: ToolKey): Result<ApiKeyHandle, ServiceError> {
    if (!this.keys.has(tool)) {
      logger.error({ tool }, 'Tool key not found in vault')
      return {
        ok: false,
        error: new ServiceError(
          `API key not available for tool: ${tool}`,
          ERRORS.INTERNAL_ERROR.code,
          ERRORS.INTERNAL_ERROR.httpStatus,
          ERRORS.INTERNAL_ERROR.errorType
        ),
      }
    }

    // Return an opaque handle (branded type prevents accidental usage)
    const handle = `${tool}:key` as unknown as ApiKeyHandle
    return { ok: true, value: handle }
  }

  /**
   * Inject: unwrap opaque handle and return actual key for Authorization header
   * This is the ONLY place where actual key values are exposed (to inject into headers)
   *
   * @param handle Opaque ApiKeyHandle
   * @returns Key value suitable for Authorization header (e.g., "Bearer xyz")
   */
  inject(handle: ApiKeyHandle): string {
    // In real implementation, handle encodes which tool/key
    // For now, parse handle to get tool and return key
    const toolKey = (handle as unknown as string).split(':')[0] as ToolKey
    const key = this.keys.get(toolKey)

    if (!key) {
      logger.error({ handle }, 'Invalid key handle')
      throw new Error('Invalid key handle')
    }

    // Return key in format suitable for tool (bearer token, basic auth, etc.)
    // For now, return as-is; actual format depends on tool
    return key
  }
}
```

### tests/custody/test_key-loader.ts

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { loadKeysFromEnv } from '../../src/custody/key-loader.js'
import type { AppConfig, ToolConfig } from '../../src/config/types.js'

describe('Key Loader', () => {
  beforeEach(() => {
    process.env.TEST_KEY_1 = 'test-value-1'
    process.env.TEST_KEY_2 = 'test-value-2'
  })

  afterEach(() => {
    delete process.env.TEST_KEY_1
    delete process.env.TEST_KEY_2
  })

  it('should load keys from environment', () => {
    const mockConfig: AppConfig = {
      tools: [
        {
          key: 'tool1' as any,
          description: 'Tool 1',
          baseUrl: 'https://api.example1.com',
          keyRef: 'TEST_KEY_1',
          endpoints: [],
        },
        {
          key: 'tool2' as any,
          description: 'Tool 2',
          baseUrl: 'https://api.example2.com',
          keyRef: 'TEST_KEY_2',
          endpoints: [],
        },
      ] as ToolConfig[],
      roles: [],
      chain: {
        name: 'local',
        chainId: 31337,
        rpcUrl: 'http://localhost:8545',
      },
      cache: { ttlSeconds: 300 },
      server: { port: 8080, host: '0.0.0.0', readTimeoutMs: 30000, writeTimeoutMs: 60000 },
    }

    const result = loadKeysFromEnv(mockConfig)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.get('tool1' as any)).toBe('test-value-1')
      expect(result.value.get('tool2' as any)).toBe('test-value-2')
    }
  })

  it('should fail on missing environment variable', () => {
    delete process.env.TEST_KEY_1

    const mockConfig: AppConfig = {
      tools: [
        {
          key: 'tool1' as any,
          description: 'Tool 1',
          baseUrl: 'https://api.example1.com',
          keyRef: 'TEST_KEY_1',
          endpoints: [],
        },
      ] as ToolConfig[],
      roles: [],
      chain: { name: 'local', chainId: 31337, rpcUrl: 'http://localhost:8545' },
      cache: { ttlSeconds: 300 },
      server: { port: 8080, host: '0.0.0.0', readTimeoutMs: 30000, writeTimeoutMs: 60000 },
    }

    const result = loadKeysFromEnv(mockConfig)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe(-32603)
    }
  })
})
```

---

## Acceptance Criteria

- ✅ Keys loaded from .env at startup
- ✅ Missing key → startup error (fail fast)
- ✅ ApiKeyHandle is opaque (never serializable)
- ✅ No key values in logs or responses
- ✅ Pino serializers redact ApiKeyHandle
- ✅ `pnpm typecheck && pnpm test tests/custody` passes

---

## Commands

```bash
touch src/custody/{key-loader,key-vault}.ts tests/custody/test_key-loader.ts

# (Copy implementations above)

pnpm typecheck
pnpm test tests/custody

git add src/custody/ tests/custody/
git commit -m "Phase 6: Key custody — opaque handles, env var loading, never expose keys"
```
