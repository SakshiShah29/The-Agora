
import { StrategyType } from "../conviction-evaluator/types.js";

export type DebatePhase =
  | "IDLE"
  | "CHALLENGE_ISSUED"
  | "CHALLENGE_ACCEPTED"
  | "ESCROW_LOCKING"
  | "ESCROW_LOCKED"
  | "OPENING_A"
  | "OPENING_B"
  | "REBUTTAL_A_1"
  | "REBUTTAL_B_1"
  | "REBUTTAL_A_2"
  | "REBUTTAL_B_2"
  | "CLOSING_A"
  | "CLOSING_B"
  | "CONCLUDED"
  | "AWAITING_VERDICT"
    | "SETTLED";
  
    export const PHASE_SEQUENCE: DebatePhase[] = [
  "ESCROW_LOCKED",
  "OPENING_A",
  "OPENING_B",
  "REBUTTAL_A_1",
  "REBUTTAL_B_1",
  "REBUTTAL_A_2",
  "REBUTTAL_B_2",
  "CLOSING_A",
  "CLOSING_B",
  "CONCLUDED",
];

export const PHASE_SPEAKER: Record<DebatePhase, "challenger" | "challenged" | null> = {
  IDLE: null,
  CHALLENGE_ISSUED: null,
  CHALLENGE_ACCEPTED: null,
  ESCROW_LOCKING: null,
  ESCROW_LOCKED: null,
  OPENING_A: "challenger",
  OPENING_B: "challenged",
  REBUTTAL_A_1: "challenger",
  REBUTTAL_B_1: "challenged",
  REBUTTAL_A_2: "challenger",
  REBUTTAL_B_2: "challenged",
  CLOSING_A: "challenger",
  CLOSING_B: "challenged",
  CONCLUDED: null,
  AWAITING_VERDICT: null,
  SETTLED: null,
};

export const PHASE_DISPLAY: Record<DebatePhase, string> = {
  IDLE: "Idle",
  CHALLENGE_ISSUED: "Challenge Issued",
  CHALLENGE_ACCEPTED: "Challenge Accepted",
  ESCROW_LOCKING: "Locking Escrow",
  ESCROW_LOCKED: "Escrow Locked",
  OPENING_A: "Opening Statement",
  OPENING_B: "Opening Statement",
  REBUTTAL_A_1: "Rebuttal | Round 1",
  REBUTTAL_B_1: "Rebuttal | Round 1",
  REBUTTAL_A_2: "Rebuttal | Round 2",
  REBUTTAL_B_2: "Rebuttal | Round 2",
  CLOSING_A: "Closing Statement",
  CLOSING_B: "Closing Statement",
  CONCLUDED: "Concluded",
  AWAITING_VERDICT: "Awaiting Verdict",
  SETTLED: "Settled",
};

export interface DebateMessage {
  agent: string;
  agentId: number;
  phase: DebatePhase;
  content: string;
  strategy: StrategyType;
  timestamp: number;
}

export interface DebateState {
  debateId: number;
  topic: string;
  challengerAgentId: number;
  challengerName: string;
  challengerBelief: string;
  challengedAgentId: number;
  challengedName: string;
  challengedBelief: string;
  myRole: "challenger" | "challenged";
  stakeAmount: string;
  currentPhase: DebatePhase;
  roundsCompleted: number;
  maxRounds: number;
  transcript: DebateMessage[];
  argumentsUsed: string[];
  startedAt: number;
  lastActivityAt: number;
  channelId: string;
}

export interface ChallengeParams {
  targetAgentId: number;
  targetAgentName: string;
  targetBelief: string;
  stakeAmount: bigint;
  topic?: string;
  channelId: string;
}

export type DebateStatus =
  | { status: "idle" }
  | { status: "active"; phase: DebatePhase; myTurn: boolean }
  | { status: "concluded"; awaitingVerdict: boolean }
  | { status: "error"; message: string };

export const DEFAULT_STAKE_AMOUNT = BigInt("100000000000000000");
export const DEFAULT_MAX_ROUNDS = 2;
export const RESPONSE_TIMEOUT_MS = 5 * 60 * 1000;
export const MIN_ARGUMENT_LENGTH = 100;
export const MAX_ARGUMENT_LENGTH = 500;
export const DIVERSITY_THRESHOLD = 70;