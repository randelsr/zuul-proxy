# Zuul Proxy Hardhat 3 + Full Dependency Upgrade — Complete Planning Documentation

## 📋 Document Index

This directory contains **2,242 lines** of detailed, step-by-step implementation guidance across **6 documents**.

### Core Documents

#### 1. 🎯 **START HERE: `upgrade_master_plan.md`** (348 lines)
   - **Purpose**: High-level overview, execution order, validation strategy
   - **Contents**:
     - Executive summary and risk assessment
     - Phase overview (1-line description of each)
     - Detailed phase execution order (with diagram)
     - Critical files modified (table)
     - Validation checklist (after each phase + final)
     - Troubleshooting guide
     - Git workflow and commit message examples
     - Success criteria (13-point checklist)
   - **Read Time**: 15 minutes
   - **Key Takeaway**: Phases must run in order; Phase 16 is critical path

#### 2. ⚠️ **HIGHEST PRIORITY: `phase_16_hardhat3_core.md`** (553 lines)
   - **Risk Level**: HIGH
   - **Time Estimate**: 1.5-2 hours
   - **Contents** (7 detailed steps):
     1. Update dependencies (Hardhat 3.1.9, remove TypeChain, add hardhat-toolbox-viem)
     2. Create `hardhat.config.ts` (ESM syntax, plugin array, full template)
     3. Delete `tsconfig.hardhat.json` (rationale)
     4. Delete `hardhat.config.cjs` (rationale)
     5. Migrate `ignition/modules/Zuul.js` → `.ts` (TypeScript annotations)
     6. Update `package.json` scripts (setup:agents, deploy commands)
     7. Rewrite `scripts/register-agents.cjs` → `scripts/register-agents.ts` (full viem implementation, ~90 lines)
   - **Validation**: pnpm contracts:build, pnpm setup:dev, pnpm demo
   - **Rollback**: Clear instructions provided
   - **Key Insight**: This phase must pass before attempting phases 17-19

#### 3. 🔧 **SECOND PRIORITY: `phase_17_dev_tools_upgrade.md`** (359 lines)
   - **Risk Level**: MEDIUM
   - **Time Estimate**: 1 hour
   - **Contents** (6 steps):
     1. Vitest 1.6.0 → 4.0.18 (config changes, coverage)
     2. ESLint 9 → 10 + @typescript-eslint 7 → 8 (potential new warnings)
     3. TypeScript 5.9.2 → 5.9.3 + @types/node (patch updates)
     4. Minor updates (prettier, tsx, husky, lint-staged, pino-pretty)
     5. Full quality gate validation
     6. Rollback plan
   - **Blockers Addressed**: vitest pool config, ESLint rules
   - **Key Insight**: Vitest 4 has breaking changes; review config if exists

#### 4. ✅ **THIRD PRIORITY: `phase_18_runtime_safe_upgrades.md`** (264 lines)
   - **Risk Level**: LOW
   - **Time Estimate**: 30 minutes
   - **Contents** (4 steps):
     1. Hono 4.0 → 4.12.0 (HTTP framework, no breaking changes)
     2. viem 2.4 → 2.46.2 (blockchain client, within major version)
     3. yaml 2.3 → 2.8.2 (config parser, within major version)
     4. Validation and rollback
   - **Why Safe**: All within major versions, backward compatible
   - **Key Insight**: Quick phase with minimal risk; good confidence builder

#### 5. ⚠️⚠️ **FOURTH PRIORITY: `phase_19_runtime_major_upgrades.md`** (506 lines)
   - **Risk Level**: HIGHEST
   - **Time Estimate**: 1.5-2 hours
   - **Contents** (4 major packages):
     1. **Pino 8 → 10** (logging): Audit logger factory, API changes, testing
     2. **UUID 9 → 13** (ID generation): ESM imports, named exports, testing
     3. **Zod 3 → 4** (validation): Schema audits, error format changes, config validation
     4. Comprehensive validation, common issues, rollback per package
   - **Why Risky**: Major versions with breaking APIs; requires code changes
   - **Code Files to Audit**: `src/logging.ts`, UUID imports, Zod schemas
   - **Key Insight**: Do this phase LAST, after all others are stable; test each package independently if needed

