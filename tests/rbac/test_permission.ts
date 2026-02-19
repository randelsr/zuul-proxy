import { describe, it, expect } from 'vitest';
import { inferAction, ACTION_TO_METHODS } from '../../src/rbac/permission.js';
import type { PermissionAction } from '../../src/types.js';

describe('RBAC: Permission Actions', () => {
  describe('inferAction', () => {
    it('should infer "read" action from GET', () => {
      const result = inferAction('GET');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe('read');
      }
    });

    it('should infer "read" action from HEAD', () => {
      const result = inferAction('HEAD');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe('read');
      }
    });

    it('should infer "create" action from POST', () => {
      const result = inferAction('POST');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe('create');
      }
    });

    it('should infer "update" action from PUT', () => {
      const result = inferAction('PUT');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe('update');
      }
    });

    it('should infer "update" action from PATCH', () => {
      const result = inferAction('PATCH');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe('update');
      }
    });

    it('should infer "delete" action from DELETE', () => {
      const result = inferAction('DELETE');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe('delete');
      }
    });
  });

  describe('ACTION_TO_METHODS', () => {
    it('should have "read" mapped to ["GET", "HEAD"]', () => {
      expect(ACTION_TO_METHODS.read).toEqual(['GET', 'HEAD'] as const);
    });

    it('should have "create" mapped to ["POST"]', () => {
      expect(ACTION_TO_METHODS.create).toEqual(['POST'] as const);
    });

    it('should have "update" mapped to ["PUT", "PATCH"]', () => {
      expect(ACTION_TO_METHODS.update).toEqual(['PUT', 'PATCH'] as const);
    });

    it('should have "delete" mapped to ["DELETE"]', () => {
      expect(ACTION_TO_METHODS.delete).toEqual(['DELETE'] as const);
    });

    it('should have all actions defined with non-empty method lists', () => {
      const actions: PermissionAction[] = ['read', 'create', 'update', 'delete'];
      for (const action of actions) {
        expect(ACTION_TO_METHODS[action]).toBeDefined();
        expect(ACTION_TO_METHODS[action].length).toBeGreaterThan(0);
      }
    });

    it('should cover all permission actions exhaustively', () => {
      const actions: PermissionAction[] = ['read', 'create', 'update', 'delete'];
      for (const action of actions) {
        // Verify the action exists in ACTION_TO_METHODS
        const methods = ACTION_TO_METHODS[action];
        expect(methods).toBeDefined();
        expect(Array.isArray(methods)).toBe(true);
        expect((methods as unknown[]).length).toBeGreaterThan(0);
      }
    });
  });

  describe('edge cases', () => {
    it('should handle unknown HTTP method gracefully', () => {
      const result = inferAction('UNKNOWN' as never);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(-32600);
        expect(result.error.httpStatus).toBe(400);
      }
    });

    it('should return RequestError with proper error context', () => {
      const result = inferAction('OPTIONS' as never);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error instanceof Error).toBe(true);
      }
    });
  });
});
