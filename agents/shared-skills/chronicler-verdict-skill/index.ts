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
 * @returns Transaction hash and receipt
 */
export async function submitDebateVerdict(
  debateId: number,
  verdict: 'winner_agent_a' | 'winner_agent_b' | 'stalemate',
  wallet: ethers.Wallet
): Promise<{ txHash: string; receipt: TransactionReceipt }> {
  console.log(`[chronicler-verdict] Submitting verdict for debate ${debateId}: ${verdict}`);

  const contractManager = new ContractManager();
  const beliefPool = contractManager.getBeliefPool(wallet);

  const result = await executeTransaction(
    beliefPool,
    'submitDebateVerdict',
    [debateId, verdict],
    {}
  );

  console.log(`[chronicler-verdict] ✅ Verdict submitted: ${result.txHash}`);

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
