import hre from "hardhat";

async function main() {
  console.log("🚀 Deploying contracts to localhost...");

  // Get test account
  const [deployer] = await hre.viem.getWalletClients();
  const publicClient = await hre.viem.getPublicClient();

  console.log(`Deploying with account: ${deployer.account.address}`);

  // Deploy RBAC
  console.log("\n📦 Deploying RBAC contract...");
  const rbacHash = await deployer.deployContract({
    abi: (await import("../contracts/artifacts/RBAC.json", { assert: { type: "json" } })).abi,
    bytecode: (await import("../contracts/artifacts/RBAC.json", { assert: { type: "json" } })).bytecode,
  });

  const rbacReceipt = await publicClient.waitForTransactionReceipt({
    hash: rbacHash,
  });

  const rbacAddress = rbacReceipt.contractAddress;
  console.log(`✓ RBAC deployed to: ${rbacAddress}`);

  // Deploy Audit
  console.log("\n📦 Deploying Audit contract...");
  const auditHash = await deployer.deployContract({
    abi: (await import("../contracts/artifacts/Audit.json", { assert: { type: "json" } })).abi,
    bytecode: (await import("../contracts/artifacts/Audit.json", { assert: { type: "json" } })).bytecode,
    args: [rbacAddress],
  });

  const auditReceipt = await publicClient.waitForTransactionReceipt({
    hash: auditHash,
  });

  const auditAddress = auditReceipt.contractAddress;
  console.log(`✓ Audit deployed to: ${auditAddress}`);

  // Output addresses
  console.log("\n✅ Deployment complete!");
  console.log("\nDeployed addresses:");
  console.log(`RBAC_CONTRACT_ADDRESS=${rbacAddress}`);
  console.log(`AUDIT_CONTRACT_ADDRESS=${auditAddress}`);

  return { rbacAddress, auditAddress };
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
