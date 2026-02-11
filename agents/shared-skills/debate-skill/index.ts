import { DebateState, DebateStatus, ChallengeParams } from "./types.js";
import {
  loadDebateState,
  saveDebateState,
  isDebateActive,
  isMyTurn,
  formatTranscript,
} from "./state.js";
import {
  issueChallenge,
  acceptChallenge,
  shouldAcceptChallenge,
  detectChallenge,
} from "./challenge.js";
import { executeRound, checkTimeout, getDebateStatus } from "./rounds.js";
import {
  evaluateConviction,
  applyConvictionResult,
} from "../conviction-evaluator/index.js";
import {
  BeliefState,
  StrategyType,
  BeliefId,
} from "../conviction-evaluator/types.js";
import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";

/**
 * LLM callback interface - provided by OpenClaw framework
 */
export interface LLMCallback {
  (prompt: string, options?: { maxTokens?: number; temperature?: number }): Promise<string>;
}

interface DebateContext {
  workspacePath: string;
  agentId: number;
  agentName: string;
  agentBelief: string;
  agentSoulMd: string;
  beliefState: BeliefState;
  wallet: ethers.Wallet;
  postToDiscord: (channelId: string, message: string) => Promise<void>;
  getLatestMessages: (
    channelId: string,
    since: number
  ) => Promise<Array<{ author: string; content: string; timestamp: number }>>;
  llmCallback?: LLMCallback; // Optional LLM callback from OpenClaw
}

export async function initiateDebate(
  ctx: DebateContext,
  params: ChallengeParams
): Promise<DebateState> {
  const existing = loadDebateState(ctx.workspacePath);
  if (existing && isDebateActive(existing))
    throw new Error("Already in a debate");

  const state = await issueChallenge(
    ctx.workspacePath,
    ctx.agentId,
    ctx.agentName,
    ctx.agentBelief,
    params,
    ctx.wallet,
    ctx.postToDiscord
  );

  trackDebateStake(ctx.workspacePath, state.debateId, state.stakeAmount);

  return state;
}

export async function respondToChallenge(
  ctx: DebateContext,
  info: {
    debateId: number;
    challengerAgentId: number;
    challengerName: string;
    challengerBelief: string;
    stakeAmount: bigint;
    topic: string;
    channelId: string;
  }
): Promise<{ accepted: boolean; state?: DebateState; reason: string }> {
  const rel = ctx.beliefState.relationshipMap[info.challengerName] ?? "neutral";
  const decision = await shouldAcceptChallenge(
    ctx.agentSoulMd,
    ctx.agentBelief,
    ctx.beliefState.conviction,
    info.challengerBelief,
    info.challengerName,
    rel
  );

  if (!decision.accept) {
    await ctx.postToDiscord(
      info.channelId,
      `**${ctx.agentName}** declines.\n\n*"${decision.reason}"*`
    );
    return { accepted: false, reason: decision.reason };
  }

  const state = await acceptChallenge(
    ctx.workspacePath,
    ctx.agentId,
    ctx.agentName,
    ctx.agentBelief,
    info,
    ctx.wallet,
    ctx.postToDiscord
  );
  trackDebateStake(ctx.workspacePath, state.debateId, state.stakeAmount);

  return { accepted: true, state, reason: decision.reason };
}

export async function continueDebate(
  ctx: DebateContext
): Promise<DebateStatus> {
  const state = loadDebateState(ctx.workspacePath);
  if (!state) return { status: "idle" };

  const timeout = checkTimeout(ctx.workspacePath);
  if (timeout.timedOut) {
    await ctx.postToDiscord(
      state.channelId,
      `⏱️ **FORFEIT** — ${timeout.forfeitAgent} timed out.`
    );
    state.currentPhase = "AWAITING_VERDICT";
    saveDebateState(ctx.workspacePath, state);
    return { status: "concluded", awaitingVerdict: true };
  }

  if (
    state.currentPhase === "CONCLUDED" ||
    state.currentPhase === "AWAITING_VERDICT"
  ) {
    return { status: "concluded", awaitingVerdict: true };
  }

  if (isMyTurn(state)) {
    await executeRound(
      ctx.workspacePath,
      ctx.agentName,
      ctx.agentId,
      ctx.agentSoulMd,
      ctx.agentBelief,
      ctx.beliefState,
      ctx.postToDiscord
    );
    const newState = loadDebateState(ctx.workspacePath);

    if (newState?.currentPhase === "CONCLUDED") {
      await concludeDebate(ctx);
      return { status: "concluded", awaitingVerdict: true };
    }
    return { status: "active", phase: newState!.currentPhase, myTurn: false };
  }

  return { status: "active", phase: state.currentPhase, myTurn: false };
}
// ─── Track debate escrow creation in belief-state ─────────────────
function trackDebateStake(
  workspacePath: string,
  debateId: number,
  stakeAmount: string
): void {
  const statePath = path.join(workspacePath, "belief-state.json");
  const raw = fs.readFileSync(statePath, "utf-8");
  const state = JSON.parse(raw);

  if (!state.stakingRecord.activeEscrows.includes(debateId)) {
    state.stakingRecord.activeEscrows.push(debateId);
  }

  const amountMON = parseFloat(ethers.formatEther(BigInt(stakeAmount)));
  state.stakingRecord.totalStaked += amountMON;

  fs.writeFileSync(statePath, JSON.stringify(state, null, 2), "utf-8");
  console.log(
    `[debate-skill] ✅ Tracked escrow ${debateId} (${amountMON} MON)`
  );
}

