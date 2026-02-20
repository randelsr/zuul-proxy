# Phase 16: Hardhat 3 Core Upgrade

## Overview

Migrate from Hardhat 2.22.0 → 3.1.9 with fundamental architecture changes: ESM-first config, TypeScript native support (no ts-node wrapper), plugin array API, removal of TypeChain, and viem as first-class citizen.

**Risk Level**: HIGH (foundational tooling change)
**Estimated Scope**: 6 critical files, 1 new file, 3 deletions
**Testing**: Must verify `pnpm contracts:build`, `pnpm typecheck`, all 21 unit tests pass

---

## Step 1: Update Core Dependencies in `package.json`

### Dependencies to Remove
```json
// DELETE from devDependencies:
"hardhat": "2.22.0",
"@nomicfoundation/hardhat-toolbox": "4.0.0",
"@nomicfoundation/hardhat-viem": "2.0.0",
"@nomicfoundation/hardhat-ignition": "0.15.0",
"@typechain/hardhat": "9.1.0",
"typechain": "8.3.0"
```

**Rationale**:
- Hardhat 3.1.9 replaces the 2.x version
- `hardhat-toolbox` → `hardhat-toolbox-viem` (Hardhat 3 viem-first approach)
- `@typechain/hardhat` + `typechain` → removed; Hardhat 3 generates typed artifacts natively
- `hardhat-ignition` → `@nomicfoundation/hardhat-ignition@3.0.7` (bundled with toolbox-viem but explicit for clarity)

### Dependencies to Add/Update
```json
{
  "devDependencies": {
    "hardhat": "3.1.9",
    "@nomicfoundation/hardhat-toolbox-viem": "5.0.2",
    "@nomicfoundation/hardhat-ignition": "3.0.7"
  }
}
```

**Implementation**:
1. Open `package.json`
2. Remove all 6 packages listed in "Dependencies to Remove"
3. Add/update the 3 packages under "Dependencies to Add/Update"
4. Run `pnpm install --frozen-lockfile` (will resolve all transitive deps)

**Validation**:
```bash
pnpm list hardhat @nomicfoundation/hardhat-toolbox-viem @nomicfoundation/hardhat-ignition
# Expected: hardhat@3.1.9, hardhat-toolbox-viem@5.0.2, hardhat-ignition@3.0.7
```

---

## Step 2: Create `hardhat.config.ts` (Replace `hardhat.config.cjs`)

**File**: Create `hardhat.config.ts` at project root

### Key Changes from Hardhat 2
1. **ESM syntax** (`import`/`export` instead of `require()`/`module.exports`)
2. **TypeScript natively supported** (no `ts-node` wrapper, no CommonJS override)
3. **Plugin array syntax** (`plugins: [plugin1, plugin2]` instead of `require('@plugin')`)
4. **HardhatUserConfig type** for strict type-safety

### Template
```typescript
import { HardhatUserConfig } from "hardhat/types";
import hardhatToolboxViem from "@nomicfoundation/hardhat-toolbox-viem";
import hardhatIgnition from "@nomicfoundation/hardhat-ignition";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    localhost: {
      url: "http://127.0.0.1:8545",
    },
    hederaTestnet: {
      url: process.env.HEDERA_RPC_URL ?? "https://testnet.hashio.io/api",
      accounts: process.env.HEDERA_PRIVATE_KEY ? [process.env.HEDERA_PRIVATE_KEY] : [],
      chainId: 295,
    },
    baseTestnet: {
      url: "https://sepolia.base.org",
      accounts: process.env.BASE_PRIVATE_KEY ? [process.env.BASE_PRIVATE_KEY] : [],
      chainId: 84532,
    },
    arbitrumTestnet: {
      url: "https://sepolia-rollup.arbitrum.io/rpc",
      accounts: process.env.ARBITRUM_PRIVATE_KEY ? [process.env.ARBITRUM_PRIVATE_KEY] : [],
      chainId: 421614,
    },
    optimismTestnet: {
      url: "https://sepolia.optimism.io",
      accounts: process.env.OPTIMISM_PRIVATE_KEY ? [process.env.OPTIMISM_PRIVATE_KEY] : [],
      chainId: 11155420,
    },
  },
  plugins: [hardhatToolboxViem, hardhatIgnition],
};

export default config;
```

