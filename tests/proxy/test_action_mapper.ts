import { describe, it, expect } from 'vitest';
import { inferAction } from '../../src/proxy/action-mapper.js';

describe('Proxy: Action Mapper', () => {
  it('should map GET to read', () => {
    const result = inferAction('GET');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe('read');
    }
  });

  it('should map HEAD to read', () => {
    const result = inferAction('HEAD');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe('read');
    }
  });

  it('should map POST to create', () => {
    const result = inferAction('POST');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe('create');
    }
  });

  it('should map PUT to update', () => {
    const result = inferAction('PUT');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe('update');
    }
  });

  it('should map PATCH to update', () => {
    const result = inferAction('PATCH');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe('update');
    }
  });

  it('should map DELETE to delete', () => {
    const result = inferAction('DELETE');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe('delete');
    }
  });
});
