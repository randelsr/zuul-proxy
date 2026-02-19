import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EncryptionService } from '../../src/audit/encryption.js';
import { buildAuditPayload, hashPayload } from '../../src/audit/payload.js';
import type { AgentAddress, ToolKey, Hash } from '../../src/types.js';

// Helper to create test payloads with less boilerplate
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function testPayload(status = 200, errorType?: string): any {
  return buildAuditPayload(
    '0x1234567890123456789012345678901234567890' as AgentAddress,
    'github' as ToolKey,
    status === 403 ? 'delete' : 'read',
    'https://api.github.com/repos/owner/repo',
    status === 403 ? 'DELETE' : 'GET',
    status,
    errorType,
    status === 403 ? 50 : 142,
    '0xaabbccdd' as Hash,
    '0xeeff0011' as Hash
  );
}

describe('Audit: Encryption', () => {
  let service: EncryptionService;
  const testKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  beforeEach(() => {
    process.env.AUDIT_ENCRYPTION_KEY = testKey;
    service = new EncryptionService();
  });

  afterEach(() => {
    delete process.env.AUDIT_ENCRYPTION_KEY;
  });

  it('should encrypt and decrypt audit payload', () => {
    const payload = testPayload();

    const encryptResult = service.encrypt(payload);
    expect(encryptResult.ok).toBe(true);

    if (!encryptResult.ok) {
      throw new Error('Encryption failed');
    }

    const decryptResult = service.decrypt(encryptResult.value);
    expect(decryptResult.ok).toBe(true);

    if (!decryptResult.ok) {
      throw new Error('Decryption failed');
    }

    expect(decryptResult.value.id).toBe(payload.id);
    expect(decryptResult.value.agent).toBe(payload.agent);
    expect(decryptResult.value.tool).toBe(payload.tool);
    expect(decryptResult.value.status).toBe(200);
    expect(decryptResult.value.latencyMs).toBe(142);
  });

  it('should fail with invalid encryption key', () => {
    delete process.env.AUDIT_ENCRYPTION_KEY;
    expect(() => new EncryptionService()).toThrow();
  });

  it('should fail with malformed key', () => {
    process.env.AUDIT_ENCRYPTION_KEY = 'not-hex';
    expect(() => new EncryptionService()).toThrow();
  });

  it('should fail with wrong key length', () => {
    process.env.AUDIT_ENCRYPTION_KEY = '0123456789abcdef'; // 8 bytes, not 32
    expect(() => new EncryptionService()).toThrow();
  });

  it('should preserve hash determinism through encrypt/decrypt', () => {
    const payload = testPayload();
    const hash1 = hashPayload(payload);

    const encryptResult = service.encrypt(payload);
    expect(encryptResult.ok).toBe(true);

    if (!encryptResult.ok) {
      throw new Error('Encryption failed');
    }

    const decryptResult = service.decrypt(encryptResult.value);
    expect(decryptResult.ok).toBe(true);

    if (!decryptResult.ok) {
      throw new Error('Decryption failed');
    }

    const hash2 = hashPayload(decryptResult.value);
    expect(hash1).toBe(hash2);
  });

  it('should return error on decryption of corrupted data', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = service.decrypt('invalid-base64-corrupted-data!!!' as any);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(-32603); // INTERNAL_ERROR
    }
  });

  it('should generate different ciphertexts for same payload (due to random IV)', () => {
    const payload = testPayload();

    const result1 = service.encrypt(payload);
    const result2 = service.encrypt(payload);

    expect(result1.ok).toBe(true);
    expect(result2.ok).toBe(true);

    if (result1.ok && result2.ok) {
      // Different ciphertexts due to random IV
      expect(result1.value).not.toBe(result2.value);

      // But both decrypt to same payload
      const decrypt1 = service.decrypt(result1.value);
      const decrypt2 = service.decrypt(result2.value);

      expect(decrypt1.ok).toBe(true);
      expect(decrypt2.ok).toBe(true);

      if (decrypt1.ok && decrypt2.ok) {
        expect(decrypt1.value.id).toBe(decrypt2.value.id);
        expect(decrypt1.value.agent).toBe(decrypt2.value.agent);
      }
    }
  });

  it('should handle error type in encrypted payload', () => {
    const payload = testPayload(403, 'permission/no_action_access');

    const encryptResult = service.encrypt(payload);
    expect(encryptResult.ok).toBe(true);

    if (!encryptResult.ok) {
      throw new Error('Encryption failed');
    }

    const decryptResult = service.decrypt(encryptResult.value);
    expect(decryptResult.ok).toBe(true);

    if (!decryptResult.ok) {
      throw new Error('Decryption failed');
    }

    expect(decryptResult.value.errorType).toBe('permission/no_action_access');
    expect(decryptResult.value.status).toBe(403);
  });
});