// ─── Record debate outcome after verdict ──────────────────────────
export function recordDebateOutcome(
  workspacePath: string,
  debateId: number,
  outcome: "win" | "loss" | "stalemate",
  stakeAmount: string
): void {
  const statePath = path.join(workspacePath, "belief-state.json");
  const raw = fs.readFileSync(statePath, "utf-8");
  const state = JSON.parse(raw);

  const amountMON = parseFloat(ethers.formatEther(BigInt(stakeAmount)));

  // Update win/loss totals
  if (outcome === "win") {
    state.stakingRecord.totalWon += amountMON;
    state.debates.wins += 1;
  } else if (outcome === "loss") {
    state.stakingRecord.totalLost += amountMON;
    state.debates.losses += 1;
  } else {
   state.stakingRecord.totalLost += amountMON * 0.1; // ~10% penalty (adjust to match your stalematePenaltyBps)
    state.debates.stalemates += 1;
  }

  // Remove from active escrows
  state.stakingRecord.activeEscrows = state.stakingRecord.activeEscrows.filter(
    (id: number) => id !== debateId
  );

  // Add to debate history
  state.debates.history.push({
    debateId,
    outcome,
    stakeAmount: amountMON,
    timestamp: Date.now(),
  });

  fs.writeFileSync(statePath, JSON.stringify(state, null, 2), "utf-8");
  console.log(
    `[debate-skill] ✅ Recorded outcome: ${outcome} for debate ${debateId} (${amountMON} MON)`
  );
}
async function concludeDebate(ctx: DebateContext): Promise<void> {
  const state = loadDebateState(ctx.workspacePath);
  if (!state) return;

  await ctx.postToDiscord(
    state.channelId,
    `🏁 **DEBATE CONCLUDED**\n\n*Awaiting The Chronicler's judgment...*`
  );

  const opponentName =
    state.myRole === "challenger" ? state.challengedName : state.challengerName;
  const opponentBelief =
    state.myRole === "challenger"
      ? state.challengedBelief
      : state.challengerBelief;
  const opponentMsgs = state.transcript.filter((m) => m.agent === opponentName);
  const strategy =
    opponentMsgs[opponentMsgs.length - 1]?.strategy ?? "logical_dismantling";

  const result = await evaluateConviction({
    agentName: ctx.agentName,
    agentSoulMd: ctx.agentSoulMd,
    currentBelief: ctx.agentBelief,
    currentConviction: ctx.beliefState.conviction,
    incomingArgument: opponentMsgs[opponentMsgs.length - 1]?.content ?? "",
    opponentName,
    opponentBelief,
    strategyUsed: strategy,
    debateContext: formatTranscript(state),
  }, ctx.llmCallback); // Pass LLM callback if provided

  const getBeliefId = (b: string): BeliefId => {
    if (b.includes("nihilism")) return 1;
    if (b.includes("existentialism")) return 2;
    if (b.includes("absurdism")) return 3;
    return 4;
  };

  await applyConvictionResult(
    ctx.workspacePath,
    result,
    {
      agentName: opponentName,
      belief: opponentBelief,
      strategy,
      beliefId: getBeliefId(opponentBelief),
    },
    {
      privateKey: process.env.AGENT_PRIVATE_KEY!,
      agentId: ctx.agentId,
    }
  );

  if (result.converted) {
    await ctx.postToDiscord(
      state.channelId,
      `🔥 **CONVERSION** — ${ctx.agentName} now believes in ${opponentBelief}!`
    );
  }

  state.currentPhase = "AWAITING_VERDICT";
  saveDebateState(ctx.workspacePath, state);
}

export {
  loadDebateState,
  getDebateStatus,
  detectChallenge,
  shouldAcceptChallenge,
};
