# Phase 17: Dev Tools Upgrade (Vitest, ESLint, TypeScript)

## Overview

Upgrade major dev tool versions after Hardhat 3 stabilizes: Vitest 1.x → 4.x, ESLint 9 → 10, @typescript-eslint 7 → 8, @types/node, and other tooling. These upgrades require testing and configuration verification but no source code changes.

**Risk Level**: MEDIUM (dev tools, impacts CI/test execution)
**Estimated Scope**: 1 file (`package.json`), 2 potential config updates (vitest, eslint)
**Testing**: Must verify `pnpm test`, `pnpm lint`, `pnpm typecheck`, coverage gates all pass

---

## Phase Prerequisites

- Phase 16 (Hardhat 3) must be complete and passing all validations
- `pnpm install` should succeed
- `pnpm contracts:build` should work

---

## Step 1: Update Vitest and Coverage Tools

### Current State
```json
{
  "devDependencies": {
    "vitest": "1.6.0",
    "@vitest/coverage-v8": "1.6.0"
  }
}
```

### Updated State
```json
{
  "devDependencies": {
    "vitest": "4.0.18",
    "@vitest/coverage-v8": "4.0.18"
  }
}
```

**Rationale**:
- Vitest 4.x includes performance improvements, better error messages, and improved TypeScript support
- Must update in tandem (versions must match exactly)
- Vitest 4 has breaking changes in reporter API and config options

**Breaking Changes in Vitest 4**:
1. Reporter configuration format may have changed
2. `pool` option syntax may differ
3. Some matchers may have different behavior
4. Test file naming convention unchanged (`.test.ts`, `.spec.ts` still work)

**Implementation**:
1. Update `package.json`: change both to `"4.0.18"`
2. Run `pnpm install --frozen-lockfile`
3. Check if `vitest.config.ts` or vitest config in `package.json` exists

**Finding vitest config**:
```bash
grep -r "vitest\|test:" package.json | head -5
find . -maxdepth 2 -name "vitest.config.*" -o -name "vite.config.*"
```

If a `vitest.config.ts` file exists (not confirmed to exist):
- Review for deprecated options from v1 that may need updates
- Common changes: `pool` option for worker threads, reporter config

**Validation**:
```bash
pnpm test --version
# Expected: shows Vitest 4.0.18

pnpm test 2>&1 | head -30
# Expected: Tests start running without config errors
```

---

## Step 2: Update ESLint and TypeScript-ESLint

### Current State
```json
{
  "devDependencies": {
    "eslint": "9.0.0",
    "@typescript-eslint/eslint-plugin": "7.0.0",
    "@typescript-eslint/parser": "7.0.0"
  }
}
```

### Updated State
```json
{
  "devDependencies": {
    "eslint": "10.0.0",
    "@typescript-eslint/eslint-plugin": "8.56.0",
    "@typescript-eslint/parser": "8.56.0"
  }
}
```

**Rationale**:
- ESLint 10 has minor improvements and rule refinements
- @typescript-eslint 8 includes new rules and better TypeScript 5.x support
- Must update in tandem (parser and plugin versions should match)

**Breaking Changes**:
- ESLint 10: Unlikely to break existing configs (flat config already stabilized in v9)
- @typescript-eslint 8: Some new rules may be enabled by default, may cause new lint warnings

**Implementation**:
1. Update `package.json` with new versions
2. Run `pnpm install --frozen-lockfile`
3. Review ESLint config file (typically `eslint.config.js` or `.eslintrc.json`)

**Finding ESLint config**:
```bash
find . -maxdepth 1 -name ".eslintrc*" -o -name "eslint.config.*"
# Expected: eslint.config.js (flat config, already in v9)
```

**Potential config updates**:
- If using old `.eslintrc.json` format (deprecated): Hardhat 3 era projects should use flat config
- If flat config exists: likely no changes needed for v10

**Validation**:
```bash
pnpm lint 2>&1 | tail -20
# Expected: No new errors; possible new warnings from @typescript-eslint 8

# If new warnings appear, review with:
pnpm lint --format=json | jq '.[] | .messages[] | select(.severity==1)' | head -20
# These are warnings (severity 1), not errors (severity 2)
```

If new warnings are introduced by @typescript-eslint 8:
- Review each warning for validity
- If acceptable: can suppress via `// eslint-disable-next-line` comments
- If rule is too strict: adjust `eslint.config.js` to disable it

---

## Step 3: Update TypeScript and @types/node

### Current State
```json
{
  "devDependencies": {
    "typescript": "5.9.2",
    "@types/node": "22.0.0"
  }
}
```

### Updated State
```json
{
  "devDependencies": {
    "typescript": "5.9.3",
    "@types/node": "25.3.0"
  }
}
```

**Rationale**:
- TypeScript 5.9.3 is a patch (no breaking changes)
- @types/node 25.x provides latest Node.js 22+ type definitions
- These are safe minor/patch upgrades

**Implementation**:
1. Update `package.json` with new versions
2. Run `pnpm install --frozen-lockfile`
3. Run `pnpm typecheck` to verify no new type errors

