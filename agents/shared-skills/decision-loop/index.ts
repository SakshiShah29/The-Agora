/**
 * Main Decision Loop
 *
 * Core orchestration engine for autonomous agent behavior.
 * Manages lifecycle states, monitors Discord, and executes actions.
 */

import fs from 'fs/promises';
import path from 'path';
import { ethers } from 'ethers';
import { getLifecycleContext, LifecycleState } from '../lifecycle-manager/index.js';
import { onboardAgent } from '../agent-onboarding/index.js';
import { deliverSermon, postSermon } from '../preach-skill/index.js';
import { SermonType } from '../preach-skill/types.js';
import { initiateDebate, respondToChallenge, continueDebate, recordDebateOutcome } from '../debate-skill/index.js';
import { detectChallenge } from '../debate-skill/challenge.js';
import { callViewFunction, ContractManager } from '../chain-interaction/index.js';
import { decideNextAction } from './action-selector.js';
import {
  discoverAgentsFromMessages,
  getAgentByName,
  registerAgent,
  formatAgentAnnouncement
} from './agent-registry.js';
import { BeliefState } from '../conviction-evaluator/types.js';
import {
  ActionCooldowns,
  createCooldowns,
  canPerformAction,
  updateCooldown
} from './cooldowns.js';
import { parseVerdictMessage, determineAgentOutcome } from './verdict-parser.js';

/**
 * Discord message interface (provided by OpenClaw)
 */
export interface DiscordMessage {
  id: string;
  content: string;
  author: {
    id: string;
    username: string;
  };
  timestamp: number;
  channelId: string;
}

/**
 * Discord callbacks provided by OpenClaw framework
 */
export interface DiscordCallbacks {
  postToDiscord: (channelId: string, message: string) => Promise<void>;
  getLatestMessages: (channelId: string, since?: number) => Promise<DiscordMessage[]>;
}

/**
 * LLM callback interface - provided by OpenClaw framework
 */
export interface LLMCallback {
  (prompt: string, options?: { maxTokens?: number; temperature?: number }): Promise<string>;
}

/**
 * Agent context for decision loop
 */
export interface AgentContext {
  agentName: string;
  agentId: number;
  workspace: string;
  wallet: ethers.Wallet;
  discord: DiscordCallbacks;
  channelIds: {
    templeSteps: string;
    debateArena: string;
    announcements: string;
  };
  llmCallback?: LLMCallback; // Optional LLM callback from OpenClaw
}

/**
 * Decision loop configuration
 */
export interface DecisionLoopConfig {
  cycleInterval: number; // Milliseconds between decision cycles (default: 60000)
  enableLogging: boolean; // Enable detailed logging (default: true)
}

const DEFAULT_CONFIG: DecisionLoopConfig = {
  cycleInterval: 60_000, // 60 seconds
  enableLogging: true
};

/**
 * Start the main decision loop for an agent
 *
 * @param context - Agent context with wallet and Discord callbacks
 * @param config - Optional configuration
 */
export async function startDecisionLoop(
  context: AgentContext,
  config: Partial<DecisionLoopConfig> = {}
): Promise<void> {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  console.log(`[decision-loop] Starting decision loop for ${context.agentName}`);
  console.log(`[decision-loop] Cycle interval: ${finalConfig.cycleInterval}ms`);

  // Initialize cooldown state
  const cooldowns = createCooldowns();

  // Initialize last check timestamp
  let lastDiscordCheck = Date.now();

  // Main loop
  while (true) {
    try {
      await runDecisionCycle(context, cooldowns, lastDiscordCheck, finalConfig);
      lastDiscordCheck = Date.now();
    } catch (error) {
      console.error(`[decision-loop] Error in decision cycle for ${context.agentName}:`, error);
      // Continue loop even on error
    }

    // Wait before next cycle
    await sleep(finalConfig.cycleInterval);
  }
}

/**
 * Run a single decision cycle
 */
