# Zuul Proxy — Complete Implementation Plan Index

**Date:** February 19, 2026
**Hackathon Target:** February 21-23, 2026 (4 days)
**Total Estimated Effort:** ~50-60 developer-hours

---

## Overview

This index maps the complete 15-phase implementation plan for the Zuul Proxy MVP. Each phase builds on previous phases in a strict dependency order. This document is the master reference for implementation sequencing.

---

## Document Structure

| Phase | Document | Duration | Key Deliverables |
|-------|----------|----------|------------------|
| **0** | `phase_0_project_bootstrap.md` | 2-3h | package.json, tsconfig, linters, directory structure |
| **1** | `phase_1_interface_contracts.md` | 4-5h | Branded types, domain entities, driver interfaces |
| **2** | `phase_2_smart_contracts.md` | 4-6h | RBAC.sol, Audit.sol, TypeChain, Hardhat Ignition |
| **3-15** | `phases_3_to_15_summary.md` | ~40h | Config/Auth/RBAC/Custody/Chain/Audit/Proxy/Middleware/API/Tests/Demo/CI/Docs |

---

## Phase Breakdown

### Phase 0: Project Bootstrap (2-3 hours)
**Status:** Ready to start
**Dependencies:** None

**Outputs:**
- `package.json` with exact dependency versions
- `tsconfig.json` with strict mode enabled
- `.eslintrc.json` + `.prettierrc`
- `.husky/pre-commit` hooks
- `.env.example` template
- Directory structure (src/, tests/, contracts/, ignition/, demo/, docs/)

**Key Actions:**
```bash
pnpm install
npx husky install
mkdir -p src/{api/{handlers,middleware},auth,rbac,proxy,audit,custody,chain,config,contracts/generated}
mkdir -p tests/{auth,rbac,proxy,audit,custody,chain,config,api,types,integration}
```

**Commit:** "Phase 0: Project bootstrap — tooling, config, directory structure"

---

### Phase 1: Interface Contracts (4-5 hours)
**Status:** Ready to start (depends on Phase 0)
**Dependencies:** Phase 0

**Outputs:**
- `src/types.ts` — All branded scalars, domain entities, JSON-RPC discriminated unions, Result<T,E>
- `src/errors.ts` — ZuulError hierarchy, all 15 error codes (PRD authoritative)
- `src/chain/driver.ts` — ChainDriver interface
- `src/audit/driver.ts` — AuditStoreDriver interface
- `src/custody/driver.ts` — KeyCustodyDriver interface
- Tests: `tests/types/test_branded.ts`, `tests/errors/test_error_hierarchy.ts`

**Key Decisions:**
- ApiKeyHandle, EncryptedPayload are OPAQUE branded types (never serializable)
- JSON-RPC uses discriminated unions (never optional result + optional error)
- ACTION_TO_METHODS enforced exhaustive with `satisfies`
- All error codes from PRD error table (authoritative)

**Acceptance Criteria:**
- ✅ `pnpm typecheck` passes
- ✅ All branded types defined
- ✅ Driver interfaces documented with timeout/retry semantics
- ✅ Tests passing

**Commit:** "Phase 1: Interface contracts — branded types, domain entities, driver interfaces"

---

### Phase 2: Smart Contracts (4-6 hours)
**Status:** Ready to start (can parallel with Phase 1)
**Dependencies:** Phase 0

**Outputs:**
- `contracts/RBAC.sol` — Permission management (registerAgent, grantPermission, hasPermission, emergencyRevoke)
- `contracts/Audit.sol` — Immutable audit log (logAudit, getAuditEntry)
- `ignition/modules/RBAC.ts`, `Audit.ts` — Hardhat Ignition deployment modules
- `ignition/parameters/local.json`, `hedera.json` — Network-specific parameters
- `contracts/test/RBAC.test.ts`, `Audit.test.ts` — TypeScript unit tests

**Key Features:**
- RBAC: ownership-gated, role-based permissions, emergency revoke
- Audit: immutable append-only log, encrypted payload + public hash + signatures
- TypeChain: auto-generates `src/contracts/generated/` types (viem-compatible)

**Acceptance Criteria:**
- ✅ `pnpm contracts:build` passes
- ✅ `pnpm contracts:test` passes all tests
- ✅ TypeChain types generated
- ✅ Ignition modules ready for deployment

**Commit:** "Phase 2: Smart contracts — RBAC.sol, Audit.sol, Hardhat Ignition, tests"

---

### Phase 3-15: Core Implementation
**See:** `phases_3_to_15_summary.md` for detailed breakdown

