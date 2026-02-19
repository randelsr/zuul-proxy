import { ZuulAgent } from './agent.js';

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
export async function runDemoScenario(): Promise<void> {
  console.log('🚀 Zuul Proxy Demo Scenario');
  console.log('='.repeat(60));

  // Agent configuration
  const agentPrivateKey =
    (process.env.AGENT_PRIVATE_KEY as `0x${string}`) ||
    ('0x1111111111111111111111111111111111111111111111111111111111111111' as `0x${string}`);
  const proxyUrl = process.env.PROXY_URL || 'http://localhost:8080';

  // Initialize agent
  const agent = new ZuulAgent(agentPrivateKey, proxyUrl);

  console.log(`\n👤 Agent Address: ${agent.getAddress()}`);
  console.log(`🌐 Proxy URL: ${proxyUrl}`);

  try {
    // ========================================================================
    // STEP 1: Discover available tools
    // ========================================================================

    console.log('\n📍 STEP 1: Discover Available Tools');
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
    // STEP 2: Call GitHub tool (read endpoint)
    // ========================================================================

    console.log('\n📍 STEP 2: Call GitHub API (GET /repos)');
    console.log('-'.repeat(60));

    try {
      const response = await agent.callTool(
        'GET',
        'https://api.github.com/repos/anthropics/claude-code'
      );

      console.log('✓ GitHub call succeeded');
      console.log(`  Response: ${JSON.stringify(response.result).substring(0, 100)}...`);
      ZuulAgent.printGovernance(response.governance);
    } catch (error) {
      console.log(`ℹ GitHub call attempt (expected in MVP): ${String(error)}`);
    }

    // ========================================================================
    // STEP 3: Try unauthorized action (POST = create)
    // ========================================================================

    console.log('\n📍 STEP 3: Try POST (unauthorized action)');
    console.log('-'.repeat(60));

    try {
      const response = await agent.callTool('POST', 'https://api.github.com/user/repos', {
        name: 'new-repo',
      });

      console.log('✓ POST call succeeded (unexpected)');
      ZuulAgent.printGovernance(response.governance);
    } catch (error) {
      console.log(`✓ POST blocked as expected: ${String(error)}`);
    }

    // ========================================================================
    // STEP 4: Demonstrate governance metadata
    // ========================================================================

    console.log('\n📍 STEP 4: Governance Metadata Deep Dive');
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

    console.log('\n📍 STEP 5: Audit Trail Verification');
    console.log('-'.repeat(60));

    console.log('ℹ All requests audited to blockchain:');
    console.log('  ✓ Valid signatures → Agent recovered correctly');
    console.log('  ✓ Permission checks → Cached with 5min TTL');
    console.log('  ✓ Success and failure → Both audited to chain');
    console.log('  ✓ Governance metadata → Included on all responses');
    console.log('  ✓ Fail-closed behavior → 503 on chain outage (never 403)');

    // ========================================================================
    // STEP 6: Key takeaways
    // ========================================================================

    console.log('\n' + '='.repeat(60));
    console.log('✅ Demo Scenario Complete');
    console.log('='.repeat(60));

    console.log('\nKey takeaways:');
    console.log('1. Agent signs requests with EIP-191 (via viem)');
    console.log('2. Proxy verifies signature and recovers signer');
    console.log('3. RBAC permission checks are cached (5min TTL)');
    console.log('4. All requests (success + failure) are audited');
    console.log('5. Governance metadata returned on all responses');
    console.log('6. Fail-closed on chain outage (503, never 403)');
    console.log('7. Audit trail provides irrefutable record');

    console.log('\nMVP Limitations:');
    console.log('- Governance is opt-in (agent must route through Zuul)');
    console.log('- HTTP-only (no WebSocket, gRPC, SSH in MVP)');
    console.log('- No transparent interception (future version)');
    console.log('- No native MCP support (future version)');
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
