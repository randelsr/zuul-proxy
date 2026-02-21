import 'dotenv/config';
import { createPublicClient, http } from 'viem';

async function main() {
  // Get agent address from CLI args or use default
  const agentAddress = process.argv[2] || '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

  // Read config from environment
  const rpcUrl = process.env.RPC_URL || 'http://127.0.0.1:8545';
  const rbacAddress = process.env.RBAC_CONTRACT_ADDRESS;
  const isLocal = rpcUrl.includes('127.0.0.1') || rpcUrl.includes('localhost');

  if (!rbacAddress) {
    console.error('❌ Error: RBAC_CONTRACT_ADDRESS not set in .env');
    process.exit(1);
  }

  console.log(`📋 Checking RBAC State\n`);
  console.log(`📡 RPC URL: ${rpcUrl}`);
  console.log(`📍 Mode: ${isLocal ? 'Local Hardhat' : 'Testnet'}`);
  console.log(`📍 RBAC Contract: ${rbacAddress}`);
  console.log(`📍 Agent Address: ${agentAddress}\n`);

  const client = createPublicClient({
    transport: http(rpcUrl),
  });

  const RBAC_ABI = [
    {
      inputs: [],
      name: 'owner',
      outputs: [{ internalType: 'address', name: '', type: 'address' }],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [{ internalType: 'address', name: 'agent', type: 'address' }],
      name: 'revokedAgents',
      outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [{ internalType: 'address', name: 'agent', type: 'address' }],
      name: 'getAgentRole',
      outputs: [
        { internalType: 'bytes32', name: 'roleId', type: 'bytes32' },
        { internalType: 'bool', name: 'isActive', type: 'bool' },
      ],
      stateMutability: 'view',
      type: 'function',
    },
  ] as const;

  try {
    // Check owner
    const owner = await client.readContract({
      address: rbacAddress as `0x${string}`,
      abi: RBAC_ABI,
      functionName: 'owner',
    });
    console.log(`✓ Owner: ${owner}`);
    console.log(`  Is agent the owner? ${owner.toLowerCase() === agentAddress.toLowerCase()}`);
  } catch (error) {
    console.log(`✗ Could not read owner: ${String(error)}`);
  }

  try {
    // Check if agent is revoked
    const isRevoked = await client.readContract({
      address: rbacAddress as `0x${string}`,
      abi: RBAC_ABI,
      functionName: 'revokedAgents',
      args: [agentAddress as `0x${string}`],
    });
    console.log(`\n✓ Agent revoked status: ${isRevoked}`);
  } catch (error) {
    console.log(`✗ Could not read revoked status: ${String(error)}`);
  }

  try {
    // Check agent role
    const [roleId, isActive] = await client.readContract({
      address: rbacAddress as `0x${string}`,
      abi: RBAC_ABI,
      functionName: 'getAgentRole',
      args: [agentAddress as `0x${string}`],
    });
    console.log(`\n✓ Agent role lookup:`);
    console.log(`  roleId: ${roleId}`);
    console.log(`  isActive: ${isActive}`);
  } catch (error) {
    console.log(`✗ Could not read agent role: ${String(error)}`);
  }
}

main().catch(console.error);
