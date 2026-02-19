# Zuul Proxy — Planning Documentation

This directory contains all planning documents for the Zuul Proxy MVP (ETHDenver 2026 Hackathon).

---

## Start Here

**If you are implementing the MVP, read these in order:**

1. **`IMPLEMENTATION_PLAN_INDEX.md`** ← START HERE
   - Complete overview of all 15 phases
   - Day-by-day schedule
   - Risk mitigation
   - Quick reference for commands

2. **`phase_0_project_bootstrap.md`**
   - Project setup: package.json, tsconfig, linters, git hooks
   - Directory structure
   - First executable steps

3. **`phase_1_interface_contracts.md`**
   - Branded types, domain entities
   - Error hierarchy
   - Driver interfaces
   - Type guards

4. **`phase_2_smart_contracts.md`**
   - RBAC.sol and Audit.sol
   - Hardhat Ignition deployment modules
   - Contract tests
   - TypeChain setup

5. **`phases_3_to_15_summary.md`**
   - Phases 3-15 detailed breakdown
   - Config/logging, auth, RBAC, custody, chain driver
   - Proxy executor, middleware, HTTP handlers
   - Integration tests, demo agent, CI/CD, documentation

---

## Document Hierarchy

```
IMPLEMENTATION_PLAN_INDEX.md (master overview)
    ↓
    ├→ phase_0_project_bootstrap.md
    ├→ phase_1_interface_contracts.md
    ├→ phase_2_smart_contracts.md
    └→ phases_3_to_15_summary.md (covers phases 3-15)

Supporting Documents:
    ├→ mvp-prd.md (product requirements — what to build)
    ├→ ../ethdenver-hackathon.md (hackathon context & history)
    └→ ../.claude/rules/ (governance rules & constraints)
```

---

## Quick Navigation

### By Role

**Project Lead / Architect:**
1. Read `IMPLEMENTATION_PLAN_INDEX.md` for overview
2. Skim each phase document for structure
3. Use risk mitigation section for contingency planning
4. Check day-by-day schedule for task allocation

**Individual Contributor:**
1. Read `IMPLEMENTATION_PLAN_INDEX.md` critical path
2. Read assigned phase document in detail
3. Execute commands in the phase document
4. Run acceptance criteria checklist
5. Create git commit with specified message

**QA / Testing:**
1. Read `phases_3_to_15_summary.md` Phase 12 (E2E tests)
2. Review all test files mentioned in each phase
3. Run `pnpm test:coverage` to verify 90% gate
4. Execute demo scenario from Phase 13

### By Timeline

**Day 1 Schedule:** Read phases 0, 1, 2, 3
**Day 2 Schedule:** Read phases 3, 4, 5, 6, 7
**Day 3 Schedule:** Read phases 7, 8, 9, 10, 11, 12
**Day 4 Schedule:** Read phases 13, 14, 15

---

## Key Decisions (Resolved)

| Area | Decision |
|------|----------|
| **HTTP Forwarding** | `POST /rpc` = discovery only. All tool execution = `/forward/{target_url}`. |
| **Audit Timing** | Always async (never block response). In-memory queue + exponential backoff retry. |
| **Error Codes** | PRD error table is authoritative. 15 distinct codes (-32001 through -32603). |
| **Failure Mode** | Fail closed: on chain outage, return 503 (not 403). Never fail open. |
| **TypeScript** | Strict mode + branded scalar types. All type errors block commit. |
| **Test Coverage** | 90% on core modules (auth, rbac, audit, custody). CI gate at 90%. |
| **Demo Agent** | Generic TypeScript script using viem (no external SDK). |
| **Contracts** | Solidity 0.8.20, Hardhat + TypeChain for type-safe interaction. |

---

## File Locations After Implementation

**Type Definitions:** `src/types.ts`, `src/errors.ts`
**Auth Logic:** `src/auth/signature.ts`, `src/auth/nonce.ts`
**RBAC Logic:** `src/rbac/cache.ts`, `src/rbac/contract.ts`
**Key Handling:** `src/custody/key-vault.ts` (opaque handles)
**Blockchain:** `src/chain/{local,hedera,evm}.ts`
**HTTP API:** `src/api/{handlers,middleware,server}.ts`
**Tests:** `tests/{auth,rbac,proxy,audit,custody,chain,config,api,types,integration}/`
**Contracts:** `contracts/{RBAC,Audit}.sol`
**Deployment:** `ignition/modules/{RBAC,Audit}.ts`, `ignition/parameters/{local,hedera}.json`

---

## Quality Gates

Before committing any phase, run:

