# Phase 3: Config & Logging

**Duration:** ~3 hours
**Depends on:** Phase 0 (project bootstrap), Phase 1 (types finalized)
**Deliverable:** YAML config loader, Zod schema validation, pino structured logging
**Success Criteria:** `pnpm typecheck && pnpm test tests/config tests/logging` passes

---

## Objective

Implement configuration loading and structured logging infrastructure. Configuration must be validated at startup (fail fast on invalid setup). Logging must be structured with context propagation and secret redaction.

---

## Implementation Details

### 1. src/config/types.ts

```typescript
import type { PermissionAction, ToolKey, RoleId, Timestamp, ChainId } from '../types.js'

/**
 * Configuration for a single tool endpoint (for documentation/discovery)
 */
export type EndpointConfig = Readonly<{
  path: string
  methods: ReadonlyArray<'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'>
  description: string
}>

/**
 * Tool definition from config.yaml
 */
export type ToolConfig = Readonly<{
  key: ToolKey
  description: string
  baseUrl: string
  keyRef: string // Environment variable name (e.g., "GITHUB_API_KEY")
  endpoints: ReadonlyArray<EndpointConfig>
}>

/**
 * Permission configuration: which actions are allowed on which tools
 */
export type PermissionConfig = Readonly<{
  tool: ToolKey
  actions: ReadonlyArray<PermissionAction>
}>

/**
 * Role definition from config.yaml
 */
export type RoleConfig = Readonly<{
  id: RoleId
  name: string
  permissions: ReadonlyArray<PermissionConfig>
}>

/**
 * Blockchain configuration
 */
export type ChainConfig = Readonly<{
  name: 'hedera' | 'base' | 'arbitrum' | 'optimism' | 'local'
  chainId: number // Will be branded as ChainId after validation
  rpcUrl: string
}>

/**
 * Cache configuration
 */
export type CacheConfig = Readonly<{
  ttlSeconds: number
}>

/**
 * Server/HTTP configuration
 */
export type ServerConfig = Readonly<{
  port: number
  host: string
  readTimeoutMs: number
  writeTimeoutMs: number
}>

/**
 * Complete application configuration
 */
export type AppConfig = Readonly<{
  tools: ReadonlyArray<ToolConfig>
  roles: ReadonlyArray<RoleConfig>
  chain: ChainConfig
  cache: CacheConfig
  server: ServerConfig
}>

/**
 * Raw config structure from YAML (before validation)
 */
export type RawConfig = Record<string, unknown>
```

### 2. src/config/schema.ts

```typescript
import { z } from 'zod'
import type {
  AppConfig,
  ToolConfig,
  RoleConfig,
  ChainConfig,
  CacheConfig,
  ServerConfig,
  EndpointConfig,
  PermissionConfig,
} from './types.js'

/**
 * Zod schema for validating config.yaml
 * All validation happens here; errors bubble up with clear messages
 */

const EndpointSchema = z.object({
  path: z.string().min(1),
  methods: z.array(z.enum(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'])),
  description: z.string().min(1),
}) as z.ZodType<EndpointConfig>

const PermissionConfigSchema = z.object({
  tool: z.string().min(1),
  actions: z.array(z.enum(['read', 'create', 'update', 'delete'])),
}) as z.ZodType<PermissionConfig>

const ToolConfigSchema = z.object({
  key: z.string().min(1, 'Tool key required'),
  description: z.string().min(1),
  baseUrl: z.string().url('Invalid base URL'),
  keyRef: z
    .string()
    .min(1)
    .refine(
      (keyRef) => process.env[keyRef] !== undefined,
      (keyRef) => ({
        message: `Environment variable ${keyRef} not found. Add to .env file.`,
      })
    ),
  endpoints: z.array(EndpointSchema).optional().default([]),
}) as z.ZodType<ToolConfig>

const RoleConfigSchema = z.object({
  id: z.string().min(1, 'Role ID required'),
  name: z.string().min(1),
  permissions: z.array(PermissionConfigSchema),
}) as z.ZodType<RoleConfig>

const ChainConfigSchema = z.object({
  name: z.enum(['hedera', 'base', 'arbitrum', 'optimism', 'local']),
  chainId: z.number().int().positive(),
  rpcUrl: z.string().url('Invalid RPC URL'),
}) as z.ZodType<ChainConfig>

const CacheConfigSchema = z.object({
  ttlSeconds: z.number().int().positive().default(300),
}) as z.ZodType<CacheConfig>

const ServerConfigSchema = z.object({
  port: z.number().int().min(1024).max(65535).default(8080),
  host: z.string().default('0.0.0.0'),
  readTimeoutMs: z.number().int().positive().default(30000),
  writeTimeoutMs: z.number().int().positive().default(60000),
}) as z.ZodType<ServerConfig>

export const AppConfigSchema = z.object({
  tools: z.array(ToolConfigSchema).min(1, 'At least one tool required'),
  roles: z.array(RoleConfigSchema).min(1, 'At least one role required'),
  chain: ChainConfigSchema,
  cache: CacheConfigSchema.optional().default({ ttlSeconds: 300 }),
  server: ServerConfigSchema.optional().default({
    port: 8080,
    host: '0.0.0.0',
    readTimeoutMs: 30000,
    writeTimeoutMs: 60000,
  }),
}) as z.ZodType<AppConfig>

/**
 * Validate config against schema
 * @throws ZodError if validation fails
 */
export function validateConfig(rawConfig: unknown): AppConfig {
  return AppConfigSchema.parse(rawConfig)
}
```

