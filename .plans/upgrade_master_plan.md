# Hardhat 3 + Full Dependency Upgrade — Master Integration Plan

## Executive Summary

Complete upgrade of the Zuul Proxy project from Hardhat 2.22.0 to Hardhat 3.1.9 and all dependencies to latest versions. This is a multi-phase, high-complexity upgrade affecting the entire build pipeline, test infrastructure, and runtime environment.

**Total Scope**: 4 phases, ~20 files modified/created/deleted, 15+ dependency version changes
**Risk**: HIGH (foundational tooling change in Phase 16; major runtime deps in Phase 19)
**Estimated Total Duration**: 4-6 hours for careful execution and validation
**Target Node.js Version**: 22+ (already required by project)

---

## Phase Overview

### Phase 16: Hardhat 3 Core Upgrade ⚠️ **CRITICAL PATH**
- **Focus**: Replace Hardhat 2 → 3, ESM config, remove TypeChain, viem-first setup
- **Files Modified**: 7 critical files
- **Risk**: HIGH (foundational)
- **Priority**: 1 (must be done first; blocks other phases)
- **Estimated Time**: 1.5-2 hours

**Key Changes**:
- Replace `hardhat.config.cjs` with `hardhat.config.ts` (ESM syntax, plugin array)
- Delete `tsconfig.hardhat.json` (no longer needed)
- Delete `@typechain/hardhat` and `typechain` (Hardhat 3 native typed artifacts)
- Add `@nomicfoundation/hardhat-toolbox-viem` (viem-first)
- Rewrite `scripts/register-agents.cjs` → `scripts/register-agents.ts` (standalone viem)
- Rename `ignition/modules/Zuul.js` → `Zuul.ts`

**Validation**:
- `pnpm contracts:build` compiles Solidity
- `pnpm setup:dev` deploys contracts and registers agents
- `pnpm demo` runs successfully

---

### Phase 17: Dev Tools Upgrade ⚠️ **QUALITY GATES**
- **Focus**: Update Vitest 1→4, ESLint 9→10, TypeScript, lint-staged, husky
- **Files Modified**: 1 file (`package.json`)
- **Risk**: MEDIUM (dev tools; impacts CI/test execution)
- **Priority**: 2 (after Phase 16)
- **Estimated Time**: 1 hour

**Key Changes**:
- Vitest 1.6.0 → 4.0.18 (review vitest config if exists)
- ESLint 9.0.0 → 10.0.0
- @typescript-eslint 7.0.0 → 8.56.0
- @types/node, prettier, tsx, husky, lint-staged, pino-pretty (minor/patch updates)
- TypeScript 5.9.2 → 5.9.3

**Validation**:
- `pnpm test` passes with 90%+ coverage
- `pnpm lint` passes (may have new warnings from @typescript-eslint 8)
- `pnpm typecheck` passes

---

### Phase 18: Runtime Safe Upgrades ✅ **LOW RISK**
- **Focus**: Hono, viem (within 2.x), YAML (within-major updates)
- **Files Modified**: 1 file (`package.json`)
- **Risk**: LOW (no breaking changes, within major versions)
- **Priority**: 3 (after Phase 17)
- **Estimated Time**: 30 minutes

**Key Changes**:
- Hono 4.0.0 → 4.12.0
- viem 2.4.0 → 2.46.2
- yaml 2.3.0 → 2.8.2

**Validation**:
- `pnpm dev` starts successfully
- `curl http://localhost:8080/health` returns 200
- All existing tests still pass

---

### Phase 19: Runtime Major Upgrades ⚠️⚠️ **HIGHEST RISK**
- **Focus**: pino (8→10), uuid (9→13), zod (3→4) — requires code inspection
- **Files Modified**: 3-4 source files (logging, schema validation, imports)
- **Risk**: HIGHEST (major versions, breaking API changes)
- **Priority**: 4 (do last, after all other phases stable)
- **Estimated Time**: 1.5-2 hours (includes code audit and fixes)

**Key Changes**:
- pino 8.16.0 → 10.3.1 (audit logger factory, API)
- uuid 9.0.0 → 13.0.0 (verify ESM named imports)
- zod 3.22.0 → 4.3.6 (audit schema definitions, validation calls)

**Validation**:
- `pnpm typecheck` passes with updated imports
- `pnpm test:coverage` passes 90%+ threshold
- `pnpm dev` starts with correct log format
- Config loads and validates correctly

