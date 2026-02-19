# Security Model

Zuul Proxy enforces on-chain governance for agent tool access with cryptographic authentication, immutable audit trails, and fail-closed permission checks.

## Executive Summary

**Security guarantees:**
- Agents must sign all requests (EIP-191)
- Permissions verified on-chain (RBAC contract as source of truth)
- All requests audited to immutable blockchain log
- API keys never exposed to agents or upstream
- Encryption at rest (AES-256-GCM) for audit privacy
- Fail-closed on any error (deny by default)

**Attack surface:**
- Signature verification (agent authentication)
- RBAC permission checks (authorization)
- Key injection (credential isolation)
- Audit encryption (privacy)
- Nonce validation (replay prevention)
- Timestamp freshness (stale request prevention)

---

## Threat Model

### Adversaries

**1. Malicious Agent**
- Attempts to:
  - Forge signatures to impersonate other agents
  - Replay previous requests
  - Escalate permissions beyond what's granted
  - Extract API keys by inspecting responses
  - Bypass governance to access tools directly
- Mitigation: EIP-191 signature verification, nonce tracking, RBAC checks, opaque key handles

**2. Compromised Upstream Tool (GitHub, Slack, etc.)**
- Attempts to:
  - Return malicious responses that expose Zuul internals
  - Exploit parsing logic
  - Cause denial of service
  - Inject malware into audit trail
- Mitigation: Response parsing validation, timeout enforcement, audit encryption

**3. Blockchain Attacker (consensus compromise)**
- Extremely unlikely; Ethereum/Hedera consensus is Byzantine Fault Tolerant
- Even if single blockchain node is compromised:
  - Cannot forge valid audit records (cryptographic signatures required)
  - Cannot modify historical records (append-only log)
  - Cannot change RBAC permissions (needs valid contract transaction)
- Mitigation: Multi-chain deployment for diversity, consensus-based security

**4. Network Eavesdropper (MITM)**
- Observes all unencrypted traffic
- Attempts to:
  - Steal API keys in transit
  - Forge signatures
  - Redirect requests
- Mitigation: HTTPS-only in production, TLS 1.3, certificate pinning

---

## Attack Vectors and Mitigations

### 1. Signature Forgery

**Attack:** Malicious agent submits request with forged signature.

**Technical details:**
```
Attacker constructs:
  Payload = "GET\nhttps://api.github.com/repos/owner/repo\n<nonce>\n<timestamp>"
  Signature = sign_with_attacker_key(Payload)
  Header X-Signature = Signature

Zuul verifies:
  RecoveredAddress = recover(Payload, Signature)  // Returns attacker's address
  Claimed Address = X-Agent-Address

  if RecoveredAddress != Claimed Address:
    REJECT (401 -32002)
```

**Mitigation:**
- Use EIP-191 signature recovery (battle-tested standard)
- Always verify recovered address matches claimed address
- Never trust claimed address without signature verification
- Log all signature mismatches as security events

**Code location:** `src/auth/signature.ts`

---

### 2. Replay Attack

**Attack:** Attacker captures a valid signed request and replays it multiple times.

**Example:**
```bash
# First request (legitimate agent)
curl -X POST /forward/https://api.github.com/repos/owner/repo/issues \
  -H "X-Signature: 0xabc..." \
  -H "X-Nonce: abc-123-def-456" \
  -H "X-Timestamp: 1740000000"

# Attacker replays the same request immediately
curl -X POST /forward/https://api.github.com/repos/owner/repo/issues \
  -H "X-Signature: 0xabc..." \
  -H "X-Nonce: abc-123-def-456"   # Same nonce!
  -H "X-Timestamp: 1740000000"     # Same timestamp
```

**Mitigation:**
- Track used nonces per agent address
- Reject any duplicate nonce (401 -32004)
- Nonce storage scoped to agent (not global) — prevents one agent from blocking all others
- TTL on nonce storage (5 minutes) — prevents unbounded memory growth
- Log all nonce reuses as security events