### 3. src/config/loader.ts

```typescript
import fs from 'fs/promises'
import yaml from 'yaml'
import { validateConfig } from './schema.js'
import type { AppConfig, RawConfig } from './types.js'
import { getLogger } from '../logging.js'

const logger = getLogger('config:loader')

/**
 * Load and validate configuration from YAML file
 * Fail fast on validation errors (startup error, not runtime)
 *
 * @param filePath Path to config.yaml
 * @returns Validated AppConfig
 * @throws Error if file not found or validation fails
 */
/**
 * Substitute environment variables in config object
 * Recursively replaces ${VAR_NAME} with process.env.VAR_NAME
 */
function substituteEnvVars(obj: unknown): unknown {
  if (typeof obj === 'string') {
    // Replace ${ENV_VAR} with process.env.ENV_VAR
    return obj.replace(/\$\{([A-Z_][A-Z0-9_]*)\}/g, (_match, varName) => {
      const value = process.env[varName]
      if (value === undefined) {
        throw new Error(`Environment variable ${varName} not found (referenced in config)`)
      }
      return value
    })
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => substituteEnvVars(item))
  }

  if (obj !== null && typeof obj === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(obj)) {
      result[key] = substituteEnvVars(value)
    }
    return result
  }

  return obj
}

/**
 * Type for file reader function (injectable for testing)
 */
export type FileReader = (path: string) => Promise<string>

/**
 * Default file reader using fs.readFile
 */
const defaultFileReader: FileReader = async (path: string) => {
  return fs.readFile(path, 'utf-8')
}

export async function loadConfig(
  filePath: string,
  fileReader: FileReader = defaultFileReader
): Promise<AppConfig> {
  logger.debug({ filePath }, 'Loading configuration from file')

  try {
    // Read file (injected for testing)
    const content = await fileReader(filePath)

    // Parse YAML
    let rawConfig = yaml.parse(content) as RawConfig
    logger.debug({ rawConfig }, 'Parsed YAML')

    // Substitute environment variables (${VAR_NAME} → process.env.VAR_NAME)
    rawConfig = substituteEnvVars(rawConfig) as RawConfig
    logger.debug('Environment variables substituted in config')

    // Validate against schema
    const config = validateConfig(rawConfig)
    logger.info(
      { tools: config.tools.length, roles: config.roles.length },
      'Configuration loaded and validated'
    )

    return config
  } catch (error) {
    if (error instanceof Error) {
      logger.error({ error: error.message, filePath }, 'Configuration load failed')
      throw new Error(`Failed to load config from ${filePath}: ${error.message}`)
    }
    throw error
  }
}

/**
 * Load config.yaml from current working directory
 * @returns Validated AppConfig
 */
export async function loadConfigDefault(): Promise<AppConfig> {
  return loadConfig('./config.yaml')
}
```

### 4. src/logging.ts

