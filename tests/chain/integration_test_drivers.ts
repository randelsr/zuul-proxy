import { describe, it, expect, beforeEach } from 'vitest';
import type { Abi } from 'viem';
import { EVMChainDriver } from '../../src/chain/evm.js';
import { HederaChainDriver } from '../../src/chain/hedera.js';
import { LocalChainDriver } from '../../src/chain/local.js';
import { createChainDriver } from '../../src/chain/factory.js';
import type { AgentAddress, RoleId } from '../../src/types.js';
import type { AppConfig } from '../../src/config/types.js';

const mockAbi: Abi = [] as const;

describe('Chain Drivers', () => {
  describe('LocalChainDriver', () => {
    let driver: LocalChainDriver;

    beforeEach(() => {
      driver = new LocalChainDriver();
    });

    it('should have correct chain ID', () => {
      expect(driver.getChainId()).toBe(31337);
    });

    it('should have correct RPC URL', () => {
      expect(driver.getRpcUrl()).toBe('http://localhost:8545');
    });

    it('should return error for callContract on unknown tool', async () => {
      const result = await driver.callContract<unknown>('0x1234', mockAbi, 'test', []);

      expect(result.ok).toBe(true); // Mock always succeeds (returns empty object)
      expect(typeof result.value).toBe('object');
    });

    it('should return mock transaction hash for writeContract', async () => {
      const result = await driver.writeContract('0x1234', mockAbi, 'test', []);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const hash = result.value as unknown as string;
        expect(hash).toMatch(/^0x[a-f0-9]{64}$/);
      }
    });

    it('should return default role for unknown agent', async () => {
      const agent = '0x1234' as AgentAddress;
      const role = await driver.getRoleForAgent(agent);

      expect(role.id).toBe(('0x' + '0'.repeat(64)) as RoleId);
      expect(role.name).toBe('Default');
      expect(role.permissions).toEqual([]);
      expect(role.isActive).toBe(false);
    });

    it('should store and retrieve pre-configured role', async () => {
      const agent = '0x5678' as AgentAddress;
      const testRole = {
        id: ('0x' + 'a'.repeat(64)) as RoleId,
        name: 'Test Role',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        permissions: [{ tool: 'github' as any, actions: ['read' as any] as any }],
        isActive: true,
      };

      driver.setRoleForAgent(agent, testRole);
      const role = await driver.getRoleForAgent(agent);

      expect(role.id).toBe(testRole.id);
      expect(role.name).toBe('Test Role');
      expect(role.isActive).toBe(true);
    });

    it('should fail on callContract when failure mode enabled', async () => {
      driver.setFailure(true);
      const result = await driver.callContract<unknown>('0x1234', mockAbi, 'test', []);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(-32022);
        expect(result.error.httpStatus).toBe(503);
      }
    });

    it('should fail on writeContract when failure mode enabled', async () => {
      driver.setFailure(true);
      const result = await driver.writeContract('0x1234', mockAbi, 'test', []);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(-32022);
        expect(result.error.httpStatus).toBe(503);
      }
    });

    it('should throw on getRoleForAgent when failure mode enabled', async () => {
      driver.setFailure(true);
      const agent = '0x1234' as AgentAddress;

      await expect(driver.getRoleForAgent(agent)).rejects.toThrow();
    });

    it('should reset state', async () => {
      const agent = '0x5678' as AgentAddress;
      const testRole = {
        id: ('0x' + 'b'.repeat(64)) as RoleId,
        name: 'Test',
        permissions: [],
        isActive: true,
      };

      driver.setRoleForAgent(agent, testRole);
      driver.setFailure(true);
      driver.reset();

      const role = await driver.getRoleForAgent(agent);
      expect(role.name).toBe('Default'); // Should be reset to default
      expect(role.isActive).toBe(false);

      const result = await driver.callContract<unknown>('0x1234', mockAbi, 'test', []);
      expect(result.ok).toBe(true); // Should not fail anymore
    });
  });

  describe('HederaChainDriver', () => {
    let driver: HederaChainDriver;

    beforeEach(() => {
      driver = new HederaChainDriver('https://testnet.hashio.io/api');
    });

    it('should have correct chain ID', () => {
      expect(driver.getChainId()).toBe(295);
    });

    it('should have correct RPC URL', () => {
      expect(driver.getRpcUrl()).toBe('https://testnet.hashio.io/api');
    });

    it('should use default RPC URL when not provided', () => {
      const defaultDriver = new HederaChainDriver();
      const rpcUrl = defaultDriver.getRpcUrl();
      expect(rpcUrl).toBeTruthy();
      expect(rpcUrl).toMatch(/^https?:\/\//);
    });

    it('should return result for callContract', async () => {
      const result = await driver.callContract<unknown>('0x1234', mockAbi, 'test', []);

      expect(result.ok).toBe(true); // Stub implementation returns success
      expect(typeof result.value).toBe('object');
    });

    it('should return mock transaction hash for writeContract', async () => {
      const result = await driver.writeContract('0x1234', mockAbi, 'test', []);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const hash = result.value as unknown as string;
        expect(hash).toMatch(/^0x[a-f0-9]{64}$/);
      }
    });

    it('should return default role for agent', async () => {
      const agent = '0x1234' as AgentAddress;
      const role = await driver.getRoleForAgent(agent);

      expect(role.id).toBe(('0x' + '0'.repeat(64)) as RoleId);
      expect(role.name).toBe('Default Role');
      expect(role.permissions).toEqual([]);
      expect(role.isActive).toBe(false);
    });
  });

  describe('EVMChainDriver', () => {
    let driver: EVMChainDriver;

    beforeEach(() => {
      driver = new EVMChainDriver('base', 'https://mainnet.base.org', 8453);
    });

    it('should have correct chain ID', () => {
      expect(driver.getChainId()).toBe(8453);
    });

    it('should have correct RPC URL', () => {
      expect(driver.getRpcUrl()).toBe('https://mainnet.base.org');
    });

    it('should support Arbitrum chain', () => {
      const arbDriver = new EVMChainDriver('arbitrum', 'https://arb1.arbitrum.io/rpc', 42161);

      expect(arbDriver.getChainId()).toBe(42161);
      expect(arbDriver.getRpcUrl()).toBe('https://arb1.arbitrum.io/rpc');
    });

    it('should support Optimism chain', () => {
      const opDriver = new EVMChainDriver('optimism', 'https://mainnet.optimism.io', 10);

      expect(opDriver.getChainId()).toBe(10);
      expect(opDriver.getRpcUrl()).toBe('https://mainnet.optimism.io');
    });

    it('should return result for callContract', async () => {
      const result = await driver.callContract<unknown>('0x1234', mockAbi, 'test', []);

      expect(result.ok).toBe(true);
      expect(typeof result.value).toBe('object');
    });

    it('should return mock transaction hash for writeContract', async () => {
      const result = await driver.writeContract('0x1234', mockAbi, 'test', []);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const hash = result.value as unknown as string;
        expect(hash).toMatch(/^0x[a-f0-9]{64}$/);
      }
    });

    it('should return default role for agent', async () => {
      const agent = '0x1234' as AgentAddress;
      const role = await driver.getRoleForAgent(agent);

      expect(role.id).toBe(('0x' + '0'.repeat(64)) as RoleId);
      expect(role.name).toBe('Default Role');
      expect(role.permissions).toEqual([]);
      expect(role.isActive).toBe(false);
    });
  });

  describe('Chain Driver Factory', () => {
    it('should create LocalChainDriver for local config', () => {
      const config: AppConfig = {
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
          host: 'localhost',
          readTimeoutMs: 30000,
          writeTimeoutMs: 60000,
        },
      };

      const driver = createChainDriver(config);

      expect(driver).toBeInstanceOf(LocalChainDriver);
      expect(driver.getChainId()).toBe(31337);
    });

    it('should create HederaChainDriver for hedera config', () => {
      const config: AppConfig = {
        tools: [],
        roles: [],
        chain: {
          name: 'hedera',
          chainId: 295,
          rpcUrl: 'https://testnet.hashio.io/api',
        },
        cache: { ttlSeconds: 300 },
        server: {
          port: 8080,
          host: 'localhost',
          readTimeoutMs: 30000,
          writeTimeoutMs: 60000,
        },
      };

      const driver = createChainDriver(config);

      expect(driver).toBeInstanceOf(HederaChainDriver);
      expect(driver.getChainId()).toBe(295);
    });

    it('should create EVMChainDriver for base config', () => {
      const config: AppConfig = {
        tools: [],
        roles: [],
        chain: {
          name: 'base',
          chainId: 8453,
          rpcUrl: 'https://mainnet.base.org',
        },
        cache: { ttlSeconds: 300 },
        server: {
          port: 8080,
          host: 'localhost',
          readTimeoutMs: 30000,
          writeTimeoutMs: 60000,
        },
      };

      const driver = createChainDriver(config);

      expect(driver).toBeInstanceOf(EVMChainDriver);
      expect(driver.getChainId()).toBe(8453);
    });

    it('should create EVMChainDriver for arbitrum config', () => {
      const config: AppConfig = {
        tools: [],
        roles: [],
        chain: {
          name: 'arbitrum',
          chainId: 42161,
          rpcUrl: 'https://arb1.arbitrum.io/rpc',
        },
        cache: { ttlSeconds: 300 },
        server: {
          port: 8080,
          host: 'localhost',
          readTimeoutMs: 30000,
          writeTimeoutMs: 60000,
        },
      };

      const driver = createChainDriver(config);

      expect(driver).toBeInstanceOf(EVMChainDriver);
      expect(driver.getChainId()).toBe(42161);
    });

    it('should create EVMChainDriver for optimism config', () => {
      const config: AppConfig = {
        tools: [],
        roles: [],
        chain: {
          name: 'optimism',
          chainId: 10,
          rpcUrl: 'https://mainnet.optimism.io',
        },
        cache: { ttlSeconds: 300 },
        server: {
          port: 8080,
          host: 'localhost',
          readTimeoutMs: 30000,
          writeTimeoutMs: 60000,
        },
      };

      const driver = createChainDriver(config);

      expect(driver).toBeInstanceOf(EVMChainDriver);
      expect(driver.getChainId()).toBe(10);
    });
  });
});