**Implementation:**
```typescript
// Per-agent nonce tracking
const nonceStore = new Map<AgentAddress, Set<Nonce>>();

function validateNonce(agent: AgentAddress, nonce: Nonce): boolean {
  const agentNonces = nonceStore.get(agent) || new Set();

  if (agentNonces.has(nonce)) {
    // REPLAY ATTACK DETECTED
    return false;
  }

  agentNonces.add(nonce);
  nonceStore.set(agent, agentNonces);

  // Schedule cleanup after TTL
  setTimeout(() => agentNonces.delete(nonce), 5 * 60 * 1000);

  return true;
}
```

**Code location:** `src/auth/nonce.ts`

---

### 3. Stale Request Attack

**Attack:** Attacker uses a timestamp from far in the past to bypass freshness checks.

**Example:**
```bash
curl -X POST /forward/https://api.github.com/repos/owner/repo/issues \
  -H "X-Timestamp: 1700000000"  # 40 days old!
```

**Mitigation:**
- Enforce ±5 minute window on timestamps
- Reject requests outside window (401 -32005)
- Server time used as source of truth (not client time)
- Prevents both old and future-dated requests

**Implementation:**
```typescript
function validateTimestamp(timestamp: number): boolean {
  const now = Date.now() / 1000;
  const drift = Math.abs(now - timestamp);

  if (drift > 5 * 60) {  // 5 minutes
    return false;  // STALE REQUEST
  }

  return true;
}
```

**Code location:** `src/auth/timestamp.ts`

---

### 4. Permission Escalation

**Attack:** Agent attempts to perform actions beyond their granted permissions.

**Example:**
```bash
# Agent has only "read" permission for GitHub
# But tries to perform "delete"
curl -X DELETE /forward/https://api.github.com/repos/owner/repo \
  -H "X-Signature: 0xabc..." \
  -H "X-Nonce: abc-123" \
  -H "X-Timestamp: 1740000000"
```

**Zuul processing:**
1. Signature verification → PASS (signature is valid)
2. Nonce/timestamp validation → PASS
3. Tool extraction → Extract `github` from URL
4. **RBAC check** → Agent has `github.read` but tries `github.delete` → DENY (403 -32012)

**Mitigation:**
- RBAC permissions stored in smart contract (on-chain, source of truth)
- Permission cache with 5-min TTL for performance
- On cache miss + chain error: Return 503 (fail closed), never grant access
- Log all permission denials with agent address and attempted action

**Code location:** `src/rbac/check.ts`

---

### 5. Key Exposure

**Attack:** Agent attempts to extract API keys from responses or logs.

**Mitigation:**
1. **Keys never in responses** — API keys only used for upstream Authorization header
2. **Keys never logged** — All logging redacts credential handles
3. **Opaque key handles** — TypeScript branded types prevent serialization

**Implementation:**
```typescript
// Branded type prevents accidental serialization
type ApiKeyHandle = string & { readonly _brand: 'ApiKeyHandle' };

// Key injection happens ONLY after auth/authz pass
function injectKeyIntoRequest(
  request: Request,
  keyHandle: ApiKeyHandle
): Request {
  const actualKey = keyVault.unwrap(keyHandle);  // Only place key is unwrapped
  request.headers.set('Authorization', `Bearer ${actualKey}`);
  return request;
}

// Logging redacts key references
logger.info('Request forwarded', {
  tool: 'github',
  action: 'read',
  keyRef: '[REDACTED]',  // Never log actual key or handle
});
```

**Code location:** `src/custody/vault.ts`, `src/logging.ts`

---

### 6. Chain Outage Exploitation

**Attack:** Attacker knows blockchain RPC is down; tries to bypass permission checks.

**Example:**
```
1. Blockchain RPC is offline
2. Attacker requests elevated action
3. Zuul cannot read RBAC contract
4. Question: What should Zuul do?
   - Option A: Grant access (fail open) — SECURITY VIOLATION
   - Option B: Deny access (fail closed) — CORRECT
```

**Mitigation:**
- On chain read failure: Return 503 -32022 (Service Unavailable)
- Never grant access due to error
- Never fall back to less-restrictive permissions
- Permission cache with TTL: If cache hit, use cached permissions; if cache miss + error, deny