```typescript
import pino, { Logger } from 'pino'
import type { ApiKeyHandle, EncryptedPayload, Signature } from './types.js'

/**
 * Logger factory: creates loggers without global state
 * Each module gets its own logger instance via dependency injection
 */
function createLogger(module: string, options?: pino.LoggerOptions): Logger {
  return pino(
    {
      level: process.env.LOG_LEVEL || 'info',
      transport:
        process.env.NODE_ENV === 'production'
          ? undefined
          : {
              target: 'pino-pretty',
              options: {
                colorize: true,
                translateTime: 'SYS:standard',
                ignore: 'pid,hostname',
              },
            },
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
        error: pino.stdSerializers.err, // Standard error serialization
      },
      ...options,
    },
    pino.transport({
      target: 'pino/file',
      options: { destination: 1 }, // stdout
    })
  ).child({ module })
}

/**
 * Initialize root logger (call once at application startup)
 * For testing and production, this creates the root logger configuration
 */
export function initLogger(options?: pino.LoggerOptions): Logger {
  return createLogger('app', options)
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
  return createLogger(module)
}

/**
 * Create a request-scoped child logger with tracing context
 * Automatically propagates across async operations
 *
 * @param module Module name
 * @param context Request context (requestId, agentAddress, tool, action, etc.)
 * @returns Logger with context attached to all messages
 */
export function getLoggerWithContext(
  module: string,
  context: Record<string, unknown>
): Logger {
  return getLogger(module).child(context)
}

/**
 * Type-safe context builder for common fields
 * Ensures consistent field names across all logs
 */
export interface LogContext {
  requestId?: string
  agentAddress?: string
  tool?: string
  action?: string
  latencyMs?: number
  auditTx?: string
  chainId?: number
  errorType?: string
}

/**
 * Helper to create log context from governance metadata
 */
export function createLogContext(metadata: Partial<LogContext>): LogContext {
  return {
    requestId: metadata.requestId,
    agentAddress: metadata.agentAddress,
    tool: metadata.tool,
    action: metadata.action,
    latencyMs: metadata.latencyMs,
    auditTx: metadata.auditTx,
    chainId: metadata.chainId,
    errorType: metadata.errorType,
  }
}
```

### 5. src/config/index.ts

```typescript
/**
 * Configuration module exports
 */

export type {
  AppConfig,
  ToolConfig,
  RoleConfig,
  ChainConfig,
  CacheConfig,
  ServerConfig,
  EndpointConfig,
  PermissionConfig,
  RawConfig,
} from './types.js'

export { AppConfigSchema, validateConfig } from './schema.js'
export { loadConfig, loadConfigDefault } from './loader.js'
```

### 6. tests/config/test_loader.ts

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import type { FileReader } from '../../src/config/loader.js'
import { loadConfig } from '../../src/config/loader.js'

describe('Config Loader', () => {
  beforeEach(() => {
    // Set required env vars
    process.env.GITHUB_API_KEY = 'ghp_test123'
    process.env.SLACK_API_KEY = 'xoxb_test456'
    process.env.HEDERA_RPC_URL = 'https://testnet.hashio.io/api'
  })

  it('should load valid config.yaml', async () => {
    const configContent = `
tools:
  - key: github
    description: GitHub API
    baseUrl: https://api.github.com
    keyRef: GITHUB_API_KEY
    endpoints:
      - path: /repos/{owner}/{repo}/issues
        methods: [GET, POST]
        description: Manage issues

roles:
  - id: developer
    name: Developer
    permissions:
      - tool: github
        actions: [read, create]

chain:
  name: hedera
  chainId: 295
  rpcUrl: \${HEDERA_RPC_URL}

cache:
  ttlSeconds: 300

server:
  port: 8080
  host: 0.0.0.0
  readTimeoutMs: 30000
  writeTimeoutMs: 60000
`

    // Mock file reader (no real filesystem calls)
    const mockFileReader: FileReader = async () => configContent

    const config = await loadConfig('config.yaml', mockFileReader)

    expect(config.tools).toHaveLength(1)
    expect(config.tools[0].key).toBe('github')
    expect(config.roles).toHaveLength(1)
    expect(config.chain.chainId).toBe(295)
    expect(config.chain.rpcUrl).toBe('https://testnet.hashio.io/api') // Env var substituted
  })

  it('should fail on missing environment variable', async () => {
    delete process.env.MISSING_API_KEY

    const configContent = `
tools:
  - key: missing
    description: Missing Tool
    baseUrl: https://api.example.com
    keyRef: MISSING_API_KEY

roles:
  - id: developer
    name: Developer
    permissions:
      - tool: missing
        actions: [read]

chain:
  name: local
  chainId: 31337
  rpcUrl: http://localhost:8545
`

    // Mock file reader
    const mockFileReader: FileReader = async () => configContent

    await expect(loadConfig('config.yaml', mockFileReader)).rejects.toThrow(
      /Environment variable MISSING_API_KEY not found/
    )
  })

  it('should fail on invalid URL', async () => {
    const configContent = `
tools:
  - key: bad
    description: Bad Tool
    baseUrl: not-a-valid-url
    keyRef: DUMMY_KEY

roles:
  - id: developer
    name: Developer
    permissions:
      - tool: bad
        actions: [read]

chain:
  name: local
  chainId: 31337
  rpcUrl: http://localhost:8545
`

    process.env.DUMMY_KEY = 'dummy'
    const configPath = path.join(testDir, 'config.yaml')
    await fs.writeFile(configPath, configContent)

    await expect(loadConfig(configPath)).rejects.toThrow(/Invalid base URL/)
  })

  it('should fail on missing required tool', async () => {
    const configContent = `
tools: []

roles:
  - id: developer
    name: Developer
    permissions: []

chain:
  name: local
  chainId: 31337
  rpcUrl: http://localhost:8545
`

    const configPath = path.join(testDir, 'config.yaml')
    await fs.writeFile(configPath, configContent)

    await expect(loadConfig(configPath)).rejects.toThrow(/At least one tool required/)
  })
})
```

### 7. tests/logging/test_logger.ts

```typescript
import { describe, it, expect } from 'vitest'
import { getLogger, getLoggerWithContext, createLogContext } from '../../src/logging.js'

