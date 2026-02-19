import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProxyExecutor } from '../../src/proxy/executor.js';
import type { KeyCustodyDriver } from '../../src/custody/driver.js';

describe('Proxy: Executor', () => {
  let executor: ProxyExecutor;
  let mockCustody: KeyCustodyDriver;

  beforeEach(() => {
    mockCustody = {
      inject: vi.fn().mockReturnValue('test-api-key'),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    executor = new ProxyExecutor(mockCustody, 30000, 60000);
  });

  it('should execute GET request', async () => {
    // Mock fetch to return a JSON response
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: 'test' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).fetch = mockFetch;

    const req = {
      method: 'GET' as const,
      targetUrl: 'https://api.github.com/repos/owner/repo',
      headers: {},
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await executor.execute(req, 'test-handle' as any);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe(200);
      expect(result.value.contentType).toBe('json');
      expect(result.value.body).toEqual({ data: 'test' });
    }

    vi.restoreAllMocks();
  });

  it('should inject Authorization header', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).fetch = mockFetch;

    const req = {
      method: 'GET' as const,
      targetUrl: 'https://api.github.com/repos/owner/repo',
      headers: {},
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await executor.execute(req, 'test-handle' as any);

    expect(mockCustody.inject).toHaveBeenCalledWith('test-handle');

    // Verify that Authorization header was injected into fetch call
    expect(mockFetch).toHaveBeenCalled();
    const fetchCall = mockFetch.mock.calls[0];
    if (fetchCall && fetchCall[1]) {
      const fetchOptions = fetchCall[1] as RequestInit;
      expect(fetchOptions.headers).toBeDefined();
      const headers = fetchOptions.headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer test-api-key');
    }

    vi.restoreAllMocks();
  });

  it('should handle key injection failure', async () => {
    const mockFailCustody = {
      inject: vi.fn().mockImplementation(() => {
        throw new Error('Key not found');
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    const failExecutor = new ProxyExecutor(mockFailCustody, 30000, 60000);

    const req = {
      method: 'GET' as const,
      targetUrl: 'https://api.github.com/repos/owner/repo',
      headers: {},
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await failExecutor.execute(req, 'test-handle' as any);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.httpStatus).toBe(500);
      expect(result.error.code).toBe(-32603);
    }
  });

  it('should handle fetch timeout', async () => {
    const mockFetch = vi.fn().mockImplementation(
      () =>
        new Promise((_, reject) => {
          const error = new Error('The operation was aborted');
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (error as any).name = 'AbortError';
          reject(error);
        })
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).fetch = mockFetch;

    const req = {
      method: 'GET' as const,
      targetUrl: 'https://api.github.com/repos/owner/repo',
      headers: {},
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await executor.execute(req, 'test-handle' as any);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(-32021); // SERVICE_TIMEOUT
      expect(result.error.httpStatus).toBe(504);
    }

    vi.restoreAllMocks();
  });

  it('should handle upstream network error', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).fetch = mockFetch;

    const req = {
      method: 'POST' as const,
      targetUrl: 'https://api.github.com/repos/owner/repo',
      headers: {},
      body: { test: 'data' },
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await executor.execute(req, 'test-handle' as any);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(-32020); // UPSTREAM_ERROR
      expect(result.error.httpStatus).toBe(502);
    }

    vi.restoreAllMocks();
  });

  it('should handle different response content types', async () => {
    // Test text/plain response
    const mockFetch = vi.fn().mockResolvedValue(
      new Response('plain text', {
        status: 200,
        headers: { 'content-type': 'text/plain' },
      })
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).fetch = mockFetch;

    const req = {
      method: 'GET' as const,
      targetUrl: 'https://api.example.com/text',
      headers: {},
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await executor.execute(req, 'test-handle' as any);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.contentType).toBe('text');
      expect(result.value.body).toBe('plain text');
    }

    vi.restoreAllMocks();
  });

  it('should handle binary response', async () => {
    const binaryData = Buffer.from([1, 2, 3, 4, 5]);
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(binaryData, {
        status: 200,
        headers: { 'content-type': 'application/octet-stream' },
      })
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).fetch = mockFetch;

    const req = {
      method: 'GET' as const,
      targetUrl: 'https://api.example.com/binary',
      headers: {},
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await executor.execute(req, 'test-handle' as any);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.contentType).toBe('binary');
      expect(Buffer.isBuffer(result.value.body)).toBe(true);
    }

    vi.restoreAllMocks();
  });
});
