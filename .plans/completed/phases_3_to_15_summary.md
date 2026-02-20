# Phases 3-15: Implementation Summary

This document outlines Phases 3-15 in detail. Each phase builds on previous phases in a strict dependency order.

---

## Phase 3: Config & Logging (~3 hours)

**Depends on:** Phase 0, Phase 1
**Deliverable:** Configuration loader, type-safe YAML parsing, pino structured logging

### Files to Create

#### `src/config/types.ts`
- ToolConfig (key, description, baseUrl, keyRef, endpoints)
- RoleConfig (id, name, permissions)
- PermissionConfig (tool, actions)
- ChainConfig (name, chainId, rpcUrl)
- AppConfig (tools, roles, chain, cache, server)
- EndpointConfig (path, methods, description)

#### `src/config/schema.ts`
- Zod schema for AppConfig validation
- Validate all keyRef values exist in process.env (fail fast at startup)
- Custom error messages for common misconfigurations

#### `src/config/loader.ts`
- parseConfig(filePath): Promise<AppConfig>
- Load YAML file
- Parse with schema
- Throw ZuulError on validation failure (never silently accept bad config)

#### `src/logging.ts`
- getLogger(module: string): pino.Logger factory
- Pino serializers: redact ApiKeyHandle, EncryptedPayload, Signature fields
- Child logger pattern: addContext(logger, { requestId, agentAddress, tool, action })
- Log levels: debug, info, warn, error

### Tests
- Valid config → parses correctly
- Missing keyRef in env → startup error
- Invalid YAML → startup error
- Logger context serialization → redacted fields

### Acceptance Criteria
- ✅ Config loads from config.yaml
- ✅ All env var references validated at startup
- ✅ pino logs with redacted secrets
- ✅ Child logger context propagates correctly
- ✅ `pnpm typecheck && pnpm test` passes

---

## Phase 4: Auth Module (~4 hours)

**Depends on:** Phase 0, Phase 1, Phase 3
**Deliverable:** Signature verification, nonce validation, timestamp freshness

### Files to Create

#### `src/auth/guards.ts`
- isAgentAddress(value: unknown): value is AgentAddress
- isNonce(value: unknown): value is Nonce
- isTimestamp(value: unknown): value is Timestamp
- isSignedRequest(headers: unknown): headers is RawSignatureHeaders
- All guards throw descriptive errors (never silent failure)

#### `src/auth/signature.ts`
- buildCanonicalPayload(method, targetUrl, nonce, timestamp): string
- recoverSigner(payload, signature): Promise<Result<AgentAddress, AuthError>>
  - Uses viem.recoverMessageAddress()
  - Never use ethers.js (viem only)
- verifySignedRequest(req: SignedRequest): Promise<Result<AgentAddress, AuthError>>
  - Compose: canonical → recover → validate nonce → validate timestamp
  - Return recovered signer (not claimed address)

#### `src/auth/nonce.ts`
- NonceValidator class
- In-memory Map<AgentAddress, Map<Nonce, expiresAt>>
- validateAndStore(agent, nonce, timestamp): Result<void, AuthError>
  - Check not reused (401 -32004)
  - Add to store with 5-min expiry
- Lazy cleanup of expired entries
- getMetrics(): { size, expired } for monitoring

#### `src/auth/timestamp.ts`
- validateTimestamp(timestamp, now): Result<void, AuthError>
  - Check within ±5 minutes (401 -32005)
  - Never accept timestamps more than 5 minutes in past or future

### Tests (90%+ coverage required)
- Valid signature recovery → correct signer
- Invalid signature → 401 -32002, includes expected + recovered signer
- Nonce reuse → 401 -32004, logged as security event
- Timestamp drift → 401 -32005 (distinguish from replay)
- Missing headers → 401 -32001
- Expired nonce entry cleanup → no memory leak

### Acceptance Criteria
- ✅ EIP-191 signature recovery works end-to-end
- ✅ Nonce validation prevents replay (scoped per agent)
- ✅ Timestamp window enforced (±5 min)
- ✅ All type guards narrow correctly
- ✅ 90%+ coverage on auth/
- ✅ `pnpm typecheck && pnpm test` passes