async function runDecisionCycle(
  context: AgentContext,
  cooldowns: ActionCooldowns,
  lastDiscordCheck: number,
  config: DecisionLoopConfig
): Promise<void> {
  if (config.enableLogging) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`[decision-loop] ${context.agentName} - Decision Cycle`);
    console.log(`${'='.repeat(60)}\n`);
  }

  // Step 0: Discover agents from Discord announcements
  const announcementMessages = await context.discord.getLatestMessages(
    context.channelIds.announcements,
    lastDiscordCheck
  );
  const discovered = discoverAgentsFromMessages(announcementMessages);
  if (discovered > 0 && config.enableLogging) {
    console.log(`[decision-loop] Discovered ${discovered} new agent(s) from Discord`);
  }

  // Step 1: Get lifecycle state
  const lifecycle = await getLifecycleContext(context.workspace, context.agentId);

  if (config.enableLogging) {
    console.log(`[decision-loop] Lifecycle state: ${lifecycle.state}`);
  }

  // Step 2: Handle special states
  const handledSpecialState = await handleSpecialStates(context, lifecycle);
  if (handledSpecialState) {
    return; // Special state handled, skip normal decision-making
  }

  // Step 3: Monitor Discord for reactive actions
  const handledReactive = await handleReactiveActions(
    context,
    cooldowns,
    lastDiscordCheck,
    config
  );
  if (handledReactive) {
    return; // Reactive action handled, skip autonomous actions
  }

  // Step 4: Execute autonomous actions
  await handleAutonomousActions(context, cooldowns, config);
}

/**
 * Handle special lifecycle states that require specific actions
 *
 * @returns true if special state was handled, false otherwise
 */
