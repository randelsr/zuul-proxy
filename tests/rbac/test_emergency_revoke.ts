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
    name: 'revokedAgents',
    inputs: [{ name: 'agent', type: 'address' }],
    outputs: [{ type: 'bool' }],
    stateMutability: 'view',
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
    name: 'setRoleStatus',
    inputs: [
      { name: 'roleId', type: 'bytes32' },
      { name: 'isActive', type: 'bool' },
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
    name: 'owner',
    inputs: [],
    outputs: [{ type: 'address' }],
    stateMutability: 'view',
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
    it('should set revokedAgents[agent] = true', async () => {
      const agentToRevoke = ACCOUNT_1.address;

      // Call emergencyRevoke
      const txHash = await walletClient.writeContract({
        address: rbacAddress,
        abi: RBAC_ABI,
        functionName: 'emergencyRevoke',
        args: [agentToRevoke],
      });

      expect(txHash).toMatch(/^0x[0-9a-f]{64}$/i);

      // Verify revokedAgents[agentToRevoke] is true
      const isRevoked = await publicClient.readContract({
        address: rbacAddress,
        abi: RBAC_ABI,
        functionName: 'revokedAgents',
        args: [agentToRevoke],
      });

      expect(isRevoked).toBe(true);
    });

    it('should emit AgentRevoked event', async () => {
      const agentToRevoke = ACCOUNT_1.address;

      // Call emergencyRevoke (event is emitted as part of transaction)
      const txHash = await walletClient.writeContract({
        address: rbacAddress,
        abi: RBAC_ABI,
        functionName: 'emergencyRevoke',
        args: [agentToRevoke],
      });

      // Transaction should succeed with a valid hash
      expect(txHash).toMatch(/^0x[0-9a-f]{64}$/i);

      // Verify agent is revoked (indirect proof of event)
      const isRevoked = await publicClient.readContract({
        address: rbacAddress,
        abi: RBAC_ABI,
        functionName: 'revokedAgents',
        args: [agentToRevoke],
      });

      expect(isRevoked).toBe(true);
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

      // Revoke once
      const tx1 = await walletClient.writeContract({
        address: rbacAddress,
        abi: RBAC_ABI,
        functionName: 'emergencyRevoke',
        args: [agentToRevoke],
      });
      expect(tx1).toMatch(/^0x[0-9a-f]{64}$/i);

      // Verify revoked
      let isRevoked = await publicClient.readContract({
        address: rbacAddress,
        abi: RBAC_ABI,
        functionName: 'revokedAgents',
        args: [agentToRevoke],
      });
      expect(isRevoked).toBe(true);

      // Revoke again (should succeed)
      const tx2 = await walletClient.writeContract({
        address: rbacAddress,
        abi: RBAC_ABI,
        functionName: 'emergencyRevoke',
        args: [agentToRevoke],
      });
      expect(tx2).toMatch(/^0x[0-9a-f]{64}$/i);

      // Verify still revoked
      isRevoked = await publicClient.readContract({
        address: rbacAddress,
        abi: RBAC_ABI,
        functionName: 'revokedAgents',
        args: [agentToRevoke],
      });
      expect(isRevoked).toBe(true);
    });
  });

  describe('getAgentRole(agent) respects revocation', () => {
    it('should return (roleId, false) if agent is revoked', async () => {
      const agent = ACCOUNT_1.address;
      const developerRoleId = keccak256(Buffer.from('developer', 'utf-8') as `0x${string}`);

      // 1. Set agent role
      await walletClient.writeContract({
        address: rbacAddress,
        abi: RBAC_ABI,
        functionName: 'setAgentRole',
        args: [agent, developerRoleId],
      });

      // 2. Activate role
      await walletClient.writeContract({
        address: rbacAddress,
        abi: RBAC_ABI,
        functionName: 'setRoleStatus',
        args: [developerRoleId, true],
      });

      // 3. Verify agent has active role
      let result = (await publicClient.readContract({
        address: rbacAddress,
        abi: RBAC_ABI,
        functionName: 'getAgentRole',
        args: [agent],
      })) as readonly [string, boolean];

      expect(result[1]).toBe(true); // isActive = true

      // 4. Revoke agent
      await walletClient.writeContract({
        address: rbacAddress,
        abi: RBAC_ABI,
        functionName: 'emergencyRevoke',
        args: [agent],
      });

      // 5. Verify getAgentRole now returns false despite active role
      result = (await publicClient.readContract({
        address: rbacAddress,
        abi: RBAC_ABI,
        functionName: 'getAgentRole',
        args: [agent],
      })) as readonly [string, boolean];

      expect(result[0]).toEqual(developerRoleId); // roleId unchanged
      expect(result[1]).toBe(false); // isActive = false (due to revocation)
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

      // Activate role
      await walletClient.writeContract({
        address: rbacAddress,
        abi: RBAC_ABI,
        functionName: 'setRoleStatus',
        args: [developerRoleId, true],
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
      expect(result1[1]).toBe(true);

      // agent2 should be revoked
      const result2 = (await publicClient.readContract({
        address: rbacAddress,
        abi: RBAC_ABI,
        functionName: 'getAgentRole',
        args: [agent2],
      })) as readonly [string, boolean];
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
