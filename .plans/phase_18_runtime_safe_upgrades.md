# Phase 18: Runtime Safe Upgrades (Hono, Viem, YAML)

## Overview

Upgrade runtime dependencies with minor/patch version changes that are backward-compatible and require no source code changes: Hono 4.0 → 4.12, viem 2.4 → 2.46 (within v2 range), yaml 2.3 → 2.8.

**Risk Level**: LOW (within major versions, no breaking changes)
**Estimated Scope**: 1 file (`package.json`)
**Testing**: `pnpm typecheck`, `pnpm test`, `pnpm dev` startup verification

---

## Phase Prerequisites

- Phase 16 (Hardhat 3) complete and validated
- Phase 17 (Dev Tools) complete and validated
- All previous quality gates passing

---

## Step 1: Update Hono HTTP Framework

### Current State
```json
{
  "dependencies": {
    "hono": "4.0.0"
  }
}
```

### Updated State
```json
{
  "dependencies": {
    "hono": "4.12.0"
  }
}
```

**Rationale**:
- Hono 4.12 includes middleware improvements, bug fixes, and performance enhancements
- Still within Hono 4.x major version — no breaking changes
- Zuul Proxy uses basic Hono features: `Hono`, `ctx.json()`, middleware stack, no advanced features

**Implementation**:
1. Update `package.json`: `hono: "4.12.0"`
2. Run `pnpm install --frozen-lockfile`
3. No source code changes needed

**Validation**:
```bash
pnpm typecheck
# Expected: No errors

pnpm dev &
sleep 2
curl http://localhost:8080/health
# Expected: {"status":"ok","timestamp":...}

kill %1
```

---

## Step 2: Update Viem Blockchain Client

### Current State
```json
{
  "dependencies": {
    "viem": "2.4.0"
  }
}
```

### Updated State
```json
{
  "dependencies": {
    "viem": "2.46.2"
  }
}
```

**Rationale**:
- viem 2.46.2 is latest within 2.x major version
- Zuul Proxy relies on viem for all blockchain interaction: contract reads, wallet signature recovery, address utilities
- Within 2.x: no breaking changes (viem 1→2 and 2→3 would be major upgrades)
- Performance improvements, bug fixes, better error messages

**viem Usage in Project**:
- `src/chain/evm.ts`: `createPublicClient`, `readContract`, `getContractEvents`
- `src/chain/hedera.ts`: `createPublicClient`, contract interaction
- `src/auth/signature.ts`: `recoverMessageAddress` (EIP-191 signature recovery)
- `scripts/register-agents.ts`: (newly created) `createWalletClient`, `writeContract`
- `demo/scenario.ts`: contract calls and signature generation

**Breaking Changes in viem 2.4→2.46**:
- None expected within 2.x (patch-level improvements only)
- Minor improvements to `recoverMessageAddress`, `readContract`, event handling

**Implementation**:
1. Update `package.json`: `viem: "2.46.2"`
2. Run `pnpm install --frozen-lockfile`
3. No source code changes needed

**Validation**:
```bash
pnpm typecheck
# Expected: No errors in chain drivers or auth modules

pnpm test 2>&1 | grep -E "auth|rbac|chain" | head -10
# Expected: Tests pass (mocked chain drivers)

pnpm dev &
sleep 2

# Test signature recovery (core auth operation)
curl -X POST http://localhost:8080/rpc \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/list",
    "params": { "agent_address": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" },
    "id": 1
  }' | jq .

# Expected: returns tools (or empty list if RBAC contract not running)

kill %1
```

---

## Step 3: Update YAML Parser

### Current State
```json
{
  "dependencies": {
    "yaml": "2.3.0"
  }
}
```

### Updated State
```json
{
  "dependencies": {
    "yaml": "2.8.2"
  }
}
```

**Rationale**:
- yaml 2.8 includes performance improvements and bug fixes for parsing YAML 1.2
- Still within 2.x major version — no breaking changes
- Zuul Proxy uses YAML for config loading: `src/config/loader.ts` reads `config.yaml`

**YAML Usage in Project**:
- `src/config/loader.ts`: `YAML.parse(configContent)` to load tool and role definitions
- `config.yaml`: tool definitions (base_url, key_ref), role definitions (permissions)

**Breaking Changes in yaml 2.3→2.8**:
- None expected within 2.x
- Improved parsing of edge cases, better error messages

**Implementation**:
1. Update `package.json`: `yaml: "2.8.2"`
2. Run `pnpm install --frozen-lockfile`
3. No source code changes needed

**Validation**:
```bash
pnpm typecheck
# Expected: No errors

# Verify config still loads correctly
node -e "
const fs = require('fs');
const YAML = require('yaml');
const content = fs.readFileSync('./config.yaml', 'utf-8');
const config = YAML.parse(content);
console.log('Roles:', config.roles.length);
console.log('Tools:', config.tools.length);
"

# Expected: Output number of roles and tools from config.yaml
```

---

## Step 4: Verify All Quality Gates

After all three updates:

```bash
# Clean install
pnpm install

# Full test suite
pnpm typecheck
pnpm test
pnpm build

# Dev server smoke test
pnpm dev &
sleep 2
curl http://localhost:8080/health
kill %1

# Full integration test (if setup available)
pnpm contracts:dev &
sleep 2
pnpm setup:dev
pnpm demo
kill %1
```

**Expected Outcomes**:
- ✅ `pnpm typecheck` — 0 errors
- ✅ `pnpm test` — all tests pass with 90%+ coverage
- ✅ `pnpm build` — TypeScript compiles successfully
- ✅ `pnpm dev` — server starts and health check responds
- ✅ All blockchain integration tests pass (if running full E2E)

---

## Rollback Plan (if needed)

If any runtime upgrade breaks functionality:

```bash
git checkout package.json
pnpm install --frozen-lockfile
# Re-test
pnpm test
```

This reverts to Phase 17 final state.

---

## Notes

- **All updates are within major versions**: No breaking changes expected
- **No source code changes required**: These are pure dependency updates
- **Viem is critical**: If viem upgrade causes issues, it's likely in signature recovery or contract calls. Check auth tests first.
- **Config.yaml backward compatible**: YAML parser updates won't affect existing config files

---

## Success Criteria

Phase 18 is complete when:
1. ✅ All runtime dependencies updated in `package.json`
2. ✅ `pnpm install` succeeds
3. ✅ `pnpm typecheck` passes (0 errors)
4. ✅ `pnpm test` passes with 90%+ coverage
5. ✅ `pnpm dev` starts successfully
6. ✅ `curl http://localhost:8080/health` responds with status: ok
7. ✅ Config loads correctly (verified by running setup:dev or manual parse)

