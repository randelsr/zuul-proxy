import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import { buildCanonicalPayload } from '../src/auth/signature.js';
import type { AgentAddress, Nonce, Timestamp, HttpMethod } from '../src/types.js';
import { randomUUID } from 'node:crypto';

/**
 * Generic TypeScript agent
 * Uses viem for wallet operations (no MCP SDK, no OpenClaw)
 *
 * Features:
 * - Sign requests with EIP-191
 * - Call tool discovery (tools/list)
 * - Execute tool calls through proxy
 * - Parse _governance metadata from responses
 */
export class ZuulAgent {
  private account: PrivateKeyAccount;
  private proxyUrl: string;

  constructor(privateKey: `0x${string}`, proxyUrl: string = 'http://localhost:8080') {
    this.account = privateKeyToAccount(privateKey);
    this.proxyUrl = proxyUrl;
  }

  /**
   * Get agent address
   */
  getAddress(): AgentAddress {
    return this.account.address as AgentAddress;
  }

  /**
   * Sign a request with EIP-191
   * @param method HTTP method
   * @param url Target URL
   * @param nonce Unique value per request
   * @param timestamp Unix seconds
   * @returns Signature
   */
  async signRequest(
    method: HttpMethod,
    url: string,
    nonce: Nonce,
    timestamp: Timestamp
  ): Promise<string> {
    const payload = buildCanonicalPayload(method, url, nonce, timestamp);
    const signature = await this.account.signMessage({ message: payload });
    return signature;
  }

  /**
   * Discover available tools
   * @returns Array of tools with permissions
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async callToolsList(): Promise<any[]> {
    const response = await fetch(`${this.proxyUrl}/rpc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/list',
        params: { agent_address: this.getAddress() },
        id: randomUUID(),
      }),
    });

    if (!response.ok) {
      throw new Error(`tools/list failed: ${response.status}`);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json = (await response.json()) as any;

    if (json.error) {
      throw new Error(`RPC error: ${json.error.message}`);
    }

    return json.result.tools;
  }

  /**
   * Execute a tool call through the proxy
   * @param method HTTP method
   * @param url Target URL
   * @param body Optional request body
   * @returns Response with _governance metadata
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async callTool(
    method: HttpMethod,
    url: string,
    body?: unknown
  ): Promise<{ result: unknown; governance: any }> {
    const nonce = randomUUID() as Nonce;
    const timestamp = Math.floor(Date.now() / 1000) as Timestamp;

    // Sign request
    const signature = await this.signRequest(method, url, nonce, timestamp);

    // Call forward endpoint
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fetchOptions: any = {
      method,
      headers: {
        'X-Agent-Address': this.getAddress(),
        'X-Signature': signature,
        'X-Nonce': nonce,
        'X-Timestamp': String(timestamp),
        'Content-Type': 'application/json',
      },
    };

    if (body) {
      fetchOptions.body = JSON.stringify(body);
    }

    const response = await fetch(
      `${this.proxyUrl}/forward/${encodeURIComponent(url)}`,
      fetchOptions
    );

    if (!response.ok) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const json = (await response.json()) as any;
      const error = json.error || {};
      throw new Error(`Tool call failed: ${response.status} ${error.code} ${error.message}`);
    }

    // Parse response based on content type
    const contentType = response.headers.get('content-type') || '';

    let result: unknown;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let governance: any;

    if (contentType.includes('application/json')) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const json = (await response.json()) as any;
      result = json.result || json;
      governance = json._governance;
    } else {
      const text = await response.text();
      result = text;

      // Try to parse X-Governance header
      const governanceHeader = response.headers.get('X-Governance');
      if (governanceHeader) {
        const decoded = Buffer.from(governanceHeader, 'base64').toString('utf-8');
        governance = JSON.parse(decoded);
      }
    }

    return { result, governance };
  }

  /**
   * Pretty-print governance metadata
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static printGovernance(governance: any): void {
    console.log('\n📋 Governance Metadata:');
    console.log(`  Request ID:   ${governance.request_id}`);
    console.log(`  Agent:        ${governance.agent}`);
    console.log(`  Tool:         ${governance.tool || 'N/A'}`);
    console.log(`  Action:       ${governance.action || 'N/A'}`);
    console.log(`  Latency:      ${governance.latency_ms || 'N/A'}ms`);
    console.log(`  Audit TX:     ${governance.audit_tx || 'pending...'}`);
    console.log(`  Chain ID:     ${governance.chain_id || 'N/A'}`);
    console.log(
      `  Timestamp:    ${new Date((governance.timestamp as number) * 1000).toISOString()}`
    );
    if (governance.error_type) {
      console.log(`  Error Type:   ${governance.error_type}`);
    }
  }
}
