/**
 * OpenClaw Hook Integration
 *
 * Entry point for OpenClaw to start our decision-loop for each agent.
 * OpenClaw calls this with its context, we translate and start our decision-loop.
 */

import { ethers } from 'ethers';
import { runAgentWithOpenClaw, OpenClawAgentContext } from './openclaw-adapter.js';

/**
 * Agent configuration mapping
 * Maps agent names to their IDs and blockchain info
 */
const AGENT_CONFIG: Record<string, { id: number; beliefId: number; privateKeyEnv: string }> = {
  'Seneca': { id: 1, beliefId: 4, privateKeyEnv: 'SENECA_PRIVATE_KEY' },
  'Camus': { id: 2, beliefId: 3, privateKeyEnv: 'CAMUS_PRIVATE_KEY' },
  'Kael': { id: 3, beliefId: 2, privateKeyEnv: 'KAEL_PRIVATE_KEY' },
  'Sera': { id: 4, beliefId: 2, privateKeyEnv: 'SERA_PRIVATE_KEY' },
  'Epicteta': { id: 5, beliefId: 4, privateKeyEnv: 'EPICTETA_PRIVATE_KEY' },
  'Nihilo': { id: 6, beliefId: 1, privateKeyEnv: 'NIHILO_PRIVATE_KEY' },
  'Voyd': { id: 7, beliefId: 1, privateKeyEnv: 'VOYD_PRIVATE_KEY' },
  'Dread': { id: 8, beliefId: 3, privateKeyEnv: 'DREAD_PRIVATE_KEY' },
  'The Chronicler': { id: 9, beliefId: 0, privateKeyEnv: 'CHRONICLER_PRIVATE_KEY' }
};

/**
 * OpenClaw context interface
 * This is what OpenClaw provides when starting an agent
 */
export interface OpenClawHookContext {
  agentId: string;           // Agent identifier (e.g., "seneca")
  agentName: string;         // Display name (e.g., "Seneca")
  workspace: string;         // Path to workspace directory
  discord: {
    postMessage: (channelId: string, content: string) => Promise<void>;
    getRecentMessages: (channelId: string, limit?: number) => Promise<Array<{
      id: string;
      content: string;
      author: { id: string; username: string; };
      timestamp: Date;
    }>>;
  };
  channels: {
    [key: string]: string;   // Channel name -> Discord channel ID
  };
  llm?: {
    // LLM callback for Chronicler verdict analysis
    call: (prompt: string, options?: { maxTokens?: number; temperature?: number }) => Promise<string>;
  };
}

/**
 * Main hook function - OpenClaw entry point
 *
 * OpenClaw calls this function to start an agent's decision-loop.
 * We translate OpenClaw's context to our format and start the loop.
 *
 * @param context - Context provided by OpenClaw
 */
export async function startAgentHook(context: OpenClawHookContext): Promise<void> {
  console.log(`[openclaw-hook] 🎯 Starting agent: ${context.agentName}`);

  // Get agent configuration
  const config = AGENT_CONFIG[context.agentName];
  if (!config) {
    throw new Error(`Unknown agent: ${context.agentName}. Available: ${Object.keys(AGENT_CONFIG).join(', ')}`);
  }

  // Get private key from environment
  const privateKey = process.env[config.privateKeyEnv];
  if (!privateKey) {
    throw new Error(`Missing environment variable: ${config.privateKeyEnv}`);
  }

  // Map OpenClaw's Discord callbacks to our format
  const discordCallbacks = {
    postToDiscord: async (channelId: string, message: string) => {
      console.log(`[openclaw-hook] Posting to channel ${channelId}`);
      await context.discord.postMessage(channelId, message);
    },

    getLatestMessages: async (channelId: string, since?: number) => {
      const messages = await context.discord.getRecentMessages(channelId, 100);

      // Filter by timestamp if provided
      const filtered = since
        ? messages.filter(m => m.timestamp.getTime() >= since)
        : messages;

      // Map to our expected format
      return filtered.map(m => ({
        id: m.id,
        content: m.content,
        author: {
          id: m.author.id,
          username: m.author.username
        },
        timestamp: m.timestamp.getTime(),
        channelId
      }));
    }
  };

  // Map channel names to IDs
  // Try to find the right channels from OpenClaw's mapping
  const channelIds = {
    templeSteps: context.channels['temple-steps']
                 || context.channels['the-forum']
                 || Object.values(context.channels)[0],
    debateArena: context.channels['the-market']
                 || context.channels['general']
                 || Object.values(context.channels)[0],
    announcements: context.channels['announcements']
                   || context.channels['the-forum']
                   || Object.values(context.channels)[0]
  };

  console.log(`[openclaw-hook] Configuration:`);
  console.log(`  - Agent ID: ${config.id}`);
  console.log(`  - Workspace: ${context.workspace}`);
  console.log(`  - Channels:`, Object.keys(channelIds).map(k => `${k}=${channelIds[k as keyof typeof channelIds]}`).join(', '));

  // Build our agent context
  const agentContext: OpenClawAgentContext = {
    agentName: context.agentName,
    agentId: config.id,
    workspace: context.workspace,
    privateKey,
    discord: discordCallbacks,
    channelIds,
    llmCallback: context.llm?.call, // Forward LLM callback if provided (required for Chronicler)
    config: {
      cycleInterval: 60_000,  // 60 seconds
      enableLogging: true
    }
  };

  // Start the decision-loop!
  console.log(`[openclaw-hook] 🚀 Launching decision-loop for ${context.agentName}`);
  await runAgentWithOpenClaw(agentContext);
}

// Default export for OpenClaw to import
export default startAgentHook;