```bash
pnpm typecheck     # All type errors resolved
pnpm lint          # No linting issues
pnpm format:check  # Formatting compliant
pnpm test          # All tests passing
# (husky pre-commit hook enforces these)
```

Coverage requirement: **90%** on core modules (test coverage gate in CI)

---

## Critical Success Factors

1. **Phase 0 first:** Bootstrap tooling is the foundation. Don't skip or shortcut.
2. **Phase 1 locked early:** Branded types prevent massive refactoring later.
3. **Strict TypeScript:** All type errors must be resolved before commit (enforced by husky).
4. **90% coverage gate:** CI will fail if coverage drops below 90%.
5. **Fail closed on chain:** RBAC cache returns 503 on chain outage, never 403.
6. **Audit queue async:** Never block responses for audit writes (durable queue pattern).
7. **Live local Hardhat:** Integration tests use live local Hardhat (not mocked contracts).

---

## Troubleshooting

**Question:** "What if I'm stuck on a phase?"
**Answer:** Each phase document has acceptance criteria. If you can't meet them, review "What's NOT in this phase" section and check if a dependency isn't complete.

**Question:** "Can I work on phases in parallel?"
**Answer:** Yes! Check the dependency graph in `IMPLEMENTATION_PLAN_INDEX.md`. Phases 3, 4, 6 can run in parallel. Phases 9, 10, 11 can overlap.

**Question:** "What if contract compilation fails?"
**Answer:** Check `hardhat.config.ts` is configured correctly. Run `pnpm contracts:build` with verbose mode. Verify Solidity version is 0.8.20.

**Question:** "How do I deploy contracts?"
**Answer:** Phase 7 uses Hardhat Ignition. For local: `pnpm contracts:deploy:local`. For Hedera testnet: set .env vars + `pnpm contracts:deploy:hedera`.

**Question:** "How do I know if tests are passing?"
**Answer:** Run `pnpm test:coverage`. Output shows coverage % per module. Gate is 90%. HTML report at `coverage/index.html`.

---

## Glossary

| Term | Definition |
|------|-----------|
| **Branded Type** | TypeScript type with compile-time enforcement (e.g., `AgentAddress` is a string but can't be assigned to other strings) |
| **Fail Closed** | On error, deny access (conservative). If chain is down, agent gets 503, not 403. |
| **Fail Open** | On error, allow access (liberal). Would be wrong here — never used. |
| **Opaque Type** | A branded type whose underlying value cannot be accessed outside its module (e.g., `ApiKeyHandle`) |
| **Type Guard** | Function that narrows `unknown` to a specific type (e.g., `isAgentAddress()`) |
| **Discriminated Union** | Type with a tag field that determines which variant (e.g., JSON-RPC response with `error` vs `result` fields) |

---

## References

**External:**
- [viem docs](https://viem.sh) — EVM client library
- [Hardhat docs](https://hardhat.org) — Solidity development
- [Hono docs](https://hono.dev) — HTTP server framework
- [pino docs](https://getpino.io) — Structured logging
- [Vitest docs](https://vitest.dev) — Test runner
- [Hedera JSON-RPC](https://docs.hedera.com/hedera/sdks-and-apis/rest-api) — Hedera testnet RPC

**Internal:**
- `.claude/rules/` — Governance rules and constraints
- `mvp-prd.md` — Product requirements document
- `../ethdenver-hackathon.md` — Hackathon context

---

## Contact / Issues

All planning questions are answered in the phase documents. If you find a gap:

1. Check the phase document acceptance criteria
2. Review the "What's NOT in this phase" section
3. Check dependencies in IMPLEMENTATION_PLAN_INDEX.md dependency graph
4. Look for the issue in a previous phase's "Acceptance Criteria" section

---

**Version:** 1.0
**Last Updated:** February 19, 2026
**Hackathon Target:** February 21-23, 2026

---

## Document Manifest

```
.plans/
├── README_PLANS.md (this file)
├── IMPLEMENTATION_PLAN_INDEX.md (master reference)
├── phase_0_project_bootstrap.md
├── phase_1_interface_contracts.md
├── phase_2_smart_contracts.md
├── phases_3_to_15_summary.md
├── mvp-prd.md (product requirements)
├── executive-summary.md (stack decisions)
├── implementation-recommendations.md (tactical guidance)
└── (other research/planning docs)
```

**Total planning documentation:** ~50,000 words of detailed technical specifications
**Total implementation phases:** 15 phases, ~50-60 developer-hours estimated
**MVP target:** 4-day hackathon (Feb 21-24, 2026)
