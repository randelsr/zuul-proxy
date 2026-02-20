# Zuul Proxy Upgrade Plans

This directory contains detailed implementation plans for major upgrade initiatives.

## Current Upgrade: Hardhat 3 + Full Dependencies

### Files in This Directory

1. **`upgrade_master_plan.md`** ← **START HERE**
   - Executive summary of entire upgrade
   - Phase overview and execution order
   - Validation checklist
   - Troubleshooting guide
   - Success criteria

2. **`phase_16_hardhat3_core.md`** ⚠️ **HIGHEST PRIORITY**
   - Migrate from Hardhat 2.22.0 → 3.1.9
   - Replace `hardhat.config.cjs` with `hardhat.config.ts` (ESM)
   - Remove TypeChain (Hardhat 3 native typed artifacts)
   - Add `hardhat-toolbox-viem` (viem-first)
   - Rewrite `scripts/register-agents.cjs` → TypeScript standalone
   - Estimated time: 1.5-2 hours
   - **Must complete before other phases**

3. **`phase_17_dev_tools_upgrade.md`**
   - Upgrade Vitest 1.x → 4.x
   - Upgrade ESLint 9 → 10
   - Upgrade @typescript-eslint 7 → 8
   - Update TypeScript, @types/node, prettier, tsx, husky, lint-staged
   - Estimated time: 1 hour
   - **Do after Phase 16**

4. **`phase_18_runtime_safe_upgrades.md`**
   - Upgrade Hono 4.0 → 4.12 (within major version)
   - Upgrade viem 2.4 → 2.46 (within major version)
   - Upgrade yaml 2.3 → 2.8 (within major version)
   - No breaking changes; minimal testing
   - Estimated time: 30 minutes
   - **Do after Phase 17**

5. **`phase_19_runtime_major_upgrades.md`** ⚠️⚠️ **HIGHEST RISK**
   - Upgrade pino 8 → 10 (requires code audit)
   - Upgrade uuid 9 → 13 (requires import verification)
   - Upgrade zod 3 → 4 (requires schema audit)
   - Estimated time: 1.5-2 hours
   - **Do last, after all other phases stable**

---

## Quick Start Guide

### 1. Read Master Plan
```bash
cat upgrade_master_plan.md
# Understand the big picture, risks, and overall flow
```

### 2. Execute Phase 16 (Hardhat 3 Core)
```bash
# Read detailed instructions
cat phase_16_hardhat3_core.md

# Follow step-by-step:
# - Update package.json (remove typechain, hardhat-toolbox, add hardhat-toolbox-viem)
# - Create hardhat.config.ts
# - Delete hardhat.config.cjs and tsconfig.hardhat.json
# - Rewrite scripts/register-agents.cjs → scripts/register-agents.ts
# - Update ignition/modules/Zuul.js → Zuul.ts
# - Validate: pnpm contracts:build, pnpm setup:dev, pnpm demo

# Commit
git add -A
git commit -m "Phase 16: Hardhat 3 core upgrade..."
```

### 3. Execute Phases 17-19 (Sequential)
```bash
# Phase 17: Dev tools (vitest, eslint, typescript)
cat phase_17_dev_tools_upgrade.md
# ... follow steps, validate, commit ...

# Phase 18: Runtime safe upgrades (hono, viem, yaml)
cat phase_18_runtime_safe_upgrades.md
# ... follow steps, validate, commit ...

# Phase 19: Runtime major upgrades (pino, uuid, zod)
cat phase_19_runtime_major_upgrades.md
# ... follow steps with code audit, validate, commit ...
```

### 4. Final Validation
```bash
# Run the complete test suite
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test:coverage
pnpm contracts:build

# End-to-end smoke test
pnpm contracts:dev &
sleep 2
pnpm setup:dev
pnpm demo
kill %1
```

---

## Key Decision Points

### Phase 16: How to Run register-agents?
**Decision**: Standalone viem script (not Hardhat task)
- **Why**: Admin scripts shouldn't depend on build tool at runtime
- **Pattern**: Consistent with existing `get-test-account-keys.ts`
- **Command**: `tsx scripts/register-agents.ts` (not `hardhat run`)

### Phase 19: Pino Upgrade Risk
**Decision**: Upgrade to v10 (2 major versions)
- **Risk**: Logger API may have changed
- **Mitigation**: Audit `src/logging.ts` thoroughly before upgrading
- **Rollback**: Can downgrade to v8 if needed

### Phase 19: Zod Upgrade Risk
**Decision**: Upgrade to v4 (major version with breaking changes)
- **Risk**: Schema definitions may need updates
- **Mitigation**: Comprehensive audit of all zod schemas
- **Rollback**: Can downgrade to v3 if needed

---

## Validation Checklist (Print This)

After **each phase**, run:
```
[ ] pnpm install --frozen-lockfile (succeeds)
[ ] pnpm typecheck (0 errors)
[ ] pnpm lint (0 errors)
[ ] pnpm test (all pass)
[ ] pnpm build (succeeds)
```

After **all phases**, run:
```
[ ] pnpm test:coverage (90%+ coverage)
[ ] pnpm contracts:build (Solidity compiles)
[ ] pnpm dev (server starts)
[ ] curl http://localhost:8080/health (returns 200)
[ ] pnpm setup:dev (deploys contracts)
[ ] pnpm demo (runs successfully)
```

---

## Timeline Estimate

| Phase | Time | Risk | Blocker? |
|-------|------|------|----------|
| 16: Hardhat 3 | 1.5-2h | HIGH | YES (blocks others) |
| 17: Dev Tools | 1h | MEDIUM | No |
| 18: Runtime Safe | 30m | LOW | No |
| 19: Runtime Major | 1.5-2h | HIGHEST | No (do last) |
| **Total** | **~5.5-6.5h** | - | - |

---

## Troubleshooting

### "I'm stuck on Phase X"
1. Re-read the phase file carefully
2. Check the Troubleshooting section in that phase
3. Run validations step-by-step
4. If error persists, check Context7 documentation for that tool

### "I broke something"
1. Identify which phase caused the issue
2. Revert with: `git revert HEAD~N` (N = number of commits to revert)
3. Or: `git checkout [previous-phase-commit]`
4. Start over from that point

### "Tests are failing"
1. Check which tests: `pnpm test 2>&1 | grep FAIL`
2. Run single failing test: `pnpm test [test-name]`
3. If phase-related, review that phase's validation section
4. If dependency-related, check that dependency's docs

---

## References

- **Master Plan**: `upgrade_master_plan.md`
- **Hardhat Docs**: https://hardhat.org/docs/learn-more/whats-new
- **Vitest Docs**: https://vitest.dev/
- **Viem Docs**: https://viem.sh/
- **Zod Docs**: https://zod.dev/
- **Project Rules**: `../../.claude/rules/*`

---

## Status

- [ ] Phase 16: Not started
- [ ] Phase 17: Not started
- [ ] Phase 18: Not started
- [ ] Phase 19: Not started
- [ ] Final validation: Not started

---

**Last Updated**: February 19, 2026
**Author**: Claude Code
**Next Review**: After Phase 16 completion
