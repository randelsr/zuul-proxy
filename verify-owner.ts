import { createPublicClient, http } from 'viem';

async function main() {
  const client = createPublicClient({ transport: http('http://127.0.0.1:8545') });

  const rbacAddress = '0x5FbDB2315678afecb367f032d93F642f64180aa3';

  try {
    const RBAC_ABI = [
      {
        inputs: [],
        name: 'owner',
        outputs: [{ type: 'address' }],
        stateMutability: 'view',
        type: 'function',
      },
    ] as const;

    const owner = await client.readContract({
      address: rbacAddress as `0x${string}`,
      abi: RBAC_ABI,
      functionName: 'owner',
    });

    console.log(`✓ Contract owner: ${owner}`);
    console.log(
      `  Is account 0? ${owner.toLowerCase() === '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266'.toLowerCase()}`
    );
  } catch (error) {
    console.error(`✗ Error: ${error}`);
  }
}

main();
