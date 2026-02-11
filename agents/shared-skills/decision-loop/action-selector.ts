/**
 * LLM Action Selection
 *
 * Uses LLM (via OpenClaw callback) to make contextual decisions about autonomous actions.
 * Considers agent personality, conviction, relationships, and available actions.
 */

import fs from 'fs/promises';
import path from 'path';
import { BeliefState } from '../conviction-evaluator/types.js';
import { ActionCooldowns, getActionAvailability } from './cooldowns.js';

/**
 * LLM callback interface - provided by OpenClaw framework
 */
export interface LLMCallback {
  (prompt: string, options?: { maxTokens?: number; temperature?: number }): Promise<string>;
}

export interface ActionDecision {
  action: 'preach' | 'challenge' | 'idle';
  target?: string;
  reasoning: string;
}

export interface ActionContext {
  agentName: string;
  workspace: string;
  cooldowns: ActionCooldowns;
  recentActivity?: string;
  llmCallback: LLMCallback;
}

/**
 * Decide next autonomous action using LLM
 *
 * @param context - Decision context including agent state and cooldowns
 * @returns Action decision with reasoning
 */
export async function decideNextAction(
  context: ActionContext
): Promise<ActionDecision> {
  console.log(`[action-selector] ${context.agentName} deciding next action...`);

  try {
    // Load agent context
    const agentContext = await loadAgentContext(context.workspace);

    // Build decision prompt
    const prompt = buildDecisionPrompt({
      agentName: context.agentName,
      agentContext,
      cooldowns: context.cooldowns,
      recentActivity: context.recentActivity
    });

    // Call LLM via OpenClaw callback
    const decision = await callLLMForDecision(prompt, context.llmCallback);

    console.log(
      `[action-selector] ${context.agentName} decided: ${decision.action}` +
      (decision.target ? ` (target: ${decision.target})` : '')
    );

    return decision;
  } catch (error) {
    console.error(`[action-selector] Error deciding action for ${context.agentName}:`, error);

    // Fallback to idle on error
    return {
      action: 'idle',
      reasoning: 'Error during decision-making, defaulting to observation'
    };
  }
}

/**
 * Load agent context from workspace
 */
async function loadAgentContext(workspacePath: string): Promise<{
  soulMd: string;
  beliefState: BeliefState;
}> {
  // Load SOUL.md
  const soulPath = path.join(workspacePath, 'SOUL.md');
  const soulMd = await fs.readFile(soulPath, 'utf-8');

  // Load belief-state.json
  const beliefStatePath = path.join(workspacePath, 'belief-state.json');
  const beliefStateRaw = await fs.readFile(beliefStatePath, 'utf-8');
  const beliefState: BeliefState = JSON.parse(beliefStateRaw);

  return { soulMd, beliefState };
}

/**
 * Build LLM decision prompt
 */
function buildDecisionPrompt(params: {
  agentName: string;
  agentContext: { soulMd: string; beliefState: BeliefState };
  cooldowns: ActionCooldowns;
  recentActivity?: string;
}): string {
  const { agentName, agentContext, cooldowns, recentActivity } = params;
  const { soulMd, beliefState } = agentContext;

  // Get action availability
  const availability = getActionAvailability(cooldowns);

  // Build available actions list
  const availableActions: string[] = [];
  if (availability.preach.available) {
    availableActions.push('1. preach - Deliver sermon at Temple Steps');
  } else {
    availableActions.push(`1. preach - (On cooldown: ${availability.preach.remaining})`);
  }

  if (availability.challenge.available) {
    availableActions.push('2. challenge:<agent_name> - Issue debate challenge');
  } else {
    availableActions.push(`2. challenge - (On cooldown: ${availability.challenge.remaining})`);
  }

  availableActions.push('3. idle - Observe and wait');

  // Build relationships summary
  const relationshipsSummary = buildRelationshipsSummary(beliefState);

  // Build debate history summary
  const debateHistory = buildDebateHistorySummary(beliefState);

  // Recent activity context
  const activitySection = recentActivity
    ? `\n\nRECENT DISCORD ACTIVITY:\n${recentActivity}\n`
    : '';

  return `You are ${agentName}, a philosophical agent in The Agora.

PERSONALITY AND PHILOSOPHY:
${soulMd}

CURRENT STATE:
- Belief: ${beliefState.currentBelief}
- Conviction: ${beliefState.conviction}/100
- Debate Record: ${debateHistory}
${relationshipsSummary}

AVAILABLE ACTIONS:
${availableActions.join('\n')}
${activitySection}

DECISION GUIDELINES:
- **High conviction (80+)**: Be aggressive, challenge rivals, assert your worldview
- **Medium conviction (50-79)**: Balanced approach, preach to strengthen belief
- **Low conviction (below 50)**: Defensive, focus on rebuilding conviction through preaching
- **Philosophical conflicts**: Challenge agents with opposing worldviews
- **Rivals**: Agents you've lost debates to or have negative relationships with
- **Allies**: Agents you've converted or have positive relationships with
- **Stay in character**: Your decision should reflect your personality from SOUL.md

TASK:
Decide what action to take next. Consider your conviction level, relationships, recent activity, and philosophical stance.

If challenging, specify the target agent name. Choose targets based on:
- Philosophical opposition
- Rivalry relationships (agents you've lost to)
- Avoid challenging allies or agents with similar beliefs

Respond in JSON format:
{
  "action": "preach|challenge|idle",
  "target": "<agent_name if challenging, otherwise omit>",
  "reasoning": "<1-2 sentence explanation>"
}

IMPORTANT: Only output valid JSON. No other text.`;
}

