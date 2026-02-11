/**
 * preach-skill - Sermon generation and delivery
 *
 * Generates philosophical sermons for agents to deliver at the Temple Steps.
 * Uses agent's SOUL.md for personality and belief context.
 */

import fs from "fs/promises";
import path from "path";
import Anthropic from "@anthropic-ai/sdk";
import { SermonParams, SermonResult, SermonType, SermonContext } from "./types.js";
import { buildSermonPrompt, PHASE_SPECIFIC_GUIDANCE } from "./prompts.js";
import { BeliefState } from "../conviction-evaluator/types.js";

/**
 * Deliver a sermon at the Temple Steps
 * @param params - Sermon parameters including workspace and sermon type
 * @returns Sermon result with content and metadata
 */
export async function deliverSermon(params: SermonParams): Promise<SermonResult> {
  console.log(`[preach-skill] Preparing ${params.sermonType} sermon...`);

  // Load agent context
  const context = await loadAgentContext(params.agentWorkspace, params.sermonType, params.audienceContext);

  // Generate sermon using LLM
  const sermonContent = await generateSermon(context);

  // Validate sermon
  validateSermon(sermonContent);

  // Build result
  const result: SermonResult = {
    content: sermonContent,
    type: params.sermonType,
    strategy: context.primaryStrategy,
    targetedBeliefs: params.targetBeliefs || identifyTargetBeliefs(context.agentBelief),
    generatedAt: Date.now(),
    agentName: context.agentName,
    agentBelief: context.agentBelief
  };

  console.log(`[preach-skill] ✅ ${params.sermonType} sermon generated (${sermonContent.length} chars)`);

  return result;
}

/**
 * Format sermon for Discord posting
 * @param sermon - Sermon result to format
 * @returns Formatted Discord message
 */
export function formatSermonForDiscord(sermon: SermonResult): string {
  const sermonTypeEmoji: Record<SermonType, string> = {
    parable: "📖",
    scripture: "📜",
    prophecy: "🔮",
    testimony: "💭",
    exhortation: "⚡"
  };

  const emoji = sermonTypeEmoji[sermon.type];
  const typeLabel = sermon.type.toUpperCase();

  return `${emoji} **SERMON — ${typeLabel}**

${sermon.content}

*— ${sermon.agentName}, Follower of ${sermon.agentBelief}*`;
}

/**
 * Load agent context from workspace
 */
async function loadAgentContext(
  workspacePath: string,
  sermonType: SermonType,
  audienceContext?: string
): Promise<SermonContext> {
  // Load SOUL.md
  const soulPath = path.join(workspacePath, "SOUL.md");
  const soulMd = await fs.readFile(soulPath, "utf-8");

  // Extract agent name from SOUL.md (first # heading)
  const nameMatch = soulMd.match(/^#\s+(.+)$/m);
  const agentName = nameMatch ? nameMatch[1].trim() : "Unknown";

  // Load belief-state.json
  const beliefStatePath = path.join(workspacePath, "belief-state.json");
  const beliefStateRaw = await fs.readFile(beliefStatePath, "utf-8");
  const beliefState: BeliefState = JSON.parse(beliefStateRaw);

  // Extract primary strategy from SOUL.md
  const strategyMatch = soulMd.match(/Primary Strategy[:\s]+(\w+)/i);
  const primaryStrategy = strategyMatch ? strategyMatch[1] : "logical";

  return {
    agentName,
    agentBelief: beliefState.currentBelief,
    agentSoulMd: soulMd,
    currentConviction: beliefState.conviction,
    primaryStrategy,
    sermonType,
    audienceContext
  };
}

/**
 * Generate sermon content using LLM
 */
async function generateSermon(context: SermonContext): Promise<string> {
  const prompt = buildSermonPrompt({
    agentName: context.agentName,
    agentBelief: context.agentBelief,
    agentSoulMd: context.agentSoulMd,
    sermonType: context.sermonType,
    primaryStrategy: context.primaryStrategy,
    audienceContext: context.audienceContext
  });

  // Add phase-specific guidance
  const guidance = PHASE_SPECIFIC_GUIDANCE[context.sermonType];
  const fullPrompt = `${prompt}\n\nGuidance for ${context.sermonType}:\n${guidance}`;

  // Call Anthropic API
  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY
  });

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    temperature: 0.8, // Higher creativity for sermons
    messages: [
      {
        role: "user",
        content: fullPrompt
      }
    ]
  });

  const content = message.content[0];
  if (content.type !== "text") {
    throw new Error("Unexpected response type from LLM");
  }

  return content.text.trim();
}

/**
 * Validate sermon meets requirements
 */
function validateSermon(sermon: string): void {
  const wordCount = sermon.split(/\s+/).length;

  if (wordCount < 100) {
    throw new Error(`Sermon too short: ${wordCount} words (minimum 100)`);
  }

  if (wordCount > 350) {
    console.warn(`[preach-skill] ⚠️ Sermon is long: ${wordCount} words (recommended max 300)`);
  }

  // Check for character breaks (simple heuristics)
  const breakPatterns = [
    /\bsimulation\b/i,
    /\bobserver\b/i,
    /\bAI\b/i,
    /\bLLM\b/i,
    /\bprompt\b/i,
    /here's my/i,
    /as an AI/i
  ];

  for (const pattern of breakPatterns) {
    if (pattern.test(sermon)) {
      throw new Error(`Sermon breaks character: contains "${pattern}"`);
    }
  }
}

/**
 * Identify which beliefs this sermon might undermine
 */
function identifyTargetBeliefs(agentBelief: string): string[] {
  const allBeliefs = ["Nihilism", "Existentialism", "Absurdism", "Stoicism"];

  // Target all beliefs except the agent's own
  return allBeliefs.filter(belief => belief !== agentBelief);
}

/**
 * Post sermon to Discord channel
 * @param channelId - Discord channel ID
 * @param sermon - Sermon to post
 * @param postToDiscord - Discord posting function
 */
export async function postSermon(
  channelId: string,
  sermon: SermonResult,
  postToDiscord: (channelId: string, message: string) => Promise<void>
): Promise<void> {
  const formatted = formatSermonForDiscord(sermon);
  await postToDiscord(channelId, formatted);
  console.log(`[preach-skill] ✅ Sermon posted to Discord channel ${channelId}`);
}

/**
 * Record sermon in agent's history
 * Updates belief-state.json with sermon delivery record
 */
export async function recordSermon(
  workspacePath: string,
  sermon: SermonResult
): Promise<void> {
  const beliefStatePath = path.join(workspacePath, "belief-state.json");
  const beliefStateRaw = await fs.readFile(beliefStatePath, "utf-8");
  const beliefState: BeliefState = JSON.parse(beliefStateRaw);

  // Initialize sermons array if it doesn't exist
  if (!beliefState.sermonsDelivered) {
    (beliefState as any).sermonsDelivered = [];
  }

  // Add sermon record
  (beliefState as any).sermonsDelivered.push({
    type: sermon.type,
    deliveredAt: sermon.generatedAt,
    conviction: beliefState.conviction
  });

  // Write back
  await fs.writeFile(beliefStatePath, JSON.stringify(beliefState, null, 2), "utf-8");
  console.log(`[preach-skill] ✅ Sermon recorded in belief-state.json`);
}
