import { describe, it, expect, beforeEach } from 'vitest';
import { KeyVault } from '../../src/custody/key-vault.js';
import type { ToolKey, ApiKeyHandle } from '../../src/types.js';

describe('Key Vault', () => {
  let vault: KeyVault;
  let keyMap: Map<ToolKey, string>;

  beforeEach(() => {
    keyMap = new Map<ToolKey, string>();
    keyMap.set('github' as ToolKey, 'github-secret-token-xyz');
    keyMap.set('slack' as ToolKey, 'slack-bot-token-abc');
    keyMap.set('openai' as ToolKey, 'openai-key-def');
    vault = new KeyVault(keyMap);
  });

  describe('getKey', () => {
    it('should return opaque handle for known tool', () => {
      const result = vault.getKey('github' as ToolKey);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(typeof result.value).toBe('string');
        // Handle should contain vault marker (internal format)
        expect((result.value as unknown as string).startsWith('vault:')).toBe(true);
      }
    });

    it('should return different handles for different tools', () => {
      const result1 = vault.getKey('github' as ToolKey);
      const result2 = vault.getKey('slack' as ToolKey);

      expect(result1.ok).toBe(true);
      expect(result2.ok).toBe(true);
      if (result1.ok && result2.ok) {
        expect(result1.value).not.toBe(result2.value);
      }
    });

    it('should return error for unknown tool', () => {
      const result = vault.getKey('unknown' as ToolKey);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(-32603);
        expect(result.error.httpStatus).toBe(500);
        expect(result.error.errorType).toBe('internal/error');
        expect(result.error.data?.tool_key).toBe('unknown');
      }
    });
  });

  describe('inject', () => {
    it('should return actual key value from handle', () => {
      const getResult = vault.getKey('github' as ToolKey);
      expect(getResult.ok).toBe(true);

      if (getResult.ok) {
        const key = vault.inject(getResult.value);
        expect(key).toBe('github-secret-token-xyz');
      }
    });

    it('should correctly inject keys for multiple tools', () => {
      const githubHandle = vault.getKey('github' as ToolKey);
      const slackHandle = vault.getKey('slack' as ToolKey);

      expect(githubHandle.ok).toBe(true);
      expect(slackHandle.ok).toBe(true);

      if (githubHandle.ok && slackHandle.ok) {
        const githubKey = vault.inject(githubHandle.value);
        const slackKey = vault.inject(slackHandle.value);

        expect(githubKey).toBe('github-secret-token-xyz');
        expect(slackKey).toBe('slack-bot-token-abc');
        expect(githubKey).not.toBe(slackKey);
      }
    });

    it('should preserve special characters in keys during injection', () => {
      const specialKeyMap = new Map<ToolKey, string>();
      specialKeyMap.set('special' as ToolKey, 'Bearer sk-abc123!@#$%^&*()_+-=[]{}|;:,.<>?/~`');
      const specialVault = new KeyVault(specialKeyMap);

      const handle = specialVault.getKey('special' as ToolKey);
      expect(handle.ok).toBe(true);

      if (handle.ok) {
        const key = specialVault.inject(handle.value);
        expect(key).toBe('Bearer sk-abc123!@#$%^&*()_+-=[]{}|;:,.<>?/~`');
      }
    });

    it('should throw on invalid handle format', () => {
      const invalidHandle = 'invalid-handle' as unknown as ApiKeyHandle;

      expect(() => {
        vault.inject(invalidHandle);
      }).toThrow('Invalid key handle');
    });

    it('should throw on handle for unknown tool', () => {
      // Create a handle with a tool that doesn't exist
      const fakeHandle = 'vault:nonexistent' as unknown as ApiKeyHandle;

      expect(() => {
        vault.inject(fakeHandle);
      }).toThrow('Key not found in vault');
    });
  });

  describe('opaque handle semantics', () => {
    it('handle should not contain actual key value', () => {
      const getResult = vault.getKey('github' as ToolKey);
      expect(getResult.ok).toBe(true);

      if (getResult.ok) {
        const handleStr = getResult.value as unknown as string;
        // Handle should NOT contain the actual secret
        expect(handleStr).not.toContain('github-secret-token-xyz');
        expect(handleStr).not.toContain('secret');
        expect(handleStr).not.toContain('token');
      }
    });

    it('same tool should return consistent format handles', () => {
      const result1 = vault.getKey('github' as ToolKey);
      const result2 = vault.getKey('github' as ToolKey);

      // Two calls should return different handle instances
      // (but both should decode to same tool)
      expect(result1.ok).toBe(true);
      expect(result2.ok).toBe(true);

      if (result1.ok && result2.ok) {
        // Handles should both work for injection
        const key1 = vault.inject(result1.value);
        const key2 = vault.inject(result2.value);

        expect(key1).toBe(key2);
        expect(key1).toBe('github-secret-token-xyz');
      }
    });
  });

  describe('vault lifecycle', () => {
    it('should initialize with keys', () => {
      expect(keyMap.size).toBe(3);
      // All keys should be retrievable
      expect(vault.getKey('github' as ToolKey).ok).toBe(true);
      expect(vault.getKey('slack' as ToolKey).ok).toBe(true);
      expect(vault.getKey('openai' as ToolKey).ok).toBe(true);
    });

    it('should handle empty vault', () => {
      const emptyVault = new KeyVault(new Map());

      const result = emptyVault.getKey('any' as ToolKey);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(-32603);
      }
    });

    it('should handle single-key vault', () => {
      const singleKeyMap = new Map<ToolKey, string>();
      singleKeyMap.set('only' as ToolKey, 'only-key-value');
      const singleVault = new KeyVault(singleKeyMap);

      const result = singleVault.getKey('only' as ToolKey);
      expect(result.ok).toBe(true);

      if (result.ok) {
        const key = singleVault.inject(result.value);
        expect(key).toBe('only-key-value');
      }
    });
  });
});
