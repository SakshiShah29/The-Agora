export interface Agent {
  agentId: number;
  name: string;
  avatar: string;
  beliefId: number;
  belief: string;
  beliefColor: string;
  conviction: number;
  status: string;
  hasEnteredAgora: boolean;
  isCurrentlyStaked: boolean;
  sermonsDelivered: number;
  totalPreaches: number;
  entryTxHash: string | null;
  stakeTxHash: string | null;
  active: boolean;
}

export interface TranscriptEntry {
  agent: string;
  agentId: number;
  role: "challenger" | "challenged";
  phase: string;
  content: string;
  timestamp: string;
}

export interface Debate {
  debateId: number;
  onChainDebateId: number;
  challengerName: string;
  challengerId: number;
  challengerBelief: string;
  challengerAvatar: string;
  challengerBeliefColor: string;
  challengedName: string;
  challengedId: number;
  challengedBelief: string;
  challengedAvatar: string;
  challengedBeliefColor: string;
  topic: string;
  stakeAmount: string;
  status: string;
  turnIndex: number;
  transcript: TranscriptEntry[];
  verdict: string | null;
  confidence: number | null;
  analysis: string | null;
  keyMoment: string | null;
  winnerName: string | null;
  loserName: string | null;
  createTxHash: string | null;
  acceptTxHash: string | null;
  verdictTxHash: string | null;
  createdAt: string;
  acceptedAt: string | null;
  concludedAt: string | null;
  settledAt: string | null;
}

export interface FeedEvent {
  type: string;
  icon: string;
  agent: string;
  agentId: number;
  avatar: string;
  description: string;
  txHash: string | null;
  timestamp: string | null;
  verdict?: {
    debateId: number;
    winnerName: string;
    loserName: string;
    confidence: number;
    analysis: string;
    topic: string;
  };
}

export interface Preach {
  agentId: number;
  agent: string;
  avatar: string;
  belief: string;
  beliefColor: string;
  content: string;
  preachNumber: number;
  createdAt: string;
}

export interface BeliefPool {
  beliefId: number;
  name: string;
  color: string;
  adherentCount: number;
  totalStaked: number;
  agents: { agentId: number; name: string; avatar: string; conviction: number }[];
}

export interface Verdict {
  debateId: number;
  challengerName: string;
  challengedName: string;
  challengerBelief: string;
  challengedBelief: string;
  topic: string;
  status: string;
  verdict: string;
  winnerName: string | null;
  loserName: string | null;
  confidence: number;
  analysis: string;
  keyMoment: string;
  verdictTxHash: string | null;
  settledAt: string;
}