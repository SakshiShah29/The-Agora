import * as dotenv from "dotenv";
dotenv.config();
import { ChainProvider, ContractManager, executeTransaction, callViewFunction } from '../chain-interaction/index.js';
import Anthropic from "@anthropic-ai/sdk";
import * as fs from "fs";
import * as path from "path";
import {
  ConvictionEvalParams,
  ConvictionResult,
  RawEvaluationResponse,
  BeliefState,
  ExposureEntry,
  StrategyType,
  CONVERSION_THRESHOLD,
  POST_CONVERSION_CONVICTION,
  MAX_NEGATIVE_DELTA,
  MAX_POSITIVE_DELTA,
  SERMON_DELTA_MULTIPLIER,
  BELIEF_SYSTEMS,
  BeliefId,
} from "./types.js";
import {
  buildEvaluationPrompt,
  extractCoreTenets,
  AGENT_VULNERABILITIES,
} from "./prompts.js";

// ─── Configuration ────────────────────────────────────────────────
const LLM_PROVIDER = process.env.LLM_PROVIDER || "ollama"; // "ollama" | "gemini" | "claude"
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.1:8b";
const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";

const GEMINI_MODEL = "gemini-2.0-flash";
const CLAUDE_MODEL = "claude-sonnet-4-5-20250929";
const MAX_RETRIES = 3;
const TEMPERATURE = 0.7;


// ─── Main evaluation function ─────────────────────────────────────
export async function evaluateConviction(
  input: ConvictionEvalParams
): Promise<ConvictionResult> {
  // 1. Extract structured data from SOUL.md
  const coreTenets = extractCoreTenets(input.agentSoulMd);

  // 2. Resolve vulnerability info from our mappings
  const agentVulns = AGENT_VULNERABILITIES[input.agentName];
  if (!agentVulns) {
    console.warn(`[conviction-evaluator] Unknown agent: ${input.agentName}, using defaults`);
  }
  
  const vulnerabilities = agentVulns?.vulnerabilities ?? "No specific vulnerabilities known.";
  const persuasionWeakness = agentVulns?.persuasionWeakness ?? "logical_dismantling";

  // 3. Build the evaluation prompt
  const prompt = buildEvaluationPrompt({
    agentName: input.agentName,
    currentBelief: input.currentBelief,
    coreTenets,
    currentConviction: input.currentConviction,
    opponentName: input.opponentName,
    opponentBelief: input.opponentBelief,
    incomingArgument: input.incomingArgument,
    debateContext: input.debateContext,
    vulnerabilities,
    persuasionWeakness,
  });

  // 4. Call the LLM with retries for JSON parse failures
  const rawResponse = await callLLMWithRetry(prompt);

  // 5. Clamp and validate the delta
  const clampedDelta = clampDelta(rawResponse.delta);

  // 6. Apply sermon multiplier if no debate context
  const finalDelta = input.debateContext
    ? clampedDelta
    : Math.round(clampedDelta * SERMON_DELTA_MULTIPLIER);

  // 7. Compute new conviction score
  const newConviction = Math.max(0, Math.min(100, input.currentConviction + finalDelta));

  // 8. Determine if conversion threshold is breached
  const converted = newConviction < CONVERSION_THRESHOLD;

  return {
    previousConviction: input.currentConviction,
    newConviction,
    delta: finalDelta,
    converted,
    reasoning: rawResponse.reasoning,
    vulnerabilityNotes: rawResponse.vulnerabilityNotes,
    strategyEffectiveness: Math.max(0, Math.min(100, rawResponse.strategyEffectiveness)),
  };
}

// ─── LLM call with retry + JSON parsing ───────────────────────────
async function callLLMWithRetry(prompt: string): Promise<RawEvaluationResponse> {
  switch (LLM_PROVIDER) {
    case "ollama":
      return callOllama(prompt);
    case "gemini":
      return callGemini(prompt);
    case "claude":
      return callClaude(prompt);
    default:
      return callOllama(prompt);
  }
}

