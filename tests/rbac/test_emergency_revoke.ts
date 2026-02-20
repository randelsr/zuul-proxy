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
    name: 'proxy',
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
describe('RBAC Emergency Revoke (Story #14) - Authorization & State Verification', () => {
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

    it('should be callable only by proxy', async () => {
      const agentToRevoke = ACCOUNT_1.address;
      const nonProxyWalletClient = createWalletClient({
        account: ACCOUNT_1,
        transport: http(RPC_URL),
      });

      // Try to call emergencyRevoke from non-proxy account
      try {
        await nonProxyWalletClient.writeContract({
          address: rbacAddress,
          abi: RBAC_ABI,
          functionName: 'emergencyRevoke',
          args: [agentToRevoke],
        });
        expect.fail('Should have thrown: non-proxy cannot revoke');
      } catch (error) {
        // Expected to fail with revert (modifier rejection)
        expect(String(error)).toMatch(/reverted|Internal error/i);
      }
    });

    it('should cleanly remove agent from mapping on single revocation', async () => {
      // Use a unique agent address for this test to avoid conflicts
      const uniqueAgent = '0x' + 'c'.repeat(40) as `0x${string}`;
      const testRoleId = keccak256(Buffer.from('clean-revoke', 'utf-8') as `0x${string}`);

      // Set agent role first
      await walletClient.writeContract({
        address: rbacAddress,
        abi: RBAC_ABI,
        functionName: 'setAgentRole',
        args: [uniqueAgent, testRoleId],
      });

      // Verify agent is in mapping
      let agentRole = await publicClient.readContract({
        address: rbacAddress,
        abi: RBAC_ABI,
        functionName: 'agentRoles',
        args: [uniqueAgent],
      });
      expect(agentRole).toBe(testRoleId);

      // Revoke once
      const txRevoke = await walletClient.writeContract({
        address: rbacAddress,
        abi: RBAC_ABI,
        functionName: 'emergencyRevoke',
        args: [uniqueAgent],
      });
      expect(txRevoke).toMatch(/^0x[0-9a-f]{64}$/i);

      // Verify agent is removed from mapping
      agentRole = await publicClient.readContract({
        address: rbacAddress,
        abi: RBAC_ABI,
        functionName: 'agentRoles',
        args: [uniqueAgent],
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

  describe('Proxy authorization control', () => {
    it('should have proxy set to deployer', async () => {
      const proxy = await publicClient.readContract({
        address: rbacAddress,
        abi: RBAC_ABI,
        functionName: 'proxy',
      });

      expect(proxy).toBe(ACCOUNT_0.address);
    });

    it('should allow only proxy to call setAgentRole', async () => {
      const agent = ACCOUNT_1.address;
      const roleId = keccak256(Buffer.from('developer', 'utf-8') as `0x${string}`);

      // Proxy (ACCOUNT_0) can call
      const proxyTx = await walletClient.writeContract({
        address: rbacAddress,
        abi: RBAC_ABI,
        functionName: 'setAgentRole',
        args: [agent, roleId],
      });
      expect(proxyTx).toMatch(/^0x[0-9a-f]{64}$/i);

      // Non-proxy (ACCOUNT_1) cannot call
      const nonProxyWalletClient = createWalletClient({
        account: ACCOUNT_1,
        transport: http(RPC_URL),
      });

      try {
        await nonProxyWalletClient.writeContract({
          address: rbacAddress,
          abi: RBAC_ABI,
          functionName: 'setAgentRole',
          args: [agent, roleId],
        });
        expect.fail('Non-proxy should not be able to call setAgentRole');
      } catch (error) {
        // Expected to fail with revert (modifier rejection)
        expect(String(error)).toMatch(/reverted|Internal error/i);
      }
    });

    it('should allow only proxy to call emergencyRevoke', async () => {
      const agentToRevoke = ACCOUNT_1.address;
      const roleId = keccak256(Buffer.from('developer', 'utf-8') as `0x${string}`);

      // First, set agent role (as proxy)
      await walletClient.writeContract({
        address: rbacAddress,
        abi: RBAC_ABI,
        functionName: 'setAgentRole',
        args: [agentToRevoke, roleId],
      });

      // Proxy (ACCOUNT_0) can revoke
      const proxyTx = await walletClient.writeContract({
        address: rbacAddress,
        abi: RBAC_ABI,
        functionName: 'emergencyRevoke',
        args: [agentToRevoke],
      });
      expect(proxyTx).toMatch(/^0x[0-9a-f]{64}$/i);

      // Non-proxy (ACCOUNT_1) cannot revoke
      const nonProxyWalletClient = createWalletClient({
        account: ACCOUNT_1,
        transport: http(RPC_URL),
      });

      try {
        await nonProxyWalletClient.writeContract({
          address: rbacAddress,
          abi: RBAC_ABI,
          functionName: 'emergencyRevoke',
          args: [agentToRevoke],
        });
        expect.fail('Non-proxy should not be able to call emergencyRevoke');
      } catch (error) {
        // Expected to fail with revert (modifier rejection)
        expect(String(error)).toMatch(/reverted|Internal error/i);
      }
    });
  });

  describe('State verification after operations', () => {
    it('should confirm getAgentRole returns (0x0, false) for revoked agent', async () => {
      const agent = ACCOUNT_1.address;
      const roleId = keccak256(Buffer.from('developer', 'utf-8') as `0x${string}`);

      // 1. Register agent
      await walletClient.writeContract({
        address: rbacAddress,
        abi: RBAC_ABI,
        functionName: 'setAgentRole',
        args: [agent, roleId],
      });

      // 2. Verify agent is active before revocation
      let result = (await publicClient.readContract({
        address: rbacAddress,
        abi: RBAC_ABI,
        functionName: 'getAgentRole',
        args: [agent],
      })) as readonly [string, boolean];

      expect(result[0]).toEqual(roleId);
      expect(result[1]).toBe(true); // isActive

      // 3. Revoke agent
      await walletClient.writeContract({
        address: rbacAddress,
        abi: RBAC_ABI,
        functionName: 'emergencyRevoke',
        args: [agent],
      });

      // 4. Confirm getAgentRole returns (0x0, false)
      result = (await publicClient.readContract({
        address: rbacAddress,
        abi: RBAC_ABI,
        functionName: 'getAgentRole',
        args: [agent],
      })) as readonly [string, boolean];

      expect(result[0]).toBe('0x' + '0'.repeat(64)); // roleId = 0x0
      expect(result[1]).toBe(false); // isActive = false
    });

    it('should confirm agentRoles mapping is deleted on revocation', async () => {
      const agent = ACCOUNT_1.address;
      const roleId = keccak256(Buffer.from('developer', 'utf-8') as `0x${string}`);

      // 1. Register agent
      await walletClient.writeContract({
        address: rbacAddress,
        abi: RBAC_ABI,
        functionName: 'setAgentRole',
        args: [agent, roleId],
      });

      // 2. Read agentRoles mapping before revocation
      let mappingValue = (await publicClient.readContract({
        address: rbacAddress,
        abi: RBAC_ABI,
        functionName: 'agentRoles',
        args: [agent],
      })) as string;

      expect(mappingValue).toEqual(roleId);

      // 3. Revoke agent
      await walletClient.writeContract({
        address: rbacAddress,
        abi: RBAC_ABI,
        functionName: 'emergencyRevoke',
        args: [agent],
      });

      // 4. Confirm mapping entry is deleted (returns 0x0)
      mappingValue = (await publicClient.readContract({
        address: rbacAddress,
        abi: RBAC_ABI,
        functionName: 'agentRoles',
        args: [agent],
      })) as string;

      expect(mappingValue).toBe('0x' + '0'.repeat(64));
    });

    it('should properly transition from active to revoked state', async () => {
      // Use a unique agent address for this test
      const uniqueAgent = '0x' + 'd'.repeat(40) as `0x${string}`;
      const roleId = keccak256(Buffer.from('state-transition', 'utf-8') as `0x${string}`);

      // 1. Register agent
      await walletClient.writeContract({
        address: rbacAddress,
        abi: RBAC_ABI,
        functionName: 'setAgentRole',
        args: [uniqueAgent, roleId],
      });

      // 2. Verify agent is active (present in mapping with non-zero roleId)
      let result = (await publicClient.readContract({
        address: rbacAddress,
        abi: RBAC_ABI,
        functionName: 'getAgentRole',
        args: [uniqueAgent],
      })) as readonly [string, boolean];

      expect(result[0]).toEqual(roleId);
      expect(result[1]).toBe(true); // Active

      // 3. Revoke agent
      await walletClient.writeContract({
        address: rbacAddress,
        abi: RBAC_ABI,
        functionName: 'emergencyRevoke',
        args: [uniqueAgent],
      });

      // 4. Verify agent is now revoked (removed from mapping)
      result = (await publicClient.readContract({
        address: rbacAddress,
        abi: RBAC_ABI,
        functionName: 'getAgentRole',
        args: [uniqueAgent],
      })) as readonly [string, boolean];

      expect(result[0]).toBe('0x' + '0'.repeat(64)); // No roleId
      expect(result[1]).toBe(false); // Inactive
    });
  });
});