async function handleSpecialStates(
  context: AgentContext,
  lifecycle: { state: LifecycleState }
): Promise<boolean> {
  switch (lifecycle.state) {
    case 'UNINITIALIZED':
      console.log(`[decision-loop] ${context.agentName} is uninitialized - onboarding now`);

      // Load belief from workspace
      const beliefStatePath = path.join(context.workspace, 'belief-state.json');
      const beliefStateRaw = await fs.readFile(beliefStatePath, 'utf-8');
      const beliefState: BeliefState = JSON.parse(beliefStateRaw);

      // Map belief name to ID
      const beliefMap: Record<string, number> = {
        'Nihilism': 1,
        'Existentialism': 2,
        'Absurdism': 3,
        'Stoicism': 4
      };
      const beliefId = beliefMap[beliefState.currentBelief];

      if (!beliefId) {
        throw new Error(`Unknown belief: ${beliefState.currentBelief}`);
      }

      // Onboard with Discord announcement
      const result = await onboardAgent({
        agentId: context.agentId,
        agentName: context.agentName,
        beliefId,
        stakeAmount: BigInt('1000000000000000000'), // 1 MON
        privateKey: context.wallet.privateKey,
        workspacePath: context.workspace,
        postToDiscord: context.discord.postToDiscord,
        announcementChannelId: context.channelIds.announcements
      });

      if (result.success) {
        // Register self in agent registry
        registerAgent({
          agentId: context.agentId,
          agentName: context.agentName,
          belief: beliefState.currentBelief,
          beliefId
        });

        console.log(`[decision-loop] ✅ ${context.agentName} onboarding complete`);
      } else {
        console.error(`[decision-loop] ❌ Onboarding failed: ${result.error}`);
      }

      return true;

    case 'IN_DEBATE':
      console.log(`[decision-loop] ${context.agentName} is in active debate`);

      // Load agent's belief state and SOUL.md for debate context
      const debateBeliefStatePath = path.join(context.workspace, 'belief-state.json');
      const debateBeliefStateRaw = await fs.readFile(debateBeliefStatePath, 'utf-8');
      const debateBeliefState: BeliefState = JSON.parse(debateBeliefStateRaw);

      const debateSoulPath = path.join(context.workspace, 'SOUL.md');
      const debateSoulMd = await fs.readFile(debateSoulPath, 'utf-8');

      // Continue debate (check if it's our turn and post argument)
      const debateStatus = await continueDebate({
        workspacePath: context.workspace,
        agentId: context.agentId,
        agentName: context.agentName,
        agentBelief: debateBeliefState.currentBelief,
        agentSoulMd: debateSoulMd,
        beliefState: debateBeliefState,
        wallet: context.wallet,
        postToDiscord: context.discord.postToDiscord,
        getLatestMessages: async (channelId: string, since: number) => {
          return (await context.discord.getLatestMessages(channelId, since)).map(msg => ({
            author: msg.author.username,
            content: msg.content,
            timestamp: msg.timestamp
          }));
        },
        llmCallback: context.llmCallback
      });

      if (debateStatus.status === 'concluded') {
        console.log(`[decision-loop] ✅ Debate concluded, awaiting verdict`);
      } else if (debateStatus.status === 'active') {
        if (debateStatus.myTurn) {
          console.log(`[decision-loop] ✅ Posted debate argument (${debateStatus.phase})`);
        } else {
          console.log(`[decision-loop] Waiting for opponent's turn (${debateStatus.phase})`);
        }
      } else {
        console.log(`[decision-loop] Debate status: ${debateStatus.status}`);
      }

      return true;

    case 'AWAITING_VERDICT':
      console.log(`[decision-loop] ${context.agentName} is awaiting verdict`);

      // Load active debate state to get debateId and stakeAmount
      const verdictDebatePath = path.join(context.workspace, 'active-debate.json');
      try {
        const verdictDebateRaw = await fs.readFile(verdictDebatePath, 'utf-8');
        const verdictDebate = JSON.parse(verdictDebateRaw);

        // Get recent messages from announcements channel
        // Look back up to 1 hour for verdict messages
        const lookbackTime = verdictDebate.lastActivityAt || (Date.now() - 3_600_000);
        const verdictMessages = await context.discord.getLatestMessages(
          context.channelIds.announcements,
          lookbackTime
        );

        // Scan messages for verdict matching our debate
        for (const msg of verdictMessages) {
          const verdict = parseVerdictMessage(msg.content);

          // Skip non-verdict messages or verdicts for other debates
          if (!verdict.isVerdict || verdict.debateId !== verdictDebate.debateId) {
            continue;
          }

          console.log(`[decision-loop] 📊 Verdict found for debate #${verdict.debateId}`);

          // Determine outcome for this specific agent
          const outcome = determineAgentOutcome(verdict, context.agentName);

          if (outcome) {
            console.log(`[decision-loop] Result: ${outcome}`);

            // Record outcome in belief-state.json
            recordDebateOutcome(
              context.workspace,
              verdict.debateId!,
              outcome,
              verdictDebate.stakeAmount
            );

            // Clear active debate file → transitions agent back to ACTIVE
            try {
              await fs.unlink(verdictDebatePath);
              console.log(`[decision-loop] ✅ active-debate.json cleared`);
            } catch (unlinkError) {
              console.error(`[decision-loop] ⚠️ Failed to clear active-debate.json:`, unlinkError);
            }

            console.log(`[decision-loop] ✅ Debate #${verdict.debateId} — ${outcome} recorded`);
            return true;
          }
        }

        console.log(`[decision-loop] ⏳ No verdict yet for debate #${verdictDebate.debateId}`);
      } catch (error) {
        // No active-debate.json found — shouldn't be in AWAITING_VERDICT
        console.warn(`[decision-loop] ⚠️ In AWAITING_VERDICT but no active-debate.json found`);
        console.warn(`[decision-loop] This may indicate a stale lifecycle state`);
      }

      return true;

    case 'CONVERTING':
      console.log(`[decision-loop] ${context.agentName} is converting beliefs`);
      console.log(`[decision-loop] Migration handled by conviction-evaluator`);
      return true;

    case 'EXITED':
      console.log(`[decision-loop] ${context.agentName} has exited The Agora`);
      console.log(`[decision-loop] Agent lifecycle complete`);
      return true;

    case 'ENTERED':
    case 'ACTIVE':
      // Normal active states - continue to reactive/autonomous actions
      return false;

    default:
      console.warn(`[decision-loop] Unknown lifecycle state: ${lifecycle.state}`);
      return false;
  }
}

/**
 * Handle reactive actions (challenges, messages, etc.)
 *
 * @returns true if reactive action was handled, false otherwise
 */
