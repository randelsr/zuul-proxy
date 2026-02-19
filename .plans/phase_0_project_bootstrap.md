# Phase 0: Project Bootstrap

**Duration:** ~2-3 hours
**Deliverable:** Fully configured project structure ready for TypeScript development
**Success Criteria:** `pnpm install && pnpm typecheck && pnpm lint` all pass with zero errors

---

## Objective

Set up a production-ready TypeScript monorepo with:
- Strict TypeScript configuration
- pnpm as package manager with lock file
- Git hooks for pre-commit quality gates
- ESLint + Prettier configuration
- Vitest for unit testing with 90% coverage threshold
- Hardhat for Solidity smart contracts with TypeChain code generation
- Environment variable template
- Directory structure aligned with MVP architecture

---

## Implementation Details

### 1. package.json

**File:** `/Users/nullfox/repos/zuul-proxy/package.json`

Key sections:
- `engines`: Pin to Node.js LTS (v22.x for 2026)
- `type`: "module" for ES modules
- Direct dependencies pinned to EXACT versions (no `^` or `~`)
- Scripts cover all quality gates

```json
{
  "name": "zuul-proxy",
  "version": "1.0.0",
  "description": "On-chain governance proxy for agent tool access",
  "type": "module",
  "engines": {
    "node": ">=22.0.0 <23.0.0"
  },
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src tests contracts --ext .ts,.sol",
    "format": "prettier --write src tests contracts",
    "format:check": "prettier --check src tests contracts",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "contracts:build": "hardhat compile",
    "contracts:test": "hardhat test",
    "contracts:deploy:local": "hardhat ignition deploy ignition/modules/RBAC.ts ignition/modules/Audit.ts --network localhost",
    "contracts:deploy:hedera": "hardhat ignition deploy ignition/modules/RBAC.ts ignition/modules/Audit.ts --network hedera --parameters ignition/parameters/hedera.json"
  },
  "dependencies": {
    "hono": "4.0.0",
    "viem": "2.4.0",
    "pino": "8.16.0",
    "yaml": "2.3.0",
    "uuid": "9.0.0",
    "zod": "3.22.0"
  },
  "devDependencies": {
    "typescript": "5.3.0",
    "@types/node": "20.10.0",
    "tsx": "4.7.0",
    "eslint": "8.55.0",
    "@typescript-eslint/parser": "6.13.0",
    "@typescript-eslint/eslint-plugin": "6.13.0",
    "prettier": "3.1.0",
    "vitest": "1.0.0",
    "@vitest/coverage-v8": "1.0.0",
    "hardhat": "2.19.0",
    "@nomicfoundation/hardhat-ignition": "0.15.0",
    "@nomicfoundation/hardhat-viem": "2.0.0",
    "@typechain/hardhat": "9.0.0",
    "typechain": "8.3.0",
    "solidity-coverage": "0.8.5",
    "pino-pretty": "11.0.0",
    "husky": "8.0.3",
    "lint-staged": "15.0.0"
  }
}
```

**Rationale:**
- Exact versions prevent "works on my machine" issues
- LTS pinning ensures reproducible builds across CI
- Scripts follow naming convention: `{domain}:{action}` (e.g., `contracts:build`)

---

### 2. tsconfig.json

