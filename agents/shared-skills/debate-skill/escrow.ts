export async function createDebateEscrow(params: {
  challengerAgentId: number;
  challengedAgentId: number;
  stakeAmount: bigint;
}): Promise<number> {
  if (process.env.MOCK_CHAIN === "true") {
    const mockId = Math.floor(Math.random() * 1000000);
    console.log(`[escrow] MOCK: Created debate ${mockId}`);
    return mockId;
  }

  // Real chain implementation would go here
  throw new Error("Real chain not implemented. Set MOCK_CHAIN=true");
}

export async function matchDebateEscrow(params: {
  debateId: number;
  stakeAmount: bigint;
}): Promise<void> {
  if (process.env.MOCK_CHAIN === "true") {
    console.log(`[escrow] MOCK: Matched debate ${params.debateId}`);
    return;
  }
  throw new Error("Real chain not implemented. Set MOCK_CHAIN=true");
}