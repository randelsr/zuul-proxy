import { createPublicClient, http } from 'viem';

async function main() {
  const client = createPublicClient({
    transport: http('http://127.0.0.1:8545'),
  });

  const rbacAddress = '0x5FbDB2315678afecb367f032d93F642f64180aa3';

  // Get bytecode
  const bytecode = await client.getCode({
    address: rbacAddress as `0x${string}`,
  });

  console.log('RBAC contract bytecode length:', bytecode.length);
  console.log('First 100 chars of bytecode:', bytecode.slice(0, 100));
  
  if (bytecode.length < 100) {
    console.log('\n❌ Contract bytecode is very short - contract may not be deployed properly!');
    console.log('Full bytecode:', bytecode);
  } else {
    console.log('\n✓ Contract appears to be deployed');
  }

  // Try reading the owner
  const ownerAbi = [
    {
      inputs: [],
      name: 'owner',
      outputs: [{ type: 'address' }],
      stateMutability: 'view',
      type: 'function',
    },
  ] as const;

  try {
    const owner = await client.readContract({
      address: rbacAddress as `0x${string}`,
      abi: ownerAbi,
      functionName: 'owner',
    });
    console.log('\n✓ owner() call succeeded:', owner);
  } catch (error) {
    console.log('\n❌ owner() call failed:', error instanceof Error ? error.message : error);
  }
}

main().catch(console.error);