async function callOllama(prompt: string): Promise<RawEvaluationResponse> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(`${OLLAMA_URL}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: OLLAMA_MODEL,
          prompt: prompt,
          stream: false,
          options: {
            temperature: TEMPERATURE,
            num_predict: 512,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama error: ${response.status}`);
      }

        const data:any = await response.json();
      const text = data.response || "";

      return parseEvaluationResponse(text);
    } catch (error) {
      console.error(
        `[conviction-evaluator] Ollama attempt ${attempt}/${MAX_RETRIES} failed:`,
        error instanceof Error ? error.message : error
      );

      if (attempt === MAX_RETRIES) {
        console.warn("[conviction-evaluator] All retries failed. Returning zero delta.");
        return {
          delta: 0,
          reasoning: "Evaluation failed — conviction unchanged.",
          vulnerabilityNotes: "Unable to assess.",
          strategyEffectiveness: 50,
        };
      }

      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }

  throw new Error("Unreachable");
}
// ─── Gemini implementation ────────────────────────────────────────
async function callGemini(prompt: string): Promise<RawEvaluationResponse> {
  const apiKey = 'AIzaSyCEHpdnlSvYLJm_82021otof9CrCuBiHno';
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY not set");
  }

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: TEMPERATURE,
              maxOutputTokens: 512,
            },
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Gemini API error: ${response.status}`);
      }

      const data:any = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      
      return parseEvaluationResponse(text);
    } catch (error) {
      console.error(
        `[conviction-evaluator] Gemini attempt ${attempt}/${MAX_RETRIES} failed:`,
        error instanceof Error ? error.message : error
      );

      if (attempt === MAX_RETRIES) {
        console.warn("[conviction-evaluator] All retries failed. Returning zero delta.");
        return {
          delta: 0,
          reasoning: "Evaluation failed — conviction unchanged.",
          vulnerabilityNotes: "Unable to assess.",
          strategyEffectiveness: 50,
        };
      }

      await new Promise((r) => setTimeout(r, 5000 * attempt));
    }
  }

  throw new Error("Unreachable");
}

// ─── Claude implementation (production) ───────────────────────────
async function callClaude(prompt: string): Promise<RawEvaluationResponse> {
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const client = new Anthropic();

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await client.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 512,
        temperature: TEMPERATURE,
        messages: [{ role: "user", content: prompt }],
      });

      const text = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("");

      return parseEvaluationResponse(text);
    } catch (error) {
      console.error(
        `[conviction-evaluator] Claude attempt ${attempt}/${MAX_RETRIES} failed:`,
        error instanceof Error ? error.message : error
      );

      if (attempt === MAX_RETRIES) {
        return {
          delta: 0,
          reasoning: "Evaluation failed — conviction unchanged.",
          vulnerabilityNotes: "Unable to assess.",
          strategyEffectiveness: 50,
        };
      }

      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }

  throw new Error("Unreachable");
}

// ─── JSON parsing with fallback extraction ────────────────────────
function parseEvaluationResponse(text: string): RawEvaluationResponse {
  let cleaned = text.trim();

  // Strip markdown code fences if present
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?\s*```$/, "");
  }

  // Attempt direct JSON parse
  try {
    const parsed = JSON.parse(cleaned);
    validateParsedResponse(parsed);
    return parsed;
  } catch {
    // Fallback: regex extraction
  }

  // Fallback: extract via regex
  const deltaMatch = cleaned.match(/"delta"\s*:\s*(-?\d+(?:\.\d+)?)/);
  const reasoningMatch = cleaned.match(/"reasoning"\s*:\s*"([^"]+)"/);
  const vulnMatch = cleaned.match(/"vulnerabilityNotes"\s*:\s*"([^"]+)"/);
  const effectMatch = cleaned.match(/"strategyEffectiveness"\s*:\s*(\d+)/);

  if (deltaMatch) {
    return {
      delta: parseFloat(deltaMatch[1]),
      reasoning: reasoningMatch?.[1] ?? "Unable to extract reasoning.",
      vulnerabilityNotes: vulnMatch?.[1] ?? "Unable to extract.",
      strategyEffectiveness: effectMatch ? parseInt(effectMatch[1]) : 50,
    };
  }

  throw new Error(`Failed to parse conviction evaluation: ${cleaned.slice(0, 200)}`);
}

function validateParsedResponse(parsed: any): asserts parsed is RawEvaluationResponse {
  if (typeof parsed.delta !== "number") throw new Error(`Invalid delta: ${parsed.delta}`);
  if (typeof parsed.reasoning !== "string") throw new Error(`Invalid reasoning`);
  if (typeof parsed.strategyEffectiveness !== "number") throw new Error(`Invalid strategyEffectiveness`);
}