**Critical notes**:
- `plugins: [hardhatToolboxViem, hardhatIgnition]` — Hardhat 3 requires explicit array; this replaces the old `require()` side-effect pattern
- No `typechain` config — Hardhat 3 generates typed artifacts automatically
- No `mocha` config needed — Hardhat 3 uses `node:test` runner by default (tests live in `test/` directory with `.test.ts` extension)
- Project uses Vitest for app tests in `tests/`, not Hardhat's native test runner, so no Hardhat test config needed

**Implementation**:
1. Create new file `hardhat.config.ts` with template above
2. Copy network URLs and private key references from old `hardhat.config.cjs` (they match exactly)
3. Delete `hardhat.config.cjs` (see Step 4)

**Validation**:
```bash
pnpm typecheck
# Expected: No errors in hardhat.config.ts (HardhatUserConfig type is strict)

npx hardhat
# Expected: Hardhat 3 help text, no errors
```

---

## Step 3: Delete `tsconfig.hardhat.json`

**Rationale**:
- Hardhat 2 required a separate CJS-compatible tsconfig because `hardhat.config.cjs` was CommonJS
- Hardhat 3 reads `hardhat.config.ts` natively as TypeScript using the root `tsconfig.json`
- No need for separate CommonJS override; root tsconfig already targets ES2022 (compatible)

**Implementation**:
1. Delete file: `tsconfig.hardhat.json`
2. Verify root `tsconfig.json` targets ES2022+ (confirmed: `"target": "ES2022"`)

**Validation**:
```bash
# Hardhat 3 will use root tsconfig.json automatically
pnpm contracts:build
# Expected: Solidity contracts compile successfully
```

---

## Step 4: Delete `hardhat.config.cjs`

**Implementation**:
1. Delete file: `hardhat.config.cjs`
2. Confirm new `hardhat.config.ts` exists and is valid (Step 2)

**Validation**:
- File should be gone; `git status` should show deletion
- `pnpm typecheck && npx hardhat` should succeed

---

## Step 5: Migrate Ignition Module: `ignition/modules/Zuul.js` → `.ts`

### Current State
```javascript
// ignition/modules/Zuul.js
import { buildModule } from '@nomicfoundation/hardhat-ignition/modules';

const ZuulModule = buildModule('Zuul', (m) => {
  const rbac  = m.contract('RBAC');
  const audit = m.contract('Audit');
  return { rbac, audit };
});

export default ZuulModule;
```

### Updated Version (`.ts` with type annotations)
```typescript
// ignition/modules/Zuul.ts
import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import type { HardhatModulesAPI } from "@nomicfoundation/hardhat-ignition";

const ZuulModule = buildModule("Zuul", (m: HardhatModulesAPI) => {
  const rbac = m.contract("RBAC");
  const audit = m.contract("Audit");

  return { rbac, audit };
});

export default ZuulModule;
```

**Changes**:
1. Rename file: `Zuul.js` → `Zuul.ts`
2. Add type annotation `m: HardhatModulesAPI` (optional but best practice)
3. No functional changes to module logic

**Update `package.json` scripts**:
```json
{
  "scripts": {
    "contracts:deploy:local": "hardhat ignition deploy ignition/modules/Zuul.ts --network localhost",
    "contracts:deploy:hedera": "hardhat ignition deploy ignition/modules/Zuul.ts --network hederaTestnet --parameters ignition/parameters/hedera.json"
  }
}
```

**Implementation**:
1. Rename `ignition/modules/Zuul.js` to `Zuul.ts`
2. Add type annotations (copy template above)
3. Update deploy scripts in `package.json` to reference `.ts`
4. Run `pnpm typecheck` to verify

**Validation**:
```bash
pnpm typecheck
# Expected: No errors in Zuul.ts

pnpm contracts:build
# Expected: Solidity compiles

pnpm contracts:dev &  # Start Hardhat in background
sleep 2
pnpm contracts:deploy:local
# Expected: Contracts deploy successfully with output showing deployment addresses
kill %1  # Kill background Hardhat
```

---

## Step 6: Update `package.json` Scripts

**Current scripts that reference old files**:
```json
{
  "scripts": {
    "setup:agents": "hardhat run scripts/register-agents.cjs --network localhost"
  }
}
```

**Updated**:
```json
{
  "scripts": {
    "setup:agents": "tsx scripts/register-agents.ts"
  }
}
```

