import { createPublicClient, http, encodeFunctionData, toHex } from 'viem';

async function main() {
  const client = createPublicClient({
    transport: http('http://127.0.0.1:8545'),
  });

  const rbacAddress = '0x5FbDB2315678afecb367f032d93F642f64180aa3';
  const agent = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

  // Encode emergencyRevoke(agent) function call
  const abi = [
    {
      inputs: [{ internalType: 'address', name: 'agent', type: 'address' }],
      name: 'emergencyRevoke',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function',
    },
  ] as const;

  const encodedData = encodeFunctionData({
    abi,
    functionName: 'emergencyRevoke',
    args: [agent as `0x${string}`],
  });

  console.log('Encoded data:', encodedData);
  console.log('Agent address:', toHex(agent));

  // Try to simulate the call
  try {
    const result = await (client as any).call({
      account: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
      to: rbacAddress as `0x${string}`,
      data: encodedData,
    });

    console.log('Simulation result:', result);
  } catch (error) {
    if (error instanceof Error) {
      console.log('Error message:', error.message);
    } else {
      console.log('Error:', error);
    }
  }
}

main().catch(console.error);
