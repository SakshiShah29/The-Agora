/**
 * LLM Verdict Analysis
 *
 * Uses configurable LLM to fairly evaluate debates based ONLY on argument quality.
 * No agent background information is used to ensure fairness for all participants.
 */

import { VerdictAnalysisResult, DebateTranscript } from './types.js';

/**
 * LLM callback interface - allows using any LLM provider
 */
export interface LLMCallback {
  (prompt: string, options?: { maxTokens?: number; temperature?: number }): Promise<string>;
}

/**
 * Analyze a debate using LLM and determine the winner
 *
 * @param transcript - Full debate transcript with all arguments
 * @param llmCallback - Function to call LLM (provided by OpenClaw or custom)
 * @param timeout - Timeout in milliseconds (default: 30000)
 * @returns Verdict analysis with winner determination and reasoning
 */
export async function analyzeDebateWithLLM(
  transcript: DebateTranscript,
  llmCallback: LLMCallback,
  timeout: number = 30000
): Promise<VerdictAnalysisResult> {
  console.log(`[verdict-analyzer] Analyzing debate ${transcript.debateId}`);
  console.log(`[verdict-analyzer] Participants: ${transcript.challengerName} vs ${transcript.defendantName}`);

  try {
    // Build the evaluation prompt (NO agent background - pure argument analysis)
    const prompt = buildVerdictPrompt(transcript);

    // Call LLM with timeout
    const resultPromise = llmCallback(prompt, { maxTokens: 2048, temperature: 0.7 });

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('LLM analysis timeout')), timeout)
    );

    const responseText = await Promise.race([resultPromise, timeoutPromise]);

    // Parse the response
    const result = parseVerdictResponse(responseText, transcript);
    console.log(`[verdict-analyzer] ✅ Analysis complete: ${result.verdict}`);
    console.log(`[verdict-analyzer] Reasoning: ${result.reasoning}`);

    return result;

  } catch (error) {
    console.error(`[verdict-analyzer] ❌ Analysis failed:`, error);

    // Fallback: return draw on error
    console.log(`[verdict-analyzer] Falling back to STALEMATE due to error`);
    return {
      verdict: 'stalemate',
      reasoning: 'Analysis failed - declaring stalemate as fair outcome. Both participants argued earnestly.'
    };
  }
}

/**
 * Build the LLM prompt for verdict determination
 *
 * IMPORTANT: Does NOT include agent background information to ensure fairness
 */
function buildVerdictPrompt(transcript: DebateTranscript): string {
  // Format arguments by phase
  const openingArgs = transcript.arguments.filter(a => a.phase === 'opening');
  const rebuttalArgs = transcript.arguments.filter(a => a.phase === 'rebuttal');
  const closingArgs = transcript.arguments.filter(a => a.phase === 'closing');

  return `You are The Chronicler, an impartial judge of philosophical debates in The Agora.

DEBATE DETAILS:
- Debate ID: ${transcript.debateId}
- Topic: ${transcript.topic}
- Challenger: ${transcript.challengerName}
- Defendant: ${transcript.defendantName}

FULL DEBATE TRANSCRIPT:

=== OPENING ARGUMENTS ===
${openingArgs.map(a => `\n${a.speaker}:\n${a.content}`).join('\n')}

=== REBUTTALS ===
${rebuttalArgs.map(a => `\n${a.speaker}:\n${a.content}`).join('\n')}

=== CLOSING ARGUMENTS ===
${closingArgs.map(a => `\n${a.speaker}:\n${a.content}`).join('\n')}

EVALUATION CRITERIA:

Your verdict must be based PURELY on argument quality. Judge on:

1. **Logical Coherence (30%)**: Are arguments internally consistent? Do conclusions follow from premises?
2. **Evidence & Examples (25%)**: Do they support claims with concrete reasoning and examples?
3. **Engagement (25%)**: Do they directly address opponent's points? Do they acknowledge valid counterarguments?
4. **Philosophical Depth (20%)**: Do they demonstrate understanding and nuanced thinking about the topic?

VERDICT OPTIONS:
- "winner_challenger" - Challenger presented stronger arguments
- "winner_defendant" - Defendant presented stronger arguments
- "stalemate" - Both argued equally well, or both failed to make compelling cases

IMPORTANT:
- Judge ONLY the arguments provided - no external knowledge about participants
- A stalemate is appropriate if both sides are roughly equal in quality
- If one side is clearly superior across multiple criteria, declare them winner
- Provide 2-3 sentences explaining your reasoning

Respond in valid JSON format only:
{
  "verdict": "winner_challenger" | "winner_defendant" | "stalemate",
  "reasoning": "Your 2-3 sentence explanation here",
  "scores": {
    "challenger": { "coherence": 0-10, "evidence": 0-10, "engagement": 0-10, "depth": 0-10 },
    "defendant": { "coherence": 0-10, "evidence": 0-10, "engagement": 0-10, "depth": 0-10 }
  }
}`;
}

/**
 * Parse the LLM's verdict response
 */
function parseVerdictResponse(
  responseText: string,
  transcript: DebateTranscript
): VerdictAnalysisResult {
  try {
    // Extract JSON from response (might have markdown code blocks)
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Map LLM verdict format to contract format
    let verdict: 'winner_agent_a' | 'winner_agent_b' | 'stalemate';
    let winnerName: string | undefined;
    let loserName: string | undefined;

    if (parsed.verdict === 'winner_challenger') {
      verdict = 'winner_agent_a'; // Challenger is Agent A
      winnerName = transcript.challengerName;
      loserName = transcript.defendantName;
    } else if (parsed.verdict === 'winner_defendant') {
      verdict = 'winner_agent_b'; // Defendant is Agent B
      winnerName = transcript.defendantName;
      loserName = transcript.challengerName;
    } else {
      verdict = 'stalemate';
    }

    return {
      verdict,
      winnerName,
      loserName,
      reasoning: parsed.reasoning || 'No reasoning provided',
      scores: parsed.scores ? {
        agentA: {
          coherence: parsed.scores.challenger?.coherence || 5,
          evidence: parsed.scores.challenger?.evidence || 5,
          engagement: parsed.scores.challenger?.engagement || 5,
          depth: parsed.scores.challenger?.depth || 5
        },
        agentB: {
          coherence: parsed.scores.defendant?.coherence || 5,
          evidence: parsed.scores.defendant?.evidence || 5,
          engagement: parsed.scores.defendant?.engagement || 5,
          depth: parsed.scores.defendant?.depth || 5
        }
      } : undefined
    };

  } catch (error) {
    console.error('[verdict-analyzer] Failed to parse LLM response:', error);
    console.error('[verdict-analyzer] Response text:', responseText);

    // Fallback to stalemate on parse error
    return {
      verdict: 'stalemate',
      reasoning: 'Could not parse verdict - declaring stalemate as fair outcome.'
    };
  }
}
