import { artifacts } from 'hardhat';
import fs from 'fs';
import path from 'path';

async function getContractAddresses() {
  const deploymentDir = path.join(
    __dirname,
    '../ignition/deployments/hedera-testnet'
  );

  if (!fs.existsSync(deploymentDir)) {
    console.error('❌ Deployment directory not found:', deploymentDir);
    process.exit(1);
  }

  const deploymentFile = path.join(deploymentDir, 'deployed_addresses.json');

  if (!fs.existsSync(deploymentFile)) {
    console.error('❌ Deployment addresses file not found:', deploymentFile);
    process.exit(1);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const deployed = JSON.parse(fs.readFileSync(deploymentFile, 'utf-8')) as any;

  console.log('RBAC', deployed['Zuul#RBAC'] || 'Not deployed');
  console.log('Audit', deployed['Zuul#Audit'] || 'Not deployed');
}

getContractAddresses().catch(console.error);