---

## Phase 5: RBAC Module (~4 hours)

**Depends on:** Phase 0, Phase 1, Phase 2, Phase 3
**Deliverable:** Permission cache, contract reads, fail-closed on chain outage

### Files to Create

#### `src/rbac/permission.ts`
- inferAction(method: HttpMethod): Result<PermissionAction, RequestError>
- ACTION_TO_METHODS reverse lookup
- Unknown method → 400 -32600

#### `src/rbac/cache.ts`
- PermissionCache class
  - Map<AgentAddress, { role: Role; expiresAt: number }>
- get(agent, chainDriver): Promise<Result<Role, ServiceError>>
  - Hit: return cached if not expired
  - Miss: read from chain, store with TTL
  - Chain failure: return ServiceError(-32022) — fail closed, never fail open
  - Retry: exponential backoff (3 attempts, 100ms base, full jitter)

#### `src/rbac/contract.ts`
- RBACContractReader class
- hasPermission(agent, tool, action, driver): Promise<Result<boolean, ServiceError>>
- getAgentRole(agent, driver): Promise<Result<{ roleId, isActive }, ServiceError>>
- Uses TypeChain-generated types (never hand-written ABI)
- Timeout: 30s per call
- Return ServiceError(-32022) on chain timeout/failure

### Tests (90%+ coverage required)
- Cache hit (no chain call) → success
- Cache TTL expiry (triggers chain call) → success
- Chain timeout (3 retries, exponential backoff) → 504 -32021
- Chain unavailable → 503 -32022 (fail closed, NOT permission denied)
- Permission denied by action → 403 -32011 with allowed_actions in error.data
- Emergency revoke (agent inactive) → 403 -32012
- Integration test against local Hardhat node

### Acceptance Criteria
- ✅ Permission cache with TTL works
- ✅ Fail-closed on chain outage (return 503, not 403)
- ✅ Exponential backoff retry on timeout
- ✅ All permission scenarios tested
- ✅ 90%+ coverage on rbac/
- ✅ Integration test with live contract on local Hardhat

---

## Phase 6: Key Custody Module (~2 hours)

**Depends on:** Phase 0, Phase 1, Phase 3
**Deliverable:** Opaque API key handles, environment variable loading

### Files to Create

#### `src/custody/key-loader.ts`
- loadKeysFromEnv(config: AppConfig): Result<Map<ToolKey, ApiKeyHandle>, ServiceError>
  - For each ToolConfig, resolve keyRef to env var
  - Fail fast if missing: startup error with clear message
  - Return opaque handles (never expose key values)

#### `src/custody/key-vault.ts`
- KeyVaultImpl implements KeyCustodyDriver
- private keyMap: Map<ToolKey, string> (actual keys, never exported)
- getKey(tool): Result<ApiKeyHandle, ServiceError>
  - Return opaque handle or ServiceError if not found
- inject(handle): string
  - Only method that unwraps handle to actual key
  - Used by executor to inject into Authorization header

#### `src/custody/types.ts`
- Re-export branded types for clarity

### Tests
- Valid env vars → all keys loaded
- Missing env var → startup error (clear message: "Missing GITHUB_API_KEY")
- ApiKeyHandle never serializable (compile-time error if attempted)
- Pino redacts ApiKeyHandle if in context

### Acceptance Criteria
- ✅ Keys loaded from .env at startup
- ✅ Missing key causes startup failure
- ✅ ApiKeyHandle is opaque (type-safe)
- ✅ No accidental key exposure in logs
- ✅ `pnpm typecheck && pnpm test` passes

---

## Phase 7: Chain Driver (~5 hours)

**Depends on:** Phase 0, Phase 1, Phase 2
**Deliverable:** Local mock, Hedera driver, generic EVM driver

### Files to Create

#### `src/chain/local.ts` (in-memory mock for testing)
- LocalChainDriver implements ChainDriver
- Simulate RBAC contract state in memory
- Configurable to simulate timeout/failure for testing fail-closed
- Used by unit tests; never used in production

