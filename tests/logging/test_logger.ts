import { describe, it, expect } from 'vitest';
import {
  getLogger,
  getLoggerWithContext,
  createLogContext,
  initLogger,
} from '../../src/logging.js';

describe('Logging', () => {
  it('should create logger with module name', () => {
    const logger = getLogger('test:module');
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.debug).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.warn).toBe('function');
  });

  it('should create context with all fields', () => {
    const context = createLogContext({
      requestId: 'req-123',
      agentAddress: '0x1234',
      tool: 'github',
      action: 'read',
      latencyMs: 142,
      auditTx: '0xabc',
      chainId: 295,
      errorType: 'auth/invalid_signature',
    });

    expect(context.requestId).toBe('req-123');
    expect(context.agentAddress).toBe('0x1234');
    expect(context.tool).toBe('github');
    expect(context.action).toBe('read');
    expect(context.latencyMs).toBe(142);
    expect(context.auditTx).toBe('0xabc');
    expect(context.chainId).toBe(295);
    expect(context.errorType).toBe('auth/invalid_signature');
  });

  it('should create context with partial fields', () => {
    const context = createLogContext({
      requestId: 'req-456',
      agentAddress: '0xabcd',
    });

    expect(context.requestId).toBe('req-456');
    expect(context.agentAddress).toBe('0xabcd');
    expect(context.tool).toBeUndefined();
    expect(context.action).toBeUndefined();
  });

  it('should create logger with context', () => {
    const logger = getLoggerWithContext('test:module', {
      requestId: 'req-456',
      agentAddress: '0xabcd',
    });

    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe('function');
  });

  it('should create empty context', () => {
    const context = createLogContext({});

    expect(context.requestId).toBeUndefined();
    expect(context.agentAddress).toBeUndefined();
    expect(context.tool).toBeUndefined();
    expect(context.action).toBeUndefined();
  });

  it('should allow logging at different levels', () => {
    const logger = getLogger('test:levels');

    // Just verify methods exist and can be called without error
    logger.debug('debug message');
    logger.info('info message');
    logger.warn('warn message');
    logger.error('error message');

    expect(logger).toBeDefined();
  });

  it('should support child loggers with context', () => {
    const logger = getLogger('test:parent');
    const childLogger = logger.child({ parentId: 'parent-123' });

    expect(childLogger).toBeDefined();
    expect(typeof childLogger.info).toBe('function');
  });

  it('should initialize logger', () => {
    const logger = initLogger();

    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe('function');
  });

  it('should handle complex context objects', () => {
    const context = createLogContext({
      requestId: 'req-789',
      agentAddress: '0x7890',
      tool: 'slack',
      action: 'create',
      latencyMs: 256,
      auditTx: '0xdef456',
      chainId: 8453,
    });

    const logger = getLoggerWithContext('test:complex', context);

    expect(logger).toBeDefined();
    logger.info({ additionalData: 'test' }, 'Complex context log');
  });
});
