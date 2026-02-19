import { describe, it, expect } from 'vitest';
import { ToolRegistry } from '../../src/proxy/tool-registry.js';
import type { AppConfig } from '../../src/config/types.js';

describe('Proxy: Tool Registry', () => {
  it('should find tool by longest prefix match', () => {
    const config: AppConfig = {
      tools: [
        {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          key: 'github' as unknown as any,
          baseUrl: 'https://api.github.com',
          keyRef: 'GITHUB_KEY',
          description: 'GitHub API',
          endpoints: [],
        },
        {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          key: 'slack' as unknown as any,
          baseUrl: 'https://slack.com/api',
          keyRef: 'SLACK_KEY',
          description: 'Slack API',
          endpoints: [],
        },
      ],
      roles: [],
      chain: { name: 'local', chainId: 31337, rpcUrl: 'http://localhost:8545' },
      cache: { ttlSeconds: 300 },
      server: { port: 8080, host: '0.0.0.0', readTimeoutMs: 30000, writeTimeoutMs: 60000 },
    };

    const registry = new ToolRegistry(config);

    const result = registry.findTool('https://api.github.com/repos/owner/repo');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.key).toBe('github');
    }
  });

  it('should return error for unknown tool', () => {
    const config: AppConfig = {
      tools: [
        {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          key: 'github' as unknown as any,
          baseUrl: 'https://api.github.com',
          keyRef: 'GITHUB_KEY',
          description: 'GitHub API',
          endpoints: [],
        },
      ],
      roles: [],
      chain: { name: 'local', chainId: 31337, rpcUrl: 'http://localhost:8545' },
      cache: { ttlSeconds: 300 },
      server: { port: 8080, host: '0.0.0.0', readTimeoutMs: 30000, writeTimeoutMs: 60000 },
    };

    const registry = new ToolRegistry(config);

    const result = registry.findTool('https://unknown-api.com/endpoint');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(-32013); // UNKNOWN_TOOL
    }
  });

  it('should prefer longest match', () => {
    const config: AppConfig = {
      tools: [
        {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          key: 'api' as unknown as any,
          baseUrl: 'https://api.example.com',
          keyRef: 'API_KEY',
          description: 'API',
          endpoints: [],
        },
        {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          key: 'graphql' as unknown as any,
          baseUrl: 'https://api.example.com/graphql',
          keyRef: 'GRAPHQL_KEY',
          description: 'GraphQL',
          endpoints: [],
        },
      ],
      roles: [],
      chain: { name: 'local', chainId: 31337, rpcUrl: 'http://localhost:8545' },
      cache: { ttlSeconds: 300 },
      server: { port: 8080, host: '0.0.0.0', readTimeoutMs: 30000, writeTimeoutMs: 60000 },
    };

    const registry = new ToolRegistry(config);

    const result = registry.findTool('https://api.example.com/graphql/query');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.key).toBe('graphql');
    }
  });
});
