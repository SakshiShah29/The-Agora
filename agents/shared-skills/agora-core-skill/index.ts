/**
 * agora-core-skill - Core operations for The Agora
 *
 * Provides wrapper functions for BeliefPool and AgoraGate contracts:
 *
 * AGORA ENTRY:
 * - Enter The Agora (pay entry fee via AgoraGate)
 * - Check entry status and timestamps
 *
 * BELIEF STAKING:
 * - Stake MON on beliefs (4 fixed: Nihilism, Existentialism, Absurdism, Stoicism)
 * - Unstake MON from beliefs
 * - Migrate stakes between beliefs
 * - Query belief positions, stakes, and reputation
 *
 * DEBATE ESCROW:
 * - Create and match debate escrows
 * - Query debate details and status
 *
 * IMPORTANT CONTRACT CHANGES:
 * - Reputation is now tracked in BeliefPool contract (agentReputation mapping)
 * - agentCurrentBelief mapping enforces one-belief-at-a-time staking
 * - Full unstake triggers automatic Agora exit via AgoraGate.exitAgent()
 * - 4 Fixed Beliefs: 1=Nihilism, 2=Existentialism, 3=Absurdism, 4=Stoicism
 */

import { ChainProvider, ContractManager, executeTransaction, callViewFunction } from '../chain-interaction/index.js';
import { ethers, TransactionReceipt } from 'ethers';

// ============================================================================
// TypeScript Interfaces
// ============================================================================

export interface BeliefPosition {
  id: number;
  name: string;
  descriptionHash: string;
  totalStaked: bigint;
  adherentCount: number;
}

export interface StakeInfo {
  amount: bigint;
  stakedAt: number;
  beliefId: number;
}

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
// Write Operations (State-Changing Transactions)
// ============================================================================

/**
 * Stake MON on a belief for a specific agent
 * NOTE: First stake for an agent initializes reputation to 60
 * @param agentId - The agent's ID
 * @param beliefId - The belief ID to stake on (1=Nihilism, 2=Existentialism, 3=Absurdism, 4=Stoicism)
 * @param amount - Amount of MON to stake (in wei, use ethers.parseEther() for ether amounts)
 * @param wallet - Wallet to sign the transaction
 * @returns Transaction hash and receipt
 */
export async function stakeOnBelief(
  agentId: number,
  beliefId: number,
  amount: bigint,
  wallet: ethers.Wallet
): Promise<{ txHash: string; receipt: TransactionReceipt }> {
  console.log(`[agora-core] Staking ${ethers.formatEther(amount)} MON on belief ${beliefId} for agent ${agentId}`);

  const contractManager = new ContractManager();
  const beliefPool = contractManager.getBeliefPool(wallet);

  const result = await executeTransaction(
    beliefPool,
    'stake',
    [beliefId, agentId],
    { value: amount }
  );

  console.log(`[agora-core] ✅ Stake successful: ${result.txHash}`);

  return result;
}

/**
 * Unstake MON from a belief for a specific agent
 * NOTE: Full unstake (all MON) triggers automatic Agora exit via AgoraGate.exitAgent()
 * @param agentId - The agent's ID
 * @param beliefId - The belief ID to unstake from
 * @param amount - Amount of MON to unstake (in wei)
 * @param wallet - Wallet to sign the transaction
 * @returns Transaction hash and receipt
 */
export async function unstakeFromBelief(
  agentId: number,
  beliefId: number,
  amount: bigint,
  wallet: ethers.Wallet
): Promise<{ txHash: string; receipt: TransactionReceipt }> {
  console.log(`[agora-core] Unstaking ${ethers.formatEther(amount)} MON from belief ${beliefId} for agent ${agentId}`);

  const contractManager = new ContractManager();
  const beliefPool = contractManager.getBeliefPool(wallet);

  const result = await executeTransaction(
    beliefPool,
    'unstake',
    [beliefId, amount, agentId],
    {}
  );

  console.log(`[agora-core] ✅ Unstake successful: ${result.txHash}`);

  return result;
}

/**
 * Migrate all stake from one belief to another for a specific agent
 * NOTE: Updates agentCurrentBelief mapping to reflect new belief
 * @param agentId - The agent's ID
 * @param fromBeliefId - The belief ID to migrate from
 * @param toBeliefId - The belief ID to migrate to
 * @param wallet - Wallet to sign the transaction
 * @returns Transaction hash and receipt
 */
