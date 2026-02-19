# Documentation

- Planning documents (hackathon notes, implementation plans, Claude-generated artifacts) belong in `.plans/` -- never in root or `docs/`.

- Project documentation (architecture decisions, deployment guides, API references) belongs in `docs/` with kebab-case filenames (e.g., `docs/architecture.md`, `docs/deployment-guide.md`, `docs/mcp-protocol.md`).

- `README.md` is the single entry point for humans -- keep it to project name, one-liner ("OpenRouter for agent tool access"), quickstart, and links to `docs/`. Never duplicate content from `docs/`.

- `CLAUDE.md` is for Claude Code context only -- not human documentation, not planning notes.

- Never create markdown files in project root except `README.md` and `CLAUDE.md`. The `ethdenver-hackathon.md` pattern is acceptable only during active hackathon planning; move to `.plans/` post-event.

- Architecture documentation in `docs/` should cover: RBAC model, audit log structure, chain driver interface, HTTP API specification, MVP assumptions, and stretch goals (transparent HTTP_PROXY, native MCP support).

- API documentation in `docs/` must document: HTTP endpoint format, request/response examples, methods (`tools/list`, `tools/call`, `governance/*`), error codes, and agent configuration patterns.

- Protocol documentation in `docs/` must document: JSON-RPC 2.0 format, signature verification, nonce/timestamp validation, and the distinction between MVP (HTTP API with MCP semantics) and 2.0 (true MCP protocol or transparent HTTP interception).

- Deployment guides in `docs/` must document: config file structure (`config.yaml`), secrets management (`.env` references), chain driver configuration, multi-chain deployment patterns, and **MVP limitations** (opt-in governance, no network isolation).
