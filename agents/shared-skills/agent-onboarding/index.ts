import * as fs from 'fs';
import * as path from 'path';
import { ChainProvider, ContractManager, executeTransaction, callViewFunction } from '../chain-interaction/index.js';
import { ethers } from 'ethers';

// ─── Types ────────────────────────────────────────────────────────
export interface OnboardingResult {
  success: boolean;
  entryTxHash?: string;
  stakeTxHash?: string;
  error?: string;
}

// ─── Check if agent has already entered ───────────────────────────
export async function checkOnboardingStatus(agentId: number): Promise<{
  hasEntered: boolean;
  entryTime: number;
  currentBelief?: number;
  stakeAmount?: bigint;
}> {
  if (process.env.MOCK_CHAIN === "true") {
    console.log(`[agent-onboarding] MOCK: checkOnboardingStatus(${agentId})`);
    return { hasEntered: false, entryTime: 0 };
  }

  const contractManager = new ContractManager();
  const agoraGate = contractManager.getAgoraGateReadOnly();
  const beliefPool = contractManager.getBeliefPoolReadOnly();

  // Check AgoraGate
  const hasEntered = await callViewFunction(agoraGate, 'hasEntered', [agentId]);
  let entryTime = 0;

  if (hasEntered) {
    const entryTimeBn = await callViewFunction(agoraGate, 'getEntryTime', [agentId]);
    entryTime = Number(entryTimeBn);
  }

  // Check BeliefPool for existing stakes (beliefs 1-4)
  let currentBelief: number | undefined;
  let stakeAmount: bigint | undefined;

  if (hasEntered) {
    for (let beliefId = 1; beliefId <= 4; beliefId++) {
      const stakeInfo = await callViewFunction(beliefPool, 'getStakeInfo', [agentId, beliefId]);
      if (stakeInfo.amount > 0n) {
        currentBelief = beliefId;
        stakeAmount = stakeInfo.amount;
        break;
      }
    }
  }

  return { hasEntered, entryTime, currentBelief, stakeAmount };
}

// ─── Onboard agent: enter Agora + stake on belief ─────────────────
export async function onboardAgent(params: {
  agentId: number;
  agentName: string;
  beliefId: number;
  stakeAmount: bigint;
  privateKey: string;
  workspacePath: string;
}): Promise<OnboardingResult> {
  console.log(`[agent-onboarding] Starting onboarding for ${params.agentName} (ID: ${params.agentId})`);

  // ── Mock mode ───────────────────────────────────────────────────
  if (process.env.MOCK_CHAIN === "true") {
    console.log(`[agent-onboarding] MOCK: enter(${params.agentId})`);
    console.log(`[agent-onboarding] MOCK: stake(${params.beliefId}, ${params.agentId}) with ${ethers.formatEther(params.stakeAmount)} MON`);

    // Update belief-state.json
    updateBeliefStateAfterOnboarding(params.workspacePath, {
      beliefId: params.beliefId,
      stakeAmount: params.stakeAmount.toString(),
      entryTime: Date.now(),
    });

    return { success: true, entryTxHash: 'MOCK_ENTRY_TX', stakeTxHash: 'MOCK_STAKE_TX' };
  }

  // ── Real chain ──────────────────────────────────────────────────
  try {
    const provider = new ChainProvider();
    const wallet = await provider.getWallet(params.privateKey);
    const contractManager = new ContractManager();

    // 1. Check if already onboarded
    const status = await checkOnboardingStatus(params.agentId);

    if (status.hasEntered && status.stakeAmount) {
      console.log(`[agent-onboarding] ⚠️ Already onboarded on belief ${status.currentBelief}`);
      return { success: true, error: 'Already onboarded' };
    }

    // 2. Enter Agora (if not already entered)
    let entryTxHash: string | undefined;

    if (!status.hasEntered) {
      const agoraGate = contractManager.getAgoraGate(wallet);

      // Get entry fee from contract
      const entryFee = await callViewFunction(
        contractManager.getAgoraGateReadOnly(),
        'entryFee',
        []
      );

      console.log(`[agent-onboarding] 💰 Entering Agora (fee: ${ethers.formatEther(entryFee)} MON)...`);

      const entryResult = await executeTransaction(
        agoraGate,
        'enter',
        [params.agentId],
        { value: entryFee }
      );

      entryTxHash = entryResult.txHash;
      console.log(`[agent-onboarding] ✅ Entered Agora: ${entryTxHash}`);
    } else {
      console.log(`[agent-onboarding] ℹ️ Already entered Agora — skipping`);
    }

    // 3. Stake on belief
    const beliefPool = contractManager.getBeliefPool(wallet);

    console.log(`[agent-onboarding] 🎯 Staking ${ethers.formatEther(params.stakeAmount)} MON on belief ${params.beliefId}...`);

    const stakeResult = await executeTransaction(
      beliefPool,
      'stake',
      [params.beliefId, params.agentId],
      { value: params.stakeAmount }
    );

    console.log(`[agent-onboarding] ✅ Staked: ${stakeResult.txHash}`);

    // 4. Update belief-state.json
    updateBeliefStateAfterOnboarding(params.workspacePath, {
      beliefId: params.beliefId,
      stakeAmount: params.stakeAmount.toString(),
      entryTime: Date.now(),
    });

    console.log(`[agent-onboarding] 🎉 Onboarding complete for ${params.agentName}`);

    return {
      success: true,
      entryTxHash,
      stakeTxHash: stakeResult.txHash,
    };

  } catch (error) {
    console.error(`[agent-onboarding] ❌ Onboarding failed:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ─── Update belief-state.json after onboarding ────────────────────
function updateBeliefStateAfterOnboarding(
  workspacePath: string,
  params: { beliefId: number; stakeAmount: string; entryTime: number }
): void {
  const statePath = path.join(workspacePath, 'belief-state.json');
  const raw = fs.readFileSync(statePath, 'utf-8');
  const state = JSON.parse(raw);

  state.hasEnteredAgora = true;
  state.entryTime = params.entryTime;
  state.isCurrentlyStaked = true;
  state.currentStakedAmount = params.stakeAmount;
  state.currentStakedBeliefId = params.beliefId;

  fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf-8');
  console.log(`[agent-onboarding] ✅ Updated belief-state.json`);
}

// ─── Batch onboard all agents ─────────────────────────────────────
export async function onboardAllAgents(agents: Array<{
  agentId: number;
  agentName: string;
  beliefId: number;
  privateKey: string;
  workspacePath: string;
}>, stakeAmount: bigint): Promise<void> {
  console.log(`[agent-onboarding] Batch onboarding ${agents.length} agents...\n`);

  for (const agent of agents) {
    const result = await onboardAgent({
      ...agent,
      stakeAmount,
    });

    if (result.success) {
      console.log(`  ✅ ${agent.agentName} onboarded\n`);
    } else {
      console.log(`  ❌ ${agent.agentName} failed: ${result.error}\n`);
    }
  }

  console.log(`[agent-onboarding] Batch onboarding complete`);
}