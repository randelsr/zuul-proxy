import { createPublicClient, createWalletClient, http, getContract } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

async function main() {
  const rpcUrl = 'http://127.0.0.1:8545';
  const rbacAddress = '0x5FbDB2315678afecb367f032d93F642f64180aa3';
  const signerKey = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
  const agentToRevoke = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

  console.log('Testing emergency revoke...\n');
  console.log(`RBAC Address: ${rbacAddress}`);
  console.log(`Signer: ${privateKeyToAccount(signerKey as `0x${string}`).address}`);
  console.log(`Agent to revoke: ${agentToRevoke}\n`);

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
