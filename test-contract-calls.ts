import { createPublicClient, createWalletClient, http, getAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

async function main() {
  const publicClient = createPublicClient({
    transport: http('http://127.0.0.1:8545'),
  });

  const rbacAddress = '0x8A791620dd6260079BF849Dc5567aDC3F2FdC318';
  const signerKey = process.env.HARDHAT_SIGNER_KEY || '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
  const account = privateKeyToAccount(signerKey as `0x${string}`);

  // Test 1: Call owner (read-only)
  console.log('\n1. Testing owner() read call...');
  try {
    const ownerAbi = [
      {
        inputs: [],
        name: 'owner',
        outputs: [{ type: 'address' }],
        stateMutability: 'view',
        type: 'function',
      },
    ] as const;

    const owner = await publicClient.readContract({
      address: rbacAddress as `0x${string}`,
      abi: ownerAbi,
      functionName: 'owner',
    });
    console.log('✓ owner() call succeeded:', owner);
  } catch (error) {
    console.error('✗ owner() call failed:', error instanceof Error ? error.message : error);
  }

  // Test 2: Call emergencyRevoke (write)
  console.log('\n2. Testing emergencyRevoke() write call...');
  try {
    const walletClient = createWalletClient({
      account,
      transport: http('http://127.0.0.1:8545', { timeout: 60_000 }),
    });

    const revokeAbi = [
      {
        inputs: [{ internalType: 'address', name: 'agent', type: 'address' }],
        name: 'emergencyRevoke',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
      },
    ] as const;

    const testAgent = '0x70997970C51812e339D9B73b0245ad59219f4137';
    const checksummedAgent = getAddress(testAgent);
    console.log('Original agent:', testAgent);
    console.log('Checksummed agent:', checksummedAgent);
    console.log('Calling emergencyRevoke with agent:', checksummedAgent);
    const txHash = await walletClient.writeContract({
      address: rbacAddress as `0x${string}`,
      abi: revokeAbi,
      functionName: 'emergencyRevoke',
      args: [checksummedAgent],
    });
    console.log('✓ emergencyRevoke() call succeeded, tx:', txHash);
  } catch (error) {
    if (error instanceof Error) {
      console.error('✗ emergencyRevoke() call failed:', error.message);
      if (error.message.includes('Internal error')) {
        console.error('\nDEBUG: "Internal error" suggests the contract might be responding but the function call is failing');
        console.error('Possible causes:');
        console.error('- onlyOwner check failing (but we verified owner matches signer)');
        console.error('- Contract doesn\'t have emergencyRevoke function');
        console.error('- Some other Solidity assertion is failing');
      }
    } else {
      console.error('✗ emergencyRevoke() call failed:', error);
    }
  }

  // Test 3: Call getAgentRole (read-only)
  console.log('\n3. Testing getAgentRole() read call...');
  try {
    const getAgentRoleAbi = [
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

    const [roleId, isActive] = await publicClient.readContract({
      address: rbacAddress as `0x${string}`,
      abi: getAgentRoleAbi,
      functionName: 'getAgentRole',
      args: ['0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'],
    });
    console.log('✓ getAgentRole() call succeeded:', { roleId, isActive });
  } catch (error) {
    console.error('✗ getAgentRole() call failed:', error instanceof Error ? error.message : error);
  }
}

main().catch(console.error);
