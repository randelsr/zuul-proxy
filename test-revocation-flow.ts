/**
 * Test: Can we directly call emergencyRevoke via RPC and then verify
 * that tools/list returns empty?
 */
import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const rpcUrl = 'http://127.0.0.1:8545';
const rbacAddress = '0x5FbDB2315678afecb367f032d93F642f64180aa3';
const signerKey = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const agentAddress = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const proxyUrl = 'http://localhost:8080';

async function main() {
  console.log('Test: Revocation Effect on Tool Discovery\n');

  // 1. Check tools BEFORE revocation
  console.log('[1] Checking tools BEFORE revocation...');
  const toolsBeforeResp = await fetch(`${proxyUrl}/rpc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'tools/list',
      params: { agent_address: agentAddress },
      id: '1',
    }),
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toolsBeforeData = (await toolsBeforeResp.json()) as any;
  const toolsBefore = toolsBeforeData.result?.tools?.length || 0;
  console.log(`✓ Tools found: ${toolsBefore}`);

  // 2. Call emergencyRevoke directly
  console.log('\n[2] Calling emergencyRevoke directly...');
  const account = privateKeyToAccount(signerKey as `0x${string}`);
  const walletClient = createWalletClient({ account, transport: http(rpcUrl) });

  const RBAC_ABI = [
    {
      inputs: [{ internalType: 'address', name: 'agent', type: 'address' }],
      name: 'emergencyRevoke',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function',
    },
  ] as const;

  const txHash = await walletClient.writeContract({
    address: rbacAddress as `0x${string}`,
    abi: RBAC_ABI,
    functionName: 'emergencyRevoke',
    args: [agentAddress as `0x${string}`],
  });
  console.log(`✓ Revocation transaction: ${txHash}`);

  // Wait for blockchain
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // 3. Check tools AFTER revocation
  console.log('\n[3] Checking tools AFTER revocation...');
  const toolsAfterResp = await fetch(`${proxyUrl}/rpc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'tools/list',
      params: { agent_address: agentAddress },
      id: '2',
    }),
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toolsAfterData = (await toolsAfterResp.json()) as any;
  const toolsAfter = toolsAfterData.result?.tools?.length || 0;
  console.log(`✓ Tools found: ${toolsAfter}`);

  if (toolsAfter === 0) {
    console.log('\n✅ SUCCESS: Agent sees ZERO tools after revocation');
  } else {
    console.log(
      '\n❌ ISSUE: Agent still has tools after revocation (cache may not be invalidated)'
    );
  }
}

main().catch(console.error);
