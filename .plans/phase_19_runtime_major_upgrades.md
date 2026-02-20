# Phase 19: Runtime Major Upgrades (Pino, UUID, Zod)

## Overview

Upgrade runtime dependencies with major version changes that require source code auditing and potential fixes: pino 8 → 10 (2 majors), uuid 9 → 13 (4 majors), zod 3 → 4 (1 major with significant API changes).

**Risk Level**: HIGH (major versions, requires code inspection and potential fixes)
**Estimated Scope**: 3 dependencies, 3-4 source files, configuration updates
**Testing**: Full test suite, end-to-end integration, careful validation

---

## Phase Prerequisites

- Phase 16-18 complete and passing all validations
- All previous upgrades (Hardhat 3, dev tools, safe runtime upgrades) complete
- Full test suite passing with 90%+ coverage

---

## Step 1: Audit and Upgrade Pino (8.x → 10.x)

### Current State
```json
{
  "dependencies": {
    "pino": "8.16.0",
    "pino-pretty": "11.2.0"
  }
}
```

### Updated State
```json
{
  "dependencies": {
    "pino": "10.3.1",
    "pino-pretty": "13.1.3"
  }
}
```

**Rationale**:
- Pino 10.x includes significant performance improvements and API refinements
- Pino-pretty must match major version for compatibility
- Zuul Proxy uses pino for structured logging via `src/logging.ts`

**Breaking Changes in Pino 8→9→10**:

1. **Logger factory signature**:
   ```typescript
   // v8
   const logger = pino({ level: 'info' });

   // v10 (may have subtle differences in config)
   const logger = pino({ level: 'info' });
   ```
   Generally compatible, but some options may have changed.

2. **Removed deprecated methods**:
   - `child()` still works but may have different behavior
   - `isLevel()` and some internal APIs may have changed

3. **Timestamp format**:
   - Default timestamp format may have changed (verify in logs)

4. **Error handling**:
   - Error serialization may differ; stack traces formatted differently

**Implementation Steps**:

### Step 1a: Review Current Pino Usage

```bash
grep -r "pino\|getLogger\|logger\." src/ --include="*.ts" | head -20
```

Key files to inspect:
- `src/logging.ts` — logger factory and configuration
- `src/api/server.ts` — request/response logging middleware
- `src/audit/store.ts` — audit logging
- `src/rbac/cache.ts` — cache operation logging

### Step 1b: Check for Deprecated Methods

```bash
grep -rE "logger\.(debug|info|warn|error|trace|fatal)" src/ | wc -l
# Should be many (this is normal; just checking we use all log levels)

grep -rE "child\(|isLevel\(|trace\(" src/ | head -5
# Check if deprecated methods are used
```

### Step 1c: Update package.json and Install

```json
{
  "dependencies": {
    "pino": "10.3.1",
    "pino-pretty": "13.1.3"
  }
}
```

1. Update `package.json`
2. Run `pnpm install --frozen-lockfile`
3. Run `pnpm typecheck` to verify no type errors

### Step 1d: Verify Logging Works

**Inspect `src/logging.ts` for any breaking changes**:

```typescript
// Typical Pino v10 config:
import pino from 'pino';

export function getLogger(name: string) {
  return pino({
    level: process.env.LOG_LEVEL || 'info',
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
    },
  }).child({ module: name });
}
```

If the above structure differs from current `src/logging.ts`, update it.

### Step 1e: Test Logging

```bash
pnpm test 2>&1 | grep -E "INFO|WARN|ERROR" | head -10
# Logs should appear (if running with debug output)

pnpm dev &
sleep 2
# Check console output for log format
# Expected: JSON or pretty-printed logs from Hono server startup
kill %1
```

**Validation**:
```bash
pnpm typecheck
# Expected: No errors in src/logging.ts

pnpm test 2>&1 | tail -5
# Expected: Coverage report and all tests passing

pnpm lint
# Expected: No errors
```

---

## Step 2: Audit and Upgrade UUID (9.x → 13.x)

### Current State
```json
{
  "dependencies": {
    "uuid": "9.0.0"
  }
}
```

### Updated State
```json
{
  "dependencies": {
    "uuid": "13.0.0"
  }
}
```

