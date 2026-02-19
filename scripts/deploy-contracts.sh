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
