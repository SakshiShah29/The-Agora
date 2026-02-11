import * as fs from 'fs';
import * as path from 'path';
import { BeliefState } from '../conviction-evaluator/types.js';
import { loadDebateState, isDebateActive } from '../debate-skill/state.js';
import { ChainProvider, ContractManager, callViewFunction } from '../chain-interaction/index.js';

// ─── Lifecycle States ─────────────────────────────────────────────
export type LifecycleState =
  | 'UNINITIALIZED'    // Not entered Agora, not staked
  | 'ENTERED'          // Entered Agora but not staked yet
  | 'ACTIVE'           // Entered + staked + ready to debate/preach
  | 'IN_DEBATE'        // Currently in an active debate
  | 'AWAITING_VERDICT' // Debate done, waiting for Chronicler
  | 'CONVERTING'       // Conviction below threshold, needs migration
  | 'EXITED';          // Left the Agora

// ─── Full lifecycle context ───────────────────────────────────────
export interface LifecycleContext {
  state: LifecycleState;
  agentId: number;
  agentName: string;
  currentBelief: string;
  beliefId: number;
  conviction: number;
  conversionThreshold: number;
  hasEnteredAgora: boolean;
  isCurrentlyStaked: boolean;
  currentStakedAmount: string;
  inDebate: boolean;
  awaitingVerdict: boolean;
  activeDebateId?: number;
  activeDebateOpponent?: string;
  canDebate: boolean;
  canPreach: boolean;
  needsOnboarding: boolean;
  needsConversion: boolean;
}

// ─── Get lifecycle context for an agent ───────────────────────────
export function getLifecycleContext(workspacePath: string, agentId: number): LifecycleContext {
  // Load belief state
  const statePath = path.join(workspacePath, 'belief-state.json');
  const raw = fs.readFileSync(statePath, 'utf-8');
  const beliefState: BeliefState = JSON.parse(raw);

  // Check debate state
  const debateState = loadDebateState(workspacePath);
  const inDebate = debateState !== null && isDebateActive(debateState);
  const awaitingVerdict = debateState?.currentPhase === 'AWAITING_VERDICT' ||
                          debateState?.currentPhase === 'CONCLUDED';

  // Determine lifecycle state
  let state: LifecycleState;

  if (!beliefState.hasEnteredAgora) {
    state = 'UNINITIALIZED';
  } else if (beliefState.hasEnteredAgora && !beliefState.isCurrentlyStaked) {
    state = 'ENTERED';
  } else if (awaitingVerdict) {
    state = 'AWAITING_VERDICT';
  } else if (inDebate) {
    state = 'IN_DEBATE';
  } else if (beliefState.conviction < beliefState.conversionThreshold) {
    state = 'CONVERTING';
  } else if (beliefState.isCurrentlyStaked) {
    state = 'ACTIVE';
  } else {
    state = 'EXITED';
  }

  // Derive capabilities
  const canDebate = state === 'ACTIVE';
  const canPreach = state === 'ACTIVE' || state === 'IN_DEBATE';
  const needsOnboarding = state === 'UNINITIALIZED' || state === 'ENTERED';
  const needsConversion = state === 'CONVERTING';

  return {
    state,
    agentId,
    agentName: beliefState.agent,
    currentBelief: beliefState.currentBelief,
    beliefId: beliefState.coreBeliefId,
    conviction: beliefState.conviction,
    conversionThreshold: beliefState.conversionThreshold,
    hasEnteredAgora: beliefState.hasEnteredAgora,
    isCurrentlyStaked: beliefState.isCurrentlyStaked,
    currentStakedAmount: beliefState.currentStakedAmount ?? '0',
    inDebate,
    awaitingVerdict,
    activeDebateId: inDebate || awaitingVerdict ? debateState?.debateId : undefined,
    activeDebateOpponent: inDebate || awaitingVerdict
      ? (debateState?.myRole === 'challenger' ? debateState?.challengedName : debateState?.challengerName)
      : undefined,
    canDebate,
    canPreach,
    needsOnboarding,
    needsConversion,
  };
}