**Implementation:**
```typescript
async function checkPermission(agent: AgentAddress, tool: string, action: string) {
  // Try cache first
  const cached = permissionCache.get(agent);
  if (cached && !cached.isExpired()) {
    return cached.hasPermission(tool, action);
  }

  // Cache miss, read from chain
  try {
    const permissions = await rbacContract.getPermissions(agent);
    permissionCache.set(agent, permissions);
    return permissions.hasPermission(tool, action);
  } catch (error) {
    // Chain error: FAIL CLOSED
    logger.error('RBAC check failed', { agent, tool, action, error });
    throw new PermissionError(
      'Service unavailable: cannot verify permissions',
      -32022,
      503  // Service Unavailable, NOT 403
    );
  }
}
```

**Code location:** `src/rbac/cache.ts`

---

### 7. Audit Trail Tampering

**Attack:** Attacker attempts to modify audit records or prevent them from being written.

**Mitigation:**
1. **Immutable blockchain log** — Each audit entry signed by Zuul proxy + agent
2. **Encryption at rest** — Payloads encrypted with AES-256-GCM before submission
3. **Non-blocking submission** — Audit is async; failures don't block agent response
4. **Dual signatures** — Both proxy and agent sign audit entry

**Implementation:**
```typescript
// Audit entry structure (on-chain)
type AuditEntry = {
  requestId: string;             // Unique ID
  agent: AgentAddress;           // Agent wallet
  tool: string;                  // Tool name
  action: string;                // RBAC action
  payloadHash: string;           // keccak256(encrypted payload)
  proxySignature: string;        // Signed by Zuul proxy
  agentSignature: string;        // Signed by agent (recovered from request)
  timestamp: number;             // Unix seconds
  success: boolean;              // Did tool call succeed?
};

// Encryption prevents Zuul from reading past audits without decryption key
const encryptedPayload = encrypt(
  JSON.stringify({
    method: 'POST',
    url: 'https://api.github.com/repos/owner/repo/issues',
    statusCode: 201,
    latencyMs: 142,
  }),
  AUDIT_ENCRYPTION_KEY
);
```

**Code location:** `src/audit/encryption.ts`, `src/audit/store.ts`

---

### 8. Configuration Injection

**Attack:** Attacker modifies tool configuration to redirect requests.

**Example:**
```bash
# Attacker tries to modify config to change GitHub URL
TOOL_GITHUB_URL=https://attacker.com/fake-github ./start.sh
```

**Mitigation:**
1. Configuration loaded at startup only
2. Configuration immutable after loading
3. TypeScript `Readonly<T>` enforced at type level
4. Environment variables validated against schema

**Implementation:**
```typescript
// Load config once at startup
const config = loadConfig();

// Make config immutable
Object.freeze(config);
Object.freeze(config.tools);

// Type prevents mutation
type Config = Readonly<{
  tools: ReadonlyArray<Readonly<Tool>>;
}>;

// This won't compile:
config.tools[0].baseUrl = 'https://attacker.com';  // ERROR: readonly
```

**Code location:** `src/config/loader.ts`

---

## Cryptographic Assumptions

### EIP-191 Signature Verification

**Standard:** EIP-191 Personal Sign (MetaMask standard)

**Implementation:**
```typescript
import { recoverMessageAddress, toBytes, keccak256 } from 'viem';

const payload = `${method}\n${url}\n${nonce}\n${timestamp}`;

const recoveredAddress = await recoverMessageAddress({
  message: payload,
  signature: signatureFromHeader,
});

// NEVER use claimed address; only use recovered address
if (recoveredAddress !== claimedAddress) {
  reject('Signature mismatch');
}
```

**Security properties:**
- No key material exposed
- Signature binding to exact payload (method, url, nonce, timestamp)
- Cannot reuse signature for different payload
- Cannot use same payload with different signature

**Code location:** `src/auth/signature.ts`

---

### AES-256-GCM Encryption

**Purpose:** Protect audit payload privacy (only timestamp + hashes public on-chain)

**Implementation:**
```typescript
import { createCipheriv, randomBytes } from 'crypto';

function encrypt(plaintext: string, key: string): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  // Format: IV || AuthTag || CiphertextEncrypted
  return iv.toString('hex') + authTag.toString('hex') + encrypted;
}

function decrypt(ciphertext: string, key: string): string {
  const iv = Buffer.from(ciphertext.slice(0, 32), 'hex');      // 16 bytes = 32 hex chars
  const authTag = Buffer.from(ciphertext.slice(32, 64), 'hex'); // 16 bytes = 32 hex chars
  const encrypted = ciphertext.slice(64);

  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
```

