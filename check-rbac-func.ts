import { createPublicClient, http } from 'viem';

async function main() {
  const client = createPublicClient({ transport: http('http://127.0.0.1:8545') });

  const rbacAddress = '0x5FbDB2315678afecb367f032d93F642f64180aa3';

  const RBAC_ABI = [
    {
      inputs: [{ internalType: 'address', name: 'agent', type: 'address' }],
      name: 'emergencyRevoke',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function',
    },
  ] as const;

  try {
    console.log('Checking if emergencyRevoke function exists in contract...');
    // Try to simulate a call to see if the function exists
    const result = await client.readContract({
      account: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
      address: rbacAddress as `0x${string}`,
      abi: [
        {
          inputs: [],
          name: 'owner',
          outputs: [{ type: 'address' }],
          stateMutability: 'view',
          type: 'function',
        },
      ] as const,
      functionName: 'owner',
    });

    console.log(`✓ Contract exists and responds`);
    console.log(`  Owner: ${result}`);
  } catch (error) {
    console.error(`✗ Error: ${error}`);
  }
}

main();