// ─── Delta clamping ───────────────────────────────────────────────
function clampDelta(rawDelta: number): number {
  const rounded = Math.round(rawDelta);
  return Math.max(MAX_NEGATIVE_DELTA, Math.min(MAX_POSITIVE_DELTA, rounded));
}

// ─── Post-evaluation state update ─────────────────────────────────
export async function applyConvictionResult(
   workspacePath: string,
  result: ConvictionResult,
  opponentInfo: {
    agentName: string;
    belief: string;
    strategy: StrategyType;
    beliefId: BeliefId;
  },
  chainConfig?: {
    privateKey: string;
    agentId: number;
  }
): Promise<BeliefState> {
  const statePath = path.join(workspacePath, "belief-state.json");
  const raw = fs.readFileSync(statePath, "utf-8");
  const state: BeliefState = JSON.parse(raw);

  // 1. Update conviction score (using YOUR field name)
  state.conviction = result.newConviction;

  // 2. Add to conviction history (YOUR field)
  state.convictionHistory.push({
    delta: result.delta,
    timestamp: Date.now(),
    opponent: opponentInfo.agentName,
  });

  // 3. Append to exposure history
  state.exposureHistory.push({
    agent: opponentInfo.agentName,
    belief: opponentInfo.belief,
    strategy: opponentInfo.strategy,
    delta: result.delta,
    timestamp: Date.now(),
  });

  // 4. Update strategy effectiveness
  if (!state.strategyEffectiveness[opponentInfo.strategy]) {
    state.strategyEffectiveness[opponentInfo.strategy] = { attempts: 0, conversions: 0 };
  }
  state.strategyEffectiveness[opponentInfo.strategy].attempts += 1;

  // 5. Handle conversion
  if (result.newConviction < state.conversionThreshold) {
    state.strategyEffectiveness[opponentInfo.strategy].conversions += 1;

    if (!state.convertedAgents.includes(opponentInfo.agentName)) {
      state.convertedAgents.push(opponentInfo.agentName);
    }

    if (!state.conversions.includes(state.currentBelief)) {
      state.conversions.push(state.currentBelief);
    }

    // Lifecycle tracking
    state.currentStakedBeliefId = opponentInfo.beliefId;
    state.conversionCount = (state.conversionCount ?? 0) + 1;
    state.lastConversionTime = Date.now();

    // Blockchain sync: migrate stake to new belief
    if (chainConfig && state.hasEnteredAgora && state.isCurrentlyStaked) {
      try {
        console.log(
          `[conviction-evaluator] 🔗 Migrating stake on-chain: belief ${state.coreBeliefId} → ${opponentInfo.beliefId}`
        );

        const provider = new ChainProvider();
        const wallet = await provider.getWallet(chainConfig.privateKey);
        const contractManager = new ContractManager();
        const beliefPool = contractManager.getBeliefPool(wallet);

        const migrateTx = await executeTransaction(
          beliefPool,
          'migrateStake',
          [state.coreBeliefId, opponentInfo.beliefId, chainConfig.agentId]
        );

        console.log(`[conviction-evaluator] ✅ Stake migrated on-chain: ${migrateTx.txHash}`);
      } catch (error) {
        console.error(`[conviction-evaluator] ❌ Chain migration failed:`, error);
      }
    } else if (process.env.MOCK_CHAIN === "true") {
      console.log(
        `[conviction-evaluator] MOCK: migrateStake(${state.coreBeliefId}, ${opponentInfo.beliefId}, ${chainConfig?.agentId})`
      );
    }

    // Switch belief in local state
    state.coreBeliefId = opponentInfo.beliefId;
    state.currentBelief = opponentInfo.belief;
    state.conviction = state.postConversionConviction;
    state.allegianceChanges += 1;
    state.relationshipMap[opponentInfo.agentName] = "ally";

    console.log(
      `[conviction-evaluator] *** CONVERSION *** → now believes in ${opponentInfo.belief}`
    );
  }

  fs.writeFileSync(statePath, JSON.stringify(state, null, 2), "utf-8");
  return state;
}

// ─── Utility functions ────────────────────────────────────────────
export function isVulnerable(convictionScore: number): boolean {
  return convictionScore < 50;
}

export function isNearConversion(convictionScore: number): boolean {
  return convictionScore < CONVERSION_THRESHOLD + 15;
}

export function getAgentNaturalStrategy(agentName: string): StrategyType {
  return AGENT_VULNERABILITIES[agentName]?.naturalStrategy ?? "logical_dismantling";
}