#### `src/chain/hedera.ts` (production Hedera driver)
- HederaChainDriver implements ChainDriver
- viem.createPublicClient() with hederaTestnet chain
- viem.createWalletClient() for writes (proxy's private key from env)
- Read timeout: 30s, write timeout: 60s
- Uses TypeChain-generated ABIs with `as const` assertion
- Retry logic: exponential backoff on timeout
- getChainId(): 295 (Hedera testnet)

#### `src/chain/evm.ts` (generic EVM: Base, Arbitrum, Optimism)
- EVMChainDriver implements ChainDriver
- Same pattern as Hedera
- Chain configured via AppConfig (chain.name, chain.chainId, chain.rpcUrl)

#### `src/chain/factory.ts`
- createChainDriver(config): ChainDriver
- Dispatch to local/hedera/evm based on config
- Fail fast if unsupported chain

### Tests
- Integration tests against local Hardhat node
- callContract (view) works correctly
- writeContract (state change) returns tx hash
- Timeout simulation: 3 retries, exponential backoff, then error
- Chain unavailable: return ServiceError(-32022)

### Acceptance Criteria
- ✅ Local mock works for unit tests
- ✅ Hedera driver connects to testnet RPC
- ✅ EVM driver generic
- ✅ Retry logic: exponential backoff (3 attempts, 100ms base, full jitter)
- ✅ Timeout enforcement (30s read, 60s write)
- ✅ Integration tests pass

---

## Phase 8: Audit Module (~5 hours)

**Depends on:** Phase 0, Phase 1, Phase 3, Phase 7
**Deliverable:** Encryption, durable queue, blockchain writes

### Files to Create

#### `src/audit/payload.ts`
- buildAuditPayload(...): AuditPayload
- hashPayload(payload): Hash (SHA-256)
- hashBody(body: unknown): Hash (SHA-256 of serialized body)

#### `src/audit/encryption.ts`
- EncryptionService class
- encrypt(payload, key: Buffer): EncryptedPayload
  - AES-256-GCM
  - IV prepended to ciphertext
  - Base64 output
  - Key loaded from AUDIT_ENCRYPTION_KEY env var (32-byte hex)
- decrypt(encrypted, key): AuditPayload (admin-only utility)

#### `src/audit/store.ts` (durable in-memory queue)
- AuditQueue class
  - entries: AuditEntry[]
  - enqueue(entry): void (non-blocking, push to array)
  - Flush loop: setInterval every 1s
    - For each entry: attempt blockchain write
    - On success: dequeue
    - On failure: retry with exponential backoff (3 attempts, 100ms base, full jitter)
    - After 3 failures: emit error event (log error, surface to monitoring, don't crash)
  - Graceful shutdown: drain queue on SIGTERM

#### `src/audit/contract.ts`
- AuditContractWriter class
- logAudit(entry, chainDriver): Promise<TransactionHash>
- getAuditEntry(auditId, chainDriver): Promise<AuditEntry>
- Both sign: agentSignature (original X-Signature) + proxySignature (proxy signs payloadHash)

### Tests (90%+ coverage required)
- Encrypt/decrypt roundtrip: original === decrypted
- Hash determinism: same payload → same hash
- Queue flush with retry: 3 attempts on failure, error on max retries
- Graceful shutdown: drain queue
- logAudit on contract
- getAuditEntry retrieves entry
- Integration test: queue → blockchain write → readable on-chain

### Acceptance Criteria
- ✅ Encryption/decryption works
- ✅ Queue persists entries (in-memory, loss acknowledged on crash)
- ✅ Retry logic: exponential backoff, 3 attempts
- ✅ Graceful shutdown drains queue
- ✅ Audit entries readable on-chain
- ✅ 90%+ coverage on audit/
- ✅ Integration tests pass

---

## Phase 9: Proxy Executor (~3 hours)

**Depends on:** Phase 0, Phase 1, Phase 5, Phase 6, Phase 8
**Deliverable:** HTTP forwarding, key injection, response handling

### Files to Create

#### `src/proxy/action-mapper.ts`
- inferAction(method): Result<PermissionAction, RequestError>
- ACTION_TO_METHODS reverse lookup

#### `src/proxy/tool-registry.ts`
- ToolRegistry class built from AppConfig
- findTool(targetUrl): Result<ToolConfig, RequestError>
- Longest prefix match on baseUrl
- No match → 404 -32013
- HTTPS-only check (if production mode)

#### `src/proxy/executor.ts`
- ProxyExecutor class
- execute(req: ForwardRequest, keyHandle): Promise<Result<ExecutorResult, ServiceError>>
  - Inject Authorization header with key
  - Stream body unchanged (no buffering)
  - Do NOT follow redirects (pass 3xx back)
  - Read timeout: 30s, write timeout: 60s
  - On upstream error: wrap in ServiceError, include upstream_status in error.data
  - Response handling:
    - JSON: return parsed body for wrapping
    - Non-JSON: return raw body + flag for X-Governance header
    - SSE: pass through, first event injected with _governance

### Tests
- Action mapping: all 6 HTTP methods
- Tool extraction: longest prefix, no match, HTTPS enforcement
- Key injection: Authorization header set, key not in response/log
- Redirect passthrough (no following)
- Upstream timeout → 504 -32021
- Upstream error → 502 -32020 with upstream_status
- Response type detection (JSON vs binary vs SSE)

### Acceptance Criteria
- ✅ HTTP forwarding works end-to-end
- ✅ Key injected correctly
- ✅ Timeouts enforced (30s read, 60s write)
- ✅ Error wrapping correct
- ✅ Response handling (JSON vs binary vs SSE)
- ✅ `pnpm typecheck && pnpm test` passes

---

## Phase 10: Middleware Pipeline (~4 hours)

**Depends on:** Phase 0, Phase 1, Phase 3, Phase 4, Phase 5, Phase 6
**Deliverable:** Authentication → Authorization → Key Injection middleware

### Files to Create

#### `src/api/middleware/signature.ts` (Hono middleware)
- Parse headers: X-Agent-Address, X-Signature, X-Nonce, X-Timestamp
- Call verifySignedRequest()
- On failure: return JSON-RPC error (-32001 to -32005)
- On success: attach recoveredAddress to context (NOT claimed address)
- Log at entry: requestId, claimed agent, action

#### `src/api/middleware/rbac.ts` (Hono middleware)
- Extract target URL from /forward/ path OR tools/list params
- Call tool-registry to find tool, infer action
- Call RBAC cache with recovered address
- On failure: return JSON-RPC error (-32010 to -32012)
- On success: attach tool, action, role to context

#### `src/api/middleware/audit.ts` (Hono middleware — post-response)
- Build AuditPayload from request + response in context
- Encrypt payload
- auditStore.enqueue() (non-blocking)
- Attach auditTx placeholder to context for response wrapping

### Tests
- Middleware chain: signature → rbac → audit
- Invalid signature blocks at step 1, never reaches RBAC
- Invalid RBAC blocks at step 2, but audit still queued
- Context propagates correctly through chain

### Acceptance Criteria
- ✅ Middleware order enforced (auth → authz → key inject → forward → audit)
- ✅ All error responses have _governance
- ✅ `pnpm typecheck && pnpm test` passes

---

## Phase 11: HTTP API Handlers (~4 hours)

**Depends on:** Phase 0, Phase 1, Phase 3, Phase 4, Phase 5, Phase 9, Phase 10
**Deliverable:** Hono server, route registration, error handlers

### Files to Create

#### `src/api/server.ts` (Hono app)
- app.use('*', requestIdMiddleware()) → UUID v4, attach to context
- app.post('/rpc', rpcHandler)
- app.all('/forward/*', signatureMiddleware, rbacMiddleware, forwardHandler)
- app.get('/health', healthHandler)
- Global error handler: catch ZuulError → format JSON-RPC + _governance
- Graceful shutdown hook: drain audit queue on SIGTERM

#### `src/api/handlers/rpc.ts`
- POST /rpc
- Parse JSON-RPC: { jsonrpc, method, params, id }
- Unknown method → -32600
- tools/list:
  - No signature verification for discovery
  - Require params.agent_address
  - Return filtered tools (agent has ≥1 permission)
  - Response: { tools: [{key, description, base_url, allowed_actions}] }
- tools/describe (optional):
  - Require params.agent_address + params.tool_key
  - Return endpoints for that tool if agent has access

#### `src/api/handlers/forward.ts`
- ANY /forward/:targetUrl
- Middleware already verified signature + RBAC
- Extract key from custody
- Call executor.execute()
- On error: build JSON-RPC error + _governance
- On success:
  - JSON: { result: body, _governance }
  - Non-JSON: passthrough + X-Governance header
  - SSE: inject _governance as first event
- Enqueue audit (non-blocking)
- Log at exit: requestId, agent, tool, action, status, latencyMs

#### `src/api/handlers/health.ts`
- GET /health
- No auth
- Response: { status: 'ok', timestamp }

### Tests (90%+ coverage required)
- tools/list: returns only permitted tools
- forward: all 5 HTTP methods
- _governance on all responses (success + error)
- All 15 error codes: correct HTTP + JSON-RPC + errorType
- Response wrapping: JSON vs binary vs SSE

### Acceptance Criteria
- ✅ Hono server starts and listens
- ✅ All endpoints respond correctly
- ✅ _governance injected everywhere
- ✅ Error handling comprehensive
- ✅ 90%+ coverage on api/
- ✅ `pnpm typecheck && pnpm test` passes

---

## Phase 12: End-to-End Integration Tests (~4 hours)

**Depends on:** Phase 1-11
**Deliverable:** Full pipeline tests with mocked upstream, live local Hardhat

### File: `tests/integration/test_e2e.ts`

Scenarios:
1. Auth failure (bad signature) → 401 -32002, audit queued
2. Unknown tool → 404 -32013
3. Permission denied (no action) → 403 -32011 + allowed_actions
4. Emergency revoke → 403 -32012
5. Success flow → 200 + _governance + audit_tx
6. RBAC cache: second request uses cache (no chain read)
7. Chain outage simulation → 503 -32022 (fail closed)
8. tools/list returns filtered tools by permission
9. Upstream timeout → 504 -32021
10. Upstream error → 502 -32020 + upstream_status

### Acceptance Criteria
- ✅ All scenarios pass
- ✅ Live local Hardhat used (not mocked)
- ✅ Mocked upstream tool (no real API calls)
- ✅ Request tracing works (requestId in all logs)
- ✅ Audit entries written to blockchain

---

## Phase 13: Demo Agent (~3 hours)

**Depends on:** Phase 1-11 (running proxy)
**Deliverable:** Generic TypeScript agent, orchestration script

### Files to Create

#### `demo/agent.ts`
- Generic TypeScript agent using viem
- Uses private key from .env for wallet
- Builds canonical payload → signs → calls Zuul
- No MCP SDK, no OpenClaw SDK (generic)
- Functions:
  - signRequest(method, url, nonce, timestamp): Promise<SignedRequest>
  - callToolsList(): Promise<Tool[]>
  - callTool(method, url, body?): Promise<unknown>

#### `demo/scenario.ts`
- Orchestrated demo script
- Setup: admin deploys contracts
- registerAgent, grantPermission
- Test flow: success, denied, revoke, success again
- Logs all responses with _governance + audit_tx

#### `demo/README.md`
- Setup instructions
- How to run demo against local proxy
- How to inspect audit logs on blockchain

### Acceptance Criteria
- ✅ Demo agent runs end-to-end
- ✅ Demonstrates auth, RBAC, key injection, audit
- ✅ Shows denied → revoke → denied flow
- ✅ Logs are clear for presentation

---

## Phase 14: CI/CD Pipeline (~3 hours)

**Depends on:** Phase 0-13
**Deliverable:** GitHub Actions workflow, coverage gates, automated testing

### File: `.github/workflows/ci.yml`

Jobs (parallel where possible):
1. **lint-format-typecheck**
   - pnpm lint (ESLint)
   - pnpm format:check (Prettier)
   - pnpm typecheck (tsc --noEmit)

2. **test**
   - pnpm test:coverage (Vitest with v8)
   - Fail if below 90%

3. **contracts**
   - pnpm contracts:build (Hardhat compile)
   - pnpm contracts:test (Hardhat test)

4. **build**
   - pnpm build (tsc compile to dist/)

5. **deploy** (manual trigger or main branch only)
   - scripts/deploy-contracts.sh (Hardhat Ignition → Hedera testnet)

Node.js: pinned to LTS (22.x) in matrix + package.json engines

### Acceptance Criteria
- ✅ CI runs on every push
- ✅ All quality gates enforced
- ✅ Coverage gate at 90%
- ✅ Deployment requires manual approval
- ✅ Artifact caching works (node_modules, contracts artifacts)

---

## Phase 15: Documentation (~3-4 hours)

**Depends on:** Phase 1-14
**Deliverable:** Complete user-facing and developer documentation

### Files to Create

#### `README.md`
- Project name: Zuul Proxy
- One-liner: On-chain governance proxy for agent tool access
- Quickstart: 3 steps (install, config, run)
- Links to docs/

#### `docs/architecture.md`
- System diagram (ASCII or Mermaid)
- Module breakdown
- Data models (Agent, Role, Permission, AuditEntry)
- Contract interfaces (RBAC, Audit)
- MVP assumptions
- Limitations (opt-in, HTTP-only, no network isolation)

#### `docs/api.md`
- Endpoint specs with request/response examples
- POST /rpc (tools/list, tools/describe)
- ANY /forward/{target_url}
- Error codes (all 15)
- Signature format
- tools/list response shape
- Governance metadata

#### `docs/deployment.md`
- config.yaml structure
- .env setup
- Chain driver configuration (Hedera, Base, Arbitrum, Optimism)
- Hardhat Ignition deploy commands
- MVP limitations

#### `docs/security.md`
- Trust boundaries
- Signature verification flow
- RBAC cache fail-closed
- Audit immutability
- Key custody model

### Acceptance Criteria
- ✅ README is entry point
- ✅ Architecture doc explains MVP design
- ✅ API doc has all endpoint details
- ✅ Deployment guide is step-by-step
- ✅ Security doc explains threat model
- ✅ All links work

---

## Summary Dependency Graph

```
Phase 0: Bootstrap
    ↓
Phase 1: Types
    ↓ ↓ ↓
    ├→ Phase 2: Contracts
    │       ↓
    │   Phase 7: Chain Driver
    │       ↓
    ├→ Phase 3: Config/Logging ─→ Phase 4: Auth ─→ Phase 5: RBAC ─→ Phase 10: Middleware
    │                                                   ↓
    ├→ Phase 6: Key Custody ────────────────────────→ Phase 9: Executor ──→ Phase 11: Handlers
    │
    ├→ Phase 8: Audit
    │
    └→ Phase 12: E2E Tests
        ↓
    Phase 13: Demo Agent
        ↓
    Phase 14: CI/CD
        ↓
    Phase 15: Documentation
```

---

## Parallel Work Opportunities

- Phases 3, 4, 6 can begin as soon as Phase 1 is done (no inter-dependencies)
- Phase 2 (contracts) can proceed in parallel with Phase 1
- Phase 7 needs Phase 2 to be complete
- Phases 9, 10, 11 can run in parallel once their dependencies are met
- Phase 12 integration tests can run as soon as Phase 11 is complete
- Phase 13 demo and Phase 14 CI can run in parallel
- Phase 15 documentation should be done at the end (or incrementally)

---

## Quality Gates

**Before each phase commit:**
- `pnpm typecheck` passes (0 errors)
- `pnpm lint` passes
- `pnpm format:check` passes
- `pnpm test` passes with 90%+ coverage (core modules)
- Git commit hooks enforced (husky + lint-staged)

**Before MVP release:**
- All 15 phases complete
- CI/CD pipeline green
- Integration tests pass against local Hardhat
- Demo agent scenario runs end-to-end
- Documentation complete
