#!/usr/bin/env tsx

/**
 * CLI tool to search audit logs via the Zuul Proxy admin endpoint
 * Usage:
 *   pnpm audit:search --agent 0x... [--decrypt] [--limit 10]
 *   pnpm audit:search --from 2024-01-01 --to 2024-01-31 [--decrypt] [--limit 10]
 *   pnpm audit:search --help
 */

import { parseArgs } from 'node:util';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

interface SearchOptions {
  agent?: string;
  startTime?: number;
  endTime?: number;
  decrypt: boolean;
  limit: number;
  proxyUrl: string;
}

function parseDate(dateStr: string): number {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid date format: ${dateStr}. Use ISO format (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss)`);
  }
  return Math.floor(date.getTime() / 1000);
}

function buildQueryString(options: SearchOptions): string {
  const params = new URLSearchParams();

  if (options.agent) {
    params.append('agent', options.agent);
  }

  if (options.startTime !== undefined) {
    params.append('startTime', String(options.startTime));
  }

  if (options.endTime !== undefined) {
    params.append('endTime', String(options.endTime));
  }

  if (options.decrypt) {
    params.append('decrypt', 'true');
  }

  params.append('limit', String(options.limit));

  return params.toString();
}

function formatTimestamp(timestamp: number): string {
  return new Date(timestamp * 1000).toISOString();
}

function formatPayload(payload: Record<string, unknown>): void {
  console.log('  Decrypted Payload:');
  console.log(`    • Agent:         ${payload.agent}`);
  console.log(`    • Tool:          ${payload.tool}`);
  console.log(`    • Action:        ${payload.action}`);
  console.log(`    • Endpoint:      ${String(payload.endpoint).substring(0, 80)}...`);
  console.log(`    • Status:        ${payload.status}`);
  console.log(`    • Error Type:    ${payload.errorType || '(none)'}`);
  console.log(`    • Latency:       ${payload.latencyMs}ms`);
}

async function searchAudit(options: SearchOptions): Promise<void> {
  const queryString = buildQueryString(options);
  const url = `${options.proxyUrl}/admin/audit/search?${queryString}`;

  console.log(`\n🔍 Searching audit logs...`);
  console.log(`   URL: ${url}\n`);

  try {
    const response = await fetch(url, {
      headers: { host: 'localhost:8080' },
    });

    if (!response.ok) {
      const errorData = await response.json() as any;
      console.error(`❌ Error: HTTP ${response.status}`);
      if (errorData.error) {
        console.error(`   ${errorData.error}`);
      }
      if (errorData.jsonrpc && errorData.error) {
        console.error(`   JSON-RPC Code: ${errorData.error.code}`);
        console.error(`   Message: ${errorData.error.message}`);
      }
      process.exit(1);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await response.json()) as any;

    console.log(`✅ Found ${data.count} entries\n`);
    console.log('=' .repeat(80));

    if (data.count === 0) {
      console.log('(no entries match the query)\n');
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data.entries.forEach((entry: any, idx: number) => {
      console.log(`\n📝 Entry #${idx + 1}`);
      console.log(`  Agent:     ${entry.agent}`);
      console.log(`  Timestamp: ${formatTimestamp(entry.timestamp)}`);
      console.log(`  Hash:      ${entry.payloadHash}`);

      if (options.decrypt && entry.payload) {
        formatPayload(entry.payload);
      } else if (entry.encryptedPayload) {
        console.log(`  Encrypted: ${String(entry.encryptedPayload).substring(0, 80)}...`);
      }
    });

    console.log('\n' + '='.repeat(80));
    console.log(`\n✨ Query completed successfully\n`);
  } catch (error) {
    console.error(`\n❌ Request failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    options: {
      agent: {
        type: 'string',
        description: 'Filter by agent address (0x...)',
      },
      from: {
        type: 'string',
        description: 'Start time (ISO format: YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss)',
      },
      to: {
        type: 'string',
        description: 'End time (ISO format: YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss)',
      },
      decrypt: {
        type: 'boolean',
        description: 'Decrypt audit payloads to reveal tool, action, status',
        default: false,
      },
      limit: {
        type: 'string',
        description: 'Max results to return (default: 10, max: 100)',
        default: '10',
      },
      'proxy-url': {
        type: 'string',
        description: 'Proxy URL (default: http://localhost:8080)',
        default: 'http://localhost:8080',
      },
      help: {
        type: 'boolean',
        description: 'Show this help message',
        default: false,
      },
    },
    strict: true,
    allowPositionals: true,
  });

  if (values.help || positionals.includes('help')) {
    console.log(`
🔍 Zuul Proxy Audit Search CLI

USAGE:
  pnpm audit:search [options]

OPTIONS:
  --agent <address>        Filter by agent address (0x...)
  --from <date>           Start time (ISO format: YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss)
  --to <date>             End time (ISO format: YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss)
  --decrypt               Decrypt payloads to reveal tool, action, status (default: false)
  --limit <n>             Max results (default: 10, max: 100)
  --proxy-url <url>       Proxy URL (default: http://localhost:8080)
  --help                  Show this message

EXAMPLES:

  # Search by agent (encrypted)
  pnpm audit:search --agent 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266

  # Search by agent with decryption
  pnpm audit:search --agent 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 --decrypt

  # Search by time range (last 24 hours)
  pnpm audit:search --from 2024-01-20 --to 2024-01-21 --limit 50

  # Search by time range with decryption
  pnpm audit:search --from 2024-01-20T12:00:00 --to 2024-01-21T12:00:00 --decrypt

  # Search on custom proxy
  pnpm audit:search --agent 0x... --proxy-url http://prod-proxy:8080

NOTES:
  - Admin endpoint requires localhost access (or via X-Forwarded-For proxy)
  - Tool field is encrypted and cannot be queried directly (privacy-first design)
  - Decryption requires encryption key to be available in the proxy
  - Query results are limited to 100 entries max per request
    `);
    return;
  }

  // Validate at least one filter is provided
  if (!values.agent && !values.from && !values.to) {
    console.error(`\n❌ Error: At least one filter required (--agent or --from/--to)\n`);
    console.error(`   Run 'pnpm audit:search --help' for usage\n`);
    process.exit(1);
  }

  // Parse limit
  const limit = parseInt(String(values.limit), 10);
  if (isNaN(limit) || limit < 1 || limit > 100) {
    console.error(`\n❌ Error: limit must be between 1 and 100 (got: ${values.limit})\n`);
    process.exit(1);
  }

  // Parse dates
  let startTime: number | undefined;
  let endTime: number | undefined;

  if (values.from && values.to) {
    try {
      startTime = parseDate(String(values.from));
      endTime = parseDate(String(values.to));

      if (startTime > endTime) {
        console.error(`\n❌ Error: --from must be before --to\n`);
        process.exit(1);
      }
    } catch (error) {
      console.error(`\n❌ ${error instanceof Error ? error.message : String(error)}\n`);
      process.exit(1);
    }
  } else if (values.from || values.to) {
    console.error(`\n❌ Error: Both --from and --to are required together\n`);
    process.exit(1);
  }

  const options: SearchOptions = {
    agent: values.agent ? String(values.agent) : undefined,
    startTime,
    endTime,
    decrypt: values.decrypt === true,
    limit,
    proxyUrl: String(values['proxy-url']),
  };

  await searchAudit(options);
}

main().catch((error) => {
  console.error(`\n💥 Unexpected error: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
