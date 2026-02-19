---
paths:
  - "src/**/*.ts"
  - "contracts/**/*.sol"
---

# TypeScript Standards

- Enable `strict`, `noImplicitAny`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, and `noImplicitReturns` in tsconfig.json; these are non-negotiable and all type errors must be resolved before committing.
- Domain types (`Agent`, `Role`, `Permission`, `AuditEntry`, `GovernanceMetadata`) are the canonical source of truth shared across all layers; wire types and contract types must be derived from or validated against them, never defined independently.
- Use discriminated unions for all JSON-RPC response shapes: a `JsonRpcSuccess<T>` branch and a `JsonRpcError` branch sharing a `jsonrpc` and `id` discriminant; never use a single union member with optional `result` and `error` fields.
- Model the `Result<T, E extends ZuulError>` type explicitly for recoverable code paths; reserve `throw` for unrecoverable invariant violations only, and never widen `E` to a plain `Error`.
- Use branded types (`type AgentAddress = string & { readonly _brand: 'AgentAddress' }`) for wallet addresses, nonces, audit IDs, and key references; never accept or pass raw `string` where a domain scalar is expected.
- Type guards (`isAgentAddress`, `isPermissionAction`, `isSignedRequest`) must validate at every trust boundary — request ingress, chain response deserialization, and config loading — narrowing unknown input to typed domain objects before any business logic runs. At request ingress (HTTP handler entry), type guards must execute in strict order: `isSignedRequest` (signature recovery) → `isAgentAddress` (recovered signer is trusted) → `isPermissionAction` (map HTTP method to action). The recovered signer address must replace any agent identity claim before authorization checks.
- Mark all config objects, domain entities, and audit entries as `Readonly<T>` or `ReadonlyArray<T>` at their definition site; mutation of these structures after construction is a type error.
- Never use `any`; use `unknown` for untyped external inputs (JSON bodies, chain call returns, env vars) and narrow explicitly with type guards or schema validation before use.
- Contract ABIs compiled by Hardhat must be imported with `as const` assertions and typed via viem's `Abi` inference; do not hand-write ABI types or cast contract return values with `as`.
- Use `satisfies` to validate that config literals and constant maps conform to their expected types without widening; prefer `satisfies` over explicit type annotations on object literals when the inferred type is more precise.
- Represent the permission action-to-HTTP-method mapping as a `const` record with a literal union key type (`type PermissionAction = 'read' | 'create' | 'update' | 'delete'`); exhaustiveness is enforced at compile time via `Record<PermissionAction, readonly HttpMethod[]>`.
- Sensitive credential handles (`KeyRef`, `EncryptedPayload`, `ApiKeyHandle`) must be opaque branded types with no string-compatible operations exposed; pass them only to the key custody module, never serialize them into logs or response objects. These types must never appear in any struct or type that implements `JSON.stringify()` or is used as a response envelope—the type system must enforce that credential handles cannot be accidentally serialized into audit logs or API responses.
- Generate or mirror TypeScript interfaces from Solidity contract events and structs via Hardhat type generation; any divergence between on-chain schema and TypeScript type is a compile-time error, not a runtime mismatch.
- Use `type`-only imports (`import type { Agent }`) for all types that do not produce runtime values; this prevents accidental circular dependencies and reduces bundle footprint across shared domain packages.