**Security properties:**
- 256-bit key (32 bytes)
- Random 128-bit IV per message (prevents pattern detection)
- GCM mode provides authentication (tampering detected)
- Cannot decrypt without key

**Code location:** `src/audit/encryption.ts`

---

## RBAC and Fail-Closed Principle

### Permission Model

**Three levels:**
1. **Agent** — A wallet address
2. **Role** — Named permission set (e.g., "github-reader", "slack-admin")
3. **Permission** — Tuple of (tool, action)

**Example:**
```solidity
// RBAC.sol (source of truth)

// Agent → Roles mapping
mapping(address agent => Role[] roles) agentRoles;

// Role → Permissions mapping
mapping(bytes32 roleId => Permission[] perms) rolePermissions;

// Permission structure
struct Permission {
  string tool;      // "github"
  string action;    // "read", "create", "update", "delete"
}

// Query: Does agent have permission?
function hasPermission(address agent, string tool, string action) external view returns (bool) {
  Role[] storage roles = agentRoles[agent];
  for (uint i = 0; i < roles.length; i++) {
    Permission[] storage perms = rolePermissions[roles[i]];
    for (uint j = 0; j < perms.length; j++) {
      if (equals(perms[j].tool, tool) && equals(perms[j].action, action)) {
        return true;
      }
    }
  }
  return false;
}
```

### Fail-Closed Logic

**Principle:** On any error or ambiguity, deny access. Never grant access due to error.

**Examples:**

**Scenario 1: Chain RPC is down**
```
Agent requests: github.read
Zuul attempts RBAC check → RPC timeout
Result: 503 -32022 (Service Unavailable)
NOT 403 (Permission Denied)
```

Why? 503 signals "try again later"; 403 signals "you don't have access". False 403 would mislead agent into thinking permission is revoked when actually chain is temporarily unavailable.

**Scenario 2: Nonce reused**
```
Agent submits request with nonce "abc-123"
Zuul checks nonce store → found (duplicate)
Result: 401 -32004 (Nonce Reuse)
Action: REJECT immediately, even if all other checks would pass
```

**Scenario 3: Signature unrecoverable**
```
Agent submits malformed signature
Zuul calls recover() → throws error
Result: 401 -32002 (Invalid Signature)
Action: REJECT before any business logic
```

**Code location:** `src/api/server.ts` (middleware pipeline), `src/errors.ts` (error hierarchy)

---

## Audit Trail Details

### What Gets Recorded

**On success:**
```json
{
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "agent": "0x1234567890abcdef1234567890abcdef12345678",
  "tool": "github",
  "action": "read",
  "targetUrl": "https://api.github.com/repos/owner/repo/issues",
  "method": "GET",
  "statusCode": 200,
  "latencyMs": 142,
  "upstreamStatusCode": 200,
  "timestamp": 1740000000
}
```

**On permission denial:**
```json
{
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "agent": "0x1234567890abcdef1234567890abcdef12345678",
  "tool": "github",
  "action": "delete",
  "targetUrl": "https://api.github.com/repos/owner/repo",
  "method": "DELETE",
  "error": "permission/no_action_access",
  "errorMessage": "No permission for github.delete",
  "allowedActions": ["read", "create", "update"],
  "timestamp": 1740000000
}
```

**On authentication failure:**
```json
{
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "error": "auth/nonce_reuse",
  "errorMessage": "Nonce already used",
  "nonce": "abc-123-def-456",
  "timestamp": 1740000000
}
```

### What's Encrypted vs. Public

**Encrypted (only accessible with decryption key):**
- Request method and target URL
- Response status code and latency
- Upstream error messages
- Full request/response payloads (if sensitive)

**Public on-chain (readable without key):**
- Request ID (UUID)
- Agent address (wallet, on-chain)
- Tool name
- Action (read/create/update/delete)
- Timestamp
- Payload hash (keccak256 of encrypted payload)
- Proxy signature and agent signature

