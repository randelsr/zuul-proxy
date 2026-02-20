# Phases 8-15: Detailed Implementation

Complete detailed specifications for remaining phases.

---

## Phase 8: Audit Module (~5 hours)

**Depends on:** Phase 0, 1, 3, 7
**Deliverable:** Encryption, durable queue, blockchain writes
**Success Criteria:** 90%+ coverage, integration tests pass

### Files to Create

**src/audit/payload.ts**
- `buildAuditPayload(agent, tool, action, endpoint, status, errorType, latencyMs, requestHash, responseHash): AuditPayload`
- `hashPayload(payload: AuditPayload): Hash` — SHA-256
- `hashBody(body: unknown): Hash` — SHA-256 of serialized body

**src/audit/encryption.ts**
- `EncryptionService` class
- `encrypt(payload: AuditPayload, key: Buffer): EncryptedPayload` — AES-256-GCM, IV prepended, base64
- `decrypt(encrypted: EncryptedPayload, key: Buffer): AuditPayload` — admin utility
- Key from `AUDIT_ENCRYPTION_KEY` env var (32-byte hex)

**src/audit/store.ts** (durable in-memory queue)
- `AuditQueue` class
- `enqueue(entry: AuditEntry): void` — non-blocking push to array
- `flush(): Promise<void>` — drain queue to blockchain with retry (3 attempts, 100ms base, full jitter)
- `getMetrics(): { pending: number, failed: number }`
- Graceful shutdown via SIGTERM

**src/audit/contract.ts**
- `AuditContractWriter` class
- `logAudit(entry: AuditEntry, chainDriver): Promise<TransactionHash>`
- Both sign: `agentSignature` (original X-Signature) + `proxySignature` (proxy signs payloadHash)
- Uses TypeChain-generated Audit ABI

**tests/audit/test_encryption.ts, test_store.ts, test_contract.ts**
- Encrypt/decrypt roundtrip
- Hash determinism
- Queue flush with retry
- Graceful shutdown
- Integration with live Hardhat contract

### Commands

```bash
touch src/audit/{payload,encryption,store,contract}.ts tests/audit/test_{encryption,store,contract}.ts

# (Copy code from specification)

pnpm typecheck
pnpm test tests/audit tests/audit --coverage

# Target 90%+ coverage on core audit modules

git add src/audit/ tests/audit/
git commit -m "Phase 8: Audit module — encryption, durable queue, blockchain writes"
```

---

## Phase 9: Proxy Executor (~3 hours)

**Depends on:** Phase 0, 1, 5, 6, 8
**Deliverable:** HTTP forwarding, key injection, response wrapping
**Success Criteria:** All response types handled correctly

### Files to Create

**src/proxy/action-mapper.ts**
```typescript
export function inferAction(method: HttpMethod): Result<PermissionAction, RequestError>
// GET/HEAD → read, POST → create, PUT/PATCH → update, DELETE → delete
```

**src/proxy/tool-registry.ts**
```typescript
export class ToolRegistry {
  findTool(targetUrl: string): Result<ToolConfig, RequestError>
  // Longest prefix match on baseUrl
  // No match → 404 -32013
  // HTTPS-only check in production mode
}
```

**src/proxy/executor.ts**
```typescript
export class ProxyExecutor {
  async execute(req: ForwardRequest, keyHandle: ApiKeyHandle): Promise<Result<ExecutorResult, ServiceError>>
  // Inject Authorization header with key
  // Stream body unchanged (no buffering)
  // Do NOT follow redirects (pass 3xx back)
  // Read timeout: 30s, write timeout: 60s
  // Response handling: JSON (parse) vs binary (passthrough) vs SSE (inject first event)
}
```

