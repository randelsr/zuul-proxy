/**
 * Simple setup script to register test agents with RBAC contract
 * Uses setAgentRole and setRoleStatus functions
 */

import "dotenv/config";
import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

// Hardhat test account private keys
const HARDHAT_TEST_ACCOUNTS = [
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", // Account 0 - Developer
  "0x7797c0f3db8b946604ec2039dfd9763e4ffdc53174342a2ed9b14fa3eda666a5", // Account 1 - Admin
];

// Roles
const ROLES = [
  { name: "Developer", id: "developer" },
  { name: "Administrator", id: "administrator" },
];

// RBAC contract ABI
const RBAC_ABI = [
  {
    type: "function" as const,
    name: "setAgentRole",
    inputs: [
      { name: "agent", type: "address" },
      { name: "roleId", type: "bytes32" },
    ],
    outputs: [],
    stateMutability: "nonpayable" as const,
  },
  {
    type: "function" as const,
    name: "setRoleStatus",
    inputs: [
      { name: "roleId", type: "bytes32" },
      { name: "isActive", type: "bool" },
    ],
    outputs: [],
    stateMutability: "nonpayable" as const,
  },
] as const;

async function main() {
  console.log("\n🤖 Setting up test agents with RBAC contract...\n");

  const rbacAddress = process.env.RBAC_CONTRACT_ADDRESS;

  if (!rbacAddress) {
    console.error("❌ Error: RBAC_CONTRACT_ADDRESS not set in .env");
    process.exit(1);
  }

  // Create viem clients
  const walletClient = createWalletClient({
    account: privateKeyToAccount(HARDHAT_TEST_ACCOUNTS[0]),
    transport: http("http://127.0.0.1:8545"),
  });

  console.log(`📍 RBAC contract: ${rbacAddress}`);
  console.log(`📍 Admin signer: ${walletClient.account.address}\n`);

  // Helper function to hash role ID consistently with the driver
  const hashRoleId = (roleId: string) => {
    const roleIdHex = `0x${Buffer.from(roleId, 'utf-8').toString('hex')}`;
    return keccak256(roleIdHex as `0x${string}`);
  };

  // Set up roles
  console.log("🔧 Activating roles...\n");
  for (const role of ROLES) {
    const roleIdHash = hashRoleId(role.id);

    try {
      const tx = await walletClient.writeContract({
        address: rbacAddress as `0x${string}`,
        abi: RBAC_ABI,
        functionName: "setRoleStatus",
        args: [roleIdHash, true],
      });
      console.log(`✓ Role '${role.name}' activated (tx: ${tx})`);
    } catch (error) {
      console.error(
        `✗ Error activating role: ${error instanceof Error ? error.message : String(error)}`
      );
      throw error;
    }
  }

  // Register agents
  console.log("\n📝 Registering test agents...\n");
  for (let i = 0; i < HARDHAT_TEST_ACCOUNTS.length && i < ROLES.length; i++) {
    const account = privateKeyToAccount(HARDHAT_TEST_ACCOUNTS[i]);
    const role = ROLES[i];
    const roleIdHash = hashRoleId(role.id);

    console.log(`Agent ${i + 1}: ${account.address}`);
    console.log(`  Role: ${role.name}`);

    try {
      const tx = await walletClient.writeContract({
        address: rbacAddress as `0x${string}`,
        abi: RBAC_ABI,
        functionName: "setAgentRole",
        args: [account.address, roleIdHash],
      });
      console.log(`  ✓ Registered (tx: ${tx})\n`);
    } catch (error) {
      console.error(
        `  ✗ Error: ${error instanceof Error ? error.message : String(error)}`
      );
      throw error;
    }
  }

  console.log("✅ Setup complete!\n");
  console.log("📋 TEST AGENTS:");
  console.log("===============\n");

  HARDHAT_TEST_ACCOUNTS.slice(0, ROLES.length).forEach((privKey, i) => {
    const account = privateKeyToAccount(privKey);
    console.log(`Agent ${i + 1}: ${account.address}`);
    console.log(`  Role: ${ROLES[i].name}`);
    console.log(`  Private Key: ${privKey}\n`);
  });
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(
      "❌ Setup failed:",
      error instanceof Error ? error.message : String(error)
    );
    process.exit(1);
  });
