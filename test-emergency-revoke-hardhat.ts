import hre from 'hardhat';

async function main() {
  console.log('Testing emergencyRevoke via Hardhat...\n');

  const [owner, agent] = await hre.ethers.getSigners();

  console.log(`Owner: ${owner.address}`);
  console.log(`Agent: ${agent.address}\n`);

  // Get RBAC contract instance
  const RBAC = await hre.ethers.getContractAt(
    'RBAC',
    '0x5FbDB2315678afecb367f032d93F642f64180aa3',
    owner
  );

  console.log('Contract owner (from code):', await RBAC.owner());

  try {
    console.log('\nCalling emergencyRevoke...');
    const tx = await RBAC.emergencyRevoke(agent.address);
    console.log(`Transaction submitted: ${tx.hash}`);
    await tx.wait();
    console.log('✓ Transaction confirmed!');
  } catch (error) {
    console.error(`✗ Error: ${String(error)}`);
  }

  // Check if revoked
  try {
    const isRevoked = await RBAC.revokedAgents(agent.address);
    console.log(`\nAgent revoked: ${isRevoked}`);
  } catch (error) {
    console.error(`Could not check revoked status: ${String(error)}`);
  }
}

main().catch(console.error);
