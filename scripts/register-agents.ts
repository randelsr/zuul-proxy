/**
 * Register test agents to RBAC contract
 *
 * Standalone viem script (not a Hardhat task).
 * Reads roles and permissions from config.yaml and registers
 * Hardhat test accounts as agents with those roles on the blockchain.
 *
 * Usage: npx tsx scripts/register-agents.ts
 */

import "dotenv/config";
import fs from "fs";
import path from "path";
import YAML from "yaml";
import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  toHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

// Hardhat test account private keys (deterministic from BIP39 mnemonic)
// "test test test test test test test test test test test junk"
const HARDHAT_TEST_ACCOUNTS = [
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", // Account 0
  "0x7797c0f3db8b946604ec2039dfd9763e4ffdc53174342a2ed9b14fa3eda666a5", // Account 1
  "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e8175e8ff081c", // Account 2
  "0x92db14e403d91d5ebff5b111b6b2d4184573ce32b41f89a8ae7dff2b5189ec3d", // Account 3
  "0x4bbbf85ce3377467afe5d46723e98038ddc3d2fd0f3f7ef7d6acbce87f8b1d09", // Account 4
  "0xdbda1821b80551c9d65939329250298aa3472ba22feea921c8aaf07d92b8a761", // Account 5
];

// RBAC contract ABI (minimal, for registerAgent and grantPermission)
const RBAC_ABI = [
  {
    type: "function" as const,
    name: "registerAgent",
    inputs: [
      { name: "agent", type: "address" },
      { name: "roleId", type: "bytes32" },
    ],
    outputs: [],
    stateMutability: "nonpayable" as const,
  },
  {
    type: "function" as const,
    name: "grantPermission",
    inputs: [
      { name: "roleId", type: "bytes32" },
      { name: "tool", type: "string" },
      { name: "action", type: "string" },
    ],
    outputs: [],
    stateMutability: "nonpayable" as const,
  },
] as const;

async function main() {
  console.log("\n🤖 Registering test agents to RBAC contract...\n");

  // Get contract addresses from environment
  const rbacAddress = process.env.RBAC_CONTRACT_ADDRESS;
  const auditAddress = process.env.AUDIT_CONTRACT_ADDRESS;

  if (!rbacAddress || !auditAddress) {
    console.error("❌ Error: Missing contract addresses");
    console.error(
      "   Set RBAC_CONTRACT_ADDRESS and AUDIT_CONTRACT_ADDRESS in .env"
    );
    process.exit(1);
  }

  // Create viem clients
  const publicClient = createPublicClient({
    transport: http("http://127.0.0.1:8545"),
  });

  // Get signer (use first Hardhat test account as admin)
  const signerAccount = privateKeyToAccount(HARDHAT_TEST_ACCOUNTS[0]);
  const walletClient = createWalletClient({
    account: signerAccount,
    transport: http("http://127.0.0.1:8545"),
  });

  console.log(`📍 Admin signer: ${signerAccount.address}`);
  console.log(`📍 RBAC contract: ${rbacAddress}\n`);

  // Load config.yaml
  const configPath = path.join(process.cwd(), "config.yaml");
  const configContent = fs.readFileSync(configPath, "utf-8");
  const config = YAML.parse(configContent) as any;

  if (!config.roles || config.roles.length === 0) {
    throw new Error("No roles defined in config.yaml");
  }

  console.log(`📋 Found ${config.roles.length} roles:\n`);
  config.roles.forEach((role: any) => {
    console.log(`   • ${role.name} (${role.id})`);
    role.permissions.forEach((perm: any) => {
      console.log(`     - ${perm.tool}: ${perm.actions.join(", ")}`);
    });
  });
  console.log("");

  // Register each agent with a role
  console.log(
    `\n📝 Registering ${Math.min(config.roles.length, HARDHAT_TEST_ACCOUNTS.length)} test agents:\n`
  );

  const agentInfo: Record<string, any> = {};

  for (
    let i = 0;
    i < config.roles.length && i < HARDHAT_TEST_ACCOUNTS.length;
    i++
  ) {
    const role = config.roles[i];
    const account = privateKeyToAccount(HARDHAT_TEST_ACCOUNTS[i]);
    const agentAddress = account.address as `0x${string}`;

    // Hash the role ID using keccak256
    const roleIdHash = keccak256(toHex(role.id, { size: 32 }));

    console.log(`   Agent ${i + 1}: ${agentAddress}`);
    console.log(`   Role: ${role.name}`);

    try {
      // Register agent via writeContract
      const registerHash = await walletClient.writeContract({
        address: rbacAddress as `0x${string}`,
        abi: RBAC_ABI,
        functionName: "registerAgent",
        args: [agentAddress, roleIdHash],
      });
      console.log(`   ✓ Registered (tx: ${registerHash})`);

      // Grant permissions
      for (const permission of role.permissions) {
        for (const action of permission.actions) {
          const permHash = await walletClient.writeContract({
            address: rbacAddress as `0x${string}`,
            abi: RBAC_ABI,
            functionName: "grantPermission",
            args: [roleIdHash, permission.tool, action],
          });
          console.log(
            `   ✓ Granted ${permission.tool}.${action} (tx: ${permHash})`
          );
        }
      }
      console.log("");

      // Store agent info for demo
      agentInfo[i + 1] = {
        address: agentAddress,
        hardhatAccountIndex: i,
        role: role.name,
        permissions: role.permissions,
      };
    } catch (error) {
      console.error(
        `   ✗ Error: ${error instanceof Error ? error.message : String(error)}`
      );
      throw error;
    }
  }

  console.log("✅ Agent registration complete!\n");
  console.log("📋 TEST AGENTS:");
  console.log("==============\n");

  for (const [key, agent] of Object.entries(agentInfo)) {
    console.log(`Agent ${key}: ${agent.address}`);
    console.log(`  Role: ${agent.role}`);
    console.log(`  ℹ️  Hardhat Account #${agent.hardhatAccountIndex}`);
    console.log("  Permissions:");
    agent.permissions.forEach((perm: any) => {
      console.log(`    • ${perm.tool}: ${perm.actions.join(", ")}`);
    });
    console.log("");
  }

  // Write agent info to file
  const agentInfoPath = path.join(process.cwd(), ".agents.json");
  fs.writeFileSync(agentInfoPath, JSON.stringify(agentInfo, null, 2));
  console.log(`📁 Agent info saved to: ${agentInfoPath}`);
  console.log("\n💡 To run the demo:\n");
  console.log("   1. Get the private keys:");
  console.log("      npx tsx scripts/get-test-account-keys.ts\n");
  console.log("   2. Use Agent 1 private key:");
  console.log('      export AGENT_PRIVATE_KEY="0x..."\n');
  console.log("   3. Run the demo:");
  console.log("      pnpm demo");
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