#### 6. 📖 **REFERENCE: `README.md`** (212 lines)
   - **Purpose**: Quick reference, quick start, troubleshooting
   - **Contents**:
     - File descriptions (1-line each)
     - Quick start guide (copy-paste commands)
     - Key decision points (3 major choices documented)
     - Validation checklist (printable)
     - Timeline estimate
     - Troubleshooting (common issues)
     - Status tracking template
   - **Use This When**: You need a quick reminder or checklist

---

## 🎯 Execution Flow

```
START (main branch, all tests passing)
  ↓
📖 Read upgrade_master_plan.md (15 min)
  ↓
⚠️ Execute Phase 16: Hardhat 3 Core (1.5-2 hrs)
  ├─ Follow phase_16_hardhat3_core.md step-by-step
  ├─ Validate: pnpm contracts:build, pnpm setup:dev, pnpm demo
  └─ Commit: "Phase 16: Hardhat 3 core upgrade..."
  ↓
🔧 Execute Phase 17: Dev Tools (1 hr)
  ├─ Follow phase_17_dev_tools_upgrade.md
  ├─ Validate: pnpm test, pnpm lint, pnpm typecheck
  └─ Commit: "Phase 17: Dev tools upgrade..."
  ↓
✅ Execute Phase 18: Runtime Safe (30 min)
  ├─ Follow phase_18_runtime_safe_upgrades.md
  ├─ Validate: pnpm dev, curl /health, all tests pass
  └─ Commit: "Phase 18: Runtime safe upgrades..."
  ↓
⚠️⚠️ Execute Phase 19: Runtime Major (1.5-2 hrs)
  ├─ Follow phase_19_runtime_major_upgrades.md
  ├─ Audit code: src/logging.ts, uuid imports, zod schemas
  ├─ Validate: Full test suite, dev server, demo scenario
  └─ Commit: "Phase 19: Runtime major upgrades..."
  ↓
✅ Final Validation (30 min)
  ├─ Clean install: rm -rf node_modules && pnpm install
  ├─ All quality gates: typecheck, lint, test:coverage (90%+)
  ├─ End-to-end: contracts:build, setup:dev, demo
  └─ Ready for PR
  ↓
END (4 commits, all validations passing)
```

---

## 📊 Statistics

| Aspect | Value |
|--------|-------|
| **Total Documentation** | 2,242 lines across 6 files |
| **Phases** | 4 (Hardhat 3, Dev Tools, Runtime Safe, Runtime Major) |
| **Estimated Total Time** | 5.5-6.5 hours |
| **Highest Risk Phase** | Phase 16 (Hardhat 3 core) and Phase 19 (runtime majors) |
| **Files Modified** | 15+ files (delete, create, update) |
| **Dependencies Changed** | 15+ package versions |
| **Source Code Files to Audit** | 3-4 files (logging, validation, imports) |
| **Validation Steps** | 50+ (scattered across phases) |

---

## 🔑 Key Decisions Made

### 1. Register Agents Script Pattern
**Decision**: Standalone viem TypeScript (not Hardhat task)
```
register-agents.cjs (Hardhat 2 + ethers)  →  register-agents.ts (standalone viem)
Command: hardhat run ...                   →  Command: tsx scripts/register-agents.ts
```
**Rationale**: Admin scripts shouldn't depend on build tools at runtime; consistent with `get-test-account-keys.ts` pattern

### 2. Phase Order (Strict Dependency)
```
16 → 17 → 18 → 19
↑           ↓
Blocks all others    Depends on all prior
```
**Rationale**: Phase 16 (Hardhat 3) is foundational; must stabilize before testing dev tools

### 3. Major vs Safe Updates
- **Phase 18 (Safe)**: Hono, viem 2.x, yaml (within major, backward compatible)
- **Phase 19 (Major)**: Pino, UUID, zod (major versions, requires code audit)

**Rationale**: Separate low-risk from high-risk to catch Phase 18 issues before attempting Phase 19

---

## 🚀 Quick Commands

### Read Everything
```bash
# Master plan first (15 min)
cat .plans/upgrade_master_plan.md

# Then each phase in order
cat .plans/phase_16_hardhat3_core.md
cat .plans/phase_17_dev_tools_upgrade.md
cat .plans/phase_18_runtime_safe_upgrades.md
cat .plans/phase_19_runtime_major_upgrades.md
```

