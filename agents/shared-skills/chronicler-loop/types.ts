/**
 * Chronicler Loop Types
 *
 * Type definitions specific to the Chronicler's autonomous verdict processing loop.
 */

/**
 * Verdict determination result from LLM analysis
 */
export interface VerdictAnalysisResult {
  verdict: 'winner_agent_a' | 'winner_agent_b' | 'stalemate';
  winnerName?: string;
  loserName?: string;
  reasoning: string;
  scores?: {
    agentA: {
      coherence: number;
      evidence: number;
      engagement: number;
      depth: number;
    };
    agentB: {
      coherence: number;
      evidence: number;
      engagement: number;
      depth: number;
    };
  };
}

/**
 * Debate that needs verdict processing
 */
export interface PendingDebate {
  debateId: number;
  agentAId: number;
  agentBId: number;
  agentAName: string;
  agentBName: string;
  stakeAmount: bigint;
  createdAt: number;
}

/**
 * Debate transcript from Discord
 */
export interface DebateTranscript {
  debateId: number;
  challengerName: string;
  defendantName: string;
  topic: string;
  arguments: Array<{
    speaker: string;
    phase: 'opening' | 'rebuttal' | 'closing';
    content: string;
    timestamp: number;
  }>;
}

/**
 * Configuration for Chronicler loop
 */
export interface ChroniclerConfig {
  cycleInterval: number; // Milliseconds between checks (default: 60000)
  enableLogging: boolean;
  llmTimeout: number; // Timeout for LLM verdict analysis (default: 30000ms)
}
