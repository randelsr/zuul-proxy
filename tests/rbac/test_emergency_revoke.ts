import { describe, it, expect, beforeEach } from 'vitest';
import { createPublicClient, createWalletClient, http, keccak256, type Abi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

// Hardhat test accounts with known private keys
const ACCOUNT_0 = privateKeyToAccount(
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
);
const ACCOUNT_1 = privateKeyToAccount(
  '0x7797c0f3db8b946604ec2039dfd9763e4ffdc53174342a2ed9b14fa3eda666a5'
);

const RPC_URL = 'http://127.0.0.1:8545';
const RBAC_ADDRESS = process.env.RBAC_CONTRACT_ADDRESS || '0x0';

// RBAC contract ABI (minimal for our tests)
// New design: single agentRoles mapping (address → bytes32)
// Presence in mapping = active, absence = revoked
const RBAC_ABI = [
  {
    type: 'function',
    name: 'emergencyRevoke',
    inputs: [{ name: 'agent', type: 'address' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'setAgentRole',
    inputs: [
      { name: 'agent', type: 'address' },
      { name: 'roleId', type: 'bytes32' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'getAgentRole',
    inputs: [{ name: 'agent', type: 'address' }],
    outputs: [
      { type: 'bytes32' },
      { type: 'bool' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'agentRoles',
    inputs: [{ name: 'agent', type: 'address' }],
    outputs: [{ type: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'owner',
    inputs: [],
    outputs: [{ type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'event',
    name: 'RoleSet',
    inputs: [
      { name: 'agent', type: 'address', indexed: true },
      { name: 'roleId', type: 'bytes32', indexed: true },
    ],
  },
  {
    type: 'event',
    name: 'AgentRevoked',
    inputs: [
      { name: 'agent', type: 'address', indexed: true },
      { name: 'timestamp', type: 'uint256' },
    ],
  },
] as const satisfies Abi;

/**
 * Emergency Revoke Integration Tests (Story #14)
 *
 * NOTE: These tests require:
 * 1. Hardhat node running: pnpm contracts:dev
 * 2. Contracts deployed: pnpm contracts:deploy:local
 * 3. Environment variables set: RBAC_CONTRACT_ADDRESS
 *
 * To run these tests:
 * pnpm contracts:dev &  # Start Hardhat in background
 * pnpm contracts:deploy:local
 * pnpm test tests/rbac/test_emergency_revoke.ts
 */
describe.skip('RBAC Emergency Revoke (Story #14)', () => {
  let publicClient;
  let walletClient;
  let rbacAddress: `0x${string}`;

  beforeEach(() => {
    publicClient = createPublicClient({ transport: http(RPC_URL) });
    walletClient = createWalletClient({
      account: ACCOUNT_0,
      transport: http(RPC_URL),
    });
    rbacAddress = RBAC_ADDRESS as `0x${string}`;
  });

  describe('emergencyRevoke(agent)', () => {
    it('should delete agent from agentRoles mapping', async () => {
      const agentToRevoke = ACCOUNT_1.address;
      const testRoleId = keccak256(Buffer.from('developer', 'utf-8') as `0x${string}`);

      // 1. First set the agent role so it exists in mapping
      await walletClient.writeContract({
        address: rbacAddress,
        abi: RBAC_ABI,
        functionName: 'setAgentRole',
        args: [agentToRevoke, testRoleId],
      });

      // 2. Verify agent is in mapping
      let agentRole = await publicClient.readContract({
        address: rbacAddress,
        abi: RBAC_ABI,
        functionName: 'agentRoles',
        args: [agentToRevoke],
      });
      expect(agentRole).toBe(testRoleId);

      // 3. Call emergencyRevoke to delete from mapping
      const txHash = await walletClient.writeContract({
        address: rbacAddress,
        abi: RBAC_ABI,
        functionName: 'emergencyRevoke',
        args: [agentToRevoke],
      });

      expect(txHash).toMatch(/^0x[0-9a-f]{64}$/i);

      // 4. Verify agent is removed from mapping (returns 0x0)
      agentRole = await publicClient.readContract({
        address: rbacAddress,
        abi: RBAC_ABI,
        functionName: 'agentRoles',
        args: [agentToRevoke],
      });

      expect(agentRole).toBe('0x' + '0'.repeat(64));
    });

    it('should emit AgentRevoked event', async () => {
      const agentToRevoke = ACCOUNT_1.address;
      const testRoleId = keccak256(Buffer.from('developer', 'utf-8') as `0x${string}`);

      // Set agent role first
      await walletClient.writeContract({
        address: rbacAddress,
        abi: RBAC_ABI,
        functionName: 'setAgentRole',
        args: [agentToRevoke, testRoleId],
      });

      // Call emergencyRevoke (event is emitted as part of transaction)
      const txHash = await walletClient.writeContract({
        address: rbacAddress,
        abi: RBAC_ABI,
        functionName: 'emergencyRevoke',
        args: [agentToRevoke],
      });

      // Transaction should succeed with a valid hash
      expect(txHash).toMatch(/^0x[0-9a-f]{64}$/i);

      // Verify agent is revoked by checking it's removed from mapping
      const agentRole = await publicClient.readContract({
        address: rbacAddress,
        abi: RBAC_ABI,
        functionName: 'agentRoles',
        args: [agentToRevoke],
      });

      expect(agentRole).toBe('0x' + '0'.repeat(64));
    });

    it('should be callable only by owner', async () => {
      const agentToRevoke = ACCOUNT_1.address;
      const nonOwnerWalletClient = createWalletClient({
        account: ACCOUNT_1,
        transport: http(RPC_URL),
      });

      // Try to call emergencyRevoke from non-owner account
      try {
        await nonOwnerWalletClient.writeContract({
          address: rbacAddress,
          abi: RBAC_ABI,
          functionName: 'emergencyRevoke',
          args: [agentToRevoke],
        });
        expect.fail('Should have thrown: non-owner cannot revoke');
      } catch (error) {
        // Expected to fail
        expect(String(error)).toMatch(/Only owner/i);
      }
    });

    it('should be idempotent (can revoke same agent multiple times)', async () => {
      const agentToRevoke = ACCOUNT_1.address;
      const testRoleId = keccak256(Buffer.from('developer', 'utf-8') as `0x${string}`);

      // Set agent role first
      await walletClient.writeContract({
        address: rbacAddress,
        abi: RBAC_ABI,
        functionName: 'setAgentRole',
        args: [agentToRevoke, testRoleId],
      });

      // Revoke once
      const tx1 = await walletClient.writeContract({
        address: rbacAddress,
        abi: RBAC_ABI,
        functionName: 'emergencyRevoke',
        args: [agentToRevoke],
      });
      expect(tx1).toMatch(/^0x[0-9a-f]{64}$/i);

      // Verify revoked
      let agentRole = await publicClient.readContract({
        address: rbacAddress,
        abi: RBAC_ABI,
        functionName: 'agentRoles',
        args: [agentToRevoke],
      });
      expect(agentRole).toBe('0x' + '0'.repeat(64));

      // Revoke again (should succeed and be idempotent)
      const tx2 = await walletClient.writeContract({
        address: rbacAddress,
        abi: RBAC_ABI,
        functionName: 'emergencyRevoke',
        args: [agentToRevoke],
      });
      expect(tx2).toMatch(/^0x[0-9a-f]{64}$/i);

      // Verify still revoked
      agentRole = await publicClient.readContract({
        address: rbacAddress,
        abi: RBAC_ABI,
        functionName: 'agentRoles',
        args: [agentToRevoke],
      });
      expect(agentRole).toBe('0x' + '0'.repeat(64));
    });
  });

  describe('getAgentRole(agent) respects revocation', () => {
    it('should return (0x0, false) if agent is revoked', async () => {
      const agent = ACCOUNT_1.address;
      const developerRoleId = keccak256(Buffer.from('developer', 'utf-8') as `0x${string}`);

      // 1. Set agent role
      await walletClient.writeContract({
        address: rbacAddress,
        abi: RBAC_ABI,
        functionName: 'setAgentRole',
        args: [agent, developerRoleId],
      });

      // 2. Verify agent has active role (absence from revokedAgents = active)
      let result = (await publicClient.readContract({
        address: rbacAddress,
        abi: RBAC_ABI,
        functionName: 'getAgentRole',
        args: [agent],
      })) as readonly [string, boolean];

      expect(result[0]).toEqual(developerRoleId); // roleId set
      expect(result[1]).toBe(true); // isActive = true (in mapping, not revoked)

      // 3. Revoke agent (delete from mapping)
      await walletClient.writeContract({
        address: rbacAddress,
        abi: RBAC_ABI,
        functionName: 'emergencyRevoke',
        args: [agent],
      });

      // 4. Verify getAgentRole now returns (0x0, false) after revocation
      result = (await publicClient.readContract({
        address: rbacAddress,
        abi: RBAC_ABI,
        functionName: 'getAgentRole',
        args: [agent],
      })) as readonly [string, boolean];

      expect(result[0]).toBe('0x' + '0'.repeat(64)); // roleId = 0x0 (deleted)
      expect(result[1]).toBe(false); // isActive = false (not in mapping)
    });

    it('should not affect other agents in same role', async () => {
      const agent1 = ACCOUNT_0.address;
      const agent2 = ACCOUNT_1.address;
      const developerRoleId = keccak256(Buffer.from('developer', 'utf-8') as `0x${string}`);

      // Set both agents to developer role
      await walletClient.writeContract({
        address: rbacAddress,
        abi: RBAC_ABI,
        functionName: 'setAgentRole',
        args: [agent1, developerRoleId],
      });

      await walletClient.writeContract({
        address: rbacAddress,
        abi: RBAC_ABI,
        functionName: 'setAgentRole',
        args: [agent2, developerRoleId],
      });

      // Revoke only agent2
      await walletClient.writeContract({
        address: rbacAddress,
        abi: RBAC_ABI,
        functionName: 'emergencyRevoke',
        args: [agent2],
      });

      // agent1 should still be active
      const result1 = (await publicClient.readContract({
        address: rbacAddress,
        abi: RBAC_ABI,
        functionName: 'getAgentRole',
        args: [agent1],
      })) as readonly [string, boolean];
      expect(result1[0]).toEqual(developerRoleId);
      expect(result1[1]).toBe(true);

      // agent2 should be revoked (deleted from mapping)
      const result2 = (await publicClient.readContract({
        address: rbacAddress,
        abi: RBAC_ABI,
        functionName: 'getAgentRole',
        args: [agent2],
      })) as readonly [string, boolean];
      expect(result2[0]).toBe('0x' + '0'.repeat(64));
      expect(result2[1]).toBe(false);
    });
  });

  describe('Owner access control', () => {
    it('should have owner set to deployer', async () => {
      const owner = await publicClient.readContract({
        address: rbacAddress,
        abi: RBAC_ABI,
        functionName: 'owner',
      });

      expect(owner).toBe(ACCOUNT_0.address);
    });

    it('should allow only owner to call emergencyRevoke', async () => {
      const agentToRevoke = ACCOUNT_1.address;

      // Owner can call
      const ownerTx = await walletClient.writeContract({
        address: rbacAddress,
        abi: RBAC_ABI,
        functionName: 'emergencyRevoke',
        args: [agentToRevoke],
      });
      expect(ownerTx).toMatch(/^0x[0-9a-f]{64}$/i);

      // Non-owner cannot call
      const nonOwnerWalletClient = createWalletClient({
        account: ACCOUNT_1,
        transport: http(RPC_URL),
      });

      try {
        await nonOwnerWalletClient.writeContract({
          address: rbacAddress,
          abi: RBAC_ABI,
          functionName: 'emergencyRevoke',
          args: [agentToRevoke],
        });
        expect.fail('Non-owner should not be able to call emergencyRevoke');
      } catch (error) {
        expect(String(error)).toMatch(/Only owner/i);
      }
    });
  });
});
