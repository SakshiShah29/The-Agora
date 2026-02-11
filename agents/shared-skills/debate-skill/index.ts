import { DebateState, DebateStatus, ChallengeParams } from "./types.js";
import {
  loadDebateState,
  saveDebateState,
  isDebateActive,
  isMyTurn,
  formatTranscript,
} from "./state.js";
import { issueChallenge, acceptChallenge, shouldAcceptChallenge, detectChallenge } from "./challenge.js";
import { executeRound, checkTimeout, getDebateStatus } from "./rounds.js";
import { evaluateConviction, applyConvictionResult } from "../conviction-evaluator/index.js";
import { BeliefState, StrategyType, BeliefId } from "../conviction-evaluator/types.js";

interface DebateContext {
  workspacePath: string;
  agentId: number;
  agentName: string;
  agentBelief: string;
  agentSoulMd: string;
  beliefState: BeliefState;
  postToDiscord: (channelId: string, message: string) => Promise<void>;
  getLatestMessages: (channelId: string, since: number) => Promise<Array<{ author: string; content: string; timestamp: number }>>;
}

export async function initiateDebate(ctx: DebateContext, params: ChallengeParams): Promise<DebateState> {
  const existing = loadDebateState(ctx.workspacePath);
  if (existing && isDebateActive(existing)) throw new Error("Already in a debate");

  return issueChallenge(ctx.workspacePath, ctx.agentId, ctx.agentName, ctx.agentBelief, params, ctx.postToDiscord);
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
    await ctx.postToDiscord(info.channelId, `**${ctx.agentName}** declines.\n\n*"${decision.reason}"*`);
    return { accepted: false, reason: decision.reason };
  }

  const state = await acceptChallenge(ctx.workspacePath, ctx.agentId, ctx.agentName, ctx.agentBelief, info, ctx.postToDiscord);
  return { accepted: true, state, reason: decision.reason };
}

export async function continueDebate(ctx: DebateContext): Promise<DebateStatus> {
  const state = loadDebateState(ctx.workspacePath);
  if (!state) return { status: "idle" };

  const timeout = checkTimeout(ctx.workspacePath);
  if (timeout.timedOut) {
    await ctx.postToDiscord(state.channelId, `⏱️ **FORFEIT** — ${timeout.forfeitAgent} timed out.`);
    state.currentPhase = "AWAITING_VERDICT";
    saveDebateState(ctx.workspacePath, state);
    return { status: "concluded", awaitingVerdict: true };
  }

  if (state.currentPhase === "CONCLUDED" || state.currentPhase === "AWAITING_VERDICT") {
    return { status: "concluded", awaitingVerdict: true };
  }

  if (isMyTurn(state)) {
    await executeRound(ctx.workspacePath, ctx.agentName, ctx.agentId, ctx.agentSoulMd, ctx.agentBelief, ctx.beliefState, ctx.postToDiscord);
    const newState = loadDebateState(ctx.workspacePath);

    if (newState?.currentPhase === "CONCLUDED") {
      await concludeDebate(ctx);
      return { status: "concluded", awaitingVerdict: true };
    }
    return { status: "active", phase: newState!.currentPhase, myTurn: false };
  }

  return { status: "active", phase: state.currentPhase, myTurn: false };
}

async function concludeDebate(ctx: DebateContext): Promise<void> {
  const state = loadDebateState(ctx.workspacePath);
  if (!state) return;

  await ctx.postToDiscord(state.channelId, `🏁 **DEBATE CONCLUDED**\n\n*Awaiting The Chronicler's judgment...*`);

  const opponentName = state.myRole === "challenger" ? state.challengedName : state.challengerName;
  const opponentBelief = state.myRole === "challenger" ? state.challengedBelief : state.challengerBelief;
  const opponentMsgs = state.transcript.filter((m) => m.agent === opponentName);
  const strategy = opponentMsgs[opponentMsgs.length - 1]?.strategy ?? "logical_dismantling";

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
  });

  const getBeliefId = (b: string): BeliefId => {
    if (b.includes("nihilism")) return 1;
    if (b.includes("existentialism")) return 2;
    if (b.includes("absurdism")) return 3;
    return 4;
  };

  await applyConvictionResult(ctx.workspacePath, result, {
    agentName: opponentName,
    belief: opponentBelief,
    strategy,
    beliefId: getBeliefId(opponentBelief),
  });

  if (result.converted) {
    await ctx.postToDiscord(state.channelId, `🔥 **CONVERSION** — ${ctx.agentName} now believes in ${opponentBelief}!`);
  }

  state.currentPhase = "AWAITING_VERDICT";
  saveDebateState(ctx.workspacePath, state);
}

export { loadDebateState, getDebateStatus, detectChallenge, shouldAcceptChallenge };