---

## Detailed Phase Execution Order

```
Start (Fresh main branch, all tests passing)
  ↓
Phase 16: Hardhat 3 Core
  - Delete hardhat.config.cjs, tsconfig.hardhat.json
  - Create hardhat.config.ts
  - Update Hardhat and ignition deps
  - Rewrite scripts/register-agents.cjs → .ts
  - Verify: contracts:build, setup:dev, demo pass
  ↓
Phase 17: Dev Tools
  - Update vitest, eslint, @typescript-eslint, @types/node
  - Verify: test (90%+ coverage), lint, typecheck all pass
  ↓
Phase 18: Runtime Safe
  - Update hono, viem (2.x), yaml
  - Verify: dev server starts, health check works
  ↓
Phase 19: Runtime Major
  - Update pino, uuid, zod
  - Audit and fix source code as needed
  - Verify: full test suite, dev server, demo scenario
  ↓
End (All validations passing, ready for commit)
```

---

## Critical Files Modified

| Phase | File | Action | Notes |
|-------|------|--------|-------|
| 16 | `hardhat.config.cjs` | **DELETE** | Replaced by hardhat.config.ts |
| 16 | `hardhat.config.ts` | **CREATE** | ESM, TypeScript, plugins array |
| 16 | `tsconfig.hardhat.json` | **DELETE** | No longer needed in Hardhat 3 |
| 16 | `ignition/modules/Zuul.js` | **RENAME** | → Zuul.ts (add types) |
| 16 | `scripts/register-agents.cjs` | **DELETE** | Replaced by TypeScript version |
| 16 | `scripts/register-agents.ts` | **CREATE** | Standalone viem, no hre dependency |
| 16 | `package.json` | UPDATE | Hardhat 3, remove/add plugins, update scripts |
| 17 | `package.json` | UPDATE | Vitest, ESLint, TypeScript versions |
| 18 | `package.json` | UPDATE | Hono, viem, yaml versions |
| 19 | `package.json` | UPDATE | Pino, uuid, zod versions |
| 19 | `src/logging.ts` | AUDIT | Verify pino v10 API compatibility |
| 19 | Source files with `uuid` | AUDIT | Verify ESM named imports |
| 19 | Source files with `zod` | AUDIT | Verify schema definitions work |

---

## Validation Checklist (Run after each phase)

### Minimum After Each Phase
```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test 2>&1 | tail -20
```

### Full After Phase 19 (Final)
```bash
# Clean state
rm -rf node_modules pnpm-lock.yaml
pnpm install

# All quality gates
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test:coverage
pnpm build

# Contracts and demo
pnpm contracts:build
pnpm contracts:dev &
sleep 2
pnpm setup:dev
pnpm demo
kill %1  # Kill Hardhat
```

**Expected Results**:
- ✅ 0 TypeScript errors
- ✅ 0 Lint errors (warnings acceptable)
- ✅ 90%+ test coverage
- ✅ All 21 unit tests pass
- ✅ Server starts without errors
- ✅ Demo agent runs successfully (2-3 tools visible)

---

## Git Workflow

### Before Starting
```bash
git checkout main
git pull origin main
git status  # Should be clean
```

### During Each Phase
```bash
# Work on phase
# ... edit files, run validations ...

# After each phase validates:
git add package.json package-lock.yaml (or pnpm-lock.yaml)
git add -A  # Stage new/modified files
git diff --cached | head -50  # Review changes

# Commit
git commit -m "Phase N: [description]"
```

### Example Commit Messages
```
Phase 16: Hardhat 3 core upgrade (ESM config, remove TypeChain, viem-first)

- Replace hardhat.config.cjs with hardhat.config.ts (ESM syntax, plugin array)
- Delete tsconfig.hardhat.json (no longer needed in Hardhat 3)
- Update @nomicfoundation deps: hardhat@3.1.9, hardhat-toolbox-viem@5.0.2
- Remove @typechain/hardhat and typechain (Hardhat 3 generates typed artifacts)
- Rewrite scripts/register-agents.cjs as standalone viem TypeScript
- Rename ignition/modules/Zuul.js to Zuul.ts with type annotations
- Verify: contracts:build, setup:dev, demo all pass
```

### Final PR
After all 4 phases pass validation:
```bash
git log --oneline main..HEAD
# Should show 4 commits (one per phase)

# Push and create PR
git push origin phase/hardhat3-upgrade
# Create pull request on GitHub
```

