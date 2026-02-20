import { privateKeyToAccount } from 'viem/accounts';

// Hardhat's default account[0]
const correctKey = '0xac0974bec39a17e36ba4a6b4d238ff944bacb476cbed5490888cad0dc0378c18';
const wrongKey = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

const correctAccount = privateKeyToAccount(correctKey as `0x${string}`);
const wrongAccount = privateKeyToAccount(wrongKey as `0x${string}`);

console.log('Correct key address:', correctAccount.address);
console.log('Wrong key address:  ', wrongAccount.address);
console.log('Expected owner:      0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266');
console.log('Match (correct)?:    ', correctAccount.address === '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266');
console.log('Match (wrong)?:      ', wrongAccount.address === '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266');