**File:** `/Users/nullfox/repos/zuul-proxy/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "lib": ["ES2022"],
    "moduleResolution": "node16",
    "resolveJsonModule": true,
    "allowJs": false,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "strictBindCallApply": true,
    "strictPropertyInitialization": true,
    "noImplicitThis": true,
    "alwaysStrict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "baseUrl": ".",
    "paths": {
      "#src/*": ["src/*"],
      "#tests/*": ["tests/*"]
    }
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

**Rationale:**
- `strict: true` + all explicit strict flags enable maximum type safety
- `noUnusedLocals/noUnusedParameters` catch dead code at compile time
- Path aliases reduce import verbosity
- `exactOptionalPropertyTypes` enforces proper optional field handling (no `undefined` in non-optional fields)

---

### 3. .eslintrc.json

**File:** `/Users/nullfox/repos/zuul-proxy/.eslintrc.json`

```json
{
  "parser": "@typescript-eslint/parser",
  "parserOptions": {
    "ecmaVersion": 2022,
    "sourceType": "module"
  },
  "plugins": ["@typescript-eslint"],
  "extends": ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
  "rules": {
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/explicit-function-return-types": "warn",
    "no-console": ["error", { "allow": ["warn", "error"] }],
    "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }]
  },
  "overrides": [
    {
      "files": ["tests/**/*.ts"],
      "rules": {
        "@typescript-eslint/explicit-function-return-types": "off"
      }
    }
  ]
}
```

**Rationale:**
- Forbid `any` — enforce proper typing from day one
- `no-console` catches production logging misuse (pino required instead)
- Test files exempt from verbose return type requirements
- `argsIgnorePattern` allows unused params prefixed with `_`

---

### 4. .prettierrc

**File:** `/Users/nullfox/repos/zuul-proxy/.prettierrc`

```json
{
  "semi": true,
  "trailingComma": "es5",
  "singleQuote": true,
  "printWidth": 100,
  "tabWidth": 2,
  "useTabs": false
}
```

**Rationale:**
- Consistent with typical TypeScript project conventions
- Line width 100 balances readability and screen real estate

---

### 5. .gitignore

**File:** `/Users/nullfox/repos/zuul-proxy/.gitignore`

```
# Dependencies
node_modules/
pnpm-lock.yaml.bak

# Build outputs
dist/
build/
*.tsbuildinfo

# Testing
coverage/
.nyc_output/

# Hardhat
artifacts/
cache/
ignition/deployments/

# Environment
.env
.env.local
.env.*.local

# IDE
.vscode/
.idea/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Logs
*.log
npm-debug.log*
yarn-debug.log*
```

**Rationale:**
- `.env` explicitly gitignored (secrets never committed)
- `pnpm-lock.yaml` is committed, not backed up
- Build outputs excluded

---

### 6. .husky/pre-commit

**File:** `/Users/nullfox/repos/zuul-proxy/.husky/pre-commit`

```bash
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

pnpm exec lint-staged
```

**Rationale:**
- Runs lint-staged on every commit
- Blocks commits if quality gates fail

---

### 7. .lintstagedrc.json

**File:** `/Users/nullfox/repos/zuul-proxy/.lintstagedrc.json`

```json
{
  "src/**/*.ts": ["eslint --fix", "prettier --write"],
  "tests/**/*.ts": ["eslint --fix", "prettier --write"],
  "contracts/**/*.ts": ["eslint --fix", "prettier --write"],
  "contracts/**/*.sol": ["prettier --write"]
}
```

**Rationale:**
- ESLint fixes auto-fixable issues
- Prettier formats all files
- Runs only on staged files (fast feedback)

---

### 8. .env.example

**File:** `/Users/nullfox/repos/zuul-proxy/.env.example`

```bash
# Blockchain
HEDERA_RPC_URL=https://testnet.hashio.io/api
HEDERA_CHAIN_ID=295
HEDERA_ACCOUNT_ID=0.0.XXXXX
HEDERA_PRIVATE_KEY=

# Contracts (populated after deployment)
RBAC_CONTRACT_ADDRESS=
AUDIT_CONTRACT_ADDRESS=

# Proxy
PROXY_PRIVATE_KEY=
AUDIT_ENCRYPTION_KEY=

# Tool API Keys
GITHUB_API_KEY=
SLACK_API_KEY=
OPENAI_API_KEY=

