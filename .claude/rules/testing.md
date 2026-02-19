---
paths:
  - "tests/**/*.ts"
---

# Testing Rules

## Structure

- All tests reside in `tests/**/*.ts` using Vitest as the test runner.
- Test file naming: `test_[module_name].ts` for unit tests, `integration_test_[module_name].ts` for integration tests.
- Group tests by module: `tests/auth/`, `tests/rbac/`, `tests/proxy/`, `tests/audit/`, `tests/chain/`.

## Coverage

- Target 90%+ coverage for core modules: signature verification, RBAC permission checks, request validation, and key injection logic.
- Fail CI if coverage drops below 90%.

## Unit Tests

- **Auth/Signature Tests**: Test wallet signature recovery, nonce validation, timestamp freshness checks, and replay attack prevention with both valid and malformed signatures.
- **RBAC/Permission Tests**: Verify role-to-permission resolution, action-to-HTTP-method mapping, permission denial scenarios, and emergency wallet revocation flows.
- **Tool Forwarding Tests**: Test request transformation, header injection, upstream timeout handling, and error response mapping (JSON-RPC error codes).
- **Configuration Tests**: Verify config loading, env var resolution for `key_ref`, and validation of malformed configurations.

## Integration Tests

- **Blockchain Integration**: Test against local Hardhat node with deployed RBAC and audit contracts; verify real contract interactions, not mocks.
- **RBAC Cache Behavior**: Test cache TTL, eviction on permission changes, and fail-closed behavior on chain outage (security invariant).
- **Audit Logging**: Verify encrypted payload generation, hash computation, signature attachment, and both success and error audit entries.
- **End-to-End Flows**: Verify complete request paths through the proxy with mocked upstream tools but live blockchain.

## Unit Test Mocking

- Mock external dependencies (chain RPC, upstream tools, wallet providers) using dependency injection; never call real endpoints.
- Simulate both success and failure scenarios in all mocks.
- Test all error codes (-32001 through -32039, including rate limiting) with corresponding HTTP status codes and `_governance` metadata (agent, tool, action, error_type, audit_tx).
- Verify `_governance` envelope is present on all responses, including error responses.

## Test Methodology

- Follow Arrange-Act-Assert pattern.
- One logical assertion per test.
- Use parameterized tests for input matrices instead of loops.
