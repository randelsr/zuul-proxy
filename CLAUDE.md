# Claude Code Context

## Project Overview

**Zuul Proxy** is an on-chain governance proxy for agent tool access. Agents route HTTP service calls through Zuul, which enforces RBAC permissions (from smart contracts) and audits all requests to an immutable blockchain log.

## Architecture

- **MVP Scope:** HTTP API with JSON-RPC 2.0 semantics; governance is opt-in (not transparent)
- **Blockchain:** Hedera testnet (chainId 295) via viem; extensible to Base, Arbitrum, Optimism
- **Audit:** Dual signatures (agent + proxy), encrypted payloads, blockchain writes
- **Testing:** Vitest for unit tests, local Hardhat for contract integration

## Key Rules

- See `.claude/rules/` for governance, API, CI/CD, exception handling, dependencies, testing, logging, code style, documentation, and TypeScript standards
- See `.plans/mvp-prd.md` for full product requirements
- All phases (0-15) are documented in `.plans/phase_N_*.md`

## Critical Files

- `src/types.ts` — Domain types (Agent, Role, Permission, AuditEntry, etc.)
- `src/errors.ts` — Error hierarchy with JSON-RPC codes
- `src/api/server.ts` — Hono HTTP server with middleware pipeline
- `src/audit/store.ts` — Durable audit queue with blockchain writes
- `src/rbac/cache.ts` — Permission cache with TTL
- `contracts/RBAC.sol`, `contracts/Audit.sol` — Solidity contracts

## Commands

```bash
pnpm install              # Install dependencies
pnpm typecheck           # TypeScript strict mode check
pnpm lint                # ESLint
pnpm format              # Format code
pnpm test                # Unit tests with 90%+ coverage gate
pnpm test:coverage       # Generate coverage report
pnpm contracts:build     # Compile Solidity contracts
pnpm contracts:dev       # Start local Hardhat node
pnpm build               # TypeScript compilation
pnpm dev                 # Start server in watch mode
pnpm demo                # Run demo agent
```

## Implementation Phases

1. **Phase 0** — Project bootstrap (config, tooling, directory structure)
2. **Phase 1** — Domain types and driver interfaces
3. **Phase 2** — Solidity smart contracts (RBAC, Audit)
4. **Phase 3** — Configuration and logging
5. **Phase 4** — Authentication (signature verification)
6. **Phase 5** — RBAC module with caching
7. **Phase 6** — Key custody module
8. **Phase 7** — Chain driver implementation
9. **Phase 8** — Audit module (encryption, queueing)
10. **Phase 9** — Proxy executor (HTTP forwarding)
11. **Phase 10** — Middleware pipeline
12. **Phase 11** — HTTP API handlers (/rpc, /forward/*)
13. **Phase 12** — E2E integration tests
14. **Phase 13** — Demo agent
15. **Phase 14** — CI/CD pipeline
16. **Phase 15** — Documentation

## Next Steps

Start with Phase 0 bootstrap: `pnpm install && pnpm typecheck`
