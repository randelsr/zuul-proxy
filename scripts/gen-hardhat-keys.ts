/**
 * Generate Hardhat test account keys
 * Usage: npx tsx scripts/gen-hardhat-keys.ts
 */

import { mnemonicToAccount } from 'viem/accounts';

// Hardhat's default BIP39 mnemonic
const mnemonic = 'test test test test test test test test test test test junk';

console.log('Hardhat Test Accounts (BIP39 mnemonic)\n');
console.log('mnemonic: "test test test test test test test test test test test junk"\n');

for (let i = 0; i < 5; i++) {
  const account = mnemonicToAccount(mnemonic, {
    accountIndex: i,
  });
  const hdKey = account.getHdKey();
  const privKeyHex = Buffer.from(hdKey.privateKey!).toString('hex');

  console.log(`Account ${i}:`);
  console.log(`  Address:     ${account.address}`);
  console.log(`  Private key: 0x${privKeyHex}`);
  console.log('');
}
