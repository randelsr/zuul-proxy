import hre from 'hardhat';

async function main() {
  const rbacAddress = process.env.RBAC_CONTRACT_ADDRESS || '0x5FbDB2315678afecb367f032d93F642f64180aa3';
  const agentAddress = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

  console.log(`📋 Checking RBAC State`);
  console.log(`RBAC Contract: ${rbacAddress}`);
  console.log(`Agent Address: ${agentAddress}\n`);

  // Get contract instance
  const RBAC = await hre.ethers.getContractAt('RBAC', rbacAddress);

  try {
    // Check owner
    const owner = await RBAC.owner();
    console.log(`✓ Owner: ${owner}`);
    console.log(`  Is deployer (account 0)? ${owner.toLowerCase() === agentAddress.toLowerCase()}`);
  } catch (error) {
    console.log(`✗ Could not read owner: ${String(error)}`);
  }

  try {
    // Check if agent is revoked
    const isRevoked = await RBAC.revokedAgents(agentAddress);
    console.log(`\n✓ Agent revoked status: ${isRevoked}`);
  } catch (error) {
    console.log(`✗ Could not read revoked status: ${String(error)}`);
  }

  try {
    // Check agent role
    const [roleId, isActive] = await RBAC.getAgentRole(agentAddress);
    console.log(`\n✓ Agent role lookup:`);
    console.log(`  roleId: ${roleId}`);
    console.log(`  isActive: ${isActive}`);
  } catch (error) {
    console.log(`✗ Could not read agent role: ${String(error)}`);
  }
}

main().catch(console.error);
