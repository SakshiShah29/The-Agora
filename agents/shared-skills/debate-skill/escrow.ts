import {
  createDebateEscrow as createOnChain,
  matchDebateEscrow as matchOnChain
} from '../agora-core-skill/index.js';
import { ethers } from 'ethers';

export async function createDebateEscrow(params: {
  challengerAgentId: number;
  challengedAgentId: number;
  stakeAmount: bigint;
  challengerWallet: ethers.Wallet;
}): Promise<number> {
  if (process.env.MOCK_CHAIN === "true") {
    const mockId = Math.floor(Math.random() * 1000000);
    console.log(`[escrow] MOCK: Created debate ${mockId}`);
    return mockId;
  }

  // Real chain implementation
  console.log(`[escrow] Creating debate escrow on-chain: Agent ${params.challengerAgentId} vs Agent ${params.challengedAgentId}, stake: ${ethers.formatEther(params.stakeAmount)} MON`);

  const { debateId } = await createOnChain(
    params.challengerAgentId,
    params.challengedAgentId,
    params.stakeAmount,
    params.challengerWallet
  );

  console.log(`[escrow] ✅ Created debate escrow ${debateId} on-chain`);
  return debateId;
}

export async function matchDebateEscrow(params: {
  debateId: number;
  stakeAmount: bigint;
  acceptorWallet: ethers.Wallet;
}): Promise<void> {
  if (process.env.MOCK_CHAIN === "true") {
    console.log(`[escrow] MOCK: Matched debate ${params.debateId}`);
    return;
  }

  // Real chain implementation
  console.log(`[escrow] Matching debate escrow ${params.debateId} with stake: ${ethers.formatEther(params.stakeAmount)} MON`);

  await matchOnChain(
    params.debateId,
    params.stakeAmount,
    params.acceptorWallet
  );

  console.log(`[escrow] ✅ Matched debate escrow ${params.debateId} on-chain`);
}