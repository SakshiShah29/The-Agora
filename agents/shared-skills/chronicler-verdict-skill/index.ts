/**
 * chronicler-verdict-skill - Submit debate verdicts as Chronicler
 *
 * Provides wrapper functions for Chronicler operations on BeliefPool:
 * - Submit debate verdicts (winner_agent_a, winner_agent_b, stalemate)
 * - Query debate details and status
 * - Verify Chronicler permissions
 *
 * IMPORTANT:
 * - Only the designated Chronicler address can submit verdicts
 * - Verdicts settle debate escrows and distribute stakes
 * - Reputation changes are applied based on verdict
 */

import { ChainProvider, ContractManager, executeTransaction, callViewFunction } from '../chain-interaction/index.js';
import { ethers, TransactionReceipt } from 'ethers';
import { formatVerdictAnnouncement } from './formatting.js';
import { getAgentById } from '../decision-loop/agent-registry.js';

// ============================================================================
// TypeScript Interfaces
// ============================================================================

export interface DebateEscrow {
  debateId: number;
  agentAId: number;
  agentBId: number;
  stakeAmount: bigint;
  stakedAmountA: bigint;
  stakedAmountB: bigint;
  createdAt: number;
  status: number; // 0=Pending, 1=Active, 2=SettledWinner, 3=SettledStalemate
}

// ============================================================================
// Write Operations (Chronicler Only)
// ============================================================================

/**
 * Submit debate verdict as Chronicler
 * @param debateId - The debate ID to judge
 * @param verdict - "winner_agent_a" | "winner_agent_b" | "stalemate"
 * @param wallet - Chronicler's wallet (must be set as chroniclerAddress in BeliefPool)
 * @param options - Optional Discord posting callbacks
 * @returns Transaction hash and receipt
 */
export async function submitDebateVerdict(
  debateId: number,
  verdict: 'winner_agent_a' | 'winner_agent_b' | 'stalemate',
  wallet: ethers.Wallet,
  options?: {
    postToDiscord?: (channelId: string, message: string) => Promise<void>;
    announcementChannelId?: string;
  }
): Promise<{ txHash: string; receipt: TransactionReceipt }> {
  console.log(`[chronicler-verdict] Submitting verdict for debate ${debateId}: ${verdict}`);

  const contractManager = new ContractManager();
  const beliefPool = contractManager.getBeliefPool(wallet);

  // 1. Submit verdict on-chain
  const result = await executeTransaction(
    beliefPool,
    'submitDebateVerdict',
    [debateId, verdict],
    {}
  );

  console.log(`[chronicler-verdict] ✅ Verdict submitted on-chain: ${result.txHash}`);

  // 2. Post announcement to Discord (if callbacks provided)
  if (options?.postToDiscord && options?.announcementChannelId) {
    try {
      // Query debate details from blockchain for agent IDs
      const debate = await callViewFunction(
        contractManager.getBeliefPoolReadOnly(),
        'debates',
        [debateId]
      );

      // Look up agent names from registry
      const agentA = getAgentById(Number(debate.agentAId));
      const agentB = getAgentById(Number(debate.agentBId));

      const agentAName = agentA?.agentName || `Agent #${debate.agentAId}`;
      const agentBName = agentB?.agentName || `Agent #${debate.agentBId}`;

      // Format announcement
      const announcement = formatVerdictAnnouncement({
        debateId,
        verdict,
        agentAName,
        agentBName,
        stakeAmount: BigInt(debate.stakeAmount),
        txHash: result.txHash,
      });

      // Post to Discord #announcements
      await options.postToDiscord(options.announcementChannelId, announcement);

      console.log(`[chronicler-verdict] 📢 Verdict announcement posted to Discord`);
    } catch (error) {
      console.error(`[chronicler-verdict] ⚠️ Failed to post Discord announcement:`, error);
      // Don't throw — on-chain verdict succeeded, Discord posting is best-effort
    }
  } else {
    console.log(`[chronicler-verdict] ℹ️ No Discord callbacks provided, skipping announcement`);
  }

  return result;
}

// ============================================================================
// View Functions (Query Debates)
// ============================================================================

/**
 * Get debate escrow details
 * @param debateId - Debate ID
 * @returns DebateEscrow struct with all details
 */
export async function getDebateDetails(debateId: number): Promise<DebateEscrow> {
  const contractManager = new ContractManager();
  const beliefPool = contractManager.getBeliefPoolReadOnly();

  const debate = await callViewFunction(beliefPool, 'debates', [debateId]);

  return {
    debateId: Number(debate.debateId),
    agentAId: Number(debate.agentAId),
    agentBId: Number(debate.agentBId),
    stakeAmount: debate.stakeAmount,
    stakedAmountA: debate.stakedAmountA,
    stakedAmountB: debate.stakedAmountB,
    createdAt: Number(debate.createdAt),
    status: Number(debate.status)
  };
}

/**
 * Get the next debate ID (total debates created + 1)
 * @returns Next debate ID to be assigned
 */
export async function getNextDebateId(): Promise<number> {
  const contractManager = new ContractManager();
  const beliefPool = contractManager.getBeliefPoolReadOnly();

  return Number(await callViewFunction(beliefPool, 'nextDebateId', []));
}

/**
 * Check if caller is the Chronicler
 * @param wallet - Wallet to check
 * @returns True if this wallet is the Chronicler
 */
export async function isChronicler(wallet: ethers.Wallet): Promise<boolean> {
  const contractManager = new ContractManager();
  const beliefPool = contractManager.getBeliefPoolReadOnly();

  const chroniclerAddress = await callViewFunction(beliefPool, 'chroniclerAddress', []);
  return chroniclerAddress.toLowerCase() === wallet.address.toLowerCase();
}

/**
 * Get the Chronicler address
 * @returns Address of the current Chronicler
 */
export async function getChroniclerAddress(): Promise<string> {
  const contractManager = new ContractManager();
  const beliefPool = contractManager.getBeliefPoolReadOnly();

  return await callViewFunction(beliefPool, 'chroniclerAddress', []);
}
