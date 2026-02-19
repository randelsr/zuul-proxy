import { randomBytes, createCipheriv, createDecipheriv } from 'crypto';
import type { EncryptedPayload } from '../types.js';
import { ServiceError } from '../errors.js';
import type { Result } from '../types.js';
import { getLogger } from '../logging.js';
import type { AuditPayload } from './payload.js';

const logger = getLogger('audit:encryption');

/**
 * AES-256-GCM encryption service
 * Encrypts audit payloads; decryption is admin-only utility
 */
export class EncryptionService {
  private key: Buffer;

  /**
   * Initialize with encryption key from AUDIT_ENCRYPTION_KEY env var
   * Expected: 64-char hex string (256 bits)
   *
   * @throws ServiceError if key is invalid format or missing
   */
  constructor() {
    const keyHex = process.env.AUDIT_ENCRYPTION_KEY;

    if (!keyHex) {
      throw new ServiceError(
        'Missing AUDIT_ENCRYPTION_KEY environment variable',
        -32603, // INTERNAL_ERROR
        500,
        'internal/error'
      );
    }

    try {
      this.key = Buffer.from(keyHex, 'hex');
      if (this.key.length !== 32) {
        throw new Error(`Expected 32 bytes, got ${this.key.length}`);
      }
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'Invalid AUDIT_ENCRYPTION_KEY format'
      );
      throw new ServiceError(
        'AUDIT_ENCRYPTION_KEY must be 64-char hex string (256 bits)',
        -32603, // INTERNAL_ERROR
        500,
        'internal/error'
      );
    }

    logger.info({}, 'Encryption service initialized');
  }

  /**
   * Encrypt audit payload using AES-256-GCM
   * IV is prepended to ciphertext for decryption
   *
   * @param payload AuditPayload to encrypt
   * @returns EncryptedPayload (base64: IV + ciphertext + authTag)
   */
  encrypt(payload: AuditPayload): Result<EncryptedPayload, ServiceError> {
    try {
      // Generate random IV (96 bits for GCM)
      const iv = randomBytes(12);

      // Create cipher
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cipher = createCipheriv('aes-256-gcm', this.key as any, iv as any);

      // Encrypt payload
      const plaintext = JSON.stringify(payload);
      const update = cipher.update(plaintext, 'utf8');
      const final = cipher.final() as Buffer;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ciphertext = Buffer.concat([update as any, final] as any);

      // Get auth tag
      const authTag = cipher.getAuthTag();

      // Combine: IV + ciphertext + authTag, base64 encode
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const combined = Buffer.concat([iv as any, ciphertext as any, authTag as any] as any);
      const encrypted = combined.toString('base64') as unknown as EncryptedPayload;

      logger.debug({ payloadId: payload.id }, 'Audit payload encrypted');

      return { ok: true, value: encrypted };
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'Encryption failed'
      );

      return {
        ok: false,
        error: new ServiceError(
          'Failed to encrypt audit payload',
          -32603, // INTERNAL_ERROR
          500,
          'internal/error'
        ),
      };
    }
  }

  /**
   * Decrypt audit payload (admin utility, not used in main request path)
   *
   * @param encrypted EncryptedPayload (base64)
   * @returns Decrypted AuditPayload or ServiceError
   */
  decrypt(encrypted: EncryptedPayload): Result<AuditPayload, ServiceError> {
    try {
      // Decode base64
      const combined = Buffer.from(encrypted, 'base64');

      // Extract: IV (first 12 bytes) + ciphertext + authTag (last 16 bytes)
      const iv = combined.subarray(0, 12);
      const authTag = combined.subarray(combined.length - 16);
      const ciphertext = combined.subarray(12, combined.length - 16);

      // Create decipher
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const decipher = createDecipheriv('aes-256-gcm', this.key as any, iv as any) as any;
      decipher.setAuthTag(authTag as unknown as Buffer);

      // Decrypt
      const update2 = decipher.update(ciphertext as unknown as Buffer);
      const final2 = decipher.final();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const plaintext = Buffer.concat([update2 as any, final2 as any] as any).toString('utf8');

      const payload = JSON.parse(plaintext) as AuditPayload;

      logger.debug({ payloadId: payload.id }, 'Audit payload decrypted');

      return { ok: true, value: payload };
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'Decryption failed'
      );

      return {
        ok: false,
        error: new ServiceError(
          'Failed to decrypt audit payload',
          -32603, // INTERNAL_ERROR
          500,
          'internal/error'
        ),
      };
    }
  }
}
