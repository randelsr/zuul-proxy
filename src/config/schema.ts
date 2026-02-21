import { z } from 'zod';
import type {
  AppConfig,
  ToolConfig,
  RoleConfig,
  ChainConfig,
  CacheConfig,
  ServerConfig,
  EndpointConfig,
  PermissionConfig,
} from './types.js';

/**
 * Zod schema for validating config.yaml
 * All validation happens here; errors bubble up with clear messages
 * Note: We don't use satisfies here because Zod can't encode branded types
 * The schema validates the raw data, and the output is cast to AppConfig
 */

const EndpointSchema = z.object({
  path: z.string().min(1),
  methods: z.array(z.enum(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'])),
  description: z.string().min(1),
}) as unknown as z.ZodType<EndpointConfig>;

const PermissionConfigSchema = z.object({
  tool: z.string().min(1),
  actions: z.array(z.enum(['read', 'create', 'update', 'delete'])),
}) as unknown as z.ZodType<PermissionConfig>;

const ToolConfigSchema = z.object({
  key: z.string().min(1, 'Tool key required'),
  description: z.string().min(1),
  baseUrl: z.string().url('Invalid base URL'),
  keyRef: z
    .string()
    .min(1)
    .superRefine((keyRef, ctx) => {
      if (process.env[keyRef] === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Environment variable ${keyRef} not found. Add to .env file.`,
        });
      }
    }),
  endpoints: z.array(EndpointSchema).optional().default([]),
}) as unknown as z.ZodType<ToolConfig>;

const RoleConfigSchema = z.object({
  id: z.string().min(1, 'Role ID required'),
  name: z.string().min(1),
  permissions: z.array(PermissionConfigSchema),
}) as unknown as z.ZodType<RoleConfig>;

const ChainConfigSchema = z.object({
  name: z.enum(['adi', 'hedera', 'base', 'arbitrum', 'optimism', 'local']),
  chainId: z.number().int().positive(),
  rpcUrl: z.string().url('Invalid RPC URL'),
  rbacContractAddress: z.string().min(1, 'RBAC contract address required'),
  auditContractAddress: z.string().min(1, 'Audit contract address required'),
}) as unknown as z.ZodType<ChainConfig>;

const CacheConfigSchema = z.object({
  ttlSeconds: z.number().int().positive().default(300),
}) as unknown as z.ZodType<CacheConfig>;

const ServerConfigSchema = z.object({
  port: z.number().int().min(1024).max(65535).default(8080),
  host: z.string().default('0.0.0.0'),
  readTimeoutMs: z.number().int().positive().default(30000),
  writeTimeoutMs: z.number().int().positive().default(60000),
}) as unknown as z.ZodType<ServerConfig>;

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
}) as unknown as z.ZodType<AppConfig>;

/**
 * Validate config against schema
 * @throws ZodError if validation fails
 */
export function validateConfig(rawConfig: unknown): AppConfig {
  return AppConfigSchema.parse(rawConfig);
}
