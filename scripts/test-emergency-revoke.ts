import 'dotenv/config';
import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

// Hardhat test account (for local mode)
const HARDHAT_SIGNER_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

async function main() {
  // Get agent address from CLI args
  const agentToRevoke = process.argv[2];
  if (!agentToRevoke) {
    console.error('Usage: npx tsx scripts/test-emergency-revoke.ts <agent_address>');
    console.error('Example: npx tsx scripts/test-emergency-revoke.ts 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266');
    process.exit(1);
  }

  // Read config from environment
  const rpcUrl = process.env.RPC_URL || 'http://127.0.0.1:8545';
  const rbacAddress = process.env.RBAC_CONTRACT_ADDRESS;
  const isLocal = rpcUrl.includes('127.0.0.1') || rpcUrl.includes('localhost');

  if (!rbacAddress) {
    console.error('❌ Error: RBAC_CONTRACT_ADDRESS not set in .env');
    process.exit(1);
  }

  // Get signer - use env var for testnet, hardhat account for local
  const signerKey = isLocal
    ? HARDHAT_SIGNER_KEY
    : process.env.PROXY_SIGNER_KEY || process.env.HEDERA_PRIVATE_KEY;

  if (!signerKey) {
    console.error('❌ Error: Missing signer key');
    console.error('   Set PROXY_SIGNER_KEY in .env for testnet deployments');
    process.exit(1);
  }

  console.log('Testing emergency revoke...\n');
  console.log(`📡 RPC URL: ${rpcUrl}`);
  console.log(`📍 Mode: ${isLocal ? 'Local Hardhat' : 'Testnet'}`);
  console.log(`📍 RBAC Address: ${rbacAddress}`);
  console.log(`📍 Signer: ${privateKeyToAccount(signerKey as `0x${string}`).address}`);
  console.log(`📍 Agent to revoke: ${agentToRevoke}\n`);

  const account = privateKeyToAccount(signerKey as `0x${string}`);

  const publicClient = createPublicClient({
    transport: http(rpcUrl),
  });

  const walletClient = createWalletClient({
    account,
    transport: http(rpcUrl),
  });

  const RBAC_ABI = [
    {
      inputs: [{ internalType: 'address', name: 'agent', type: 'address' }],
      name: 'emergencyRevoke',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function',
    },
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
  ] as const;

  try {
    // Check owner
    const owner = await publicClient.readContract({
      address: rbacAddress as `0x${string}`,
      abi: RBAC_ABI,
      functionName: 'owner',
    });
    console.log(`✓ Owner: ${owner}`);
    console.log(`  Signer is owner? ${owner.toLowerCase() === account.address.toLowerCase()}\n`);

    // Check revocation status before
    const revokedBefore = await publicClient.readContract({
      address: rbacAddress as `0x${string}`,
      abi: RBAC_ABI,
      functionName: 'revokedAgents',
      args: [agentToRevoke as `0x${string}`],
    });
    console.log(`✓ Revoked status (before): ${revokedBefore}\n`);

    // Try to revoke
    console.log('Calling emergencyRevoke...');
    const txHash = await walletClient.writeContract({
      address: rbacAddress as `0x${string}`,
      abi: RBAC_ABI,
      functionName: 'emergencyRevoke',
      args: [agentToRevoke as `0x${string}`],
    });
    console.log(`✓ Transaction submitted: ${txHash}\n`);

    // Check revocation status after
    const revokedAfter = await publicClient.readContract({
      address: rbacAddress as `0x${string}`,
      abi: RBAC_ABI,
      functionName: 'revokedAgents',
      args: [agentToRevoke as `0x${string}`],
    });
    console.log(`✓ Revoked status (after): ${revokedAfter}`);
  } catch (error) {
    console.error(`✗ Error: ${String(error)}`);
  }
}

main();