async function handleReactiveActions(
  context: AgentContext,
  cooldowns: ActionCooldowns,
  lastCheck: number,
  config: DecisionLoopConfig
): Promise<boolean> {
  // Get recent messages from debate arena
  const messages = await context.discord.getLatestMessages(
    context.channelIds.debateArena,
    lastCheck
  );

  if (config.enableLogging && messages.length > 0) {
    console.log(`[decision-loop] Checking ${messages.length} new messages for challenges`);
  }

  // Check for incoming challenges
  for (const message of messages) {
    const challenge = detectChallenge(message.content);

    if (!challenge.isChallenge) {
      continue; // Not a challenge message
    }

    // Check if challenge is targeted at this agent
    if (challenge.targetName?.toLowerCase() !== context.agentName.toLowerCase()) {
      continue; // Challenge not for this agent
    }

    console.log(
      `[decision-loop] 🔔 Challenge detected from ${challenge.challengerName} ` +
      `(Debate #${challenge.debateId})`
    );

    if (!challenge.debateId) {
      console.warn(`[decision-loop] Challenge missing debate ID, cannot respond`);
      continue;
    }

    try {
      // Query blockchain for full debate details
      const contractManager = new ContractManager();
      const beliefPool = contractManager.getBeliefPoolReadOnly();
      const debateDetails = await callViewFunction(beliefPool, 'debates', [challenge.debateId]) as any;

      // Load agent's belief state
      const beliefStatePath = path.join(context.workspace, 'belief-state.json');
      const beliefStateRaw = await fs.readFile(beliefStatePath, 'utf-8');
      const beliefState: BeliefState = JSON.parse(beliefStateRaw);

      // Load agent's SOUL.md
      const soulPath = path.join(context.workspace, 'SOUL.md');
      const soulMd = await fs.readFile(soulPath, 'utf-8');

      // Get challenger agent info from registry
      const challengerInfo = getAgentByName(challenge.challengerName || '');
      if (!challengerInfo) {
        console.warn(`[decision-loop] Challenger ${challenge.challengerName} not in registry, cannot respond`);
        continue;
      }

      // Call respondToChallenge with full context
      const response = await respondToChallenge(
        {
          workspacePath: context.workspace,
          agentId: context.agentId,
          agentName: context.agentName,
          agentBelief: beliefState.currentBelief,
          agentSoulMd: soulMd,
          beliefState,
          wallet: context.wallet,
          postToDiscord: context.discord.postToDiscord,
          getLatestMessages: async (channelId: string, since: number) => {
            return (await context.discord.getLatestMessages(channelId, since)).map(msg => ({
              author: msg.author.username,
              content: msg.content,
              timestamp: msg.timestamp
            }));
          },
          llmCallback: context.llmCallback
        },
        {
          debateId: challenge.debateId,
          challengerAgentId: challengerInfo.agentId,
          challengerName: challengerInfo.agentName,
          challengerBelief: challengerInfo.belief,
          stakeAmount: BigInt(debateDetails.stakeAmount),
          topic: challenge.topic || '',
          channelId: context.channelIds.debateArena
        }
      );

      if (response.accepted) {
        console.log(`[decision-loop] ✅ Accepted challenge from ${challenge.challengerName}`);
        updateCooldown(cooldowns, 'debate_turn');
        return true; // Handled reactive action
      } else {
        console.log(`[decision-loop] ❌ Declined challenge: ${response.reason}`);
      }
    } catch (error) {
      console.error(`[decision-loop] Error responding to challenge:`, error);
      // Continue to next message
    }
  }

  return false; // No reactive actions handled
}

/**
 * Handle autonomous actions (preach, challenge, idle)
 */
async function handleAutonomousActions(
  context: AgentContext,
  cooldowns: ActionCooldowns,
  config: DecisionLoopConfig
): Promise<void> {
  console.log(`[decision-loop] ${context.agentName} deciding autonomous action...`);

  // Validate llmCallback is provided
  if (!context.llmCallback) {
    console.error(`[decision-loop] No LLM callback provided for ${context.agentName} - cannot make decisions`);
    return;
  }

  // Get LLM decision
  const decision = await decideNextAction({
    agentName: context.agentName,
    workspace: context.workspace,
    cooldowns,
    llmCallback: context.llmCallback
  });

  console.log(
    `[decision-loop] Decision: ${decision.action}` +
    (decision.target ? ` (target: ${decision.target})` : '') +
    ` - ${decision.reasoning}`
  );

  // Execute action
  switch (decision.action) {
    case 'preach':
      await executePreach(context, cooldowns, config);
      break;

    case 'challenge':
      if (decision.target) {
        await executeChallenge(context, decision.target, cooldowns, config);
      } else {
        console.warn(`[decision-loop] Challenge decision missing target, skipping`);
      }
      break;

    case 'idle':
      console.log(`[decision-loop] ${context.agentName} is observing`);
      break;

    default:
      console.warn(`[decision-loop] Unknown action: ${decision.action}`);
  }
}

