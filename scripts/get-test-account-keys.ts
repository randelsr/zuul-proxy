/**
 * Get Hardhat test account private keys for registered agents
 *
 * Hardhat uses deterministic test accounts derived from its own mechanism.
 * This script reads .agents.json and shows which private keys map to each agent.
 *
 * Usage: npx tsx scripts/get-test-account-keys.ts
 */

import * as fs from 'fs';
import * as path from 'path';

// Hardhat's default test accounts derived from BIP39 mnemonic:
// mnemonic: "test test test test test test test test test test test junk"
// See: https://github.com/NomicFoundation/hardhat/blob/main/packages/hardhat-core/src/internal/core/config/default-config.ts
const HARDHAT_TEST_ACCOUNTS = [
  {
    address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    privateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  },
  {
    address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    privateKey: '0x7797c0f3db8b946604ec2039dfd9763e4ffdc53174342a2ed9b14fa3eda666a5',
  },
  {
    address: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
    privateKey: '0x19d1b9afaf5b1f79f708bd95673df2203213fdbbdafe50e70f056c2fecaa799e',
  },
  {
    address: '0x1CBd3b2770909D4e10f157cABC84C7264073C9Ec',
    privateKey: '0xb7f8851ef62746aa7e2a549bad1c8a2ce90da684e61721b5e227ecfbae864680',
  },
  {
    address: '0x8626f6940E2eb28930DF2967ba8f30fDdAf4b7a1',
    privateKey: '0x4bc2a63581f6412492ed13addf464cd583bf66dbcabde2b02bcd1a500a4580f0',
  },
];

async function main() {
  console.log('🔑 Hardhat Test Account Private Keys\n');

  // Try to read registered agents
  const agentsFile = path.join(process.cwd(), '.agents.json');
  let agents: any = {};

  if (fs.existsSync(agentsFile)) {
    agents = JSON.parse(fs.readFileSync(agentsFile, 'utf-8'));
    console.log('📁 Registered agents from .agents.json:\n');
  } else {
    console.warn(
      '⚠️  .agents.json not found. Run "pnpm setup:agents" first.\n'
    );
  }

  console.log('Available Test Accounts:');
  console.log('=======================\n');

  for (let i = 0; i < HARDHAT_TEST_ACCOUNTS.length; i++) {
    const account = HARDHAT_TEST_ACCOUNTS[i];
    const agent = agents[i + 1];

    console.log(`Account ${i}:`);
    console.log(`  Address:     ${account.address}`);
    console.log(`  Private key: ${account.privateKey}`);

    if (agent) {
      console.log(`  ✓ Registered as Agent ${i + 1} (${agent.role})`);
    }
    console.log('');
  }

  console.log('\n💡 To run the demo with Agent 1:\n');
  console.log(`export AGENT_PRIVATE_KEY="${HARDHAT_TEST_ACCOUNTS[0].privateKey}"`);
  console.log('pnpm demo\n');

  console.log('💡 To run the demo with Agent 2:\n');
  console.log(`export AGENT_PRIVATE_KEY="${HARDHAT_TEST_ACCOUNTS[1].privateKey}"`);
  console.log('pnpm demo\n');
}

main().catch((error) => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});
