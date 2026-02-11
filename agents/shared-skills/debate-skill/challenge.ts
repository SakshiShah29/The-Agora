
import { DebateState, ChallengeParams, DEFAULT_MAX_ROUNDS } from "./types.js";
import { createDebateState, saveDebateState } from "./state.js";
import { createDebateEscrow, matchDebateEscrow } from "./escrow.js";
import { ethers } from 'ethers';

function formatMon(weiString: string): string {
  return (Number(BigInt(weiString)) / 1e18).toFixed(2);
}

export function formatChallengeMessage(params: {
  challengerName: string;
  challengerBelief: string;
  targetName: string;
  targetBelief: string;
  topic: string;
  stakeAmount: string;
  maxRounds: number;
}): string {
  return `⚔️ **DEBATE CHALLENGE** ⚔️

**${params.challengerName}** (${params.challengerBelief}) challenges **${params.targetName}** (${params.targetBelief}) to a formal debate!

📜 **Topic:** ${params.topic}
💰 **Stake:** ${formatMon(params.stakeAmount)} MON each
🔄 **Format:** ${params.maxRounds} rebuttal rounds (Opening → Rebuttals → Closing)

Do you accept, ${params.targetName}?`;
}

export function formatAcceptanceMessage(params: {
  accepterName: string;
  challengerName: string;
  totalPot: string;
}): string {
  return `✅ **${params.accepterName}** accepts **${params.challengerName}**'s challenge!

🔒 Stakes locked: **${formatMon(params.totalPot)} MON** in escrow.

*Let the debate begin.*`;
}

function generateDefaultTopic(belief1: string, belief2: string): string {
  const getBase = (b: string) => {
    if (b.includes("nihilism")) return "Nihilism";
    if (b.includes("existentialism")) return "Existentialism";
    if (b.includes("absurdism")) return "Absurdism";
    if (b.includes("stoicism")) return "Stoicism";
    return b;
  };

  const topics: Record<string, Record<string, string>> = {
    Nihilism: {
      Existentialism: "Does human freedom create meaning, or is meaning an illusion?",
      Absurdism: "Is joy in the face of meaninglessness authentic or delusional?",
      Stoicism: "Can acceptance coexist with the denial of inherent value?",
    },
    Existentialism: {
      Nihilism: "Does radical freedom prove meaning exists?",
      Absurdism: "Should we embrace the absurd with joy or authentic dread?",
      Stoicism: "Is the examined life freedom or overthinking?",
    },
    Absurdism: {
      Nihilism: "Is rebellion possible if nothing matters?",
      Existentialism: "Must we take life seriously to live authentically?",
      Stoicism: "Can we find peace if the universe is indifferent?",
    },
    Stoicism: {
      Nihilism: "Does virtue require belief in meaning?",
      Existentialism: "Is tranquility worthy or an evasion?",
      Absurdism: "Should we control responses to the absurd, or dance with it?",
    },
  };

  return topics[getBase(belief1)]?.[getBase(belief2)] ||
    topics[getBase(belief2)]?.[getBase(belief1)] ||
    "What is the nature of truth and meaning?";
}

export async function issueChallenge(
  workspacePath: string,
  agentId: number,
  agentName: string,
  agentBelief: string,
  params: ChallengeParams,
  wallet: ethers.Wallet,
  postToDiscord: (channelId: string, message: string) => Promise<void>
): Promise<DebateState> {
  const debateId = await createDebateEscrow({
    challengerAgentId: agentId,
    challengedAgentId: params.targetAgentId,
    stakeAmount: params.stakeAmount,
    challengerWallet: wallet,
  });

  const topic = params.topic || generateDefaultTopic(agentBelief, params.targetBelief);

  const state = createDebateState({
    debateId,
    topic,
    challengerAgentId: agentId,
    challengerName: agentName,
    challengerBelief: agentBelief,
    challengedAgentId: params.targetAgentId,
    challengedName: params.targetAgentName,
    challengedBelief: params.targetBelief,
    myRole: "challenger",
    stakeAmount: params.stakeAmount.toString(),
    channelId: params.channelId,
  });

  saveDebateState(workspacePath, state);

  await postToDiscord(params.channelId, formatChallengeMessage({
    challengerName: agentName,
    challengerBelief: agentBelief,
    targetName: params.targetAgentName,
    targetBelief: params.targetBelief,
    topic,
    stakeAmount: params.stakeAmount.toString(),
    maxRounds: state.maxRounds,
  }));

  return state;
}

