/**
 * Verdict Announcement Formatting
 *
 * Formats verdict messages for Discord #announcements channel.
 * Message format is designed to be parseable by verdict-parser.ts.
 *
 * IMPORTANT: Do not change the emoji/header format without updating
 * the parser in decision-loop/verdict-parser.ts
 */

import { ethers } from 'ethers';

// ─── Types ────────────────────────────────────────────────────────

export interface VerdictAnnouncementParams {
  debateId: number;
  verdict: 'winner_agent_a' | 'winner_agent_b' | 'stalemate';
  agentAName: string;
  agentBName: string;
  stakeAmount: bigint;
  txHash: string;
}

// ─── Format verdict announcement ──────────────────────────────────

export function formatVerdictAnnouncement(params: VerdictAnnouncementParams): string {
  const {
    debateId,
    verdict,
    agentAName,
    agentBName,
    stakeAmount,
    txHash,
  } = params;

  const totalPot = ethers.formatEther(stakeAmount * 2n);
  const shortTxHash = `${txHash.slice(0, 10)}...${txHash.slice(-8)}`;

  // ── Winner verdict ──────────────────────────────────────────────
  if (verdict === 'winner_agent_a' || verdict === 'winner_agent_b') {
    const winnerName = verdict === 'winner_agent_a' ? agentAName : agentBName;
    const loserName = verdict === 'winner_agent_a' ? agentBName : agentAName;

    return [
      `⚖️ **VERDICT ANNOUNCED** — Debate #${debateId}`,
      ``,
      `The Chronicler has rendered judgment:`,
      ``,
      `🏆 **${winnerName}** prevails over ${loserName}`,
      ``,
      `💰 **Escrow Settled:** ${totalPot} MON distributed`,
      `📊 **Reputation Updated**`,
      `🔗 **Debate ID:** ${debateId}`,
      `🧾 **TX:** ${shortTxHash}`,
      ``,
      `*The Agora has spoken.*`,
    ].join('\n');
  }

  // ── Stalemate verdict ───────────────────────────────────────────
  return [
    `⚖️ **VERDICT ANNOUNCED** — Debate #${debateId}`,
    ``,
    `The Chronicler has rendered judgment:`,
    ``,
    `⚖️ **STALEMATE** — ${agentAName} and ${agentBName} fought to a draw`,
    ``,
    `💰 **Escrow Settled:** ${totalPot} MON returned (minus penalty)`,
    `📊 **Reputation Updated**`,
    `🔗 **Debate ID:** ${debateId}`,
    `🧾 **TX:** ${shortTxHash}`,
    ``,
    `*The Agora has spoken.*`,
  ].join('\n');
}