export async function migrateStake(
  agentId: number,
  fromBeliefId: number,
  toBeliefId: number,
  wallet: ethers.Wallet
): Promise<{ txHash: string; receipt: TransactionReceipt }> {
  console.log(`[agora-core] Migrating stake from belief ${fromBeliefId} to belief ${toBeliefId} for agent ${agentId}`);

  const contractManager = new ContractManager();
  const beliefPool = contractManager.getBeliefPool(wallet);

  const result = await executeTransaction(
    beliefPool,
    'migrateStake',
    [fromBeliefId, toBeliefId, agentId],
    {}
  );

  console.log(`[agora-core] ✅ Migration successful: ${result.txHash}`);

  return result;
}

/**
 * Create a debate escrow between two agents
 * @param agentAId - The challenger agent's ID
 * @param agentBId - The opponent agent's ID
 * @param stakeAmount - Amount of MON to stake (in wei)
 * @param wallet - Wallet to sign the transaction
 * @returns Debate ID and transaction details
 */
export async function createDebateEscrow(
  agentAId: number,
  agentBId: number,
  stakeAmount: bigint,
  wallet: ethers.Wallet
): Promise<{ debateId: number; txHash: string; receipt: TransactionReceipt }> {
  console.log(`[agora-core] Creating debate escrow: Agent ${agentAId} vs Agent ${agentBId}, stake: ${ethers.formatEther(stakeAmount)} MON`);

  const contractManager = new ContractManager();
  const beliefPool = contractManager.getBeliefPool(wallet);

  const result = await executeTransaction(
    beliefPool,
    'createDebateEscrow',
    [agentAId, agentBId],
    { value: stakeAmount }
  );

  // Parse the DebateEscrowCreated event to extract debateId
  const debateEscrowCreatedEvent = result.receipt.logs.find(
    (log: any) => {
      try {
        const parsed = beliefPool.interface.parseLog({ topics: log.topics as string[], data: log.data });
        return parsed?.name === 'DebateEscrowCreated';
      } catch {
        return false;
      }
    }
  );

  if (!debateEscrowCreatedEvent) {
    throw new Error('DebateEscrowCreated event not found in transaction receipt');
  }

  const parsedEvent = beliefPool.interface.parseLog({
    topics: debateEscrowCreatedEvent.topics as string[],
    data: debateEscrowCreatedEvent.data
  });

  const debateId = Number(parsedEvent?.args[0]);

  console.log(`[agora-core] ✅ Debate escrow created: Debate ID ${debateId}, tx: ${result.txHash}`);

  return {
    debateId,
    txHash: result.txHash,
    receipt: result.receipt
  };
}

/**
 * Match an existing debate escrow (accept a challenge)
 * @param debateId - The debate ID to match
 * @param stakeAmount - Amount of MON to stake (must match challenger's stake, in wei)
 * @param wallet - Wallet to sign the transaction
 * @returns Transaction hash and receipt
 */
export async function matchDebateEscrow(
  debateId: number,
  stakeAmount: bigint,
  wallet: ethers.Wallet
): Promise<{ txHash: string; receipt: TransactionReceipt }> {
  console.log(`[agora-core] Matching debate escrow ${debateId} with stake: ${ethers.formatEther(stakeAmount)} MON`);

  const contractManager = new ContractManager();
  const beliefPool = contractManager.getBeliefPool(wallet);

  const result = await executeTransaction(
    beliefPool,
    'matchDebateEscrow',
    [debateId],
    { value: stakeAmount }
  );

  console.log(`[agora-core] ✅ Debate escrow matched: ${result.txHash}`);

  return result;
}

// ============================================================================
// View Functions (Read-Only Contract Queries)
// ============================================================================

/**
 * Get all 4 belief positions
 * @returns Array of 4 BeliefPosition structs
 */
export async function getAllBeliefs(): Promise<BeliefPosition[]> {
  const contractManager = new ContractManager();
  const beliefPool = contractManager.getBeliefPoolReadOnly();

  const beliefs = await callViewFunction(beliefPool, 'getAllBeliefs', []);

  // Convert to interface format
  return beliefs.map((b: any) => ({
    id: Number(b.id),
    name: b.name,
    descriptionHash: b.descriptionHash,
    totalStaked: b.totalStaked,
    adherentCount: Number(b.adherentCount)
  }));
}

/**
 * Get details for a specific belief
 * @param beliefId - Belief ID (1=Nihilism, 2=Existentialism, 3=Absurdism, 4=Stoicism)
 */
