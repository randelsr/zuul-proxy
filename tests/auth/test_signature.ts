import { describe, it, expect, beforeEach } from 'vitest';
import { privateKeyToAccount } from 'viem/accounts';
import {
  buildCanonicalPayload,
  recoverSigner,
  NonceValidator,
  TimestampValidator,
  verifySignedRequest,
} from '../../src/auth/signature.js';
import type {
  HttpMethod,
  Nonce,
  Timestamp,
  SignedRequest,
  AgentAddress,
  Signature,
} from '../../src/types.js';

describe('Auth: Signature Verification', () => {
  const testAccount = privateKeyToAccount(
    '0x1234567890123456789012345678901234567890123456789012345678901234'
  );
  const agentAddress = testAccount.address as `0x${string}`;

  describe('buildCanonicalPayload', () => {
    it('should build canonical payload with correct format', () => {
      const method: HttpMethod = 'GET';
      const targetUrl = 'https://api.github.com/repos/owner/repo';
      const nonce = '550e8400-e29b-41d4-a716-446655440000' as Nonce;
      const timestamp = 1740000000 as Timestamp;

      const payload = buildCanonicalPayload(method, targetUrl, nonce, timestamp);

      expect(payload).toContain('GET');
      expect(payload).toContain('https://api.github.com/repos/owner/repo');
      expect(payload).toContain('550e8400-e29b-41d4-a716-446655440000');
      expect(payload).toContain('1740000000');
    });

    it('should include newlines between parts', () => {
      const method: HttpMethod = 'POST';
      const targetUrl = 'https://api.example.com/test';
      const nonce = '550e8400-e29b-41d4-a716-446655440000' as Nonce;
      const timestamp = 1740000000 as Timestamp;

      const payload = buildCanonicalPayload(method, targetUrl, nonce, timestamp);

      const lines = payload.split('\n');
      expect(lines).toHaveLength(4);
      expect(lines[0]).toBe('POST');
      expect(lines[1]).toBe('https://api.example.com/test');
      expect(lines[2]).toBe('550e8400-e29b-41d4-a716-446655440000');
      expect(lines[3]).toBe('1740000000');
    });
  });

  describe('recoverSigner', () => {
    it('should recover signer from valid signature', async () => {
      const timestamp = Math.floor(Date.now() / 1000) as Timestamp;
      const nonce = '550e8400-e29b-41d4-a716-446655440000' as Nonce;
      const payload = buildCanonicalPayload(
        'GET',
        'https://api.github.com/repos/owner/repo',
        nonce,
        timestamp
      );

      const signature = await testAccount.signMessage({ message: payload });

      const result = await recoverSigner(payload, signature as Signature);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.toLowerCase()).toBe(agentAddress.toLowerCase());
      }
    });

    it('should reject invalid signature', async () => {
      const payload = 'invalid-payload';
      const invalidSignature = '0xinvalidSignature';

      const result = await recoverSigner(payload, invalidSignature as Signature);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(-32002);
        expect(result.error.errorType).toContain('auth');
      }
    });

    it('should reject malformed signature', async () => {
      const payload = 'test payload';
      const malformedSignature = '0x123' as Signature;

      const result = await recoverSigner(payload, malformedSignature);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(-32002);
      }
    });
  });

  describe('NonceValidator', () => {
    let validator: NonceValidator;

    beforeEach(() => {
      validator = new NonceValidator();
    });

    it('should accept first use of nonce', () => {
      const timestamp = Math.floor(Date.now() / 1000) as Timestamp;
      const nonce = '550e8400-e29b-41d4-a716-446655440000' as Nonce;

      const result = validator.validateAndStore(agentAddress as AgentAddress, nonce, timestamp);

      expect(result.ok).toBe(true);
    });

    it('should reject nonce reuse (replay attack)', () => {
      const timestamp = Math.floor(Date.now() / 1000) as Timestamp;
      const nonce = '550e8400-e29b-41d4-a716-446655440000' as Nonce;

      // First use: should succeed
      const result1 = validator.validateAndStore(agentAddress as AgentAddress, nonce, timestamp);
      expect(result1.ok).toBe(true);

      // Second use: should fail (replay)
      const result2 = validator.validateAndStore(agentAddress as AgentAddress, nonce, timestamp);
      expect(result2.ok).toBe(false);
      if (!result2.ok) {
        expect(result2.error.code).toBe(-32004);
      }
    });

    it('should allow different agents to use same nonce', () => {
      const timestamp = Math.floor(Date.now() / 1000) as Timestamp;
      const nonce = '550e8400-e29b-41d4-a716-446655440000' as Nonce;
      const agent1 = '0x1111111111111111111111111111111111111111' as AgentAddress;
      const agent2 = '0x2222222222222222222222222222222222222222' as AgentAddress;

      const result1 = validator.validateAndStore(agent1, nonce, timestamp);
      const result2 = validator.validateAndStore(agent2, nonce, timestamp);

      expect(result1.ok).toBe(true);
      expect(result2.ok).toBe(true);
    });

    it('should report metrics', () => {
      const timestamp = Math.floor(Date.now() / 1000) as Timestamp;
      const nonce1 = '550e8400-e29b-41d4-a716-446655440000' as Nonce;
      const nonce2 = '550e8400-e29b-41d4-a716-446655440001' as Nonce;

      validator.validateAndStore(agentAddress as AgentAddress, nonce1, timestamp);
      validator.validateAndStore(agentAddress as AgentAddress, nonce2, timestamp);

      const metrics = validator.getMetrics();

      expect(metrics.totalAgents).toBe(1);
      expect(metrics.totalNonces).toBe(2);
    });

    it('should cleanup on destroy', () => {
      const timestamp = Math.floor(Date.now() / 1000) as Timestamp;
      const nonce = '550e8400-e29b-41d4-a716-446655440000' as Nonce;

      validator.validateAndStore(agentAddress as AgentAddress, nonce, timestamp);
      validator.destroy();

      const metrics = validator.getMetrics();
      expect(metrics.totalAgents).toBe(0);
      expect(metrics.totalNonces).toBe(0);
    });
  });

  describe('TimestampValidator', () => {
    let validator: TimestampValidator;

    beforeEach(() => {
      validator = new TimestampValidator();
    });

    it('should accept current timestamp', () => {
      const now = Math.floor(Date.now() / 1000) as Timestamp;
      const result = validator.validate(now);

      expect(result.ok).toBe(true);
    });

    it('should accept timestamp within 5-minute window', () => {
      const now = Math.floor(Date.now() / 1000) as Timestamp;
      const recent = (now - 60) as Timestamp; // 1 minute ago

      const result = validator.validate(recent);

      expect(result.ok).toBe(true);
    });

    it('should reject timestamp 10 minutes in past', () => {
      const now = Math.floor(Date.now() / 1000) as Timestamp;
      const old = (now - 600) as Timestamp; // 10 minutes ago

      const result = validator.validate(old);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(-32005);
      }
    });

    it('should reject timestamp 10 minutes in future', () => {
      const now = Math.floor(Date.now() / 1000) as Timestamp;
      const future = (now + 600) as Timestamp; // 10 minutes ahead

      const result = validator.validate(future);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(-32005);
      }
    });

    it('should accept timestamp at edge of 5-minute window', () => {
      const now = Math.floor(Date.now() / 1000) as Timestamp;
      const edgeOld = (now - 299) as Timestamp; // Just under 5 minutes
      const edgeFuture = (now + 299) as Timestamp; // Just under 5 minutes ahead

      const result1 = validator.validate(edgeOld);
      const result2 = validator.validate(edgeFuture);

      expect(result1.ok).toBe(true);
      expect(result2.ok).toBe(true);
    });
  });

  describe('verifySignedRequest', () => {
    let nonceValidator: NonceValidator;
    let timestampValidator: TimestampValidator;

    beforeEach(() => {
      nonceValidator = new NonceValidator();
      timestampValidator = new TimestampValidator();
    });

    it('should verify valid signed request', async () => {
      const timestamp = Math.floor(Date.now() / 1000) as Timestamp;
      const nonce = '550e8400-e29b-41d4-a716-446655440000' as Nonce;
      const payload = buildCanonicalPayload(
        'GET',
        'https://api.github.com/repos/owner/repo',
        nonce,
        timestamp
      );

      const signature = await testAccount.signMessage({ message: payload });

      const req: SignedRequest = {
        agentAddress: agentAddress as AgentAddress,
        signature: signature as Signature,
        method: 'GET',
        targetUrl: 'https://api.github.com/repos/owner/repo',
        nonce,
        timestamp,
      };

      const result = await verifySignedRequest(req, nonceValidator, timestampValidator);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.toLowerCase()).toBe(agentAddress.toLowerCase());
      }
    });

    it('should reject replay attack', async () => {
      const timestamp = Math.floor(Date.now() / 1000) as Timestamp;
      const nonce = '550e8400-e29b-41d4-a716-446655440000' as Nonce;
      const payload = buildCanonicalPayload(
        'GET',
        'https://api.github.com/repos/owner/repo',
        nonce,
        timestamp
      );

      const signature = await testAccount.signMessage({ message: payload });

      const req: SignedRequest = {
        agentAddress: agentAddress as AgentAddress,
        signature: signature as Signature,
        method: 'GET',
        targetUrl: 'https://api.github.com/repos/owner/repo',
        nonce,
        timestamp,
      };

      // First request: should succeed
      const result1 = await verifySignedRequest(req, nonceValidator, timestampValidator);
      expect(result1.ok).toBe(true);

      // Replay attack: same request again
      const result2 = await verifySignedRequest(req, nonceValidator, timestampValidator);
      expect(result2.ok).toBe(false);
      if (!result2.ok) {
        expect(result2.error.code).toBe(-32004);
      }
    });

    it('should reject invalid signature', async () => {
      const timestamp = Math.floor(Date.now() / 1000) as Timestamp;
      const nonce = '550e8400-e29b-41d4-a716-446655440000' as Nonce;

      const req: SignedRequest = {
        agentAddress: agentAddress as AgentAddress,
        signature: '0xinvalidSignature' as Signature,
        method: 'GET',
        targetUrl: 'https://api.github.com/repos/owner/repo',
        nonce,
        timestamp,
      };

      const result = await verifySignedRequest(req, nonceValidator, timestampValidator);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(-32002);
      }
    });

    it('should reject signer mismatch', async () => {
      const timestamp = Math.floor(Date.now() / 1000) as Timestamp;
      const nonce = '550e8400-e29b-41d4-a716-446655440000' as Nonce;
      const payload = buildCanonicalPayload(
        'GET',
        'https://api.github.com/repos/owner/repo',
        nonce,
        timestamp
      );

      const signature = await testAccount.signMessage({ message: payload });

      const wrongAddress = '0x0000000000000000000000000000000000000001' as AgentAddress;

      const req: SignedRequest = {
        agentAddress: wrongAddress,
        signature: signature as Signature,
        method: 'GET',
        targetUrl: 'https://api.github.com/repos/owner/repo',
        nonce,
        timestamp,
      };

      const result = await verifySignedRequest(req, nonceValidator, timestampValidator);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(-32002);
      }
    });

    it('should reject stale timestamp', async () => {
      const oldTimestamp = (Math.floor(Date.now() / 1000) - 600) as Timestamp; // 10 minutes ago
      const nonce = '550e8400-e29b-41d4-a716-446655440000' as Nonce;
      const payload = buildCanonicalPayload(
        'GET',
        'https://api.github.com/repos/owner/repo',
        nonce,
        oldTimestamp
      );

      const signature = await testAccount.signMessage({ message: payload });

      const req: SignedRequest = {
        agentAddress: agentAddress as AgentAddress,
        signature: signature as Signature,
        method: 'GET',
        targetUrl: 'https://api.github.com/repos/owner/repo',
        nonce,
        timestamp: oldTimestamp,
      };

      const result = await verifySignedRequest(req, nonceValidator, timestampValidator);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(-32005);
      }
    });
  });
});
