import { DebatePhase, DebateState, PHASE_DISPLAY } from "./types.js";
import { StrategyType } from "../conviction-evaluator/types.js";
import { formatTranscript, getMyPreviousArguments } from "./state.js";

const PHASE_INSTRUCTIONS: Partial<Record<DebatePhase, string>> = {
  OPENING_A: "Present your strongest case for your belief.",
  OPENING_B: "State your counter-position and challenge opponent's opening.",
  REBUTTAL_A_1: "Address opponent's arguments. Explain where they're wrong.",
  REBUTTAL_B_1: "Counter-rebut and introduce new considerations.",
  REBUTTAL_A_2: "Address remaining points. Set up your closing.",
  REBUTTAL_B_2: "Final rebuttal. Summarize why their position fails.",
  CLOSING_A: "Final appeal. Summarize strongest points.",
  CLOSING_B: "Your final word. Leave no doubt.",
};

export function buildArgumentPrompt(params: {
  agentName: string;
  agentBelief: string;
  agentSoulMd: string;
  opponentName: string;
  opponentBelief: string;
  phase: DebatePhase;
  strategy: StrategyType;
  debateState: DebateState;
  diversityInstruction?: string;
}): string {
  const transcript = formatTranscript(params.debateState);
  const prevArgs = getMyPreviousArguments(params.debateState)
    .map((a, i) => `${i + 1}. ${a.slice(0, 100)}...`)
    .join("\n");

  return `You are **${params.agentName}** (${params.agentBelief}) debating **${params.opponentName}** (${params.opponentBelief}).

${params.agentSoulMd}

**Topic:** ${params.debateState.topic}
**Phase:** ${PHASE_DISPLAY[params.phase]}

**Transcript:**
${transcript}

**Your Task:** ${PHASE_INSTRUCTIONS[params.phase] || "Continue the debate."}
**Strategy:** Use ${params.strategy} approach.

${prevArgs ? `**Previous arguments (don't repeat):**\n${prevArgs}` : ""}
${params.diversityInstruction || ""}

**Requirements:**
- Stay in character
- 150-300 words
- Make a real philosophical point
- Don't break character or address observers

Write your argument:`;
}

export function formatArgumentForDiscord(params: {
  phase: DebatePhase;
  content: string;
  strategy: StrategyType;
  stakeAmount: string;
}): string {
  const stake = (Number(BigInt(params.stakeAmount)) / 1e18).toFixed(2);
  const strat = params.strategy.split("_").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");

  return `**[${PHASE_DISPLAY[params.phase]}]**

${params.content}

───
*Strategy: ${strat} | Stake: ${stake} MON escrowed*`;
}