**Why split?**
- Timestamps and hashes enable verification without exposing sensitive details
- Encrypted content is auditable to proxy + agent (who have decryption key)
- Blockchain provides immutability + consensus verification
- Public fields allow third-party attestation of governance decisions

### Dual Signatures

**Who signs:**
1. **Proxy signs** — Proves request was authorized and processed by Zuul
2. **Agent signs** — Recovered from original request signature

**Verification:**
```solidity
// On-chain verification
function verifyAuditEntry(AuditEntry entry) public view returns (bool) {
  // Verify proxy signature
  address proxyAddress = recoverSigner(entry.payload, entry.proxySignature);
  require(proxyAddress == authorizedProxyAddress, "Invalid proxy signature");

  // Verify agent signature
  address agentAddress = recoverSigner(entry.payload, entry.agentSignature);
  require(agentAddress == entry.agent, "Invalid agent signature");

  return true;
}
```

---

## Key Custody Procedures

### Private Key Management

**Zuul proxy private key:**
- Used only for signing audit entries
- Loaded from environment variable at startup
- Kept in memory, never persisted to disk after startup
- Never logged or exposed in responses
- Rotated periodically (recommended: quarterly)

**Audit encryption key:**
- 256-bit random value (64 hex characters)
- Used for AES-256-GCM encryption of audit payloads
- Kept in memory, never persisted
- Never logged or exposed
- Rotated periodically (recommended: semi-annually)

**API keys for upstream tools:**
- Loaded from environment variables at startup
- Wrapped in opaque branded types to prevent serialization
- Only unwrapped when injecting into upstream Authorization header
- Never logged or exposed in responses
- Rotated at service provider's cadence

**Startup validation:**
```bash
#!/bin/bash

# Fail fast if secrets are missing
if [ -z "$WALLET_PRIVATE_KEY" ]; then
  echo "ERROR: WALLET_PRIVATE_KEY not set"
  exit 1
fi

if [ -z "$AUDIT_ENCRYPTION_KEY" ]; then
  echo "ERROR: AUDIT_ENCRYPTION_KEY not set"
  exit 1
fi

# Verify encryption key format (must be 64 hex chars = 32 bytes)
if ! [[ "$AUDIT_ENCRYPTION_KEY" =~ ^[0-9a-fA-F]{64}$ ]]; then
  echo "ERROR: AUDIT_ENCRYPTION_KEY must be 64 hex characters"
  exit 1
fi

echo "✓ All secrets validated"
```

---

## Transport Security

### Local Development

**HTTP allowed** (for simplicity, testing only)
```bash
LOG_LEVEL=debug
HTTP_ONLY=true
PORT=8080
# Proxy listens on http://localhost:8080
```

### Production

**HTTPS mandatory**
```bash
NODE_ENV=production
HTTP_ONLY=false
HTTPS_CERT_PATH=/etc/letsencrypt/live/zuul.example.com/fullchain.pem
HTTPS_KEY_PATH=/etc/letsencrypt/live/zuul.example.com/privkey.pem
# Proxy listens on https://0.0.0.0:8080
```