**Quick Reference:**
| Phase | Title | Hours | Depends On |
|-------|-------|-------|-----------|
| 3 | Config & Logging | 3 | 0, 1 |
| 4 | Auth Module | 4 | 0, 1, 3 |
| 5 | RBAC Module | 4 | 0, 1, 2, 3 |
| 6 | Key Custody | 2 | 0, 1, 3 |
| 7 | Chain Driver | 5 | 0, 1, 2 |
| 8 | Audit Module | 5 | 0, 1, 3, 7 |
| 9 | Proxy Executor | 3 | 0, 1, 5, 6, 8 |
| 10 | Middleware Pipeline | 4 | 0, 1, 3, 4, 5, 6 |
| 11 | HTTP API Handlers | 4 | 0, 1, 3, 4, 5, 9, 10 |
| 12 | E2E Integration Tests | 4 | 1-11 |
| 13 | Demo Agent | 3 | 1-11 (running) |
| 14 | CI/CD Pipeline | 3 | 0-13 |
| 15 | Documentation | 3-4 | 1-14 |

---

## Critical Path (Sequential)

```
Phase 0 (2-3h)
    ↓
Phase 1 (4-5h)  [can parallel with 2]
    ↓
Phase 2 (4-6h)  [can parallel with 1]
    ↓
[Phase 3, 4, 6 can run in parallel; Phase 5 waits for 2]
    ↓
Phase 7 (5h) [waits for Phase 2]
    ↓
Phase 8 (5h)
    ↓
[Phase 9, 10, 11 can overlap]
    ↓
Phase 12 (4h)
    ↓
Phase 13 (3h)
    ↓
Phase 14 (3h) [can parallel with 13]
    ↓
Phase 15 (3-4h)
```

**Minimum sequential time:** ~28 hours
**With parallelization:** ~20-22 hours (realistic for a 2-3 person team)

---

## Quality Gates (Before Every Commit)

```bash
# All phases require these to pass:
pnpm typecheck     # Zero type errors
pnpm lint          # No linting issues
pnpm format:check  # Formatting compliant
pnpm test          # All tests passing
# Plus: pre-commit hooks enforce the above
```

**Coverage requirement:** 90% on core modules (auth, rbac, proxy, audit)

---

## Key Resolved Design Decisions

