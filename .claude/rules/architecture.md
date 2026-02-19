---
paths:
  - "src/**/*.ts"
  - "contracts/**/*.sol"
---

# Architecture Principles

## MVP Scope

The MVP exposes an **HTTP API with JSON-RPC 2.0 request/response semantics** (inspired by MCP, but not the MCP protocol itself). Agents explicitly route HTTP service calls through Zuul. **This is governance-enabled audit, not infrastructure-enforced governance.** Stretch goals (2.0) will add transparent HTTP interception and native MCP support with network isolation.

## Core Principles

- Enforce strict trust boundaries: agents are untrusted, the proxy is the enforcement point, keys never cross the boundary to agent space.
- Separate protocol handling (HTTP API with MCP semantics) from business logic (RBAC, audit, key injection) using distinct modules with clear interfaces.
- All blockchain interactions (RBAC reads, audit writes) must go through a chain driver abstraction to maintain EVM portability.
- Define domain types for Agent, Role, Permission, and AuditEntry as the canonical data model shared across all layers.
- Key custody logic must be isolated in a dedicated module; no other component should have direct access to credential storage.
- Use contract-first design: Solidity interfaces define the on-chain permission and audit schemas, TypeScript types are generated or mirrored from them.
- Authentication (signature verification) and authorization (RBAC lookup) are separate concerns handled by distinct middleware.
- Audit logging is a cross-cutting concern that must capture both successful and denied requests without blocking the request path.
- Configuration (tools, roles, endpoints) and secrets (API keys, encryption keys) must be loaded from separate sources with different security postures.
- All external service calls (upstream tools) flow through a single proxy execution path that handles key injection, request forwarding, and response normalization.
- Error handling must distinguish between auth failures, permission denials, upstream errors, and internal errors with typed error codes.
- Driver interfaces (chain, wallet, audit storage) must be swappable via configuration to support local development and multi-chain deployment.

## MVP Assumptions (Documented in Demo)

- **Opt-in governance**: Agent explicitly routes through Zuul (not transparent interception)
- **HTTP-only**: No WebSocket, gRPC, or SSH in MVP
- **No native MCP support**: Agent cannot use GitHub MCP, Slack MCP, etc. directly
- **No network isolation**: Without infrastructure-level controls, agents could bypass by making direct HTTP calls
- **Immutable audit**: Blockchain log provides irrefutable record, but doesn't prevent violations

---

## Review Process

When implementing code in this project, consult the appropriate specialist agent for guidance. See `agent-governance.md` for the complete mapping of feature areas to agent specialists.
