import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadKeysFromEnv } from '../../src/custody/key-loader.js';
import type { AppConfig } from '../../src/config/types.js';
import type { ToolKey } from '../../src/types.js';

describe('Key Loader', () => {
  beforeEach(() => {
    process.env.GITHUB_API_KEY = 'test-github-key-12345';
    process.env.SLACK_BOT_TOKEN = 'test-slack-token-67890';
  });

  afterEach(() => {
    delete process.env.GITHUB_API_KEY;
    delete process.env.SLACK_BOT_TOKEN;
    delete process.env.MISSING_KEY;
  });

  describe('loadKeysFromEnv', () => {
    it('should load API keys from environment variables', () => {
      const mockConfig: AppConfig = {
        tools: [
          {
            key: 'github' as ToolKey,
            description: 'GitHub API',
            baseUrl: 'https://api.github.com',
            keyRef: 'GITHUB_API_KEY',
            endpoints: [],
          },
          {
            key: 'slack' as ToolKey,
            description: 'Slack API',
            baseUrl: 'https://slack.com/api',
            keyRef: 'SLACK_BOT_TOKEN',
            endpoints: [],
          },
        ],
        roles: [],
        chain: {
          name: 'local',
          chainId: 31337,
          rpcUrl: 'http://localhost:8545',
        },
        cache: { ttlSeconds: 300 },
        server: {
          port: 8080,
          host: '0.0.0.0',
          readTimeoutMs: 30000,
          writeTimeoutMs: 60000,
        },
      };

      const result = loadKeysFromEnv(mockConfig);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.get('github' as ToolKey)).toBe('test-github-key-12345');
        expect(result.value.get('slack' as ToolKey)).toBe('test-slack-token-67890');
        expect(result.value.size).toBe(2);
      }
    });

    it('should fail if environment variable is missing', () => {
      delete process.env.GITHUB_API_KEY;

      const mockConfig: AppConfig = {
        tools: [
          {
            key: 'github' as ToolKey,
            description: 'GitHub API',
            baseUrl: 'https://api.github.com',
            keyRef: 'GITHUB_API_KEY',
            endpoints: [],
          },
        ],
        roles: [],
        chain: {
          name: 'local',
          chainId: 31337,
          rpcUrl: 'http://localhost:8545',
        },
        cache: { ttlSeconds: 300 },
        server: {
          port: 8080,
          host: '0.0.0.0',
          readTimeoutMs: 30000,
          writeTimeoutMs: 60000,
        },
      };

      const result = loadKeysFromEnv(mockConfig);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(-32603);
        expect(result.error.httpStatus).toBe(500);
        expect(result.error.errorType).toBe('internal/error');
        expect(result.error.data?.missing_env_var).toBe('GITHUB_API_KEY');
        expect(result.error.data?.tool_key).toBe('github');
      }
    });

    it('should fail on first missing key (fail-fast)', () => {
      delete process.env.GITHUB_API_KEY;

      const mockConfig: AppConfig = {
        tools: [
          {
            key: 'github' as ToolKey,
            description: 'GitHub API',
            baseUrl: 'https://api.github.com',
            keyRef: 'GITHUB_API_KEY',
            endpoints: [],
          },
          {
            key: 'slack' as ToolKey,
            description: 'Slack API',
            baseUrl: 'https://slack.com/api',
            keyRef: 'SLACK_BOT_TOKEN',
            endpoints: [],
          },
        ],
        roles: [],
        chain: {
          name: 'local',
          chainId: 31337,
          rpcUrl: 'http://localhost:8545',
        },
        cache: { ttlSeconds: 300 },
        server: {
          port: 8080,
          host: '0.0.0.0',
          readTimeoutMs: 30000,
          writeTimeoutMs: 60000,
        },
      };

      const result = loadKeysFromEnv(mockConfig);

      // Should fail on first tool, not proceed to second
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.data?.tool_key).toBe('github');
      }
    });

    it('should return empty map for zero tools', () => {
      const mockConfig: AppConfig = {
        tools: [],
        roles: [],
        chain: {
          name: 'local',
          chainId: 31337,
          rpcUrl: 'http://localhost:8545',
        },
        cache: { ttlSeconds: 300 },
        server: {
          port: 8080,
          host: '0.0.0.0',
          readTimeoutMs: 30000,
          writeTimeoutMs: 60000,
        },
      };

      const result = loadKeysFromEnv(mockConfig);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.size).toBe(0);
      }
    });

    it('should handle keys with special characters', () => {
      process.env.SPECIAL_KEY = 'Bearer sk-abc123!@#$%^&*()_+-=[]{}|;:,.<>?';

      const mockConfig: AppConfig = {
        tools: [
          {
            key: 'openai' as ToolKey,
            description: 'OpenAI API',
            baseUrl: 'https://api.openai.com',
            keyRef: 'SPECIAL_KEY',
            endpoints: [],
          },
        ],
        roles: [],
        chain: {
          name: 'local',
          chainId: 31337,
          rpcUrl: 'http://localhost:8545',
        },
        cache: { ttlSeconds: 300 },
        server: {
          port: 8080,
          host: '0.0.0.0',
          readTimeoutMs: 30000,
          writeTimeoutMs: 60000,
        },
      };

      const result = loadKeysFromEnv(mockConfig);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.get('openai' as ToolKey)).toBe(
          'Bearer sk-abc123!@#$%^&*()_+-=[]{}|;:,.<>?'
        );
      }

      delete process.env.SPECIAL_KEY;
    });
  });
});