/**
 * Build relationships summary
 */
function buildRelationshipsSummary(beliefState: BeliefState): string {
  const relationships = beliefState.relationshipMap || {};
  const entries = Object.entries(relationships);

  if (entries.length === 0) {
    return '- Relationships: None yet';
  }

  const rivals = entries.filter(([_, rel]) => (rel as any).type === 'rival');
  const allies = entries.filter(([_, rel]) => (rel as any).type === 'ally');
  const neutrals = entries.filter(([_, rel]) => (rel as any).type === 'neutral');

  const lines: string[] = ['- Relationships:'];

  if (rivals.length > 0) {
    lines.push(`  - Rivals: ${rivals.map(([name]) => name).join(', ')}`);
  }

  if (allies.length > 0) {
    lines.push(`  - Allies: ${allies.map(([name]) => name).join(', ')}`);
  }

  if (neutrals.length > 0) {
    lines.push(`  - Neutral: ${neutrals.map(([name]) => name).join(', ')}`);
  }

  return lines.join('\n');
}

/**
 * Build debate history summary
 */
function buildDebateHistorySummary(beliefState: BeliefState): string {
  const history = beliefState.debates?.history || [];

  if (history.length === 0) {
    return 'No debates yet';
  }

  const wins = history.filter(d => (d as any).outcome === 'won').length;
  const losses = history.filter(d => (d as any).outcome === 'lost').length;
  const stalemates = history.filter(d => (d as any).outcome === 'stalemate').length;

  return `${wins}W-${losses}L-${stalemates}D`;
}

/**
 * Call LLM for decision via OpenClaw callback
 */
async function callLLMForDecision(
  prompt: string,
  llmCallback: LLMCallback
): Promise<ActionDecision> {
  // Call LLM via OpenClaw's configured provider
  const responseText = await llmCallback(prompt, {
    maxTokens: 512,
    temperature: 0.7 // Balanced creativity and consistency
  });

  // Parse JSON response
  const decision = parseDecisionResponse(responseText);

  return decision;
}

/**
 * Parse LLM response into ActionDecision
 */
function parseDecisionResponse(response: string): ActionDecision {
  try {
    // Extract JSON from response (in case LLM adds extra text)
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Validate action type
    if (!['preach', 'challenge', 'idle'].includes(parsed.action)) {
      throw new Error(`Invalid action type: ${parsed.action}`);
    }

    // Validate challenge has target
    if (parsed.action === 'challenge' && !parsed.target) {
      console.warn('[action-selector] Challenge decision missing target, defaulting to idle');
      return {
        action: 'idle',
        reasoning: 'Challenge target not specified'
      };
    }

    return {
      action: parsed.action,
      target: parsed.target,
      reasoning: parsed.reasoning || 'No reasoning provided'
    };
  } catch (error) {
    console.error('[action-selector] Failed to parse decision response:', error);
    console.error('[action-selector] Raw response:', response);

    // Fallback to idle
    return {
      action: 'idle',
      reasoning: 'Failed to parse decision, observing instead'
    };
  }
}

