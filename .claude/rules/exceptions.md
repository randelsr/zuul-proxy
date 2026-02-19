---
paths:
  - "src/**/*.ts"
---

# Exception Handling Rules

## Exception Hierarchy

- Define a base `ZuulError` class extending `Error` with `code: number`, `httpStatus: number`, and `errorType: string` properties.
- Create domain-specific subclasses: `AuthError`, `PermissionError`, `ServiceError`, `RateLimitError`, `RequestError`.
- Each subclass must set its JSON-RPC code range: auth (-32001 to -32009), permission (-32010 to -32019), service (-32020 to -32029), rate (-32030 to -32039).

## JSON-RPC Error Mapping

- Always return both HTTP status code (transport) and JSON-RPC error code (semantics) as documented.
- Include `error.data` object with contextual information (tool, action, allowed_actions, upstream_status).
- Attach `_governance` metadata on ALL responses including errors, with `error_type` field using slash notation (e.g., `auth/invalid_signature`, `permission/no_tool_access`).

## HTTP Status Code Usage

- Use 401 for authentication failures (missing/invalid signature, unknown wallet, invalid nonce).
- Use 403 for permission denials (no tool access, no action access, wallet revoked).
- Use 400/404 for request errors (malformed request, unknown tool).
- Use 502/503/504 for upstream service errors (error, unavailable, timeout).
- Use 429 for rate limiting, 500 for internal gateway errors.

## Error Propagation

- Catch upstream HTTP errors and wrap them in `ServiceError` with original status preserved in `error.data.upstream_status`.
- Never expose internal stack traces or sensitive details to agents; log internally, return sanitized JSON-RPC error.
- All errors must be audited to blockchain with signature proof before returning response to agent.

## Blockchain and RBAC Failures

- Chain read failures during RBAC lookup should return 503 with `-32022` (service unavailable), not permission denied.
- Contract call timeouts should return 504 with `-32021`; implement retry with exponential backoff (max 3 attempts, base 100ms, full jitter) before failing.
- Cache RBAC results with TTL; on cache miss during chain outage, fail closed (deny) rather than fail open.

## Signature Verification Errors

- Invalid signature recovery must return 401 with `-32002` and include both expected and recovered signer addresses in `error.data`.
- Nonce reuse (replay attack) returns 401 with `-32004`; log as security event with agent address.
- Timestamp drift beyond 5 minutes returns 401 with `-32005`; distinguish from replay attacks for monitoring.
