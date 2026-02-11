/**
 * Verdict Parser
 *
 * Parses Chronicler verdict announcements from Discord messages.
 * Works with the message format defined in chronicler-verdict-skill/formatting.ts.
 *
 * IMPORTANT: If you change the format in formatting.ts, update the regex here.
 */

// ─── Types ────────────────────────────────────────────────────────

export interface ParsedVerdict {
  isVerdict: boolean;
  debateId?: number;
  winnerName?: string;
  loserName?: string;
  isStalemate?: boolean;
  participants?: [string, string];
}

// ─── Parse verdict from Discord message ───────────────────────────

export function parseVerdictMessage(message: string): ParsedVerdict {
  // Must have the verdict header
  if (!message.includes('⚖️') || !message.includes('VERDICT ANNOUNCED')) {
    return { isVerdict: false };
  }

  // Extract debate ID
  const debateIdMatch = message.match(/Debate #(\d+)/);
  if (!debateIdMatch) {
    return { isVerdict: false };
  }

  const debateId = parseInt(debateIdMatch[1]);

  // Check for winner verdict
  // Format: 🏆 **WinnerName** prevails over LoserName
  const winnerMatch = message.match(/🏆 \*\*(.+?)\*\* prevails over (.+)/);
  if (winnerMatch) {
    const winnerName = winnerMatch[1].trim();
    const loserName = winnerMatch[2].trim();

    return {
      isVerdict: true,
      debateId,
      winnerName,
      loserName,
      isStalemate: false,
      participants: [winnerName, loserName],
    };
  }

  // Check for stalemate verdict
  // Format: ⚖️ **STALEMATE** — AgentA and AgentB fought to a draw
  const stalemateMatch = message.match(/STALEMATE.*?— (.+?) and (.+?) fought/);
  if (stalemateMatch) {
    const agentA = stalemateMatch[1].trim();
    const agentB = stalemateMatch[2].trim();

    return {
      isVerdict: true,
      debateId,
      isStalemate: true,
      participants: [agentA, agentB],
    };
  }

  // Has header but couldn't parse details
  console.warn(`[verdict-parser] Found verdict header but couldn't parse details`);
  return { isVerdict: false };
}

// ─── Determine outcome for a specific agent ───────────────────────

export function determineAgentOutcome(
  verdict: ParsedVerdict,
  agentName: string
): 'win' | 'loss' | 'stalemate' | null {
  if (!verdict.isVerdict || !verdict.participants) {
    return null;
  }

  // Check if this agent was a participant (case-insensitive)
  const wasParticipant = verdict.participants.some(
    (p) => p.toLowerCase() === agentName.toLowerCase()
  );

  if (!wasParticipant) {
    return null; // Not our debate
  }

  // Stalemate
  if (verdict.isStalemate) {
    return 'stalemate';
  }

  // Win or loss
  if (verdict.winnerName?.toLowerCase() === agentName.toLowerCase()) {
    return 'win';
  }

  return 'loss';
}