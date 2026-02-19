---
paths:
  - "src/**/*.ts"
---

# Logging

- Use pino for structured logging (via `src/logging.ts`). Import and instantiate with context: `const logger = getLogger('module-name')`.
- Never use `console.log/warn/error` for production code. Always use the structured logger.
- Log levels: `debug` for dev diagnostics, `info` for operational events (request start/end, proxy decisions), `warn` for recoverable issues, `error` for failures requiring attention.
- Distinguish **audit logs** from **application logs**: audit logs capture governance events (agent identity, tool access, permission decisions, signature verification) and write to the blockchain driver; application logs capture operational telemetry and write to stdout/OTEL.
- Include mandatory contextual metadata in every log: `requestId`, `agentAddress`, `tool`, `action`, `latencyMs`, `chainId`, `auditTx` (on exit). Use pino serializers to redact secrets at transport level.
- Never log secrets, API keys, wallet private keys, encryption keys, or decrypted audit payloads. Redact `key_ref` values and signature payloads in application logs.
- For request logging, log at request entry (agent, tool, action) and exit (status, latency, auditTx). Do not log full request/response bodies — use hashes if content verification is needed.
