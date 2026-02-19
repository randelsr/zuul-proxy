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
} from './types.js';

export { AppConfigSchema, validateConfig } from './schema.js';
export { loadConfig, loadConfigDefault, type FileReader } from './loader.js';
