/**
 * Test script for decision-loop
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-xxx SENECA_PRIVATE_KEY=0x... ts-node test-decision-loop.ts
 */

import { runAgentWithOpenClaw, createMockDiscordCallbacks } from './openclaw-adapter.js';
import type { OpenClawAgentContext } from './openclaw-adapter.js';

async function testDecisionLoop() {
  console.log('🧪 Testing decision-loop with mock Discord...\n');

  // Use Seneca as test agent
  const workspace = '/Users/sameeragarwal/Documents/hackathons/The-Agora/agents/seneca/workspace';

  // Create mock Discord callbacks
  const mockDiscord = createMockDiscordCallbacks();

  // Build OpenClaw context
  const openclawContext: OpenClawAgentContext = {
    agentName: 'Seneca',
    agentId: 1,
    workspace,
    // privateKey will be loaded from SENECA_PRIVATE_KEY env var
    discord: mockDiscord,
    channelIds: {
      templeSteps: 'test-temple-steps',
      debateArena: 'test-debate-arena',
      announcements: 'test-announcements'
    },
    config: {
      cycleInterval: 10_000, // 10 seconds for testing
      enableLogging: true
    }
  };

  console.log('📋 Test Configuration:');
  console.log(`  Agent: ${openclawContext.agentName}`);
  console.log(`  Workspace: ${openclawContext.workspace}`);
  console.log(`  Cycle Interval: ${openclawContext.config?.cycleInterval}ms`);
  console.log('');

  console.log('🚀 Starting decision loop...');
  console.log('   (Press Ctrl+C to stop)\n');

  // Start decision loop (runs indefinitely)
  await runAgentWithOpenClaw(openclawContext);
}

// Run test
testDecisionLoop().catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