/**
 * Execute preach action
 */
async function executePreach(
  context: AgentContext,
  cooldowns: ActionCooldowns,
  config: DecisionLoopConfig
): Promise<void> {
  // Double-check cooldown
  if (!canPerformAction('preach', cooldowns)) {
    console.log(`[decision-loop] Preach action on cooldown, skipping`);
    return;
  }

  console.log(`[decision-loop] ${context.agentName} preparing sermon...`);

  // Choose random sermon type
  const sermonTypes: SermonType[] = ['parable', 'scripture', 'prophecy', 'testimony', 'exhortation'];
  const sermonType = sermonTypes[Math.floor(Math.random() * sermonTypes.length)];

  // Generate sermon
  const sermon = await deliverSermon({
    agentWorkspace: context.workspace,
    sermonType,
    audienceContext: 'Mixed philosophical crowd at the Temple Steps'
  });

  // Post to Discord
  await postSermon(
    context.channelIds.templeSteps,
    sermon,
    context.discord.postToDiscord
  );

  console.log(`[decision-loop] ✅ ${context.agentName} delivered ${sermonType} sermon`);

  // Update cooldown
  updateCooldown(cooldowns, 'preach');
}

/**
 * Execute challenge action
 */
async function executeChallenge(
  context: AgentContext,
  targetName: string,
  cooldowns: ActionCooldowns,
  config: DecisionLoopConfig
): Promise<void> {
  // Double-check cooldown
  if (!canPerformAction('challenge', cooldowns)) {
    console.log(`[decision-loop] Challenge action on cooldown, skipping`);
    return;
  }

  console.log(`[decision-loop] ${context.agentName} initiating challenge against ${targetName}...`);

  try {
    // Look up target agent from registry
    const targetAgent = getAgentByName(targetName);
    if (!targetAgent) {
      console.warn(`[decision-loop] Target agent ${targetName} not found in registry`);
      console.log(`[decision-loop] Cannot challenge unknown agent`);
      return;
    }

    // Load agent's belief state and SOUL.md
    const beliefStatePath = path.join(context.workspace, 'belief-state.json');
    const beliefStateRaw = await fs.readFile(beliefStatePath, 'utf-8');
    const beliefState: BeliefState = JSON.parse(beliefStateRaw);

    const soulPath = path.join(context.workspace, 'SOUL.md');
    const soulMd = await fs.readFile(soulPath, 'utf-8');

    // Call initiateDebate
    const debateState = await initiateDebate(
      {
        workspacePath: context.workspace,
        agentId: context.agentId,
        agentName: context.agentName,
        agentBelief: beliefState.currentBelief,
        agentSoulMd: soulMd,
        beliefState,
        wallet: context.wallet,
        postToDiscord: context.discord.postToDiscord,
        getLatestMessages: async (channelId: string, since: number) => {
          return (await context.discord.getLatestMessages(channelId, since)).map(msg => ({
            author: msg.author.username,
            content: msg.content,
            timestamp: msg.timestamp
          }));
        },
        llmCallback: context.llmCallback
      },
      {
        targetAgentId: targetAgent.agentId,
        targetAgentName: targetAgent.agentName,
        targetBelief: targetAgent.belief,
        stakeAmount: BigInt('1000000000000000000'), // 1 MON
        channelId: context.channelIds.debateArena
      }
    );

    console.log(`[decision-loop] ✅ Challenge initiated - Debate #${debateState.debateId}`);

    // Update cooldown
    updateCooldown(cooldowns, 'challenge');
  } catch (error) {
    console.error(`[decision-loop] Error initiating challenge:`, error);
    // Don't update cooldown since challenge failed
  }
}

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
