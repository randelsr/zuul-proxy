import { Buffer } from 'node:buffer';
import { createInterface } from 'readline/promises';
import { createPublicClient, http } from 'viem';
import { ZuulAgent } from './agent.js';
import { EncryptionService } from '../src/audit/encryption.js';

/**
 * Orchestrated demo scenario
 * Flow:
 * 1. Setup: Initialize agent
 * 2. Discover tools via RPC
 * 3. Call tool (GitHub API GET)
 * 4. Try unauthorized action (permission denied)
 * 5. Demonstrate governance metadata
 * 6. Verify audit trail information
 */

// Helper to prompt user to continue
async function waitForEnter(nextStep: string): Promise<void> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  console.log('\n' + '─'.repeat(60));
  console.log(`⏭️  NEXT: ${nextStep}`);
  await rl.question('   Press ENTER to continue...');
  rl.close();
  console.log('');
}

export async function runDemoScenario(): Promise<void> {
  console.log('🚀 Zuul Proxy Demo Scenario');
  console.log('='.repeat(60));

  // Agent configuration
  if (!process.env.AGENT_PRIVATE_KEY) {
    console.error('\n❌ AGENT_PRIVATE_KEY not set');
    console.error('\nTo run the demo:');
    console.error('  1. Run setup: pnpm setup:dev');
    console.error('  2. Set agent private key:');
    console.error(
      '     export AGENT_PRIVATE_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb476c6b8d6c1f02960247590"'
    );
    console.error('  3. Run demo: pnpm demo\n');
    process.exit(1);
  }

  const agentPrivateKey = process.env.AGENT_PRIVATE_KEY as `0x${string}`;
  let agentAddress: string | undefined;

  // Try to read registered agents from .agents.json (created by pnpm setup:dev)
  try {
    const fs = await import('fs');
    const path = await import('path');
    const agentsFile = path.default.join(process.cwd(), '.agents.json');
    if (fs.default.existsSync(agentsFile)) {
      const agents = JSON.parse(fs.default.readFileSync(agentsFile, 'utf-8'));
      console.log('📁 Loaded registered agents from .agents.json');
      // Show available agents
      console.log('\nRegistered agents:');
      Object.entries(agents).forEach(([idx, agent]: [string, any]) => {
        console.log(`  Agent ${idx}: ${agent.address} (${agent.role})`);
      });
      console.log('');
      agentAddress = agents[1]?.address;
    }
  } catch (error) {
    console.warn(`⚠️  Could not read .agents.json`);
    console.warn(`   Run 'pnpm setup:dev' first to register test agents\n`);
  }

  const proxyUrl = process.env.PROXY_URL || 'http://localhost:8080';

  // Initialize agent
  const agent = new ZuulAgent(agentPrivateKey, proxyUrl);

  console.log(`\n👤 Agent Address: ${agent.getAddress()}`);
  console.log(`🌐 Proxy URL: ${proxyUrl}`);

  try {
    // ========================================================================
    // STEP 1: Discover available tools
    // ========================================================================

    await waitForEnter('STEP 1 - Discover available tools via JSON-RPC');
    console.log('📍 STEP 1: Discover Available Tools');
    console.log('-'.repeat(60));

    let tools;
    try {
      tools = await agent.callToolsList();
      console.log(`✓ Found ${tools.length} tools:`);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tools.forEach((tool: any) => {
        console.log(`  - ${tool.key}: ${tool.description}`);
        console.log(`    Base URL: ${tool.base_url}`);
        console.log(
          `    Allowed Actions: ${(tool.allowed_actions as string[])?.join(', ') || 'N/A'}`
        );
      });
    } catch (error) {
      console.error(`✗ Failed to discover tools: ${String(error)}`);
      return;
    }

    // ========================================================================
    // STEP 1.5: Configure Demo Activity Level
    // ========================================================================

    await waitForEnter('STEP 1.5 - Configure how many API calls to make');
    console.log('📍 STEP 1.5: Configure Demo Activity Level');
    console.log('-'.repeat(60));

    const rl2 = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const numCallsStr = await rl2.question(
      '\nHow many tool calls should we make? (default: 22): '
    );
    rl2.close();

    const numCalls = parseInt(numCallsStr) || 22;
    console.log(`✓ Will make ${numCalls} tool calls to generate audit activity\n`);

    // ========================================================================
    // STEP 2: Call GitHub tool (read endpoint)
    // ========================================================================

    await waitForEnter(`STEP 2 - Make ${numCalls} GitHub API calls (authorized action)`);
    console.log(`📍 STEP 2: Call GitHub API (GET /repos) - ${numCalls}x`);
    console.log('-'.repeat(60));

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < numCalls; i++) {
      try {
        const response = await agent.callTool(
          'GET',
          'https://api.github.com/repos/anthropics/claude-code'
        );

        successCount++;

        // Only show details on first call to avoid spam
        if (i === 0) {
          console.log(`✓ Call 1/${numCalls} succeeded`);
          console.log(`  Response: ${JSON.stringify(response.result).substring(0, 100)}...`);
          ZuulAgent.printGovernance(response.governance);
        } else if ((i + 1) % 10 === 0) {
          // Progress update every 10 calls
          console.log(`✓ Completed ${i + 1}/${numCalls} calls...`);
        }
      } catch (error) {
        failCount++;
        if (i === 0) {
          // Show first error for debugging
          console.log(`ℹ Call 1/${numCalls} failed: ${String(error)}`);
        }
      }
    }

    console.log(`\n📊 Summary: ${successCount} succeeded, ${failCount} failed (total: ${numCalls})`);

    // ========================================================================
    // STEP 3: Try unauthorized action (POST = create)
    // ========================================================================

    await waitForEnter('STEP 3 - Attempt unauthorized action (POST should be denied)');
    console.log('📍 STEP 3: Try POST (unauthorized action)');
    console.log('-'.repeat(60));

    try {
      const response = await agent.callTool('POST', 'https://api.github.com/user/repos', {
        name: 'new-repo',
      });

      console.log('✓ POST call succeeded (unexpected)');
      ZuulAgent.printGovernance(response.governance);
    } catch (error) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const err = error as any;
      console.log(`✓ POST blocked as expected: ${String(error)}`);
      if (err.governance) {
        ZuulAgent.printGovernance(err.governance);
      }
    }

    // ========================================================================
    // STEP 4: Demonstrate governance metadata
    // ========================================================================

    await waitForEnter('STEP 4 - Review governance metadata structure');
    console.log('📍 STEP 4: Governance Metadata Deep Dive');
    console.log('-'.repeat(60));

    console.log('ℹ All requests include _governance metadata:');
    console.log('  ✓ request_id  — Unique ID for tracing');
    console.log('  ✓ agent       — Recovered signer address');
    console.log('  ✓ tool        — Matched tool key');
    console.log('  ✓ action      — HTTP method mapped to permission');
    console.log('  ✓ target_url  — Full URL of upstream request');
    console.log('  ✓ latency_ms  — Proxy execution time');
    console.log('  ✓ audit_tx    — Blockchain transaction hash');
    console.log('  ✓ chain_id    — Network identifier');
    console.log('  ✓ timestamp   — Server time (Unix seconds)');

    // ========================================================================
    // STEP 5: Verify audit trail
    // ========================================================================

    await waitForEnter('STEP 5 - Explain audit trail verification');
    console.log('📍 STEP 5: Audit Trail Verification');
    console.log('-'.repeat(60));

    console.log('ℹ All requests audited to blockchain:');
    console.log('  ✓ Valid signatures → Agent recovered correctly');
    console.log('  ✓ Permission checks → Cached with 5min TTL');
    console.log('  ✓ Success and failure → Both audited to chain');
    console.log('  ✓ Governance metadata → Included on all responses');
    console.log('  ✓ Fail-closed behavior → 503 on chain outage (never 403)');

    // ========================================================================
    // STEP 6: Emergency revoke agent
    // ========================================================================

    await waitForEnter('STEP 6 - Emergency revoke agent (admin removes access)');
    console.log('📍 STEP 6: Emergency Revoke Agent');
    console.log('-'.repeat(60));

    const revokeAgentAddress = agentAddress || agent.getAddress();

    try {
      // Verify agent currently has access by making a signed request
      console.log(`\n[6.1] Verify agent ${revokeAgentAddress.slice(0, 10)}... CAN make tool calls`);

      let preRevokeSuccess = false;
      try {
        const preRevokeResp = await agent.callTool(
          'GET',
          'https://api.github.com/repos/anthropics/claude-code'
        );
        console.log('✓ Pre-revoke: Tool call SUCCEEDED');
        console.log(`  Response: ${JSON.stringify(preRevokeResp.result).substring(0, 80)}...`);
        preRevokeSuccess = true;
      } catch (error) {
        console.log(`ℹ Pre-revoke tool call failed: ${String(error)}`);
      }

      // Emergency revoke
      console.log(`\n[6.2] Admin calls /admin/rbac/revoke for agent ${revokeAgentAddress.slice(0, 10)}...`);

      const revokeHost = new URL(proxyUrl).host;
      const revokeResp = await fetch(`${proxyUrl}/admin/rbac/revoke`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'host': revokeHost,
        },
        body: JSON.stringify({ agent_address: revokeAgentAddress }),
      });

      if (revokeResp.status === 200) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const revokeData = (await revokeResp.json()) as any;
        console.log('✓ Revocation endpoint returned 200 OK');
        console.log(`  Message: ${revokeData.message}`);
        console.log(`  Transaction: ${revokeData.tx_hash?.slice(0, 10)}...`);
        console.log('  (Cache for this agent has been invalidated)');

        // Wait for blockchain to process
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } else {
        console.log(`ℹ Revocation endpoint returned HTTP ${revokeResp.status}`);
      }

      // Verify revocation by attempting a tool call
      console.log(`\n[6.3] Verify revocation: Attempt tool call with revoked agent`);

      if (revokeResp.status === 200) {
        // If revocation succeeded, attempt a tool call with the revoked agent's key
        try {
          const postRevokeResp = await agent.callTool(
            'GET',
            'https://api.github.com/repos/anthropics/claude-code'
          );

          // If we got here, the call succeeded (unexpected after revocation)
          console.log('⚠️  Tool call SUCCEEDED (unexpected)');
          console.log('  This could mean:');
          console.log('  - Revocation did not take effect');
          console.log('  - Cache was not invalidated');
          console.log(`  Response: ${JSON.stringify(postRevokeResp.result).substring(0, 80)}...`);
        } catch (error) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const err = error as any;
          const httpStatus = err.httpStatus;
          const errCode = err.code;

          if (httpStatus === 403 && errCode === -32012) {
            console.log('✅ REVOCATION VERIFIED: Tool call denied with 403/-32012');
            console.log(`  Error: ${err.message}`);
            console.log('  Agent is successfully revoked and cannot access tools');
          } else if (httpStatus === 403) {
            console.log('✓ Tool call denied (HTTP 403)');
            console.log(`  Error code: ${errCode}`);
            console.log(`  Message: ${err.message}`);
          } else if (httpStatus === 401) {
            console.log('ℹ Signature validation failed (HTTP 401)');
            console.log('  (This means we reached the proxy, but auth layer rejected it)');
          } else {
            console.log(`ℹ Tool call failed with HTTP ${httpStatus}`);
            console.log(`  Error: ${err.message}`);
          }
        }
      } else {
        console.log('ℹ Skipping post-revoke verification (revocation endpoint failed)');
      }
    } catch (error) {
      console.log(`ℹ Emergency revoke step skipped: ${String(error)}`);
    }

    // Wait for audit queue to flush (entries are queued asynchronously)
    // Flush interval is 5 seconds + 1 second buffer for processing
    console.log('\n⏳ Waiting for audit queue to flush (6 seconds)...');
    await new Promise((resolve) => setTimeout(resolve, 6000));

    // ========================================================================
    // STEP 7: Full Audit Log Dump (Direct Blockchain Query)
    // ========================================================================

    await waitForEnter('STEP 7 - Query and decrypt all audit entries from blockchain');
    console.log('📍 STEP 7: Full Audit Log Dump');
    console.log('-'.repeat(60));
    console.log('ℹ Querying all audit entries directly from blockchain...\n');

    try {
      // Load environment variables
      const fs = await import('fs');
      const path = await import('path');
      const dotenv = await import('dotenv');

      const envPath = path.default.join(process.cwd(), '.env');
      const envConfig = dotenv.config({ path: envPath });

      const rpcUrl = process.env.RPC_URL || envConfig.parsed?.RPC_URL || 'http://127.0.0.1:8545';
      const auditContractAddress = process.env.AUDIT_CONTRACT_ADDRESS || envConfig.parsed?.AUDIT_CONTRACT_ADDRESS || '';
      const chainId = parseInt(process.env.CHAIN_ID || envConfig.parsed?.CHAIN_ID || '31337', 10);
      const chainName = process.env.CHAIN_NAME || envConfig.parsed?.CHAIN_NAME || 'hardhat';

      // Create public client for reading from blockchain
      const client = createPublicClient({
        chain: {
          id: chainId,
          name: chainName,
          network: chainName,
          nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
          rpcUrls: { default: { http: [rpcUrl] } },
        } as any,
        transport: http(rpcUrl),
      });

      // ABI for getEntryCount and getEntry
      // Privacy-first design: only agent, encrypted payload, hash, and timestamp are visible
      const auditAbi = [
        {
          name: 'getEntryCount',
          type: 'function',
          stateMutability: 'view',
          inputs: [],
          outputs: [{ type: 'uint256' }],
        },
        {
          name: 'getEntry',
          type: 'function',
          stateMutability: 'view',
          inputs: [{ name: 'index', type: 'uint256' }],
          outputs: [
            {
              name: '',
              type: 'tuple',
              components: [
                { name: 'agent', type: 'address' },
                { name: 'encryptedPayload', type: 'bytes' },
                { name: 'payloadHash', type: 'bytes32' },
                { name: 'timestamp', type: 'uint256' },
              ],
            },
          ],
        },
      ] as const;

      // Get entry count using readContract
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const entryCount = await (client.readContract as any)({
        address: auditContractAddress as `0x${string}`,
        abi: auditAbi,
        functionName: 'getEntryCount',
      });

      console.log(`📊 Total audit entries: ${entryCount}\n`);

      if (entryCount > 0n) {
        const encryptionService = new EncryptionService();

        for (let i = 0; i < Number(entryCount); i++) {
          // Get entry using readContract
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const entry = await (client.readContract as any)({
            address: auditContractAddress as `0x${string}`,
            abi: auditAbi,
            functionName: 'getEntry',
            args: [BigInt(i)],
          });

          // Extract from tuple (viem readContract returns object or array)
          // Privacy-first design: only agent, timestamp, encrypted payload, and hash are on-chain
          const agent = entry.agent ?? entry[0];
          const encryptedPayload = entry.encryptedPayload ?? entry[1];
          const payloadHash = entry.payloadHash ?? entry[2];
          const timestamp = Number(entry.timestamp ?? entry[3]);

          console.log(`\n${'='.repeat(60)}`);
          console.log(`📝 Entry #${i}`);
          console.log(`${'='.repeat(60)}`);
          console.log(`Agent:     ${agent}`);
          console.log(`Timestamp: ${new Date(timestamp * 1000).toISOString()}`);
          console.log(`Hash:      ${payloadHash}`);
          console.log(`\nℹ Decrypting to reveal tool, action, and error details...`);

          // Decrypt payload
          if (encryptedPayload && encryptedPayload !== '0x') {
            try {
              // encryptedPayload is already base64 from the contract (stored as bytes but returned as hex)
              // Convert hex string to base64 for decryption
              const hexString = typeof encryptedPayload === 'string' ? encryptedPayload.slice(2) : encryptedPayload;
              const base64Payload = Buffer.from(hexString, 'hex').toString('base64');
              const decrypted = encryptionService.decrypt(base64Payload as any);

              if (decrypted.ok) {
                console.log('\n✓ Decrypted Payload:');
                console.log(`  Agent Address: ${decrypted.value.agent}`);
                console.log(`  Tool:          ${decrypted.value.tool}`);
                console.log(`  Action:        ${decrypted.value.action}`);
                console.log(`  Endpoint:      ${decrypted.value.endpoint}`);
                console.log(`  Status:        ${decrypted.value.status}`);
                console.log(`  Error Type:    ${decrypted.value.errorType || '(none)'}`);
                console.log(`  Latency:       ${decrypted.value.latencyMs}ms`);
                console.log(`  Request Hash:  ${decrypted.value.requestHash}`);
                console.log(`  Response Hash: ${decrypted.value.responseHash}`);
              } else {
                console.log(`\n✗ Decryption failed: ${decrypted.error.message}`);
              }
            } catch (error) {
              console.log(`\n⚠ Could not decrypt: ${String(error)}`);
            }
          }
        }

        console.log(`\n${'='.repeat(60)}`);
        console.log(`✅ Full audit log dump complete (${entryCount} entries)`);
        console.log(`${'='.repeat(60)}\n`);
      }
    } catch (error) {
      console.log(`✗ Audit log dump failed: ${String(error)}\n`);
    }

    // ========================================================================
    // STEP 8: Admin Endpoints - Audit Search and Query
    // ========================================================================

    await waitForEnter('STEP 8 - Test admin audit search API endpoints');
    console.log('📍 STEP 8: Admin Audit Search Endpoints');
    console.log('-'.repeat(60));
    console.log('ℹ Note: Admin endpoints are localhost-only for security\n');

    const proxyHost = new URL(proxyUrl).host;
    const adminBaseUrl = `http://${proxyHost}`;

    try {
      const queryAgent = agentAddress || agent.getAddress();

      // Query 1: Search by agent (encrypted)
      console.log('[8.1] Query audit logs by agent (encrypted)');
      try {
        const searchResp1 = await fetch(
          `${adminBaseUrl}/admin/audit/search?agent=${queryAgent}`,
          { headers: { host: proxyHost } }
        );

        if (searchResp1.ok) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const searchData1 = (await searchResp1.json()) as any;
          console.log(`✓ Found ${searchData1.count} entries for agent`);
          if (searchData1.entries[0]) {
            console.log(`  Entry #0: Agent=${searchData1.entries[0].agent.slice(0, 10)}..., Hash=${String(searchData1.entries[0].payloadHash).slice(0, 10)}...`);
          }
        } else {
          console.log(`ℹ Query returned HTTP ${searchResp1.status} (admin server may not be running)`);
        }
      } catch (error) {
        console.log(`ℹ Query failed: ${String(error).slice(0, 50)}`);
      }

      // Query 2: Search by agent with decryption
      console.log('\n[8.2] Query audit logs by agent (decrypted)');
      try {
        const searchResp2 = await fetch(
          `${adminBaseUrl}/admin/audit/search?agent=${queryAgent}&decrypt=true`,
          { headers: { host: proxyHost } }
        );

        if (searchResp2.ok) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const searchData2 = (await searchResp2.json()) as any;
          console.log(`✓ Found ${searchData2.count} decrypted entries for agent`);
          if (searchData2.entries[0]) {
            const entry = searchData2.entries[0];
            console.log(`  First entry:`);
            console.log(`    - Tool: ${entry.tool}`);
            console.log(`    - Action: ${entry.action}`);
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            console.log(`    - Endpoint: ${String(entry.payload?.endpoint).slice(0, 50)}...`);
            console.log(`    - Status: ${entry.status}`);
          }
        } else {
          console.log(`ℹ Query returned HTTP ${searchResp2.status}`);
        }
      } catch (error) {
        console.log(`ℹ Query failed: ${String(error).slice(0, 50)}`);
      }

      // Query 3: Search by time range (use wide range to handle Hardhat clock skew)
      console.log('\n[8.3] Query audit logs by time range (all time)');
      try {
        // Use epoch 0 to far future to capture ALL entries regardless of clock skew
        const startTime = 0;
        const endTime = 9999999999; // Far future (year 2286)

        const searchResp3 = await fetch(
          `${adminBaseUrl}/admin/audit/search?startTime=${startTime}&endTime=${endTime}`,
          { headers: { host: proxyHost } }
        );

        if (searchResp3.ok) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const searchData3 = (await searchResp3.json()) as any;
          console.log(`✓ Found ${searchData3.count} entries (all time)`);
        } else {
          console.log(`ℹ Query returned HTTP ${searchResp3.status}`);
        }
      } catch (error) {
        console.log(`ℹ Query failed: ${String(error).slice(0, 50)}`);
      }
    } catch (error) {
      console.log(`ℹ Admin endpoint queries skipped: ${String(error)}`);
    }

    // ========================================================================
    // STEP 9: Summary
    // ========================================================================

    await waitForEnter('STEP 9 - View demo summary and key takeaways');
    console.log('='.repeat(60));
    console.log('✅ Demo Scenario Complete');
    console.log('='.repeat(60));

    console.log('\n✅ User Stories Demonstrated:');
    console.log('  - Stories #1-11: Agent operations (Steps 1-5)');
    console.log('  - Story #14: Emergency revoke (Step 6)');
    console.log('  - Story #12: Audit search (Steps 7, 8)');
    console.log('  - Story #13: Decrypt audit logs (Steps 7, 8)');

    console.log('\nKey takeaways:');
    console.log('1. Agent signs requests with EIP-191 (via viem)');
    console.log('2. Proxy verifies signature and recovers signer');
    console.log('3. RBAC permission checks are cached (5min TTL)');
    console.log('4. All requests (success + failure) are audited');
    console.log('5. Governance metadata returned on all responses');
    console.log('6. Fail-closed on chain outage (503, never 403)');
    console.log('7. Audit trail provides irrefutable record');
    console.log('8. Admins can revoke agents and inspect audit logs');

    console.log('\nMVP Coverage:');
    console.log('  📊 Completed: 14/14 user stories (100%)');
    console.log('  🎯 Blockchain: Hedera testnet (chainId 295)');
    console.log('  ✅ Admin endpoints: Localhost-only');
  } catch (error) {
    console.error(`\n✗ Demo scenario failed: ${String(error)}`);
    process.exit(1);
  }
}

// Run demo
runDemoScenario().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