---

## Troubleshooting Guide

### Phase 16 Blockers

**Error**: `Cannot find module 'ts-node'`
- **Cause**: ts-node was used in old hardhat.config.cjs
- **Fix**: Hardhat 3 reads .ts files natively; no ts-node needed

**Error**: `ReferenceError: hre is not defined`
- **Cause**: scripts/register-agents.ts still references old hre
- **Fix**: Use standalone viem client instead of hre.ethers

**Error**: `hardhat-toolbox is not a valid plugin`
- **Cause**: Hardhat 3 doesn't recognize hardhat-toolbox; need hardhat-toolbox-viem
- **Fix**: Remove hardhat-toolbox, add hardhat-toolbox-viem

### Phase 17 Blockers

**Error**: `Cannot find module 'vitest'`
- **Cause**: pnpm install didn't complete
- **Fix**: Run `pnpm install --frozen-lockfile` again

**Error**: `Vitest 4 config error: pool is not defined`
- **Cause**: vitest.config.ts uses v1 syntax
- **Fix**: Update config to v4 format (see Phase 17 step 1)

### Phase 18 Blockers

**Error**: `viem API changed`
- **Cause**: This shouldn't happen (viem 2.4 → 2.46 is patch-safe)
- **Fix**: Verify viem is updated correctly; rerun `pnpm test`

### Phase 19 Blockers

**Error**: Pino logger initialization fails
- **Cause**: Logger factory API changed in v10
- **Fix**: Audit src/logging.ts against Pino v10 docs

**Error**: `uuid.v4 is not a function`
- **Cause**: Using default import instead of named import
- **Fix**: Change to `import { v4 as uuidv4 } from 'uuid'`

**Error**: Zod validation fails
- **Cause**: Schema definition uses v3-only API
- **Fix**: Audit schema files against Zod v4 docs

---

## Communication Plan

**Before Starting**:
1. Notify team: "Starting Hardhat 3 + dependency upgrade (4 phases, ~6 hours)"
2. Block main branch from merges if using CI protection
3. Have rollback plan ready (git revert capability)

**After Each Phase**:
1. Update progress in PR or comment: "✅ Phase 16 complete and validated"
2. If blocker: "⚠️ Phase 17 blocked by [issue]; investigating"

**On Completion**:
1. Create PR with all 4 commits
2. Request code review
3. Ensure all CI checks pass before merge
4. Merge to main
5. Notify team: "Hardhat 3 upgrade complete"

---

## Success Criteria (Final)

Phase 19 (final phase) is complete when ALL of the following are true:

1. ✅ **All 4 phases implemented** (commits visible in git log)
2. ✅ **All files modified/created/deleted** (as per Critical Files table)
3. ✅ **pnpm install** succeeds with no conflicts
4. ✅ **pnpm typecheck** — 0 errors
5. ✅ **pnpm lint** — 0 errors
6. ✅ **pnpm test:coverage** — 90%+ coverage, all tests pass
7. ✅ **pnpm contracts:build** — Solidity compiles
8. ✅ **pnpm dev** — Server starts without errors
9. ✅ **curl /health** — Returns 200 with status: ok
10. ✅ **pnpm setup:dev** — Deploys contracts, registers agents
11. ✅ **pnpm demo** — Runs successfully (Agent 1: 2 tools, Agent 2: 3 tools)
12. ✅ **git log** — 4 clean commits (one per phase)
13. ✅ **CI/CD pipeline** — All checks pass on GitHub Actions

---

## References

- **Hardhat 3 Migration**: https://hardhat.org/docs/learn-more/beta-status
- **Hardhat 3 Plugins**: https://hardhat.org/docs/reference/configuration
- **Viem Docs**: https://viem.sh/
- **Vitest Docs**: https://vitest.dev/
- **Zod Docs**: https://zod.dev/
- **Pino Docs**: https://getpino.io/
- **Project Rules**: `.claude/rules/*`

---

## Final Notes

- **This is high-complexity work**: Take breaks, validate after each phase
- **Rollback is always available**: `git revert` if needed
- **Test thoroughly**: The 90%+ coverage requirement is there for a reason
- **Document blockers**: If something fails, capture the exact error and context
- **Ask for help**: Don't guess at breaking changes; consult documentation (use Context7)

Good luck! 🚀

