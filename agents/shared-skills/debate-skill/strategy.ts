import { StrategyType, BeliefState } from "../conviction-evaluator/types.js";
import { AGENT_VULNERABILITIES } from "../conviction-evaluator/prompts.js";
import { DebatePhase } from "./types.js";
import { callLLM } from "./llm.js";

const STRATEGY_DESCRIPTIONS: Record<StrategyType, string> = {
  logical_dismantling: "Expose logical flaws and contradictions.",
  emotional_bypass: "Appeal to experience and feelings.",
  social_proof: "Highlight movements toward your position.",
  experiential_demonstration: "Show through concrete examples.",
  absurdist_disruption: "Use humor and irony.",
  stoic_reframe: "Reframe in terms of control and acceptance.",
  existential_confrontation: "Force confrontation with existence.",
  nihilistic_deconstruction: "Strip away assumed values.",
  comedic_deflation: "Use wit to puncture pretension.",
  patient_silence: "Let silence reveal their need.",
  urgent_provocation: "Create urgency, demand confrontation.",
  gentle_inquiry: "Ask piercing questions.",
};

export async function selectStrategy(params: {
  agentName: string;
  agentSoulMd: string;
  agentBelief: string;
  opponentName: string;
  opponentBelief: string;
  estimatedOpponentConviction: number;
  previousStrategies: StrategyType[];
  debatePhase: DebatePhase;
  beliefState: BeliefState;
}): Promise<StrategyType> {
  const natural = AGENT_VULNERABILITIES[params.agentName]?.naturalStrategy;
  const weakness = AGENT_VULNERABILITIES[params.opponentName]?.persuasionWeakness;

  const weights = new Map<StrategyType, number>();
  for (const s of Object.keys(STRATEGY_DESCRIPTIONS) as StrategyType[]) {
    let w = 1.0;
    if (s === weakness) w *= 1.5;
    if (s === natural) w *= 1.2;
    const recent = params.previousStrategies.slice(-3).filter((x) => x === s).length;
    w *= Math.pow(0.6, recent);
    weights.set(s, w);
  }

  // Heuristic 70% of the time
  if (Math.random() < 0.7) {
    const entries = Array.from(weights.entries());
    const total = entries.reduce((sum, [_, w]) => sum + w, 0);
    let r = Math.random() * total;
    for (const [s, w] of entries) {
      r -= w;
      if (r <= 0) return s;
    }
    return natural ?? "logical_dismantling";
  }

  // LLM selection
  const top5 = Array.from(weights.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([s]) => s);

  const prompt = `You are ${params.agentName} debating ${params.opponentName}.
Phase: ${params.debatePhase}
Choose strategy from: ${top5.join(", ")}
Respond with ONLY the strategy name.`;

  try {
    const resp = await callLLM(prompt, { maxTokens: 50, temperature: 0.3 });
    const cleaned = resp.trim().toLowerCase().replace(/[^a-z_]/g, "");
    if (top5.includes(cleaned as StrategyType)) return cleaned as StrategyType;
  } catch {}

  return top5[0];
}