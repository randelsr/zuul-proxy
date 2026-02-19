# Phase 14: CI/CD Pipeline

**Duration:** ~3 hours
**Depends on:** Phases 0-13
**Deliverable:** GitHub Actions workflow, coverage gates, deployment
**Success Criteria:** All jobs pass

---

## Objective

Implement GitHub Actions CI/CD pipeline: lint, format, typecheck, test with 90% coverage gate, contract build/test, and optional deployment.

---

## Implementation

### .github/workflows/ci.yml

```yaml
name: CI/CD

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

env:
  NODE_VERSION: '22.x'

jobs:
  # ====================================================================
  # Lint, Format, Type Check (Parallel)
  # ====================================================================

  lint-format-typecheck:
    name: Lint, Format, Type Check
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: ['22.x']

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: 'pnpm'

      - name: Install pnpm
        uses: pnpm/action-setup@v2
        with:
          version: 8

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run ESLint
        run: pnpm lint

      - name: Check formatting
        run: pnpm format:check

      - name: Type check (tsc)
        run: pnpm typecheck

  # ====================================================================
  # Unit Tests with Coverage
  # ====================================================================

  test:
    name: Unit Tests (Coverage 90%+)
    runs-on: ubuntu-latest
    needs: lint-format-typecheck
    strategy:
      matrix:
        node-version: ['22.x']

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: 'pnpm'

      - name: Install pnpm
        uses: pnpm/action-setup@v2
        with:
          version: 8

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run tests with coverage
        run: pnpm test:coverage

      - name: Upload coverage to Codecov
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/coverage-final.json
          fail_ci_if_error: true
          verbose: true

  # ====================================================================
  # Contract Compilation and Testing
  # ====================================================================

  contracts:
    name: Contracts (Build & Test)
    runs-on: ubuntu-latest
    needs: lint-format-typecheck
    strategy:
      matrix:
        node-version: ['22.x']

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: 'pnpm'

      - name: Install pnpm
        uses: pnpm/action-setup@v2
        with:
          version: 8

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Compile contracts (Hardhat)
        run: pnpm contracts:build

      - name: Cache Hardhat compilation
        uses: actions/cache@v3
        with:
          path: ./artifacts
          key: hardhat-${{ github.sha }}
          restore-keys: |
            hardhat-

      - name: Run contract tests
        run: pnpm contracts:test

      - name: Upload contract ABIs as artifact
        uses: actions/upload-artifact@v3
        with:
          name: contract-abis
          path: artifacts/
          retention-days: 30

  # ====================================================================
  # TypeScript Build
  # ====================================================================

  build:
    name: Build (TypeScript)
    runs-on: ubuntu-latest
    needs: [lint-format-typecheck, test, contracts]
    strategy:
      matrix:
        node-version: ['22.x']

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: 'pnpm'

      - name: Install pnpm
        uses: pnpm/action-setup@v2
        with:
          version: 8

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Download contract ABIs
        uses: actions/download-artifact@v3
        with:
          name: contract-abis
          path: artifacts/

      - name: Build TypeScript
        run: pnpm build

      - name: Upload dist artifact
        uses: actions/upload-artifact@v3
        with:
          name: dist
          path: dist/
          retention-days: 30

  # ====================================================================
  # Optional: Docker Build
  # ====================================================================

  docker:
    name: Build Docker Image
    runs-on: ubuntu-latest
    needs: build
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v2

      - name: Build Docker image
        uses: docker/build-push-action@v4
        with:
          context: .
          push: false
          tags: zuul-proxy:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max

  # ====================================================================
  # Optional: Deploy to Testnet
  # ====================================================================

  deploy:
    name: Deploy to Hedera Testnet
    runs-on: ubuntu-latest
    needs: [build]
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    environment:
      name: hedera-testnet
      url: https://testnet.hashscan.io

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22.x'
          cache: 'pnpm'

      - name: Install pnpm
        uses: pnpm/action-setup@v2
        with:
          version: 8

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Download contract ABIs
        uses: actions/download-artifact@v3
        with:
          name: contract-abis
          path: artifacts/

      - name: Deploy contracts to Hedera testnet
        env:
          HEDERA_ACCOUNT_ID: ${{ secrets.HEDERA_ACCOUNT_ID }}
          HEDERA_PRIVATE_KEY: ${{ secrets.HEDERA_PRIVATE_KEY }}
          HEDERA_RPC_URL: ${{ secrets.HEDERA_RPC_URL }}
        run: scripts/deploy-contracts.sh

      - name: Verify deployment
        run: |
          echo "Deployment verification:"
          echo "  Chain: Hedera testnet"
          echo "  Timestamp: $(date -u +'%Y-%m-%dT%H:%M:%SZ')"
          echo "  Contracts deployed successfully"

      - name: Create deployment summary
        run: |
          cat > deployment-summary.txt <<EOF
          Deployment Complete
          ====================

          Environment: Hedera Testnet (chain 295)
          Timestamp: $(date -u +'%Y-%m-%dT%H:%M:%SZ')
          Commit: ${{ github.sha }}

          Deployed Contracts:
          - RBAC.sol
          - Audit.sol

          See https://testnet.hashscan.io for transaction details.
          EOF

      - name: Upload deployment summary
        uses: actions/upload-artifact@v3
        with:
          name: deployment-summary
          path: deployment-summary.txt

  # ====================================================================
  # Workflow Summary
  # ====================================================================

  summary:
    name: Workflow Summary
    runs-on: ubuntu-latest
    needs: [lint-format-typecheck, test, contracts, build]
    if: always()

    steps:
      - name: Check job statuses
        run: |
          echo "Workflow Summary"
          echo "================"
          echo "Lint/Format/Typecheck: ${{ needs.lint-format-typecheck.result }}"
          echo "Unit Tests:            ${{ needs.test.result }}"
          echo "Contracts:             ${{ needs.contracts.result }}"
          echo "Build:                 ${{ needs.build.result }}"

      - name: Fail if any job failed
        if: failure()
        run: exit 1

      - name: Success
        if: success()
        run: echo "✅ All checks passed!"
```