**Rationale**:
- uuid 13.x includes performance improvements and ESM optimizations
- Zuul Proxy uses uuid for generating unique request IDs via `src/config/request.ts` or similar

**Breaking Changes in UUID 9→10→11→12→13**:

1. **CommonJS vs ESM exports**:
   - UUID 9: `const { v4 } = require('uuid')` works
   - UUID 13: ESM-first; CommonJS still works via `require('uuid').v4`

2. **Named exports**:
   ```typescript
   // v9 (works)
   import { v4 as uuidv4 } from 'uuid';

   // v13 (still works, ESM optimized)
   import { v4 as uuidv4 } from 'uuid';
   ```

3. **Default export removed**:
   - UUID 13 removed default export
   - Always use named imports

**Implementation Steps**:

### Step 2a: Find UUID Usage

```bash
grep -r "uuid\|uuidv4\|v4()" src/ demo/ --include="*.ts" | head -10
```

Expected matches in:
- Request ID generation (likely in middleware or types)
- Audit logging (if used for audit entry IDs)

### Step 2b: Check for Named Imports

```bash
grep -r "from 'uuid'" src/ --include="*.ts"
# Expected: import { v4 as uuidv4 } from 'uuid'

grep -r "require.*uuid" src/ --include="*.ts"
# Expected: None (project is ESM)
```

### Step 2c: Update package.json

```json
{
  "dependencies": {
    "uuid": "13.0.0"
  }
}
```

1. Update `package.json`
2. Run `pnpm install --frozen-lockfile`
3. Run `pnpm typecheck` to verify

### Step 2d: Verify UUID Generation Works

```bash
node -e "
import { v4 as uuidv4 } from 'uuid';
console.log('UUID v4:', uuidv4());
console.log('UUID v4:', uuidv4());
" --input-type=module

# Expected: Two different UUIDs printed
```

**Validation**:
```bash
pnpm typecheck
# Expected: No errors

pnpm test 2>&1 | grep -i "uuid\|request.*id" | head -5
# Should pass (if uuid is tested)

pnpm dev &
sleep 2
curl -v http://localhost:8080/health 2>&1 | grep -i "request-id\|x-request"
# Check if request ID is generated and unique
kill %1
```

---

## Step 3: Audit and Upgrade Zod (3.x → 4.x)

### Current State
```json
{
  "dependencies": {
    "zod": "3.22.0"
  }
}
```

### Updated State
```json
{
  "dependencies": {
    "zod": "4.3.6"
  }
}
```

**Rationale**:
- Zod 4.x includes significant API improvements and better error messages
- Zuul Proxy uses Zod for config validation and request/response schema validation

**Breaking Changes in Zod 3→4**:

1. **API changes** (major):
   - `z.string().email()` still works but error messages changed
   - Some validators removed or renamed
   - `.parse()` returns different error format (though still throws on failure)

2. **Validation changes**:
   - `z.coerce` API introduced (new feature)
   - Enum validation stricter

3. **Transform and refinement API**:
   - `.transform()` and `.refine()` work the same
   - Error messages more specific

**Implementation Steps**:

### Step 3a: Find Zod Usage

```bash
grep -r "z\.\|from 'zod'" src/ --include="*.ts" | head -30
# Expected: Schema definitions, validation calls
```

Key files to inspect:
- `src/config/loader.ts` or similar — config validation
- `src/types.ts` — domain type validation
- Any middleware that validates JSON bodies

### Step 3b: Audit Schema Definitions

```bash
find src/ -name "*schema*" -o -name "*types*" | grep -E "\.ts$"
# List files with schema definitions

grep -rE "z\.string\(\)|z\.object\(\)|z\.enum\(\)|z\.array\(\)" src/ --include="*.ts" | wc -l
# Count schema validators
```

### Step 3c: Review Common Zod Patterns

Look for these patterns and verify they still work in v4:

```typescript
// v3 and v4 compatible
const AgentAddressSchema = z.string().startsWith('0x').length(42);
const ToolKeySchema = z.string().min(1);
const PermissionSchema = z.object({
  tool: z.string(),
  actions: z.array(z.string()),
});

// v3 only (may need update)
z.string().email(); // Still works in v4, but error messages changed

// New in v4 (can adopt but not required)
z.coerce.number(); // Type coercion
```