**TLS Configuration:**
- TLS 1.3 (modern browsers/clients only)
- HSTS header: `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- Certificate pinning (optional, for API clients): Pin public key of certificate

**Network isolation:**
```bash
# Firewall rules
sudo ufw allow from 10.0.0.0/8 to any port 8080 proto tcp
# Only allow agents in trusted network (VPN, same cloud VPC, etc.)
```

---

## Security Testing Checklist

Unit tests for security scenarios (in `tests/` directory):

- [ ] **Signature verification**
  - [ ] Valid signature accepted
  - [ ] Invalid signature rejected (401 -32002)
  - [ ] Recovered address must match claimed address
  - [ ] Malformed signature header rejected (401 -32001)

- [ ] **Nonce validation**
  - [ ] First nonce accepted
  - [ ] Duplicate nonce rejected (401 -32004)
  - [ ] Nonce scoped per agent (agent A's nonce doesn't block agent B)
  - [ ] Expired nonce can be reused

- [ ] **Timestamp validation**
  - [ ] Current timestamp accepted
  - [ ] ±5 minute window enforced
  - [ ] Future timestamps rejected (401 -32005)
  - [ ] Very old timestamps rejected (401 -32005)

- [ ] **Permission checks**
  - [ ] Agent with permission succeeds
  - [ ] Agent without permission denied (403 -32012)
  - [ ] Unknown agent denied (403 -32010)
  - [ ] Revoked agent denied (403 -32013)
  - [ ] Cache miss + chain error returns 503 (fail closed)

- [ ] **Key injection**
  - [ ] API key injected into Authorization header
  - [ ] API key never appears in logs
  - [ ] API key never appears in response
  - [ ] Different tools use different keys

- [ ] **Audit logging**
  - [ ] Success request logged
  - [ ] Denied request logged
  - [ ] Error request logged
  - [ ] Payload encrypted (not readable without key)
  - [ ] Payload hash computed correctly
  - [ ] Dual signatures present

- [ ] **Error handling**
  - [ ] No stack traces exposed
  - [ ] No internal state exposed
  - [ ] All errors include `_governance` metadata
  - [ ] Error codes in documented ranges

**Run tests:**
```bash
pnpm test
pnpm test:coverage  # Must be ≥90%
```

---

## Incident Response

### Signature Verification Compromised

**Symptoms:**
- Requests from unknown agents succeeding
- Multiple agents reporting requests from others
- Logs showing signature mismatches increasing

**Response:**
1. Enable debug logging: `LOG_LEVEL=debug`
2. Examine signature recovery logs
3. If viem library issue: Update viem version
4. If key material exposed: Rotate wallet private key immediately
5. Review all recent audit entries for unauthorized access
6. Notify affected agents

### Chain Outage

**Symptoms:**
- All requests return 503 -32022
- Cannot read RBAC contract
- Cannot write audit entries

**Response:**
1. Check RPC endpoint status
2. Try failover RPC URL (if configured)
3. Verify contract address is correct
4. Wait for chain recovery
5. Monitor audit queue (should backfill when chain recovers)
6. No agent access is granted during outage (fail closed)

### Key Compromise

**If wallet private key exposed:**
1. Stop proxy immediately
2. Generate new wallet address
3. Deploy new instance with new key
4. Rotate RBAC contract permissions to new address
5. Invalidate old audit signatures (mark as "revoked" on-chain)
6. Notify all agents of key rotation

**If API keys exposed:**
1. Rotate API keys with each tool provider
2. Review audit trail for tool (who accessed, when)
3. Revoke or limit permissions if abuse detected
4. Update .env with new keys

**If encryption key exposed:**
1. All past audit payloads are compromised
2. Generate new encryption key
3. Re-encrypt all historical audits with new key (if stored)
4. Consider this a root compromise; treat as P0 incident

### Audit Queue Backlog

**Symptoms:**
- Audit queue depth > 1000
- Requests pile up while waiting for audit

**Response:**
1. Check if chain RPC is responding
2. Increase retry backoff if too aggressive
3. Consider batch submission (future optimization)
4. Monitor until queue drains

---

## Compliance Considerations

### Data Residency

**Audit data location:**
- Encrypted payloads stored on blockchain (immutable, global)
- Encryption key (needed to decrypt) stored locally in proxy only
- Without encryption key, audit data is unreadable even with blockchain access

**GDPR implications:**
- Right to be forgotten: Cannot delete audit entries (append-only log)
- Data minimization: Only required fields encrypted and recorded
- Data portability: Audit entries are on-chain; can export any time

### Audit and Logging

**What's logged:**
- Request entry: agent, tool, action, timestamp
- Request exit: status, latency, audit_tx
- Errors: error type, involved agent/tool
- Security events: nonce reuse, signature failures, permission denials

**Retention:**
- Application logs: 90 days (configurable)
- Audit entries: Forever (blockchain)
- Nonce store: 5 minutes (in-memory)

---

## Future Improvements (2.0+)

- **Multi-sig audit** — Multiple validators sign audit entries (not just agent + proxy)
- **Rate limiting** — Per-agent quotas to prevent abuse
- **Network isolation** — Transparent HTTP_PROXY interception on agent host
- **MFA support** — Require multi-factor auth for high-risk actions
- **Attestation** — Prove request authorized without exposing full details
- **Zero-knowledge proofs** — Verify permission without revealing role