**Rationale**:
- `scripts/register-agents.cjs` will be rewritten as standalone viem TypeScript (Phase 16, Step 7)
- Using `tsx` directly (consistent with `demo/scenario.ts` pattern) avoids Hardhat runtime dependency for an admin script
- This is best practice: Hardhat is a compile-time/build-time tool, not a runtime dependency for script execution

**Implementation**:
1. Update `setup:agents` script in `package.json`
2. Update `contracts:deploy:local` and `contracts:deploy:hedera` to reference `Zuul.ts` (done in Step 5)

**Validation**:
```bash
pnpm setup:agents --help
# Expected: Shows TypeError or runs successfully (implementation in Step 7)
```

---

## Step 7: Migrate `scripts/register-agents.cjs` → `scripts/register-agents.ts`

### Current Implementation (Hardhat 2 with ethers.js)
```javascript
// register-agents.cjs
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const YAML = require('yaml');

async function main() {
  const { ethers } = hre;  // ← Hardhat 2 provides ethers globally

  const rbac = await ethers.getContractAt('RBAC', rbacAddress);
  const accounts = await ethers.getSigners();

  const roleIdHash = ethers.keccak256(ethers.toUtf8Bytes(role.id));

  const registerTx = await rbac.connect(signer).registerAgent(agent.address, roleIdHash);
  // ...
}

main().then(...).catch(...);
```

### New Implementation (Standalone viem, no Hardhat dependency)

```typescript
// scripts/register-agents.ts
import "dotenv/config";
import fs from "fs";
import path from "path";
import YAML from "yaml";
import { createPublicClient, createWalletClient, http, getContract, keccak256, toHex } from "viem";
import { hardie } from "viem/chains";

// Hardhat test account mnemonic (deterministic)
const HARDHAT_MNEMONIC = "test test test test test test test test test test test junk";

async function main() {
  const rbacAddress = process.env.RBAC_CONTRACT_ADDRESS;
  const auditAddress = process.env.AUDIT_CONTRACT_ADDRESS;

  if (!rbacAddress || !auditAddress) {
    console.error("❌ Error: Missing contract addresses in .env");
    process.exit(1);
  }

  // Create viem clients (localhost for local dev)
  const publicClient = createPublicClient({
    chain: hardie, // Hardhat chain
    transport: http("http://127.0.0.1:8545"),
  });

  // Create wallet client for Hardhat test account 0 (signer)
  // In local dev, we use the first Hardhat account as admin
  const signerPrivateKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
  const walletClient = createWalletClient({
    chain: hardie,
    transport: http("http://127.0.0.1:8545"),
  });

  // RBAC contract ABI (inline, matching hardhat config)
  const RBAC_ABI = [
    {
      type: "function",
      name: "registerAgent",
      inputs: [
        { name: "agent", type: "address" },
        { name: "roleId", type: "bytes32" },
      ],
      outputs: [],
      stateMutability: "nonpayable",
    },
    {
      type: "function",
      name: "grantPermission",
      inputs: [
        { name: "roleId", type: "bytes32" },
        { name: "tool", type: "string" },
        { name: "action", type: "string" },
      ],
      outputs: [],
      stateMutability: "nonpayable",
    },
  ] as const;

  // Get signer account
  const [signerAddress] = await walletClient.getAddresses();
  console.log(`\n📍 Admin signer: ${signerAddress}`);
  console.log(`📍 RBAC contract: ${rbacAddress}\n`);

  // Load config.yaml
  const configPath = path.join(process.cwd(), "config.yaml");
  const configContent = fs.readFileSync(configPath, "utf-8");
  const config = YAML.parse(configContent);

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

  // Get test accounts
  // Hardhat test accounts are deterministic from the mnemonic
  // We'll iterate through accounts 0-5 and assign roles
  const testAccounts = [
    "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", // Account 0
    "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", // Account 1
    "0x3C44CdDdB6a900c2d0CCd6B3959939AC2233BA08", // Account 2
    "0x1CBd3b2770909D4e10f157cABC84C7264073C9Ea", // Account 3
    "0xdF3E18d64BC6A983f1be8b06c1C0550c1e4d8d9b", // Account 4
    "0xcd3B766CCdd6AE721141F452C550Ca635964ce71", // Account 5
  ];

  console.log(`\n📝 Registering ${Math.min(config.roles.length, testAccounts.length)} test agents:\n`);

  const agentInfo: Record<string, any> = {};

  for (let i = 0; i < config.roles.length && i < testAccounts.length; i++) {
    const role = config.roles[i];
    const agentAddress = testAccounts[i] as `0x${string}`;

    // Hash the role ID using keccak256
    const roleIdHash = keccak256(toHex(role.id, { size: 32 }));

    console.log(`   Agent ${i + 1}: ${agentAddress}`);
    console.log(`   Role: ${role.name}`);

    try {
      // Register agent via writeContract
      const hash = await walletClient.writeContract({
        address: rbacAddress as `0x${string}`,
        abi: RBAC_ABI,
        functionName: "registerAgent",
        args: [agentAddress, roleIdHash],
        account: signerAddress,
      });
      console.log(`   ✓ Registered (tx: ${hash})`);

      // Grant permissions
      for (const permission of role.permissions) {
        for (const action of permission.actions) {
          const permHash = await walletClient.writeContract({
            address: rbacAddress as `0x${string}`,
            abi: RBAC_ABI,
            functionName: "grantPermission",
            args: [roleIdHash, permission.tool, action],
            account: signerAddress,
          });
          console.log(`   ✓ Granted ${permission.tool}.${action} (tx: ${permHash})`);
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
      console.error(`   ✗ Error: ${(error as Error).message}`);
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
    console.error("❌ Setup failed:", (error as Error).message);
    process.exit(1);
  });
```

