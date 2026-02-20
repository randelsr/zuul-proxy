/**
 * Show registered agent information and how to use them in the demo
 * Usage: npx hardhat run scripts/show-agent-keys.cjs --network localhost
 */

require('dotenv').config();

// eslint-disable-next-line no-undef
async function main() {
  // eslint-disable-next-line no-undef
  const { ethers } = hre;
  const fs = require('fs');
  const path = require('path');

  // Read registered agents
  const agentsFile = path.join(process.cwd(), '.agents.json');
  if (!fs.existsSync(agentsFile)) {
    console.error('❌ .agents.json not found. Run "pnpm setup:agents" first.');
    process.exit(1);
  }

  const agents = JSON.parse(fs.readFileSync(agentsFile, 'utf-8'));

  // Get Hardhat test signers
  const signers = await ethers.getSigners();

  console.log('\n🔑 Registered Agent Private Keys\n');
  console.log('=============================\n');

  // Find which Hardhat accounts are registered
  for (let i = 1; i <= 5; i++) {
    const agent = agents[i];
    if (!agent) break;

    const registeredAddr = agent.address.toLowerCase();

    // Find matching signer
    let signerIndex = -1;
    for (let j = 0; j < signers.length; j++) {
      if (signers[j].address.toLowerCase() === registeredAddr) {
        signerIndex = j;
        break;
      }
    }

    console.log(`Agent ${i}: ${agent.address}`);
    console.log(`  Role: ${agent.role}`);

    if (signerIndex >= 0) {
      // Check if we have provider details
      const signer = signers[signerIndex];
      // Note: ethers v6 doesn't expose private key for security, but we can document it
      console.log(`  ⓘ  Hardhat account #${signerIndex}`);
      console.log(`  🔑 Private key: (run: npx hardhat accounts --network localhost)`);
    }
    console.log('');
  }

  console.log('💡 To use Agent 1 in demo:\n');
  console.log('  # Get the private key from Hardhat:');
  console.log('  npx hardhat accounts --network localhost\n');
  console.log('  # Then run:\n');
  console.log('  export AGENT_PRIVATE_KEY="0x..."  # Account key from above');
  console.log('  pnpm demo\n');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Error:', error.message);
    process.exit(1);
  });