# Development
NODE_ENV=development
LOG_LEVEL=debug
```

**Rationale:**
- All required env vars documented with examples
- No actual values (safe to commit)
- Matches expected usage in config.yaml

---

### 9. tsconfig for Contracts

**File:** `/Users/nullfox/repos/zuul-proxy/hardhat.config.ts`

```typescript
import { HardhatUserConfig } from 'hardhat/config';
import '@nomicfoundation/hardhat-ignition';
import '@nomicfoundation/hardhat-ethers';
import '@typechain/hardhat';
import 'solidity-coverage';

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.20',
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    localhost: {
      url: 'http://127.0.0.1:8545',
    },
    hedera: {
      url: process.env.HEDERA_RPC_URL || 'https://testnet.hashio.io/api',
      accounts: process.env.HEDERA_PRIVATE_KEY ? [process.env.HEDERA_PRIVATE_KEY] : [],
      chainId: 295,
    },
    base_testnet: {
      url: 'https://sepolia.base.org',
      accounts: process.env.BASE_PRIVATE_KEY ? [process.env.BASE_PRIVATE_KEY] : [],
      chainId: 84532,
    },
  },
  typechain: {
    outDir: 'src/contracts/generated',
    target: 'viem-v2',
  },
};

export default config;
```

**Rationale:**
- Solidity 0.8.20 (latest stable, matches contract examples in PRD)
- Optimizer enabled for production deployment
- TypeChain outputs viem-compatible types
- Hedera chain ID 295 (not 1 or 11155111)
- All networks configured but require env vars for credentials

---

### 10. vitest.config.ts

**File:** `/Users/nullfox/repos/zuul-proxy/vitest.config.ts`

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 90,
        statements: 90,
      },
      exclude: [
        'node_modules/',
        'dist/',
        'src/contracts/generated/',
      ],
    },
    include: ['tests/**/*.ts'],
    exclude: ['node_modules', 'dist'],
  },
});
```

**Rationale:**
- 90% threshold enforced on all metrics (per user decision)
- v8 provider (native Node.js support)
- HTML coverage report for visual inspection
- Generated contract types excluded from coverage

---

### 11. Directory Structure

Create all directories (empty for now):

```
zuul-proxy/
├── src/
│   ├── api/
│   │   ├── handlers/
│   │   ├── middleware/
│   │   └── server.ts
│   ├── auth/
│   ├── rbac/
│   ├── proxy/
│   ├── audit/
│   ├── custody/
│   ├── chain/
│   ├── config/
│   ├── contracts/
│   │   └── generated/   (TypeChain output, gitignored)
│   ├── types.ts
│   ├── errors.ts
│   ├── logging.ts
│   └── index.ts
├── tests/
│   ├── auth/
│   ├── rbac/
│   ├── proxy/
│   ├── audit/
│   ├── custody/
│   ├── chain/
│   ├── config/
│   ├── api/
│   ├── types/
│   ├── errors/
│   └── integration/
├── contracts/
│   ├── RBAC.sol
│   ├── Audit.sol
│   └── test/
├── ignition/
│   ├── modules/
│   │   ├── RBAC.ts
│   │   └── Audit.ts
│   └── parameters/
│       ├── local.json
│       └── hedera.json
├── demo/
│   ├── agent.ts
│   ├── scenario.ts
│   └── README.md
├── docs/
│   ├── architecture.md
│   ├── api.md
│   └── deployment.md
├── .github/
│   └── workflows/
│       └── ci.yml
└── .plans/
    └── (all planning documents)
```

---

### 12. CLAUDE.md

**File:** `/Users/nullfox/repos/zuul-proxy/CLAUDE.md`