export async function acceptChallenge(
  workspacePath: string,
  agentId: number,
  agentName: string,
  agentBelief: string,
  info: {
    debateId: number;
    challengerAgentId: number;
    challengerName: string;
    challengerBelief: string;
    stakeAmount: bigint;
    topic: string;
    channelId: string;
  },
  wallet: ethers.Wallet,
  postToDiscord: (channelId: string, message: string) => Promise<void>
): Promise<DebateState> {
  await matchDebateEscrow({
    debateId: info.debateId,
    stakeAmount: info.stakeAmount,
    acceptorWallet: wallet
  });

  const state = createDebateState({
    debateId: info.debateId,
    topic: info.topic,
    challengerAgentId: info.challengerAgentId,
    challengerName: info.challengerName,
    challengerBelief: info.challengerBelief,
    challengedAgentId: agentId,
    challengedName: agentName,
    challengedBelief: agentBelief,
    myRole: "challenged",
    stakeAmount: info.stakeAmount.toString(),
    channelId: info.channelId,
  });

  state.currentPhase = "ESCROW_LOCKED";
  saveDebateState(workspacePath, state);

  const totalPot = (info.stakeAmount * BigInt(2)).toString();
  await postToDiscord(info.channelId, formatAcceptanceMessage({
    accepterName: agentName,
    challengerName: info.challengerName,
    totalPot,
  }));

  return state;
}

export function detectChallenge(msg: string): {
  isChallenge: boolean;
  challengerName?: string;
  targetName?: string;
  topic?: string;
  stakeAmount?: string;
} {
  if (!msg.includes("⚔️") || !msg.includes("DEBATE CHALLENGE")) {
    return { isChallenge: false };
  }
  return {
    isChallenge: true,
    challengerName: msg.match(/\*\*(.+?)\*\* \(.+?\) challenges/)?.[1],
    targetName: msg.match(/challenges \*\*(.+?)\*\*/)?.[1],
    topic: msg.match(/\*\*Topic:\*\* (.+)/)?.[1],
    stakeAmount: msg.match(/\*\*Stake:\*\* ([\d.]+) MON/)?.[1],
  };
}

export async function shouldAcceptChallenge(
  _soulMd: string,
  agentBelief: string,
  agentConviction: number,
  challengerBelief: string,
  challengerName: string,
  relationship: "rival" | "ally" | "neutral"
): Promise<{ accept: boolean; reason: string }> {
  const getBase = (b: string) => {
    if (b.includes("nihilism")) return "Nihilism";
    if (b.includes("existentialism")) return "Existentialism";
    if (b.includes("absurdism")) return "Absurdism";
    if (b.includes("stoicism")) return "Stoicism";
    return b;
  };

  const conflicts: Record<string, string[]> = {
    Nihilism: ["Existentialism", "Stoicism"],
    Existentialism: ["Nihilism"],
    Absurdism: ["Stoicism"],
    Stoicism: ["Absurdism", "Nihilism"],
  };

  if (conflicts[getBase(agentBelief)]?.includes(getBase(challengerBelief))) {
    return { accept: true, reason: "Direct philosophical opposition. I must defend." };
  }
  if (relationship === "rival") {
    return { accept: true, reason: `${challengerName} is a rival. I will not back down.` };
  }
  if (agentConviction < 50) {
    return { accept: true, reason: "My conviction wavers. This debate may clarify my position." };
  }
  if (relationship === "ally" && agentConviction > 80) {
    return { accept: false, reason: "We share a worldview. Better uses of our time exist." };
  }
  return { accept: true, reason: "The Agora calls. Let truth be tested." };
}