**tests/proxy/**
- Action mapping (all 6 HTTP methods)
- Tool extraction (longest prefix, no match, HTTPS)
- Key injection verification
- Timeout handling
- Upstream error wrapping
- Response type detection

---

## Phase 10: Middleware Pipeline (~4 hours)

**Depends on:** Phase 0, 1, 3, 4, 5, 6
**Deliverable:** Auth → AuthZ → Key Inject middleware
**Success Criteria:** Strict ordering enforced

### Files to Create

**src/api/middleware/signature.ts** (Hono middleware)
- Parse X-Agent-Address, X-Signature, X-Nonce, X-Timestamp headers
- Call verifySignedRequest()
- On failure: return JSON-RPC error (-32001 to -32005)
- On success: attach recoveredAddress to context (NOT claimed)
- Log at entry: requestId, claimed agent

**src/api/middleware/rbac.ts** (Hono middleware)
- Extract target URL from /forward/ path OR tools/list params
- Call tool-registry to find tool, infer action
- Call RBAC cache with recovered address
- On failure: return JSON-RPC error (-32010 to -32012)
- On success: attach tool, action, role to context

**src/api/middleware/audit.ts** (Hono middleware, post-response)
- Build AuditPayload from request + response in context
- Encrypt payload
- `auditStore.enqueue()` (non-blocking)
- Attach auditTx placeholder to context

**tests/api/middleware/**
- Middleware chain: signature → rbac → audit
- Invalid signature blocks at step 1, never reaches RBAC
- Invalid RBAC blocks at step 2, but audit still queued

---

## Phase 11: HTTP API Handlers (~4 hours)

**Depends on:** All previous phases
**Deliverable:** Hono server, route registration, error handlers
**Success Criteria:** All endpoints respond correctly with _governance

### Files to Create

**src/api/server.ts** (Hono app)
```typescript
const app = new Hono()
app.use('*', requestIdMiddleware())  // UUID v4
app.post('/rpc', rpcHandler)
app.all('/forward/*', signatureMiddleware, rbacMiddleware, forwardHandler)
app.get('/health', healthHandler)
// Global error handler
// Graceful shutdown: drain audit queue on SIGTERM
```

**src/api/handlers/rpc.ts**
- POST /rpc
- Parse JSON-RPC: { jsonrpc, method, params, id }
- Unknown method → -32600
- `tools/list`: no signature verification, return filtered tools by permission
- `tools/describe` (optional): return endpoints if agent has access

**src/api/handlers/forward.ts**
- ANY /forward/:targetUrl
- Middleware verified signature + RBAC
- Retrieve key from custody
- Call executor.execute()
- On success: wrap response
  - JSON: { result: body, _governance }
  - Binary: passthrough body + X-Governance header
  - SSE: inject _governance as first event
- Enqueue audit (non-blocking)

**src/api/handlers/health.ts**
- GET /health → { status: 'ok', timestamp }
- No auth required

**tests/api/**
- tools/list: returns only permitted tools
- forward: all 5 HTTP methods
- _governance on all responses
- All 15 error codes: correct HTTP + JSON-RPC + errorType
- Response wrapping: JSON vs binary vs SSE

---

## Phase 12: E2E Integration Tests (~4 hours)

**Depends on:** Phases 1-11
**Deliverable:** Full pipeline tests, live local Hardhat, mocked upstream

### File: tests/integration/test_e2e.ts

Scenarios:
1. **Auth failure** (bad signature) → 401 -32002, audit queued
2. **Unknown tool** → 404 -32013
3. **Permission denied** (no action) → 403 -32011 + allowed_actions
4. **Emergency revoke** → 403 -32012
5. **Success flow** → 200 + _governance + audit_tx
6. **RBAC cache hit** → second request uses cache (no chain read)
7. **Chain outage simulation** → 503 -32022 (fail closed)
8. **tools/list** returns filtered tools by permission
9. **Upstream timeout** → 504 -32021
10. **Upstream error** → 502 -32020 + upstream_status

All scenarios use:
- Live local Hardhat for contracts
- Mocked upstream tool (no real API calls)
- Request tracing (requestId in all logs)
- Audit entries written to blockchain

---

## Phase 13: Demo Agent (~3 hours)

**Depends on:** Phases 1-11 (running proxy)
**Deliverable:** Generic TypeScript agent, orchestration script

### Files to Create

**demo/agent.ts**
- Generic TypeScript agent using viem
- Uses private key from .env for wallet
- Functions:
  - `signRequest(method, url, nonce, timestamp): Promise<SignedRequest>`
  - `callToolsList(): Promise<Tool[]>`
  - `callTool(method, url, body?): Promise<unknown>`
- No MCP SDK, no OpenClaw SDK

**demo/scenario.ts**
- Orchestrated demo script
- Setup: admin deploys contracts
- Flow: registerAgent → grantPermission → call (success) → denied → revoke → denied → re-register → success
- Logs all responses with _governance + audit_tx

**demo/README.md**
- Setup instructions
- How to run against local proxy
- How to inspect audit logs on blockchain

---

## Phase 14: CI/CD Pipeline (~3 hours)

**Depends on:** Phases 0-13
**Deliverable:** GitHub Actions workflow, coverage gates, deployment

### File: .github/workflows/ci.yml

Jobs (parallel):
1. **lint-format-typecheck**
   - `pnpm lint`
   - `pnpm format:check`
   - `pnpm typecheck`

2. **test**
   - `pnpm test:coverage` (Vitest, v8 provider)
   - Fail if below 90%

3. **contracts**
   - `pnpm contracts:build` (Hardhat)
   - `pnpm contracts:test` (Hardhat)

4. **build**
   - `pnpm build` (tsc)

5. **deploy** (manual or main branch)
   - `scripts/deploy-contracts.sh` (Hardhat Ignition → Hedera testnet)

Node.js: pinned to LTS (22.x) in matrix + package.json engines

---

## Phase 15: Documentation (~3-4 hours)

**Depends on:** Phases 1-14
**Deliverable:** Complete user-facing and developer documentation

### Files to Create

**README.md**
- Project name: Zuul Proxy
- One-liner: On-chain governance proxy for agent tool access
- Quickstart: 3 steps
- Links to docs/

**docs/architecture.md**
- System diagram
- Module breakdown
- Data models
- Contract interfaces
- MVP assumptions
- Limitations

**docs/api.md**
- Endpoint specs with examples
- POST /rpc (tools/list, tools/describe)
- ANY /forward/{target_url}
- All 15 error codes
- Signature format
- Governance metadata

**docs/deployment.md**
- config.yaml structure
- .env setup
- Chain driver configuration
- Hardhat Ignition commands
- MVP limitations

**docs/security.md**
- Trust boundaries
- Signature verification flow
- RBAC fail-closed
- Audit immutability
- Key custody model

---

## Parallel Work Opportunities

- Phases 3, 4, 6 can run parallel (after Phase 1)
- Phase 2 (contracts) can parallel with Phase 1
- Phase 5 needs Phase 2 done
- Phase 7 needs Phase 2 done
- Phases 9, 10, 11 can overlap
- Phases 13, 14 can parallel
- Phase 15 (documentation) can start once Phase 11 is done

---

## Quality Gates (Every Phase)

```bash
pnpm typecheck     # Zero type errors
pnpm lint          # No linting issues
pnpm format:check  # Formatting
pnpm test          # All tests passing
                   # 90%+ coverage on core modules
```

---

## Success Criteria (MVP)

✅ All 15 phases complete
✅ `pnpm typecheck && pnpm lint && pnpm test:coverage` passes (90%)
✅ `pnpm contracts:build && pnpm contracts:test` passes
✅ Demo agent runs end-to-end
✅ Audit entries visible on-chain
✅ Live demo: signature verification → permission denied → emergency revoke → success
✅ GitHub Actions CI/CD passes
✅ README + API docs complete

---

## Known Limitations (Documented)

| Limitation | Rationale | Future |
|-----------|-----------|--------|
| Nonce storage in-memory | MVP simplicity | Redis/SQLite in 2.0 |
| Audit queue loss on crash | Trade-off | Write-ahead log in 2.0 |
| HTTP-only | Focus on governance | WebSocket/gRPC in 2.0 |
| No native MCP | Explicit opt-in | Native MCP in 2.0 |
| Coarse RBAC (tool-level) | MVP scope | Per-path RBAC in 2.0 |
| .env for keys | No external infra | Vault integration in 2.0 |