### Step 3d: Update package.json

```json
{
  "dependencies": {
    "zod": "4.3.6"
  }
}
```

1. Update `package.json`
2. Run `pnpm install --frozen-lockfile`

### Step 3e: Test Validation

```bash
pnpm typecheck
# Expected: No errors in schema definitions

pnpm test 2>&1 | grep -i "schema\|validation\|config" | head -10
# Expected: All tests pass

# Manually test config loading
npx tsx -e "
import { readFileSync } from 'fs';
import YAML from 'yaml';
import z from 'zod';

const configContent = readFileSync('./config.yaml', 'utf-8');
const config = YAML.parse(configContent);

console.log('Config loaded:', Object.keys(config));
console.log('Roles:', config.roles.length);
console.log('Tools:', config.tools.length);
"

# Expected: Config loads without errors
```

---

## Step 4: Comprehensive Validation

After all three major upgrades, run full validation:

```bash
# Clean install
rm -rf node_modules
pnpm install --frozen-lockfile

# All quality gates
pnpm typecheck
pnpm lint
pnpm test:coverage
pnpm format:check

# Server startup
pnpm dev &
sleep 3
curl http://localhost:8080/health
kill %1

# Full integration (if Hardhat available)
pnpm contracts:dev &
sleep 2
pnpm setup:dev
pnpm demo
kill %1
```

**Expected Outcomes**:
- ✅ `pnpm typecheck` — 0 errors
- ✅ `pnpm lint` — 0 errors
- ✅ `pnpm test:coverage` — 90%+ coverage, all pass
- ✅ `pnpm dev` — server starts, health check responds
- ✅ `pnpm demo` — completes successfully (if full E2E)

---

## Rollback Plan (if needed)

If major upgrades introduce breaking changes:

1. **Identify the problematic package**:
   ```bash
   git diff package.json
   # Shows which packages changed
   ```

2. **Revert one package at a time**:
   ```bash
   git checkout package.json
   pnpm install
   # Back to Phase 18 state
   ```

3. **Then manually downgrade only the problem package**:
   ```bash
   # Edit package.json, downgrade only pino (for example)
   pnpm install --frozen-lockfile
   pnpm test
   ```

This allows identifying which package(s) cause issues.

---

## Common Issues and Fixes

### Pino Logger Errors
**Error**: `Cannot find module 'pino'` or logger initialization fails
- **Fix**: Verify `src/logging.ts` uses correct pino v10 API
- Check: `pino()` constructor still accepts same options

### UUID Import Errors
**Error**: `Cannot find module 'uuid'` or `uuid.v4 is not a function`
- **Fix**: Ensure using named import: `import { v4 as uuidv4 } from 'uuid'`
- Don't use default import in v13

### Zod Validation Errors
**Error**: Config validation fails with different error message
- **Fix**: Update error message assertions in tests (if any)
- The logic is the same; only error text changed

### Mixed Module System Errors
**Error**: ESM/CommonJS interop errors with pino or uuid
- **Fix**: Verify project uses ESM (`"type": "module"` in package.json)
- All imports should use ES6 syntax

---

## Success Criteria

Phase 19 is complete when:
1. ✅ All three packages updated: pino 10, uuid 13, zod 4
2. ✅ `pnpm install` succeeds
3. ✅ `pnpm typecheck` passes (0 errors)
4. ✅ `pnpm lint` passes (0 errors)
5. ✅ `pnpm test:coverage` passes with 90%+ coverage
6. ✅ `pnpm dev` starts and health check passes
7. ✅ `pnpm demo` completes successfully (end-to-end verification)
8. ✅ All logs format correctly (pino)
9. ✅ All UUIDs generate correctly and uniquely (uuid)
10. ✅ All config/request validation works (zod)

---

## Notes

- **These are the highest-risk upgrades**: Do them last, after all other phases are stable
- **Pino logging is critical**: If anything fails, check logs first
- **UUID must be imported correctly**: ESM-first library, no CommonJS default export
- **Zod validation is extensive**: If config loading fails, start with zod diagnostics
- **Consider doing one at a time**: If all three break, hard to debug. Try pino → uuid → zod sequentially for isolation

