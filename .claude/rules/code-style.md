---
paths:
  - "src/**/*.ts"
---

# Code Style

- Keep modules under 400 lines and functions under 50 lines; extract helpers when thresholds are reached.
- Use async/await throughout; never block the event loop with synchronous I/O or CPU-intensive work.
- Use structured logging with contextual metadata (agent address, tool, action, request ID); avoid console.log in production code.
- Return typed Result objects (`Result<T, E = ZuulError>`) or throw domain-specific errors; never throw generic Error for expected failures. Use Result for optional recovery paths; throw for unrecoverable invariant violations.
- Inject drivers and clients (chain, wallet, audit storage) via constructor or factory; avoid module-level singletons.
- Load configuration from YAML/JSON files; load secrets exclusively from environment variables (not in code or config files).
- Never log, serialize, or expose API keys or encryption keys; treat all credential data as opaque handles.
- Verify wallet signatures using recovery-based validation; reject requests before any business logic if signature is invalid. Implement three distinct middleware stages in this exact order: **(1) authentication** (signature recovery, nonce/timestamp validation, signer recovery), **(2) authorization** (RBAC permission lookup), **(3) key injection** (fetch credential from custody storage and inject into upstream headers). Key injection must only occur after both prior stages pass without error; never inject keys into requests that fail authentication or authorization.
- Map permission actions to HTTP methods at the proxy layer; do not leak action semantics into upstream request construction.
- Include request ID, agent address, and audit transaction hash in all JSON-RPC responses via the _governance envelope.
- Return JSON-RPC error codes in defined ranges (auth -32001 to -32009, permission -32010 to -32019, service -32020 to -32029, rate -32030 to -32039) with machine-readable error_type.
- Encrypt audit payloads before chain submission; only timestamp and hash remain public.
- HTTP API uses JSON-RPC 2.0 request/response pattern for tool discovery (`tools/list`) and execution (`tools/call`); this is inspired by MCP semantics but is NOT the MCP protocol itself (MVP uses HTTP, not STDIO/Streamable HTTP).
