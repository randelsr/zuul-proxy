import { keccak256, toHex } from 'viem';
import { toFunctionSelector } from 'viem/utils';

// Check function selector
const selector = toFunctionSelector('emergencyRevoke(address)');
console.log('Function selector for emergencyRevoke(address):', selector);
console.log('In encoded data: 0x58084024...');

// Also let's check against the ABI
const abi = [
  {
    inputs: [{ internalType: 'address', name: 'agent', type: 'address' }],
    name: 'emergencyRevoke',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

import { encodeFunctionData } from 'viem';
const encoded = encodeFunctionData({
  abi,
  functionName: 'emergencyRevoke',
  args: ['0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as `0x${string}`],
});

console.log('\nFull encoded call:', encoded);
console.log('Selector in encoded call:', encoded.slice(0, 10));

// Manually compute
const sig = 'emergencyRevoke(address)';
const hash = keccak256(toHex(sig));
const manualSelector = hash.slice(0, 10);
console.log('\nManual calculation:');
console.log('Signature:', sig);
console.log('Keccak256:', hash);
console.log('Selector (first 4 bytes):', manualSelector);
