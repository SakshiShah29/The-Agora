/**
 * OpenClaw Integration Test
 *
 * Tests the decision-loop integration with OpenClaw without needing full OpenClaw setup.
 * Creates mock OpenClaw context and verifies our hook works correctly.
 */

import { startAgentHook, OpenClawHookContext } from './shared-skills/decision-loop/openclaw-hook.js';

/**
 * Create mock OpenClaw context for testing
 */
function createMockOpenClawContext(agentName: string): OpenClawHookContext {
  const agentId = agentName.toLowerCase();
  const workspace = `/Users/sameeragarwal/Documents/hackathons/The-Agora/agents/${agentId}/workspace`;

  return {
    agentId,
    agentName,
    workspace,

    discord: {
      postMessage: async (channelId: string, content: string) => {
        console.log(`\n📤 MOCK POST TO CHANNEL ${channelId}:`);
        console.log('─'.repeat(60));
        console.log(content);
        console.log('─'.repeat(60));
        console.log('');
      },

      getRecentMessages: async (channelId: string, limit?: number) => {
        console.log(`📥 MOCK GET MESSAGES FROM ${channelId} (limit: ${limit})`);
        // Return empty for now - no messages in mock
        return [];
      }
    },

    channels: {
      'temple-steps': 'mock-temple-steps-123',
      'the-market': 'mock-market-456',
      'announcements': 'mock-announcements-789',
      'the-forum': 'mock-forum-999'
    }
  };
}

/**
 * Test single agent integration
 */
async function testSingleAgent(agentName: string) {
  console.log('\n' + '='.repeat(70));
  console.log(`Testing OpenClaw Integration: ${agentName}`);
  console.log('='.repeat(70) + '\n');

  try {
    const context = createMockOpenClawContext(agentName);

    console.log('Mock OpenClaw Context:');
    console.log(`  Agent ID: ${context.agentId}`);
    console.log(`  Agent Name: ${context.agentName}`);
    console.log(`  Workspace: ${context.workspace}`);
    console.log(`  Channels: ${Object.keys(context.channels).join(', ')}`);
    console.log('');

    console.log('Starting agent hook...\n');

    // This will run the decision loop - let it run for 2 cycles then stop
    const timeout = setTimeout(() => {
      console.log('\n✅ Test complete - stopping after 2 cycles');
      console.log('   (In production, this would run indefinitely)');
      process.exit(0);
    }, 130_000); // 2 cycles + buffer

    await startAgentHook(context);

    clearTimeout(timeout);
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

/**
 * Validate environment
 */
function validateEnvironment(agentName: string): boolean {
  const required = [
    'ANTHROPIC_API_KEY',
    'MONAD_RPC_URL',
    `${agentName.toUpperCase()}_PRIVATE_KEY`
  ];

  console.log('Checking environment variables...');
  let allValid = true;

  for (const envVar of required) {
    if (process.env[envVar]) {
      console.log(`  ✅ ${envVar}`);
    } else {
      console.error(`  ❌ ${envVar} - MISSING`);
      allValid = false;
    }
  }

  return allValid;
}

/**
 * Main test runner
 */
async function main() {
  const agentName = process.argv[2] || 'Seneca';

  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║         OpenClaw Integration Test - The Agora               ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  console.log(`Testing with agent: ${agentName}\n`);

  // Validate environment
  if (!validateEnvironment(agentName)) {
    console.error('\n❌ Missing required environment variables');
    console.error('   Please set the required environment variables and try again.\n');
    process.exit(1);
  }

  console.log('');

  // Run test
  await testSingleAgent(agentName);
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('Test runner error:', error);
    process.exit(1);
  });
}

export { testSingleAgent, createMockOpenClawContext };