| Decision | Resolution |
|----------|-----------|
| `tools/call` | NOT an RPC method. `POST /rpc` = discovery only. Execution = `/forward/{target_url}`. |
| Audit timing | Always async (never block response). In-memory queue with exponential backoff retry. |
| Audit signatures | Both: X-Signature (agent intent) + proxy signature (Zuul attestation). |
| Coverage gate | 90% overall — CI fails below 90%. |
| Demo agent | Generic TypeScript with viem (no OpenClaw SDK). |
| Error codes | PRD table is authoritative (api.md's -32004 for unknown_tool is wrong; correct = -32013). |
| RBAC on outage | Fail closed (503 -32022), never fail open (403). |
| Nonce storage | In-memory Map per agent (MVP limitation — documented). |
| HTTP-only | No WebSocket/gRPC/SSH in MVP. |

---

## File Structure After All Phases

```
zuul-proxy/
├── src/
│   ├── api/
│   │   ├── handlers/
│   │   │   ├── rpc.ts
│   │   │   ├── forward.ts
│   │   │   └── health.ts
│   │   ├── middleware/
│   │   │   ├── signature.ts
│   │   │   ├── rbac.ts
│   │   │   └── audit.ts
│   │   └── server.ts
│   ├── auth/
│   │   ├── guards.ts
│   │   ├── signature.ts
│   │   ├── nonce.ts
│   │   └── timestamp.ts
│   ├── rbac/
│   │   ├── permission.ts
│   │   ├── cache.ts
│   │   └── contract.ts
│   ├── proxy/
│   │   ├── action-mapper.ts
│   │   ├── tool-registry.ts
│   │   └── executor.ts
│   ├── audit/
│   │   ├── payload.ts
│   │   ├── encryption.ts
│   │   ├── store.ts
│   │   └── contract.ts
│   ├── custody/
│   │   ├── key-loader.ts
│   │   └── key-vault.ts
│   ├── chain/
│   │   ├── driver.ts
│   │   ├── local.ts
│   │   ├── hedera.ts
│   │   ├── evm.ts
│   │   └── factory.ts
│   ├── config/
│   │   ├── types.ts
│   │   ├── schema.ts
│   │   └── loader.ts
│   ├── types.ts
│   ├── errors.ts
│   ├── logging.ts
│   └── index.ts
├── tests/
│   ├── auth/ (90%+ coverage)
│   ├── rbac/ (90%+ coverage)
│   ├── proxy/
│   ├── audit/ (90%+ coverage)
│   ├── custody/
│   ├── chain/
│   ├── config/
│   ├── api/
│   ├── types/
│   └── integration/
├── contracts/
│   ├── RBAC.sol
│   ├── Audit.sol
│   └── test/
│       ├── RBAC.test.ts
│       └── Audit.test.ts
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
│   ├── deployment.md
│   └── security.md
├── .github/
│   └── workflows/
│       └── ci.yml
├── .plans/
│   ├── (all planning documents)
│   ├── phase_0_project_bootstrap.md
│   ├── phase_1_interface_contracts.md
│   ├── phase_2_smart_contracts.md
│   ├── phases_3_to_15_summary.md
│   └── IMPLEMENTATION_PLAN_INDEX.md
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
├── .eslintrc.json
├── .prettierrc
├── .gitignore
├── .env.example
├── .env (gitignored)
├── hardhat.config.ts
├── vitest.config.ts
├── README.md
└── .husky/
    └── pre-commit
```

---

## Recommended Day-by-Day Schedule

### Day 1 (Friday, Feb 21)
- **Phase 0** (2-3h) — Bootstrap tooling
- **Phase 1** (4-5h) — Interface contracts & types
- **Phase 2** (start) — Smart contracts (parallel with Phase 1, complete by EOD)
- **Phase 3** (start) — Config & logging

### Day 2 (Saturday, Feb 22)
- **Phase 3** (complete) — Config & logging
- **Phase 4** (4h) — Auth module
- **Phase 5** (4h) — RBAC module (wait for Phase 2 contracts)
- **Phase 6** (2h) — Key custody
- **Phase 7** (start) — Chain driver (parallel, complete by EOD)

### Day 3 (Sunday, Feb 23, Morning)
- **Phase 7** (complete) — Chain driver
- **Phase 8** (4h) — Audit module
- **Phase 9** (3h) — Proxy executor

### Day 3 (Sunday, Feb 23, Afternoon)
- **Phase 10** (4h) — Middleware pipeline
- **Phase 11** (4h) — HTTP API handlers
- **Phase 12** (2-3h) — E2E integration tests

### Day 4 (Monday, Feb 24, OR Sunday evening if running long)
- **Phase 13** (3h) — Demo agent & scenario
- **Phase 14** (3h) — CI/CD pipeline
- **Phase 15** (3-4h) — Documentation
- Final testing & presentation prep

---

## Risk Mitigation

### High-Risk Areas

1. **Contract interaction (Phase 2 + Phase 7)** → Mitigate: Local Hardhat for unit tests before testnet
2. **Async audit queue (Phase 8)** → Mitigate: In-memory MVP, acknowledged limitation, documented
3. **TypeScript strict mode (Phase 0)** → Mitigate: tsconfig locked early, enforced by husky pre-commit
4. **Integration testing (Phase 12)** → Mitigate: Live local Hardhat + mocked upstream tools

### Fallback Plans

- If Phase 2 (contracts) overruns → Skip initial testnet deployment, use local Hardhat for demo
- If Phase 8 (audit queue) overruns → Implement blocking audit writes (simpler, trades latency for correctness)
- If Phase 14 (CI/CD) overruns → Deploy manually for demo, CI can be completed post-hackathon
- If Phase 15 (documentation) overruns → Focus on README + API doc; architecture/security docs post-event

---

## Commands Quick Reference

```bash
# Setup
pnpm install
npx husky install

# Development
pnpm dev          # Watch mode
pnpm typecheck    # Type checking
pnpm lint         # Linting
pnpm format:check # Format check

# Testing
pnpm test         # Unit tests
pnpm test:watch   # Watch mode
pnpm test:coverage # Coverage report (90% gate)

# Contracts
pnpm contracts:build  # Compile Solidity
pnpm contracts:test   # Run Hardhat tests
pnpm contracts:deploy:local  # Deploy to local Hardhat
pnpm contracts:deploy:hedera # Deploy to Hedera testnet (with .env)

# Build
pnpm build        # TypeScript compilation

# Demo
npx ts-node demo/scenario.ts  # Run full demo
```

---

## Success Criteria for MVP

- ✅ All 15 phases complete
- ✅ `pnpm typecheck && pnpm lint && pnpm test:coverage` passes (90% gate)
- ✅ `pnpm contracts:build && pnpm contracts:test` passes
- ✅ Demo agent runs end-to-end against local proxy
- ✅ Audit entries visible on-chain (local Hardhat or Hedera testnet)
- ✅ Live presentation: signature verification → permission denied → emergency revoke → success flow
- ✅ GitHub Actions CI/CD passes
- ✅ README + API docs complete

---

## Post-Hackathon Roadmap (Stretch Goals / 2.0)

- Event-based RBAC cache invalidation (listen to contract events)
- Persistent audit queue (SQLite backend)
- Native MCP server support (Streamable HTTP + SSE)
- Transparent HTTP interception (HTTP_PROXY env var)
- Per-path RBAC (not just tool-level)
- JWT session mode for high-throughput tools
- Vault integration (AWS Secrets Manager, HashiCorp Vault)
- OpenTelemetry tracing

---

## Contact & Questions

For implementation questions, refer to the detailed phase documents:
- `phase_0_project_bootstrap.md` — Tooling setup
- `phase_1_interface_contracts.md` — Type system & interfaces
- `phase_2_smart_contracts.md` — Solidity contracts
- `phases_3_to_15_summary.md` — All remaining phases

Each phase document includes:
- Objective & dependencies
- Complete file implementations
- Test coverage requirements
- Acceptance criteria
- Commands to execute
- What's NOT included (defer to later phases)
