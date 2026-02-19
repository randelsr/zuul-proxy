import type { PermissionAction, ToolKey, RoleId } from '../types.js';

/**
 * Configuration for a single tool endpoint (for documentation/discovery)
 */
export type EndpointConfig = Readonly<{
  path: string;
  methods: ReadonlyArray<'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'>;
  description: string;
}>;

/**
 * Tool definition from config.yaml
 */
export type ToolConfig = Readonly<{
  key: ToolKey;
  description: string;
  baseUrl: string;
  keyRef: string; // Environment variable name (e.g., "GITHUB_API_KEY")
  endpoints: ReadonlyArray<EndpointConfig>;
}>;

/**
 * Permission configuration: which actions are allowed on which tools
 */
export type PermissionConfig = Readonly<{
  tool: ToolKey;
  actions: ReadonlyArray<PermissionAction>;
}>;

/**
 * Role definition from config.yaml
 */
export type RoleConfig = Readonly<{
  id: RoleId;
  name: string;
  permissions: ReadonlyArray<PermissionConfig>;
}>;

/**
 * Blockchain configuration
 */
export type ChainConfig = Readonly<{
  name: 'hedera' | 'base' | 'arbitrum' | 'optimism' | 'local';
  chainId: number;
  rpcUrl: string;
}>;

/**
 * Cache configuration
 */
export type CacheConfig = Readonly<{
  ttlSeconds: number;
}>;

/**
 * Server/HTTP configuration
 */
export type ServerConfig = Readonly<{
  port: number;
  host: string;
  readTimeoutMs: number;
  writeTimeoutMs: number;
}>;

/**
 * Complete application configuration
 */
export type AppConfig = Readonly<{
  tools: ReadonlyArray<ToolConfig>;
  roles: ReadonlyArray<RoleConfig>;
  chain: ChainConfig;
  cache: CacheConfig;
  server: ServerConfig;
}>;

/**
 * Raw config structure from YAML (before validation)
 */
export type RawConfig = Record<string, unknown>;
