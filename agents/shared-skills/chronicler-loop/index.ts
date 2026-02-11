/**
 * Chronicler Autonomous Loop
 *
 * Specialized decision loop for the Chronicler agent that monitors blockchain
 * for concluded debates, analyzes them with LLM, and announces verdicts.
 *
 * DIFFERENT from standard debating agent loop:
 * - No preaching
 * - No challenging
 * - No debate participation
 * - Purely reactive: monitor → analyze → announce
 */

import { ethers } from 'ethers';
import fs from 'fs/promises';
import path from 'path';
import { getLifecycleContext } from '../lifecycle-manager/index.js';
import { onboardAgent } from '../agent-onboarding/index.js';
import { BeliefState } from '../conviction-evaluator/types.js';
import { ContractManager, callViewFunction } from '../chain-interaction/index.js';
import { submitDebateVerdict, getDebateDetails } from '../chronicler-verdict-skill/index.js';
import { analyzeDebateWithLLM, LLMCallback } from './verdict-analyzer.js';
import { getAgentById } from '../decision-loop/agent-registry.js';
import { PendingDebate, DebateTranscript, ChroniclerConfig } from './types.js';

/**
 * Chronicler context
 */
export interface ChroniclerContext {
  agentName: string;
  agentId: number;
  workspace: string;
  wallet: ethers.Wallet;
  discord: {
    postMessage: (channelId: string, message: string) => Promise<void>;
    getLatestMessages: (
      channelId: string,
      since?: number
    ) => Promise<Array<{
      id: string;
      content: string;
      author: { id: string; username: string };
      timestamp: number;
    }>>;
  };
  channelIds: {
    debateArena: string;
    announcements: string;
  };
  llmCallback: LLMCallback; // For verdict analysis
}

const DEFAULT_CONFIG: ChroniclerConfig = {
  cycleInterval: 60_000, // 60 seconds
  enableLogging: true,
  llmTimeout: 30_000 // 30 seconds for LLM analysis
};

/**
 * Start the Chronicler autonomous loop
 *
 * @param context - Chronicler context with wallet, Discord callbacks, and LLM callback
 * @param config - Optional configuration
 */
export async function startChroniclerLoop(
  context: ChroniclerContext,
  config: Partial<ChroniclerConfig> = {}
): Promise<void> {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  console.log(`[chronicler-loop] Starting Chronicler autonomous loop`);
  console.log(`[chronicler-loop] Cycle interval: ${finalConfig.cycleInterval}ms`);
  console.log(`[chronicler-loop] LLM timeout: ${finalConfig.llmTimeout}ms`);

  // Main loop
  while (true) {
    try {
      await runChroniclerCycle(context, finalConfig);
    } catch (error) {
      console.error(`[chronicler-loop] Error in Chronicler cycle:`, error);
      // Continue loop even on error
    }

    // Wait before next cycle
    await sleep(finalConfig.cycleInterval);
  }
}

/**
 * Run a single Chronicler decision cycle
 */
async function runChroniclerCycle(
  context: ChroniclerContext,
  config: ChroniclerConfig
): Promise<void> {
  if (config.enableLogging) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`[chronicler-loop] Chronicler - Verdict Processing Cycle`);
    console.log(`${'='.repeat(60)}\n`);
  }

  // Step 1: Check lifecycle state
  const lifecycle = await getLifecycleContext(context.workspace, context.agentId);

  if (config.enableLogging) {
    console.log(`[chronicler-loop] Lifecycle state: ${lifecycle.state}`);
  }

  // Step 2: Handle onboarding if needed
  if (lifecycle.state === 'UNINITIALIZED') {
    console.log(`[chronicler-loop] Chronicler not onboarded - onboarding now`);

    // Onboard with beliefId = 0 (impartial Chronicler)
    await onboardAgent({
      agentId: context.agentId,
      agentName: context.agentName,
      beliefId: 0, // Chronicler has no belief affiliation
      stakeAmount: ethers.parseEther('0.01'), // Minimum stake
      privateKey: context.wallet.privateKey,
      workspacePath: context.workspace,
      postToDiscord: context.discord.postMessage,
      announcementChannelId: context.channelIds.announcements
    });

    console.log(`[chronicler-loop] ✅ Chronicler onboarded successfully`);
    return; // Exit this cycle, next cycle will start monitoring
  }

  // Step 3: Find the active debate (only 1 active at a time)
  const pendingDebate = await findActiveDebate(context);

  if (!pendingDebate) {
    if (config.enableLogging) {
      console.log(`[chronicler-loop] No active debate awaiting verdict`);
    }
    return;
  }

  console.log(`[chronicler-loop] Found active debate #${pendingDebate.debateId}`);
  console.log(`[chronicler-loop] Participants: ${pendingDebate.agentAName} vs ${pendingDebate.agentBName}`);

  try {
    // Fetch debate transcript from Discord
    const transcript = await fetchDebateTranscript(
      context,
      pendingDebate,
      config.enableLogging
    );

    if (!transcript || transcript.arguments.length === 0) {
      console.log(`[chronicler-loop] ⚠️ No transcript found for debate #${pendingDebate.debateId} - will retry next cycle`);
      return;
    }

    // Analyze with LLM
    console.log(`[chronicler-loop] Analyzing debate with LLM...`);
    const analysis = await analyzeDebateWithLLM(
      transcript,
      context.llmCallback,
      config.llmTimeout
    );

    console.log(`[chronicler-loop] Verdict: ${analysis.verdict}`);
    console.log(`[chronicler-loop] Reasoning: ${analysis.reasoning}`);

    // Submit verdict on-chain and post announcement
    console.log(`[chronicler-loop] Submitting verdict on-chain...`);
    const result = await submitDebateVerdict(
      pendingDebate.debateId,
      analysis.verdict,
      context.wallet,
      {
        postToDiscord: context.discord.postMessage,
        announcementChannelId: context.channelIds.announcements
      }
    );

    console.log(`[chronicler-loop] ✅ Verdict submitted: ${result.txHash}`);

  } catch (error) {
    console.error(`[chronicler-loop] ❌ Failed to process debate #${pendingDebate.debateId}:`, error);
    // Will retry next cycle
  }
}