**Key Changes**:
1. **No Hardhat dependency**: Uses `viem` directly instead of `hre.ethers`
2. **Standalone execution**: Runs via `tsx scripts/register-agents.ts`, not `hardhat run`
3. **Deterministic test accounts**: Hardhat test account addresses are hardcoded (they're deterministic from the mnemonic)
4. **viem contract interaction**: Uses `walletClient.writeContract()` instead of `contract.connect(signer).method()`
5. **Correct hashing**: Uses viem's `keccak256(toHex())` instead of ethers' `ethers.keccak256(ethers.toUtf8Bytes())`

**Implementation**:
1. Delete `scripts/register-agents.cjs`
2. Create `scripts/register-agents.ts` with template above
3. Update `package.json` script: `setup:agents: "tsx scripts/register-agents.ts"`
4. Run `pnpm typecheck` to verify no TS errors
5. Test with local dev setup

**Validation**:
```bash
# Start Hardhat in background
pnpm contracts:dev &
sleep 2

# Run setup
pnpm setup:dev  # This calls setup:agents internally

# Check output
cat .agents.json | head -20
# Expected: Agent 1 and Agent 2 registered with roles and permissions

kill %1  # Kill background Hardhat
```

---

## Final Validation Checklist

After completing all 7 steps, verify:

- [ ] `pnpm install` succeeds with no dependency conflicts
- [ ] `pnpm typecheck` passes (no TypeScript errors)
- [ ] `pnpm lint` passes
- [ ] `pnpm contracts:build` compiles Solidity successfully
- [ ] `npx hardhat --version` shows Hardhat 3.1.9
- [ ] `pnpm contracts:dev` starts Hardhat node without errors
- [ ] `pnpm setup:agents` registers agents successfully (creates `.agents.json`)
- [ ] `pnpm dev` starts Zuul Proxy server
- [ ] `pnpm test` runs all 21 unit tests with 90%+ coverage
- [ ] `pnpm demo` completes demo scenario successfully (Agent 1: 2 tools, Agent 2: 3 tools)

---

## Rollback Plan (if needed)

If any step fails:

1. Run `git checkout hardhat.config.cjs tsconfig.hardhat.json` to restore old configs
2. Run `git checkout scripts/register-agents.cjs` to restore old script
3. Revert `package.json` changes: `git checkout package.json`
4. Run `pnpm install` to restore old deps
5. Delete new files: `hardhat.config.ts`, `ignition/modules/Zuul.ts`, `scripts/register-agents.ts`

---

## Notes

- **TypeChain removal is safe**: The project does not use TypeChain-generated types. ABIs are defined inline in chain drivers (`src/chain/evm.ts`, `src/chain/hedera.ts`).
- **No Hardhat tests**: The project uses Vitest for unit tests (`tests/`), not Hardhat's native Mocha test runner. No Hardhat test config is needed.
- **Ignition 3.x compatibility**: Zuul.ts module format is unchanged; Ignition 3 is backward-compatible with the simple `buildModule` pattern used here.
- **viem 2.x to latest**: Zuul-proxy already uses viem 2.4.0. Phase 16 does not upgrade viem (that's Phase 17); we only update Hardhat and its plugins here.