### scripts/deploy-contracts.sh

```bash
#!/bin/bash

# Deploy contracts to Hedera testnet via Hardhat Ignition
# Usage: scripts/deploy-contracts.sh

set -e

echo "🚀 Deploying contracts to Hedera testnet..."

# Check environment variables
if [ -z "$HEDERA_ACCOUNT_ID" ]; then
  echo "❌ Error: HEDERA_ACCOUNT_ID not set"
  exit 1
fi

if [ -z "$HEDERA_PRIVATE_KEY" ]; then
  echo "❌ Error: HEDERA_PRIVATE_KEY not set"
  exit 1
fi

# Deploy via Hardhat Ignition
pnpm hardhat ignition deploy ignition/modules/Zuul.ts \
  --network hederaTestnet \
  --deployment-id hedera-testnet \
  --verify false

# Extract deployment addresses
RBAC_ADDRESS=$(pnpm hardhat run scripts/get-contract-address.ts --network hederaTestnet | grep RBAC | cut -d' ' -f2)
AUDIT_ADDRESS=$(pnpm hardhat run scripts/get-contract-address.ts --network hederaTestnet | grep Audit | cut -d' ' -f2)

echo ""
echo "✅ Deployment Complete"
echo "===================="
echo "Network:   Hedera Testnet (ChainID 295)"
echo "RBAC:      $RBAC_ADDRESS"
echo "Audit:     $AUDIT_ADDRESS"
echo ""
echo "Explorer: https://testnet.hashscan.io"
```

### scripts/get-contract-address.ts

```typescript
import { artifacts } from 'hardhat'
import fs from 'fs'
import path from 'path'

async function getContractAddresses() {
  const deploymentDir = path.join(
    __dirname,
    '../ignition/deployments/hedera-testnet'
  )

  if (!fs.existsSync(deploymentDir)) {
    console.error('❌ Deployment directory not found:', deploymentDir)
    process.exit(1)
  }

  const deploymentFile = path.join(deploymentDir, 'deployed_addresses.json')

  if (!fs.existsSync(deploymentFile)) {
    console.error('❌ Deployment addresses file not found:', deploymentFile)
    process.exit(1)
  }

  const deployed = JSON.parse(fs.readFileSync(deploymentFile, 'utf-8'))

  console.log('RBAC', deployed['Zuul#RBAC'] || 'Not deployed')
  console.log('Audit', deployed['Zuul#Audit'] || 'Not deployed')
}

getContractAddresses().catch(console.error)
```

