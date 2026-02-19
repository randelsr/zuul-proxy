---
paths:
  - "src/**/*.ts"
  - "contracts/**/*.sol"
---

# Agent Governance

When implementing features or making architectural decisions, consult the appropriate specialist agent for review and guidance:

- **API-related code or decisions** → `api-architect` agent. Use for: HTTP endpoint design, request/response patterns, routing logic, signature verification protocols, tool discovery endpoints.
- **High-level architectural code or decisions** → `architect-reviewer` agent. Use for: system design, module boundaries, cross-cutting concerns, layering patterns, SOLID principles compliance.
- **Backend architectural code or decisions** → `backend-architect` agent. Use for: service design, scalability, performance optimization, microservice patterns, backend-specific architectural choices.
- **Database-related code or decisions** → `database-architect` agent. Use for: schema design, data modeling, migration strategies, query optimization, multi-database patterns.
- **MCP protocol-related code or decisions** → `mcp-expert` agent. Use for: MCP server integration, protocol compliance, Streamable HTTP transport, client-server interaction patterns.
- **Test engineering code or decisions** → `test-engineer` agent. Use for: test strategy, coverage analysis, CI/CD testing patterns, test automation, quality engineering.
- **TypeScript code standards or decisions** → `typescript-pro` agent. Use for: type system design, advanced generics, branded types, discriminated unions, type-level programming, type guards, end-to-end type safety.

**When to consult an agent:**
1. Before implementing significant features across multiple files
2. When making architectural trade-offs or pattern decisions
3. When reviewing code in their specialty area
4. When unsure about best practices for a specific domain
5. When integrating new patterns or technologies

**Example:** Implementing the `/forward/{target_url}` routing layer → consult `api-architect` for endpoint design and signature verification, `backend-architect` for middleware pipeline and performance, `typescript-pro` for type safety of request/response shapes.
