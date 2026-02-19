---
paths:
  - "package.json"
  - "pnpm-lock.yaml"
  - "tsconfig.json"
  - "src/**/*.ts"
  - "contracts/**/*.sol"
---

# Dependencies and Toolchain

- Use pnpm as the package manager; run `pnpm install` for dependency changes and commit `pnpm-lock.yaml` alongside `package.json`.
- Use Context7 to verify and reference up-to-date documentation for all dependencies (viem, Hardhat, pino, etc.); never rely on outdated or hallucinated API information.
- TypeScript strict mode is mandatory; run `pnpm typecheck` (tsc --noEmit) before committing and fix all type errors.
- Enforce quality pipeline locally via git hooks (lint-staged + husky): `pnpm lint`, `pnpm format:check`, `pnpm typecheck` must pass before commit.
- Use viem for all EVM client operations; viem's `recoverMessageAddress()` is purpose-built for agent wallet signature recovery. Do not use ethers.js; viem provides superior wallet abstraction and 4× smaller bundle size.
- All blockchain RPC calls must include explicit timeout configuration (default 30s for reads, 60s for writes) to prevent hanging requests.
- Use Hardhat (not Foundry) for Solidity compilation and testing; Hardhat Ignition provides config-driven multi-chain deployment. Generate contract ABIs via TypeChain; do not hand-write ABI types.
- Implement wallet abstraction as a unified pattern (not per-wallet drivers); all wallets (Coinbase Agentic Wallet, MetaMask, WalletConnect, raw ECDSA) follow EIP-191 standard and produce identical (message, signature, signer) tuples that viem's recovery API handles universally.
- Use Hardhat Ignition for safe, declarative multi-chain contract deployment; maintain identical Solidity bytecode across Hedera, Base, Arbitrum, and Optimism (network-specific addresses tracked per chain via Ignition parameter files).
- Secrets (API keys, encryption keys, RPC URLs with credentials) belong in `.env` files only; never import them in `package.json` scripts or config files.
- Pin direct dependencies to exact versions in package.json; use `pnpm update --latest` deliberately when upgrading.
- Test runner is Vitest; all new modules require unit tests and blockchain interactions require integration tests against a local Hardhat node.
- Keep SDK dependencies (MCP SDK, wallet SDKs) behind abstraction interfaces to preserve modularity across wallet providers and protocol versions.