**Validation**:
```bash
pnpm typecheck
# Expected: No TypeScript errors

npx tsc --version
# Expected: Version 5.9.3
```

---

## Step 4: Update Remaining Minor Dev Dependencies

### Current State
```json
{
  "devDependencies": {
    "prettier": "3.2.0",
    "tsx": "4.7.0",
    "husky": "9.1.0",
    "lint-staged": "15.2.0",
    "pino-pretty": "11.2.0"
  }
}
```

### Updated State
```json
{
  "devDependencies": {
    "prettier": "3.8.1",
    "tsx": "4.21.0",
    "husky": "9.1.7",
    "lint-staged": "16.2.7",
    "pino-pretty": "13.1.3"
  }
}
```

**Rationale**:
- All are minor/patch updates (same major versions)
- No breaking changes expected
- Prettier: formatting improvements
- tsx: faster TypeScript execution
- husky/lint-staged: git hook fixes and performance
- pino-pretty: better log formatting (separate from pino itself)

**Implementation**:
1. Update all 5 packages in `package.json`
2. Run `pnpm install --frozen-lockfile`

**Validation**:
```bash
pnpm format:check
# Expected: No format errors (prettier 3.8.1 may slightly reformat code)

pnpm typecheck
# Expected: No errors

pnpm lint
# Expected: No errors (or only warnings from Step 2)
```

---

## Step 5: Verify All Quality Gates

After all updates, run the full test suite:

```bash
# Clean install
rm -rf node_modules pnpm-lock.yaml
pnpm install

# Static analysis (should run in parallel in CI)
pnpm typecheck
pnpm lint
pnpm format:check

# Unit tests with coverage
pnpm test:coverage

# Build
pnpm build

# Contract compilation
pnpm contracts:build
```

**Expected Outcomes**:
- ✅ `pnpm typecheck` — 0 errors
- ✅ `pnpm lint` — 0 errors (warnings are acceptable)
- ✅ `pnpm format:check` — 0 errors
- ✅ `pnpm test:coverage` — 90%+ coverage, all tests pass
- ✅ `pnpm build` — TypeScript compiles to `dist/`
- ✅ `pnpm contracts:build` — Solidity compiles

**If tests fail**:

### Vitest 4 Compatibility Issues
If `pnpm test` fails with config errors:
```bash
pnpm test --reporter=verbose 2>&1 | head -50
```

Common issues and fixes:
- **`pool is not defined`**: Add `pool: 'forks'` to vitest config
- **Reporter error**: Update `reporters` array syntax (v4 uses different format)
- **Matcher errors**: Check for deprecated matchers in test files (e.g., `toBeDefined()` is fine, but some custom matchers may have changed)

### ESLint Issues
If `pnpm lint` shows new errors:
```bash
pnpm lint --format=json | jq '.[] | .messages[] | select(.severity==2)' | head -5
```

- Review each error and fix
- If error is new rule from @typescript-eslint 8, decide: fix code or disable rule in `eslint.config.js`

### Format Issues
If `pnpm format:check` fails:
```bash
pnpm format  # Auto-fixes formatting
git diff     # Review changes
```

Prettier 3.8.1 may have different formatting than 3.2.0. Review diff to ensure changes are acceptable.

---

## Step 6: Update CI/CD Pipeline (GitHub Actions)

If using GitHub Actions workflows:

1. Verify workflow runs all quality gates in correct order
2. Check coverage gate: `pnpm test:coverage` must fail build if <90%
3. Ensure artifacts are cached for faster runs

**Example workflow check**:
```bash
cat .github/workflows/*.yml | grep -A5 "pnpm test:coverage"
# Should show: coverage thresholds or fail on low coverage
```

No changes needed to workflows if they already run the right commands. Vitest 4 will automatically use the updated version.

---

## Rollback Plan (if needed)

If dev tools upgrade breaks tests:

```bash
git checkout package.json
pnpm install --frozen-lockfile
pnpm test
```

This reverts to Phase 16 final state (Hardhat 3 with dev tools v1).

---

## Notes

- **Vitest is app-only**: Project uses Vitest for unit tests in `tests/`, not Hardhat's native test runner. No coordination needed between Vitest 4 and Hardhat 3.
- **No Hardhat contract tests**: Project doesn't have Solidity tests (`.test.sol` files). All contract testing is via Vitest with mocked chain drivers.
- **eslint.config.js is modern**: Already using flat config from v9, so v10 compatibility is expected to be smooth.
- **Coverage gates are enforced**: CI must verify `pnpm test:coverage` maintains 90%+ threshold. This is a hard requirement per CLAUDE.md rules.

---

## Success Criteria

Phase 17 is complete when:
1. ✅ All dev tools updated in `package.json`
2. ✅ `pnpm install` succeeds
3. ✅ `pnpm typecheck` passes (0 errors)
4. ✅ `pnpm lint` passes (0 errors)
5. ✅ `pnpm test:coverage` passes with 90%+ coverage
6. ✅ `pnpm format:check` passes
7. ✅ `pnpm contracts:build` succeeds
8. ✅ `pnpm demo` completes successfully (end-to-end validation)