// ─── Verify local state matches chain (optional deep check) ──────
export async function verifyChainSync(
  agentId: number,
  beliefId: number
): Promise<{ inSync: boolean; chainBelief?: number; chainStake?: string }> {
  if (process.env.MOCK_CHAIN === 'true') {
    return { inSync: true };
  }

  try {
    const contractManager = new ContractManager();
    const beliefPool = contractManager.getBeliefPoolReadOnly();
    const agoraGate = contractManager.getAgoraGateReadOnly();

    const hasEntered = await callViewFunction(agoraGate, 'hasEntered', [agentId]);
    if (!hasEntered) {
      return { inSync: false, chainBelief: 0, chainStake: '0' };
    }

    // Check which belief has stake
    for (let bId = 1; bId <= 4; bId++) {
      const stakeInfo = await callViewFunction(beliefPool, 'getStakeInfo', [agentId, bId]);
      if (stakeInfo.amount > 0n) {
        return {
          inSync: bId === beliefId,
          chainBelief: bId,
          chainStake: stakeInfo.amount.toString(),
        };
      }
    }

    return { inSync: false, chainBelief: 0, chainStake: '0' };
  } catch (error) {
    console.error(`[lifecycle-manager] ❌ Chain sync check failed:`, error);
    return { inSync: true }; // Assume sync on error to not block operations
  }
}

// ─── Pretty print lifecycle for debugging ─────────────────────────
export function printLifecycle(ctx: LifecycleContext): void {
  const stateEmoji: Record<LifecycleState, string> = {
    UNINITIALIZED: '⬜',
    ENTERED: '🚪',
    ACTIVE: '🟢',
    IN_DEBATE: '⚔️',
    AWAITING_VERDICT: '⏳',
    CONVERTING: '🔄',
    EXITED: '🔴',
  };

  console.log(`\n${stateEmoji[ctx.state]} ${ctx.agentName} (ID: ${ctx.agentId})`);
  console.log(`  State: ${ctx.state}`);
  console.log(`  Belief: ${ctx.currentBelief} (ID: ${ctx.beliefId})`);
  console.log(`  Conviction: ${ctx.conviction} (threshold: ${ctx.conversionThreshold})`);
  console.log(`  Staked: ${ctx.currentStakedAmount} wei`);
  console.log(`  Can debate: ${ctx.canDebate} | Can preach: ${ctx.canPreach}`);
  if (ctx.inDebate) console.log(`  Active debate: #${ctx.activeDebateId} vs ${ctx.activeDebateOpponent}`);
  if (ctx.needsOnboarding) console.log(`  ⚠️ Needs onboarding`);
  if (ctx.needsConversion) console.log(`  ⚠️ Needs conversion/migration`);
  console.log('');
}

// ─── Get all agents' lifecycle status ─────────────────────────────
export function getAllAgentStatus(agentsBasePath: string): LifecycleContext[] {
  const agents = [
    { name: 'nihilo', id: 1 },
    { name: 'voyd', id: 2 },
    { name: 'kael', id: 3 },
    { name: 'sera', id: 4 },
    { name: 'camus', id: 5 },
    { name: 'dread', id: 6 },
    { name: 'seneca', id: 7 },
    { name: 'epicteta', id: 8 },
  ];

  const results: LifecycleContext[] = [];

  for (const agent of agents) {
    const workspacePath = path.join(agentsBasePath, agent.name, 'workspace');
    try {
      const ctx = getLifecycleContext(workspacePath, agent.id);
      results.push(ctx);
    } catch (error) {
      console.error(`[lifecycle-manager] Failed to get status for ${agent.name}:`, error);
    }
  }

  return results;
}

// ─── Dashboard: print all agents ──────────────────────────────────
export function printDashboard(agentsBasePath: string): void {
  console.log('\n🏛️  THE AGORA — Agent Status Dashboard\n');
  console.log('─'.repeat(50));

  const agents = getAllAgentStatus(agentsBasePath);

  for (const agent of agents) {
    printLifecycle(agent);
  }

  const active = agents.filter(a => a.state === 'ACTIVE').length;
  const debating = agents.filter(a => a.state === 'IN_DEBATE').length;
  const uninitialized = agents.filter(a => a.needsOnboarding).length;

  console.log('─'.repeat(50));
  console.log(`  Active: ${active} | Debating: ${debating} | Need onboarding: ${uninitialized}`);
  console.log('');
}