import { ethers } from 'ethers';

async function main() {
  console.log('Testing emergencyRevoke via ethers...\n');

  const rpcUrl = 'http://127.0.0.1:8545';
  const rbacAddress = '0x8A791620dd6260079BF849Dc5567aDC3F2FdC318';
  const owner = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
  const ownerPrivateKey = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
  const agentToRevoke = '0x70997970C51812e339D9B73b0245ad59219f4137';

  console.log(`Owner: ${owner}`);
  console.log(`Agent to revoke: ${agentToRevoke}\n`);

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const signer = new ethers.Wallet(ownerPrivateKey, provider);

  console.log(`Signer address: ${signer.address}`);

  const RBAC_ABI = [
    'function emergencyRevoke(address agent) public',
    'function owner() public view returns (address)',
    'function revokedAgents(address agent) public view returns (bool)',
  ];

  const contract = new ethers.Contract(rbacAddress, RBAC_ABI, signer);

  try {
    const contractOwner = await contract.owner();
    console.log(`Contract owner: ${contractOwner}`);
    console.log(`Signer is owner: ${signer.address.toLowerCase() === contractOwner.toLowerCase()}\n`);

    console.log('Calling emergencyRevoke...');
    const tx = await contract.emergencyRevoke(agentToRevoke);
    console.log(`Transaction hash: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`✓ Transaction confirmed! Block: ${receipt?.blockNumber}`);
  } catch (error) {
    console.error(`✗ Error: ${String(error)}`);
  }

  // Check revocation status
  try {
    const isRevoked = await contract.revokedAgents(agentToRevoke);
    console.log(`\nAgent revoked: ${isRevoked}`);
  } catch (error) {
    console.error(`Could not check revoked status: ${String(error)}`);
  }
}

main().catch(console.error);