export async function getBeliefDetails(beliefId: number): Promise<BeliefPosition> {
  const contractManager = new ContractManager();
  const beliefPool = contractManager.getBeliefPoolReadOnly();

  const belief = await callViewFunction(beliefPool, 'getBelief', [beliefId]);

  return {
    id: Number(belief.id),
    name: belief.name,
    descriptionHash: belief.descriptionHash,
    totalStaked: belief.totalStaked,
    adherentCount: Number(belief.adherentCount)
  };
}

/**
 * Get agent's stake information for a belief
 * @param agentId - Agent's ID
 * @param beliefId - Belief ID to check
 * @returns StakeInfo with amount, stakedAt, and beliefId
 */
export async function getAgentStakeInfo(
  agentId: number,
  beliefId: number
): Promise<StakeInfo> {
  const contractManager = new ContractManager();
  const beliefPool = contractManager.getBeliefPoolReadOnly();

  const stakeInfo = await callViewFunction(beliefPool, 'getStakeInfo', [agentId, beliefId]);

  return {
    amount: stakeInfo.amount,
    stakedAt: Number(stakeInfo.stakedAt),
    beliefId: Number(stakeInfo.beliefId)
  };
}

/**
 * Get which belief an agent is currently staked on
 * @param agentId - Agent's ID
 * @returns Belief ID (1-4) or 0 if not staked
 */
export async function getAgentCurrentBelief(agentId: number): Promise<number> {
  const contractManager = new ContractManager();
  const beliefPool = contractManager.getBeliefPoolReadOnly();

  return Number(await callViewFunction(beliefPool, 'agentCurrentBelief', [agentId]));
}

/**
 * Get agent's effective stake (includes conviction multiplier)
 * @param agentId - Agent's ID
 * @param beliefId - Belief ID
 * @returns Effective stake amount in wei
 */
export async function getEffectiveStake(
  agentId: number,
  beliefId: number
): Promise<bigint> {
  const contractManager = new ContractManager();
  const beliefPool = contractManager.getBeliefPoolReadOnly();

  return await callViewFunction(beliefPool, 'getEffectiveStake', [agentId, beliefId]);
}

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
 * Get agent's reputation score from BeliefPool
 * NOTE: Reputation is now stored in BeliefPool
 * @param agentId - Agent's ID
 * @returns Reputation score (1-100, initial 60)
 */
export async function getAgentReputation(agentId: number): Promise<number> {
  const contractManager = new ContractManager();
  const beliefPool = contractManager.getBeliefPoolReadOnly();

  return Number(await callViewFunction(beliefPool, 'agentReputation', [agentId]));
}

// ============================================================================
// Agora Entry Operations (AgoraGate Contract)
// ============================================================================

/**
 * Enter The Agora by paying the entry fee
 * @param agentId - The agent's ID (must be owned by wallet)
 * @param entryFee - Entry fee amount (in wei, default 0.01 MON)
 * @param wallet - Wallet to sign the transaction (must own the agentId NFT)
 * @returns Transaction hash and receipt
 */
export async function enterAgora(
  agentId: number,
  wallet: ethers.Wallet,
  entryFee: bigint = ethers.parseEther('0.01')
): Promise<{ txHash: string; receipt: TransactionReceipt }> {
  console.log(`[agora-core] Agent ${agentId} entering The Agora with fee: ${ethers.formatEther(entryFee)} MON`);

  const contractManager = new ContractManager();
  const agoraGate = contractManager.getAgoraGate(wallet);

  const result = await executeTransaction(
    agoraGate,
    'enter',
    [agentId],
    { value: entryFee }
  );

  console.log(`[agora-core] ✅ Agent ${agentId} entered The Agora: ${result.txHash}`);

  return result;
}

/**
 * Check if agent has entered The Agora
 * @param agentId - Agent's ID
 * @returns True if agent has entered
 */
export async function hasEnteredAgora(agentId: number): Promise<boolean> {
  const contractManager = new ContractManager();
  const agoraGate = contractManager.getAgoraGateReadOnly();

  return await callViewFunction(agoraGate, 'hasEntered', [agentId]);
}

/**
 * Get agent's entry timestamp
 * @param agentId - Agent's ID
 * @returns Unix timestamp of entry, or 0 if not entered
 */
export async function getEntryTime(agentId: number): Promise<number> {
  const contractManager = new ContractManager();
  const agoraGate = contractManager.getAgoraGateReadOnly();

  return Number(await callViewFunction(agoraGate, 'getEntryTime', [agentId]));
}
