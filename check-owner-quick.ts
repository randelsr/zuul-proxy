import { createPublicClient, http } from 'viem';

async function main() {
  const client = createPublicClient({
    transport: http('http://127.0.0.1:8545'),
  });

  const rbacAddress = '0x5FbDB2315678afecb367f032d93F642f64180aa3';
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

    console.log('Contract owner:', owner);
    console.log('Signer address: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266');
    console.log('Match:', owner?.toLowerCase() === '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'.toLowerCase());
  } catch (error) {
    console.error('Error:', error);
  }
}

main();
