/**
 * OpenClaw Integration Adapter
 *
 * Thin adapter layer between OpenClaw framework and decision-loop.
 * Provides entry point for OpenClaw to start agents.
 */

import { ethers } from 'ethers';
import { startDecisionLoop, AgentContext, DiscordCallbacks } from './index.js';

/**
 * OpenClaw agent configuration (provided by OpenClaw framework)
 */
export interface OpenClawAgentContext {
  agentName: string;
  agentId: number;
  workspace: string;
  privateKey?: string; // Optional - if not provided, uses env var
  discord: DiscordCallbacks;
  channelIds: {
    templeSteps: string;
    debateArena: string;
    announcements: string;
  };
  config?: {
    cycleInterval?: number;
    enableLogging?: boolean;
  };
}

/**
 * Main entry point for OpenClaw to start an agent
 *
 * @param openclawContext - Agent configuration from OpenClaw
 */
export async function runAgentWithOpenClaw(
  openclawContext: OpenClawAgentContext
): Promise<void> {
  console.log(`[openclaw-adapter] Initializing agent: ${openclawContext.agentName}`);

  // Validate required fields
  validateOpenClawContext(openclawContext);

  // Initialize wallet
  const wallet = await initializeWallet(
    openclawContext.agentName,
    openclawContext.privateKey
  );

  // Build agent context
  const agentContext: AgentContext = {
    agentName: openclawContext.agentName,
    agentId: openclawContext.agentId,
    workspace: openclawContext.workspace,
    wallet,
    discord: openclawContext.discord,
    channelIds: openclawContext.channelIds
  };

  console.log(`[openclaw-adapter] Agent context initialized for ${openclawContext.agentName}`);
  console.log(`[openclaw-adapter] Wallet address: ${wallet.address}`);
  console.log(`[openclaw-adapter] Workspace: ${openclawContext.workspace}`);

  // Start decision loop
  await startDecisionLoop(agentContext, openclawContext.config);
}

/**
 * Validate OpenClaw context has required fields
 */
function validateOpenClawContext(context: OpenClawAgentContext): void {
  const required = [
    'agentName',
    'agentId',
    'workspace',
    'discord',
    'channelIds'
  ];

  for (const field of required) {
    if (!(field in context)) {
      throw new Error(`OpenClaw context missing required field: ${field}`);
    }
  }

  // Validate Discord callbacks
  if (typeof context.discord.postToDiscord !== 'function') {
    throw new Error('OpenClaw context missing discord.postToDiscord callback');
  }

  if (typeof context.discord.getLatestMessages !== 'function') {
    throw new Error('OpenClaw context missing discord.getLatestMessages callback');
  }

  // Validate channel IDs
  const requiredChannels = ['templeSteps', 'debateArena', 'announcements'];
  for (const channel of requiredChannels) {
    if (!context.channelIds[channel as keyof typeof context.channelIds]) {
      throw new Error(`OpenClaw context missing channelIds.${channel}`);
    }
  }
}

/**
 * Initialize wallet from private key or environment variable
 */
async function initializeWallet(
  agentName: string,
  privateKey?: string
): Promise<ethers.Wallet> {
  // Try provided private key first
  if (privateKey) {
    return new ethers.Wallet(privateKey);
  }

  // Fall back to environment variable
  const envVarName = `${agentName.toUpperCase()}_PRIVATE_KEY`;
  const envKey = process.env[envVarName];

  if (!envKey) {
    throw new Error(
      `No private key provided and ${envVarName} environment variable not set`
    );
  }

  return new ethers.Wallet(envKey);
}

/**
 * Helper to create mock Discord callbacks for testing
 */
export function createMockDiscordCallbacks(): DiscordCallbacks {
  return {
    postToDiscord: async (channelId: string, message: string) => {
      console.log(`\n📤 MOCK POST TO CHANNEL ${channelId}:`);
      console.log(message);
      console.log('');
    },
    getLatestMessages: async (channelId: string, since?: number) => {
      console.log(`📥 MOCK GET MESSAGES FROM CHANNEL ${channelId} (since: ${since})`);
      return []; // No messages in mock
    }
  };
}
