import { describe, it, expect } from 'vitest';
import { buildAuditPayload, hashPayload, hashBody } from '../../src/audit/payload.js';
import type { AgentAddress, ToolKey, Hash } from '../../src/types.js';

describe('Audit: Payload', () => {
  it('should build audit payload', () => {
    const payload = buildAuditPayload(
      '0x1234567890123456789012345678901234567890' as AgentAddress,
      'github' as ToolKey,
      'read',
      'https://api.github.com/repos/owner/repo',
      'GET',
      200,
      undefined,
      142,
      '0xaabbccdd' as Hash,
      '0xeeff0011' as Hash
    );

    expect(payload.agent).toBe('0x1234567890123456789012345678901234567890');
    expect(payload.tool).toBe('github');
    expect(payload.action).toBe('read');
    expect(payload.status).toBe(200);
    expect(payload.latencyMs).toBe(142);
    expect(payload.endpoint).toBe('https://api.github.com/repos/owner/repo');
    expect(payload.method).toBe('GET');
  });

  it('should build audit payload with error type', () => {
    const payload = buildAuditPayload(
      '0x1234567890123456789012345678901234567890' as AgentAddress,
      'github' as ToolKey,
      'delete',
      'https://api.github.com/repos/owner/repo',
      'DELETE',
      403,
      'permission/no_action_access',
      50,
      '0xaabbccdd' as Hash,
      '0xeeff0011' as Hash
    );

    expect(payload.status).toBe(403);
    expect(payload.errorType).toBe('permission/no_action_access');
    expect(payload.action).toBe('delete');
  });

  it('should compute deterministic payload hash', () => {
    const payload = buildAuditPayload(
      '0x1234567890123456789012345678901234567890' as AgentAddress,
      'github' as ToolKey,
      'read',
      'https://api.github.com/repos/owner/repo',
      'GET',
      200,
      undefined,
      142,
      '0xaabbccdd' as Hash,
      '0xeeff0011' as Hash
    );

    const hash1 = hashPayload(payload);
    const hash2 = hashPayload(payload);

    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^0x[a-f0-9]{64}$/);
  });

  it('should hash string bodies', () => {
    const hash = hashBody('{"key":"value"}');
    expect(hash).toMatch(/^0x[a-f0-9]{64}$/);
  });

  it('should hash binary bodies', () => {
    const buffer = Buffer.from('binary-data');
    const hash = hashBody(buffer);
    expect(hash).toMatch(/^0x[a-f0-9]{64}$/);
  });

  it('should handle empty bodies', () => {
    const hash = hashBody(null);
    expect(hash).toMatch(/^0x[a-f0-9]{64}$/);
  });

  it('should handle undefined bodies', () => {
    const hash = hashBody(undefined);
    expect(hash).toMatch(/^0x[a-f0-9]{64}$/);
  });

  it('should preserve hash determinism for same body content', () => {
    const body = '{"status":"success","data":[1,2,3]}';
    const hash1 = hashBody(body);
    const hash2 = hashBody(body);
    expect(hash1).toBe(hash2);
  });

  it('should hash objects by serialization', () => {
    const obj = { key: 'value', nested: { foo: 'bar' } };
    const hash = hashBody(obj);
    expect(hash).toMatch(/^0x[a-f0-9]{64}$/);
  });
});
