#!/bin/bash

# ============================================================================
# Zuul Proxy Local Development Setup
# ============================================================================
#
# This script sets up a complete local development environment with:
# 1. Smart contracts deployed to Hardhat
# 2. Test agents registered on-chain
# 3. Permissions configured from config.yaml
#
# Prerequisites:
#   - Hardhat node running on localhost:8545 (start with: pnpm contracts:dev)
#   - .env file configured with RBAC_CONTRACT_ADDRESS and AUDIT_CONTRACT_ADDRESS
#
# Usage:
#   ./scripts/setup-local-dev.sh
#

set -e

# Ensure we're in the right directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR/.."

echo "🚀 Setting Up Local Development Environment"
echo "==========================================="
echo ""

# Check if Hardhat node is running
echo "📍 Checking for Hardhat node on localhost:8545..."
if ! curl -s http://localhost:8545 > /dev/null 2>&1; then
  echo "❌ Error: Hardhat node not running on localhost:8545"
  echo ""
  echo "Start it with:"
  echo "  pnpm contracts:dev"
  echo ""
  exit 1
fi
echo "✓ Hardhat node is running\n"

# Check for .env file
if [ ! -f .env ]; then
  echo "❌ Error: .env file not found"
  echo ""
  echo "Create it with:"
  echo "  cp .env.example .env"
  echo ""
  exit 1
fi

echo "✓ .env file found\n"

# Deploy contracts
echo "📦 Deploying smart contracts..."
DEPLOY_OUTPUT=$(pnpm hardhat ignition deploy ignition/modules/Zuul.js --network localhost 2>&1)
DEPLOY_EXIT=$?

# Extract contract addresses from deployment output
# Ignition prints: "Zuul#RBAC - 0x..." and "Zuul#Audit - 0x..."
RBAC_ADDRESS=$(echo "$DEPLOY_OUTPUT" | grep "Zuul#RBAC -" | awk '{print $NF}')
AUDIT_ADDRESS=$(echo "$DEPLOY_OUTPUT" | grep "Zuul#Audit -" | awk '{print $NF}')

echo ""
echo "📍 Reading deployed contract addresses..."

if [ -z "$RBAC_ADDRESS" ] || [ -z "$AUDIT_ADDRESS" ]; then
  echo "⚠️  Could not extract contract addresses from deployment"
  echo ""
  echo "   Deployment output:"
  echo "$DEPLOY_OUTPUT" | tail -30
  echo ""
  echo "   Please update .env manually with:"
  echo "   RBAC_CONTRACT_ADDRESS=0x..."
  echo "   AUDIT_CONTRACT_ADDRESS=0x..."
  echo ""
  echo "   Then run: pnpm setup:agents"
  exit 1
fi

echo "✓ Found contract addresses:"
echo "  RBAC: $RBAC_ADDRESS"
echo "  Audit: $AUDIT_ADDRESS"
echo ""

# Update .env with new addresses
sed -i.bak "s|RBAC_CONTRACT_ADDRESS=.*|RBAC_CONTRACT_ADDRESS=$RBAC_ADDRESS|" .env
sed -i.bak "s|AUDIT_CONTRACT_ADDRESS=.*|AUDIT_CONTRACT_ADDRESS=$AUDIT_ADDRESS|" .env
rm -f .env.bak

# Export for the agent setup script
export RBAC_CONTRACT_ADDRESS="$RBAC_ADDRESS"
export AUDIT_CONTRACT_ADDRESS="$AUDIT_ADDRESS"

# Setup test agents
echo "🤖 Setting up test agents..."
if [ -z "$RBAC_CONTRACT_ADDRESS" ] || [ -z "$AUDIT_CONTRACT_ADDRESS" ]; then
  echo "⚠️  Skipping agent setup: contract addresses not available"
  echo "   Please set RBAC_CONTRACT_ADDRESS and AUDIT_CONTRACT_ADDRESS in .env"
else
  # Register agents via Hardhat
  pnpm hardhat run scripts/register-agents.cjs --network localhost
fi

echo ""
echo "✅ LOCAL DEVELOPMENT SETUP COMPLETE!"
echo "====================================="
echo ""
echo "Next steps:"
echo "1. Start the Zuul Proxy server:"
echo "   pnpm dev"
echo ""
echo "2. In another terminal, run the demo:"
echo "   pnpm demo"
echo ""