```markdown
# Claude Code Context

## Project Overview

**Zuul Proxy** is an on-chain governance proxy for agent tool access. Agents route HTTP service calls through Zuul, which enforces RBAC permissions (from smart contracts) and audits all requests to an immutable blockchain log.

## Architecture

- **MVP Scope:** HTTP API with JSON-RPC 2.0 semantics; governance is opt-in (not transparent)
- **Blockchain:** Hedera testnet (chainId 295) via viem; extensible to Base, Arbitrum, Optimism
- **Audit:** Dual signatures (agent + proxy), encrypted payloads, blockchain writes
- **Testing:** Vitest for unit tests, local Hardhat for contract integration

## Key Rules

- See `.claude/rules/` for governance, API, CI/CD, exception handling, dependencies, testing, logging, code style, documentation, and TypeScript standards
- See `.plans/mvp-prd.md` for full product requirements
- All phases (0-15) are documented in `.plans/phase_N_*.md`

## Critical Files

- `src/types.ts` — Domain types (Agent, Role, Permission, AuditEntry, etc.)
- `src/api/server.ts` — Hono HTTP server with middleware pipeline
- `src/audit/store.ts` — Durable audit queue with blockchain writes
- `src/rbac/cache.ts` — Permission cache with TTL
- `contracts/RBAC.sol`, `contracts/Audit.sol` — Solidity contracts

## Commands

```bash
pnpm install              # Install dependencies
pnpm typecheck           # TypeScript strict mode check
pnpm lint                # ESLint
pnpm test                # Unit tests with 90%+ coverage gate
pnpm contracts:build     # Compile Solidity contracts
pnpm build               # TypeScript compilation
pnpm dev                 # Start server in watch mode
```

## Next Steps

1. Bootstrap project: Phase 0 (tooling, config, directory structure)
2. Implement core modules: Phases 1-11 (types, auth, RBAC, audit, API)
3. Add tests and docs: Phases 12-15 (E2E, demo, documentation)
```

---

### 13. Initialize Git Hooks

Commands to run after cloning:

```bash
pnpm install
pnpm exec husky install
pnpm exec husky add .husky/pre-commit "pnpm exec lint-staged"
```

---

## Acceptance Criteria

- ✅ All config files present and valid JSON/YAML
- ✅ `pnpm install` completes without errors
- ✅ `pnpm typecheck` passes (empty project has no type errors)
- ✅ `pnpm lint` passes (no linting issues in placeholder files)
- ✅ `pnpm format:check` passes
- ✅ Directory structure matches MVP architecture diagram
- ✅ `git add .` → `git commit -m "..."` triggers husky hooks (runs lint-staged)
- ✅ `.env` is gitignored; `.env.example` is committed

---

## Commands to Execute

```bash
cd /Users/nullfox/repos/zuul-proxy

# Install dependencies
pnpm install

# Verify setup
pnpm typecheck
pnpm lint
pnpm format:check

# Create directories
mkdir -p src/{api/{handlers,middleware},auth,rbac,proxy,audit,custody,chain,config,contracts/generated}
mkdir -p tests/{auth,rbac,proxy,audit,custody,chain,config,api,types,errors,integration}
mkdir -p contracts/test
mkdir -p ignition/{modules,parameters}
mkdir -p demo docs .github/workflows

# Install git hooks
pnpm exec husky install
pnpm exec husky add .husky/pre-commit "pnpm exec lint-staged"

# Commit
git add .
git commit -m "Phase 0: Project bootstrap — tooling, config, directory structure"
```

---

## Notes

- **pnpm-lock.yaml:** Will be generated by `pnpm install`. Commit it alongside `package.json`.
- **Node version:** If using NVM or similar, create `.nvmrc` with `22` to pin version.
- **CI:** GitHub Actions will use the `engines` field from `package.json` to select Node version.
- **Pre-commit hooks:** First `git commit` will prompt to set up husky; subsequent commits run lint-staged automatically.
- **TypeScript:** Strict mode enabled. All type errors must be resolved before committing (enforced by pre-commit hook + CI).

---

## What's NOT in Phase 0

- Source code (all implemented in later phases)
- Tests (created in parallel with implementation)
- Smart contracts (Phase 2)
- Documentation beyond config files (Phase 15)