/**
 * Find the active debate awaiting verdict
 *
 * Since there's only 1 active debate at a time, this returns either
 * the active debate or null.
 *
 * @returns The active debate or null if none
 */
async function findActiveDebate(
  context: ChroniclerContext
): Promise<PendingDebate | null> {
  const contractManager = new ContractManager();
  const beliefPool = contractManager.getBeliefPoolReadOnly();

  // Get next debate ID (total debates created + 1)
  const nextDebateId = await callViewFunction(beliefPool, 'nextDebateId', []) as bigint;
  const totalDebates = Number(nextDebateId) - 1;

  // Query all debates to find the one that's Active
  for (let debateId = 1; debateId <= totalDebates; debateId++) {
    try {
      const debate = await getDebateDetails(debateId);

      // Check if debate is Active (awaiting verdict)
      // Status: 0=Pending, 1=Active, 2=SettledWinner, 3=SettledStalemate
      if (debate.status === 1) {
        // Look up agent names
        const agentA = getAgentById(debate.agentAId);
        const agentB = getAgentById(debate.agentBId);

        return {
          debateId: debate.debateId,
          agentAId: debate.agentAId,
          agentBId: debate.agentBId,
          agentAName: agentA?.agentName || `Agent #${debate.agentAId}`,
          agentBName: agentB?.agentName || `Agent #${debate.agentBId}`,
          stakeAmount: debate.stakeAmount,
          createdAt: debate.createdAt
        };
      }
    } catch (error) {
      console.error(`[chronicler-loop] Error querying debate ${debateId}:`, error);
      // Continue to next debate
    }
  }

  return null; // No active debate found
}

/**
 * Fetch debate transcript from Discord
 *
 * @returns Debate transcript with all arguments
 */
async function fetchDebateTranscript(
  context: ChroniclerContext,
  debate: PendingDebate,
  enableLogging: boolean
): Promise<DebateTranscript | null> {
  try {
    // Fetch recent messages from debate arena channel
    // Use a timestamp from before the debate started
    const sinceTimestamp = debate.createdAt * 1000 - (24 * 60 * 60 * 1000); // 24 hours before

    const messages = await context.discord.getLatestMessages(
      context.channelIds.debateArena,
      sinceTimestamp
    );

    if (enableLogging) {
      console.log(`[chronicler-loop] Fetched ${messages.length} messages from debate arena`);
    }

    // Parse debate messages
    // Look for challenge message to get topic
    const challengePattern = /⚔️\s*\*\*DEBATE CHALLENGE\*\*/i;
    const debateIdPattern = new RegExp(`Debate #${debate.debateId}\\b`);

    let topic = 'Philosophical debate';
    const debateArgs: Array<{
      speaker: string;
      phase: 'opening' | 'rebuttal' | 'closing';
      content: string;
      timestamp: number;
    }> = [];

    for (const msg of messages) {
      // Check if message is part of this debate
      if (!debateIdPattern.test(msg.content)) {
        continue;
      }

      // Extract topic from challenge message
      if (challengePattern.test(msg.content)) {
        const topicMatch = msg.content.match(/Topic:\s*(.+)/);
        if (topicMatch) {
          topic = topicMatch[1].trim();
        }
      }

      // Extract debate arguments
      // Format: "🗣️ **Agent Name** [PHASE]:\n{argument}"
      const argPattern = /🗣️\s*\*\*(.+?)\*\*\s*\[(.+?)\]:\s*([\s\S]+)/;
      const match = msg.content.match(argPattern);

      if (match) {
        const [, speaker, phaseRaw, content] = match;
        const phase = parsePhase(phaseRaw);

        if (phase) {
          debateArgs.push({
            speaker: speaker.trim(),
            phase,
            content: content.trim(),
            timestamp: msg.timestamp
          });
        }
      }
    }

    if (debateArgs.length === 0) {
      return null;
    }

    // Sort by timestamp
    debateArgs.sort((a, b) => a.timestamp - b.timestamp);

    return {
      debateId: debate.debateId,
      challengerName: debate.agentAName,
      defendantName: debate.agentBName,
      topic,
      arguments: debateArgs
    };

  } catch (error) {
    console.error(`[chronicler-loop] Error fetching transcript for debate ${debate.debateId}:`, error);
    return null;
  }
}

/**
 * Parse debate phase from string
 */
function parsePhase(phaseStr: string): 'opening' | 'rebuttal' | 'closing' | null {
  const normalized = phaseStr.toLowerCase().trim();

  if (normalized.includes('opening')) return 'opening';
  if (normalized.includes('rebuttal')) return 'rebuttal';
  if (normalized.includes('closing')) return 'closing';

  return null;
}

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