### Execute Phase 16 (Highest Priority)
```bash
# Follow phase_16_hardhat3_core.md steps 1-7
# Then validate:
pnpm install
pnpm typecheck
pnpm lint
pnpm contracts:build
pnpm contracts:dev &
sleep 2
pnpm setup:dev
pnpm demo
kill %1
git commit -m "Phase 16: Hardhat 3 core upgrade..."
```

### Execute All Phases
```bash
# See upgrade_master_plan.md "Detailed Phase Execution Order" section
# Run each phase, validate, commit
# Repeat for phases 17, 18, 19
```

### Final Validation
```bash
# From upgrade_master_plan.md "Validation Checklist (Run after each phase)"
pnpm install --frozen-lockfile
pnpm typecheck && pnpm lint && pnpm test:coverage && pnpm build
pnpm contracts:build
```

---

## ⚠️ Critical Reminders

1. **Phase 16 must pass before starting Phase 17**
   - If Phase 16 fails, fix it before attempting other phases
   - Phase 16 changes the fundamental build pipeline

2. **Phase 19 is highest risk**
   - Do it last, only after 16-18 are stable
   - Requires code auditing (src/logging.ts, imports, schemas)
   - Can be done package-by-package if needed (pino → uuid → zod)

3. **Test after each phase**
   - Run: `pnpm test` and `pnpm typecheck` after every change
   - Don't accumulate changes across phases

4. **Commit early, commit often**
   - One commit per phase (4 total)
   - Makes rollback easy if needed

5. **Rollback is always available**
   - `git revert HEAD~N` to back out any phase
   - Full rollback: `git checkout main` (fresh start)

---

## 📞 Getting Help

### If Stuck on Phase X
1. Re-read that phase's document carefully
2. Check the "Troubleshooting" section in that phase
3. Run validations step-by-step (don't skip)
4. Check Context7 documentation for the specific tool

### If Tests Fail
1. Identify failing test: `pnpm test 2>&1 | grep FAIL`
2. Run single test: `pnpm test [test-name]`
3. Check which phase likely caused it
4. Review that phase's "Validation" section

### If Unsure About Decision
- Consult the relevant phase document's "Decision" section
- Master plan has "Critical Files Modified" table with rationale

---

## 📅 Timeline Suggestion

**Morning (3 hours)**:
- Read master plan (15 min)
- Execute Phase 16 (1.5-2 hrs)
- Validate Phase 16 (30 min)
- Commit Phase 16

**Afternoon (3 hours)**:
- Execute Phase 17 (1 hr)
- Execute Phase 18 (30 min)
- Execute Phase 19 (1.5 hrs)
- Final validation and commit

**Total**: ~6 hours in one day, or split across 2-3 days

---

## ✅ Success Criteria

When all phases are complete, you will have:

1. ✅ Hardhat 3.1.9 (from 2.22.0)
2. ✅ Vitest 4.0.18 (from 1.6.0)
3. ✅ ESLint 10.0.0 (from 9.0.0)
4. ✅ @typescript-eslint 8.56.0 (from 7.0.0)
5. ✅ Pino 10.3.1 (from 8.16.0)
6. ✅ UUID 13.0.0 (from 9.0.0)
7. ✅ Zod 4.3.6 (from 3.22.0)
8. ✅ All tests passing with 90%+ coverage
9. ✅ Server starts without errors
10. ✅ Demo scenario runs successfully
11. ✅ 4 clean commits in git log

---

## 📚 Document Navigation

```
INDEX.md (you are here)
├── upgrade_master_plan.md (start here)
├── phase_16_hardhat3_core.md (do first)
├── phase_17_dev_tools_upgrade.md (do second)
├── phase_18_runtime_safe_upgrades.md (do third)
├── phase_19_runtime_major_upgrades.md (do fourth)
└── README.md (quick reference)
```

---

**Last Updated**: February 19, 2026
**Total Lines**: 2,242 lines of detailed guidance
**Format**: Markdown (GitHub-friendly)
**Status**: Ready for execution

🚀 **Happy upgrading!**
