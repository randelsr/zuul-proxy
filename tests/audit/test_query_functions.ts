import { describe, it, expect, beforeEach } from 'vitest';
import { createPublicClient, createWalletClient, http, keccak256 } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { AUDIT_ABI } from '../../src/contracts/abis.js';

// Hardhat test accounts with known private keys
const ACCOUNT_0 = privateKeyToAccount(
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
);
const ACCOUNT_1 = privateKeyToAccount(
  '0x7797c0f3db8b946604ec2039dfd9763e4ffdc53174342a2ed9b14fa3eda666a5'
);

const RPC_URL = 'http://127.0.0.1:8545';
const AUDIT_ADDRESS = process.env.AUDIT_CONTRACT_ADDRESS || '0x0';

/**
 * Audit Contract Query Functions Integration Tests (Story #12, #13)
 *
 * NOTE: These tests require:
 * 1. Hardhat node running: pnpm contracts:dev
 * 2. Contracts deployed: pnpm contracts:deploy:local
 * 3. Environment variables set: AUDIT_CONTRACT_ADDRESS
 *
 * To run these tests:
 * pnpm contracts:dev &  # Start Hardhat in background
 * pnpm contracts:deploy:local
 * pnpm test tests/audit/test_query_functions.ts
 */
describe.skip('Audit Contract Query Functions (Stories #12, #13)', () => {
  let publicClient;
  let walletClient;
  let auditAddress: `0x${string}`;

  beforeEach(() => {
    publicClient = createPublicClient({ transport: http(RPC_URL) });
    walletClient = createWalletClient({
      account: ACCOUNT_0,
      transport: http(RPC_URL),
    });
    auditAddress = AUDIT_ADDRESS as `0x${string}`;
  });

  describe('getEntriesByAgent', () => {
    it('should return entries for a specific agent', async () => {
      const agent = ACCOUNT_1.address;
      const payloadHash = keccak256('0x' + Buffer.from('test_payload').toString('hex') as `0x${string}`);

      // Record 3 entries for this agent
      for (let i = 0; i < 3; i++) {
        const payload = Buffer.from(JSON.stringify({ test: i }));
        await walletClient.writeContract({
          address: auditAddress,
          abi: AUDIT_ABI,
          functionName: 'recordEntry',
          args: [agent, payload, payloadHash],
        });
      }

      // Query agent entries with pagination
      const result = (await publicClient.readContract({
        address: auditAddress,
        abi: AUDIT_ABI,
        functionName: 'getEntriesByAgent',
        args: [agent, 0n, 10n],
      })) as unknown[];

      expect(result).toHaveLength(3);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((result as any[]).every((e) => e.agent === agent)).toBe(true);
    });

    it('should respect pagination offset and limit', async () => {
      const agent = ACCOUNT_0.address;

      // Record 5 entries
      for (let i = 0; i < 5; i++) {
        const payload = Buffer.from(JSON.stringify({ test: i }));
        const payloadHash = keccak256(('0x' + Buffer.from(`test_${i}`).toString('hex')) as `0x${string}`);
        await walletClient.writeContract({
          address: auditAddress,
          abi: AUDIT_ABI,
          functionName: 'recordEntry',
          args: [agent, payload, payloadHash],
        });
      }

      // Query with offset=2, limit=2
      const result = (await publicClient.readContract({
        address: auditAddress,
        abi: AUDIT_ABI,
        functionName: 'getEntriesByAgent',
        args: [agent, 2n, 2n],
      })) as unknown[];

      expect(result).toHaveLength(2);
    });

    it('should return empty array if agent has no entries', async () => {
      const agent = '0xdead000000000000000000000000000000000000' as `0x${string}`;

      const result = (await publicClient.readContract({
        address: auditAddress,
        abi: AUDIT_ABI,
        functionName: 'getEntriesByAgent',
        args: [agent, 0n, 10n],
      })) as unknown[];

      expect(result).toHaveLength(0);
    });
  });

  describe.skip('getEntriesByTool', () => {
    it('should return entries for a specific tool', async () => {
      const agents = [ACCOUNT_0.address, ACCOUNT_1.address];

      // Record entries for different agents but same tool (encrypted in payload)
      for (const agent of agents) {
        const payload = Buffer.from(JSON.stringify({ agent }));
        const payloadHash = keccak256(('0x' + Buffer.from(agent).toString('hex')) as `0x${string}`);
        await walletClient.writeContract({
          address: auditAddress,
          abi: AUDIT_ABI,
          functionName: 'recordEntry',
          args: [agent, payload, payloadHash],
        });
      }

      // Query tool entries
      // NOTE: This test is skipped because tool is encrypted in the payload
      // const result = (await publicClient.readContract({
      //   address: auditAddress,
      //   abi: AUDIT_ABI,
      //   functionName: 'getEntriesByTool',
      //   args: [tool, 0n, 10n],
      // })) as unknown[];
      const result: unknown[] = [];

      expect(result.length).toBeGreaterThanOrEqual(agents.length);
      // NOTE: tool is encrypted in payload, not a direct field
      // expect((result as any[]).every((e) => e.tool === tool)).toBe(true);
    });
  });

  describe('getEntriesByTimeRange', () => {
    it('should return entries within time range', async () => {
      const agent = ACCOUNT_0.address;

      // Record an entry (timestamp is set by block.timestamp)
      const payload = Buffer.from(JSON.stringify({ test: 'data' }));
      const payloadHash = keccak256('0x' + Buffer.from('test').toString('hex') as `0x${string}`);
      await walletClient.writeContract({
        address: auditAddress,
        abi: AUDIT_ABI,
        functionName: 'recordEntry',
        args: [agent, payload, payloadHash],
      });

      const now = Math.floor(Date.now() / 1000);

      // Query entries in range (past hour to future)
      const result = (await publicClient.readContract({
        address: auditAddress,
        abi: AUDIT_ABI,
        functionName: 'getEntriesByTimeRange',
        args: [BigInt(now - 3600), BigInt(now + 3600), 0n, 100n],
      })) as unknown[];

      expect(result.length).toBeGreaterThanOrEqual(1);
    });

    it('should return empty array if no entries in range', async () => {
      const now = Math.floor(Date.now() / 1000);

      // Query far future range
      const result = (await publicClient.readContract({
        address: auditAddress,
        abi: AUDIT_ABI,
        functionName: 'getEntriesByTimeRange',
        args: [BigInt(now + 10000), BigInt(now + 20000), 0n, 100n],
      })) as unknown[];

      expect(result).toHaveLength(0);
    });
  });

  describe('Count functions', () => {
    it('getAgentEntryCount should return correct count', async () => {
      const agent = '0xcafe000000000000000000000000000000000000' as `0x${string}`;

      // Record 5 entries
      for (let i = 0; i < 5; i++) {
        const payload = Buffer.from(JSON.stringify({ test: i }));
        const payloadHash = keccak256(('0x' + Buffer.from(`count_${i}`).toString('hex')) as `0x${string}`);
        await walletClient.writeContract({
          address: auditAddress,
          abi: AUDIT_ABI,
          functionName: 'recordEntry',
          args: [agent, payload, payloadHash],
        });
      }

      const count = (await publicClient.readContract({
        address: auditAddress,
        abi: AUDIT_ABI,
        functionName: 'getAgentEntryCount',
        args: [agent],
      })) as unknown;

      expect(Number(count)).toBeGreaterThanOrEqual(5);
    });

    it('getEntryCount should return total count', async () => {
      const initialCount = (await publicClient.readContract({
        address: auditAddress,
        abi: AUDIT_ABI,
        functionName: 'getEntryCount',
        args: [],
      })) as unknown;

      const agent = ACCOUNT_0.address;
      const payload = Buffer.from(JSON.stringify({ test: 'data' }));
      const payloadHash = keccak256('0x' + Buffer.from('total_test').toString('hex') as `0x${string}`);

      // Record 2 more entries
      for (let i = 0; i < 2; i++) {
        await walletClient.writeContract({
          address: auditAddress,
          abi: AUDIT_ABI,
          functionName: 'recordEntry',
          args: [agent, payload, payloadHash],
        });
      }

      const newCount = (await publicClient.readContract({
        address: auditAddress,
        abi: AUDIT_ABI,
        functionName: 'getEntryCount',
        args: [],
      })) as unknown;

      expect(Number(newCount)).toBeGreaterThan(Number(initialCount));
    });
  });

  describe('Pagination safety', () => {
    it('should reject limit > 100', async () => {
      const agent = ACCOUNT_0.address;

      try {
        await publicClient.readContract({
          address: auditAddress,
          abi: AUDIT_ABI,
          functionName: 'getEntriesByAgent',
          args: [agent, 0n, 101n], // limit > 100
        });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(String(error)).toMatch(/Limit must be/i);
      }
    });

    it('should handle offset beyond array length gracefully', async () => {
      const agent = ACCOUNT_0.address;

      // Query with offset beyond length
      const result = (await publicClient.readContract({
        address: auditAddress,
        abi: AUDIT_ABI,
        functionName: 'getEntriesByAgent',
        args: [agent, 100n, 10n],
      })) as unknown[];

      expect(result).toHaveLength(0);
    });
  });
});