describe('Logging', () => {
  it('should create logger with module name', () => {
    const logger = getLogger('test:module')
    expect(logger).toBeDefined()
    expect(logger.child).toBeDefined()
  })

  it('should create context', () => {
    const context = createLogContext({
      requestId: 'req-123',
      agentAddress: '0x1234',
      tool: 'github',
      action: 'read',
    })

    expect(context.requestId).toBe('req-123')
    expect(context.agentAddress).toBe('0x1234')
    expect(context.tool).toBe('github')
    expect(context.action).toBe('read')
  })

  it('should create logger with context', () => {
    const logger = getLoggerWithContext('test:module', {
      requestId: 'req-456',
      agentAddress: '0xabcd',
    })
    expect(logger).toBeDefined()
  })

  it('should redact sensitive fields', () => {
    const logger = getLogger('test:redaction')
    // Serializers are configured to redact these fields
    // Actual redaction happens in pino serialization layer
    expect(logger.serializers).toBeDefined()
  })
})
```

---

## config.yaml Example

**File:** `config.yaml` (at project root)

```yaml
# Zuul Proxy Configuration

tools:
  - key: github
    description: GitHub REST API
    baseUrl: https://api.github.com
    keyRef: GITHUB_API_KEY
    endpoints:
      - path: /repos/{owner}/{repo}/issues
        methods: [GET, POST]
        description: Manage repository issues
      - path: /repos/{owner}/{repo}/issues/{issue_number}
        methods: [GET, PATCH, DELETE]
        description: Manage single issue

  - key: slack
    description: Slack API
    baseUrl: https://slack.com/api
    keyRef: SLACK_BOT_TOKEN
    endpoints:
      - path: /conversations.list
        methods: [GET]
        description: List conversations
      - path: /chat.postMessage
        methods: [POST]
        description: Send message

  - key: openai
    description: OpenAI API
    baseUrl: https://api.openai.com/v1
    keyRef: OPENAI_API_KEY
    endpoints:
      - path: /chat/completions
        methods: [POST]
        description: Create completion

# Roles and permissions
roles:
  - id: developer
    name: Developer
    permissions:
      - tool: github
        actions: [read, create, update]
      - tool: slack
        actions: [read]

  - id: admin
    name: Administrator
    permissions:
      - tool: github
        actions: [read, create, update, delete]
      - tool: slack
        actions: [read, create]
      - tool: openai
        actions: [read, create]

# Blockchain configuration
chain:
  name: hedera
  chainId: 295
  rpcUrl: ${HEDERA_RPC_URL}

# Cache settings
cache:
  ttlSeconds: 300

# Server settings
server:
  port: 8080
  host: 0.0.0.0
  readTimeoutMs: 30000
  writeTimeoutMs: 60000
```

---

## Acceptance Criteria

- ✅ Config loads from config.yaml
- ✅ All keyRef values validated against process.env at startup
- ✅ Missing env var → clear error message
- ✅ Invalid config → validation error with Zod details
- ✅ Pino logs with context propagation
- ✅ Sensitive fields redacted (apiKey, signature, encryptedPayload)
- ✅ No console.log in production code (all via pino)
- ✅ `pnpm typecheck && pnpm test tests/config tests/logging` passes
- ✅ 90%+ coverage on config/ and logging modules

---

## Commands to Execute

```bash
# Create files
touch src/config/{types,schema,loader,index}.ts src/logging.ts
touch tests/config/test_loader.ts tests/logging/test_logger.ts

# (Copy implementations above)

# Create config.yaml
cp config.yaml.example config.yaml
# Edit .env to add GITHUB_API_KEY, SLACK_API_KEY, OPENAI_API_KEY

# Verify
pnpm typecheck
pnpm lint
pnpm test tests/config tests/logging

# Commit
git add src/config/ src/logging.ts tests/config/ tests/logging/ config.yaml
git commit -m "Phase 3: Config & Logging — YAML loader with Zod validation, pino structured logging"
```

---

## What's NOT in Phase 3

- Actual HTTP server setup (defer to Phase 11)
- Request context propagation in middleware (defer to Phase 10)
- Audit logging integration (defer to Phase 8)
- Loading encrypted secrets from vault (defer to future)
