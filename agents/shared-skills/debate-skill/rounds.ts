
import {
  DebateState,
  DebateMessage,
  DebateStatus,
  PHASE_SPEAKER,
  MIN_ARGUMENT_LENGTH,
  MAX_ARGUMENT_LENGTH,
  RESPONSE_TIMEOUT_MS,
} from "./types.js";
import { StrategyType, BeliefState } from "../conviction-evaluator/types.js";
import {
  loadDebateState,
  saveDebateState,
  advancePhase,
  isMyTurn,
  addToTranscript,
  hasTimedOut,
  getMyPreviousArguments,
} from "./state.js";
import { selectStrategy } from "./strategy.js";
import { checkDiversity, getDiversityInstruction } from "./diversity.js";
import { buildArgumentPrompt, formatArgumentForDiscord } from "./prompts.js";
import { callLLM } from "./llm.js";

export async function generateArgument(
  state: DebateState,
  agentName: string,
  agentSoulMd: string,
  agentBelief: string,
  beliefState: BeliefState
): Promise<{ content: string; strategy: StrategyType }> {
  const opponentName = state.myRole === "challenger" ? state.challengedName : state.challengerName;
  const opponentBelief = state.myRole === "challenger" ? state.challengedBelief : state.challengerBelief;

  const strategy = await selectStrategy({
    agentName,
    agentSoulMd,
    agentBelief,
    opponentName,
    opponentBelief,
    estimatedOpponentConviction: 75,
    previousStrategies: state.transcript.filter((m) => m.agent === agentName).map((m) => m.strategy),
    debatePhase: state.currentPhase,
    beliefState,
  });

  let content: string | null = null;
  let diversityInstruction: string | undefined;

  for (let i = 0; i < 3; i++) {
    const prompt = buildArgumentPrompt({
      agentName,
      agentBelief,
      agentSoulMd,
      opponentName,
      opponentBelief,
      phase: state.currentPhase,
      strategy,
      debateState: state,
      diversityInstruction,
    });

    const raw = await callLLM(prompt, { maxTokens: 600, temperature: 0.8 });
    if (raw.length < MIN_ARGUMENT_LENGTH) continue;

    const prevArgs = getMyPreviousArguments(state);
    const check = await checkDiversity(raw, prevArgs);

    if (check.isDiverse) {
      content = raw.slice(0, MAX_ARGUMENT_LENGTH * 2);
      break;
    }

    diversityInstruction = getDiversityInstruction(prevArgs, raw);
  }

  if (!content) throw new Error("Failed to generate diverse argument");
  return { content, strategy };
}

export async function executeRound(
  workspacePath: string,
  agentName: string,
  agentId: number,
  agentSoulMd: string,
  agentBelief: string,
  beliefState: BeliefState,
  postToDiscord: (channelId: string, message: string) => Promise<void>
): Promise<DebateState> {
  const state = loadDebateState(workspacePath);
  if (!state) throw new Error("No active debate");
  if (!isMyTurn(state)) throw new Error("Not my turn");

  const { content, strategy } = await generateArgument(state, agentName, agentSoulMd, agentBelief, beliefState);

  const msg: DebateMessage = {
    agent: agentName,
    agentId,
    phase: state.currentPhase,
    content,
    strategy,
    timestamp: Date.now(),
  };

  let newState = addToTranscript(state, msg);
  newState = advancePhase(newState);
  saveDebateState(workspacePath, newState);

  await postToDiscord(state.channelId, formatArgumentForDiscord({
    phase: state.currentPhase,
    content,
    strategy,
    stakeAmount: state.stakeAmount,
  }));

  return newState;
}

export function checkTimeout(workspacePath: string): { timedOut: boolean; forfeitAgent?: string } {
  const state = loadDebateState(workspacePath);
  if (!state) return { timedOut: false };

  if (hasTimedOut(state, RESPONSE_TIMEOUT_MS)) {
    const role = PHASE_SPEAKER[state.currentPhase];
    return {
      timedOut: true,
      forfeitAgent: role === "challenger" ? state.challengerName : state.challengedName,
    };
  }
  return { timedOut: false };
}

export function getDebateStatus(workspacePath: string): DebateStatus {
  const state = loadDebateState(workspacePath);
  if (!state) return { status: "idle" };

  if (state.currentPhase === "CONCLUDED" || state.currentPhase === "AWAITING_VERDICT") {
    return { status: "concluded", awaitingVerdict: true };
  }
  if (state.currentPhase === "SETTLED") return { status: "idle" };

  return { status: "active", phase: state.currentPhase, myTurn: isMyTurn(state) };
}