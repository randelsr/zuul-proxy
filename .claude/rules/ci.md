# CI/CD

## Pipeline Stages

Every build follows this pipeline order using GitHub Actions (`.github/workflows/`):

1. **Checkout and Setup** - Clone repo, set up Node.js (pin to LTS), cache `node_modules` via `actions/cache` with `pnpm-lock.yaml` hash key.
2. **Install** - `pnpm install --frozen-lockfile` (clean install for reproducible builds).
3. **Static Analysis** - Run in parallel: `pnpm lint` (ESLint), `pnpm format:check` (Prettier), `pnpm typecheck` (tsc --noEmit).
4. **Test** - `pnpm test:coverage` with minimum 80% threshold; fail the build if coverage drops below gate.
5. **Contract Compilation** - `pnpm contracts:build` for Solidity RBAC and audit contracts; cache compiled artifacts between runs.
6. **Build** - `pnpm build` for TypeScript compilation; optionally `docker compose build` to verify container image.
7. **Deploy** - Gated on all previous steps; only on `main` branch. Contract deployment to Hedera testnet via `scripts/deploy-contracts.sh`, proxy deployment via `scripts/deploy.sh`.

## Rules

- Use separate workflow jobs for lint/format/typecheck to enable parallel execution and faster feedback.
- Contract compilation must succeed before integration tests; use Hardhat cache to avoid recompilation on unchanged Solidity files.
- Deployment requires all quality gates (lint, types, tests, coverage) to pass; never deploy on failures.
- Pin Node.js version in workflow matrix to match `engines` field in `package.json`; support current LTS only.
- Store contract ABIs as workflow artifacts for downstream deployment jobs; include chain-specific deployment addresses in output.
- For testnet deployments, require manual approval gate or environment protection rules; mainnet deployments require explicit approval workflow.