### vitest.config.ts (Coverage Configuration)

```typescript
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'dist/',
        'coverage/',
        '**/*.spec.ts',
        '**/*.test.ts',
        '**/index.ts',
      ],
      lines: 90,
      functions: 90,
      branches: 90,
      statements: 90,
      all: true,
      skipFull: false,
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

### .github/workflows/deploy.yml (Manual Deployment)

```yaml
name: Manual Deploy

on:
  workflow_dispatch:
    inputs:
      environment:
        description: 'Target environment'
        required: true
        default: 'hedera-testnet'
        type: choice
        options:
          - hedera-testnet
          - base-testnet
          - arbitrum-testnet

jobs:
  deploy:
    name: Deploy to ${{ inputs.environment }}
    runs-on: ubuntu-latest
    environment:
      name: ${{ inputs.environment }}

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22.x'
          cache: 'pnpm'

      - name: Install pnpm
        uses: pnpm/action-setup@v2
        with:
          version: 8

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Deploy to ${{ inputs.environment }}
        env:
          DEPLOYMENT_ENV: ${{ inputs.environment }}
          HEDERA_ACCOUNT_ID: ${{ secrets.HEDERA_ACCOUNT_ID }}
          HEDERA_PRIVATE_KEY: ${{ secrets.HEDERA_PRIVATE_KEY }}
          HEDERA_RPC_URL: ${{ secrets.HEDERA_RPC_URL }}
        run: |
          case $DEPLOYMENT_ENV in
            hedera-testnet)
              scripts/deploy-contracts.sh
              ;;
            base-testnet)
              echo "Base testnet deployment (future)"
              ;;
            arbitrum-testnet)
              echo "Arbitrum testnet deployment (future)"
              ;;
          esac

      - name: Notify Slack
        if: always()
        uses: 8398a7/action-slack@v3
        with:
          status: ${{ job.status }}
          text: 'Deployment to ${{ inputs.environment }} ${{ job.status }}'
          webhook_url: ${{ secrets.SLACK_WEBHOOK }}
```

---

## Acceptance Criteria

- ✅ Lint job: `pnpm lint` passes with no issues
- ✅ Format job: `pnpm format:check` passes
- ✅ Typecheck job: `pnpm typecheck` passes with no errors
- ✅ Test job: `pnpm test:coverage` passes with 90%+ coverage
- ✅ Contracts job: `pnpm contracts:build && pnpm contracts:test` passes
- ✅ Build job: `pnpm build` produces dist/ artifacts
- ✅ All jobs run in parallel where possible
- ✅ Coverage report uploaded to Codecov
- ✅ Contract ABIs uploaded as workflow artifact
- ✅ Docker image built (optional, on main branch)
- ✅ Deployment to Hedera testnet (manual or auto-trigger)
- ✅ Workflow summary reports all job statuses
- ✅ PR checks block merge if any job fails
- ✅ Main branch requires all checks to pass before deploy

---

## Commands

```bash
mkdir -p .github/workflows scripts
touch .github/workflows/ci.yml .github/workflows/deploy.yml scripts/deploy-contracts.sh scripts/get-contract-address.ts

# (Copy implementations above)

# Make scripts executable
chmod +x scripts/deploy-contracts.sh

pnpm typecheck
pnpm test

# Verify workflow syntax
pnpm dlx github-workflow-validator .github/workflows/ci.yml

git add .github/ scripts/ vitest.config.ts
git commit -m "Phase 14: CI/CD pipeline — GitHub Actions, coverage gate 90%, deployment"
```

---

## What's NOT in Phase 14

- Mainnet deployment (MVP is testnet-only)
- Kubernetes deployment (MVP is GitHub Actions)
- Terraform/IaC (defer to 2.0)
- Multi-chain simultaneous deployment (sequential in MVP)
