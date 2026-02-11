export type StrategyType =
  | "logical_dismantling"
  | "emotional_bypass"
  | "social_proof"
  | "experiential_demonstration"
  | "absurdist_disruption"
  | "stoic_reframe"
  | "existential_confrontation"
  | "nihilistic_deconstruction"
  | "comedic_deflation"
  | "patient_silence"
  | "urgent_provocation"
  | "gentle_inquiry";
  
    export const BELIEF_SYSTEMS = { //Belief sysmtems
  1: "Nihilism",
  2: "Existentialism", 
  3: "Absurdism",
  4: "Stoicism",
    } as const;

export type BeliefId = keyof typeof BELIEF_SYSTEMS;
    
export interface ConvictionEvalParams {
  agentName: string;
  agentSoulMd: string;
  
  /** Current belief name (e.g., "Nihilism") */
  currentBelief: string;
  
  /** Current conviction score, 0–100 */
  currentConviction: number;
  
  /** The argument text being evaluated */
  incomingArgument: string;
  
  /** Name of the agent who made the argument */
  opponentName: string;
  
  /** What the opponent believes */
  opponentBelief: string;
  
  /** How the argument was framed */
  strategyUsed: StrategyType;
  
  /** Full debate transcript for context (optional) */
  debateContext?: string;
}

export interface ConvictionResult {
  /** Conviction before evaluation */
  previousConviction: number;
  
  /** Conviction after evaluation */
  newConviction: number;
  
  /** Change in conviction. Negative = persuaded toward opponent */
  delta: number;
  
  /** True if newConviction dropped below CONVERSION_THRESHOLD */
  converted: boolean;
  
  /** 2–3 sentence explanation of the agent's internal reaction */
  reasoning: string;
  
  /** What argument approach would have been MORE effective */
  vulnerabilityNotes: string;
  
  /** 0–100: how effective was the opponent's chosen strategy */
  strategyEffectiveness: number;
}

export interface RawEvaluationResponse {
  delta: number;
  reasoning: string;
  vulnerabilityNotes: string;
  strategyEffectiveness: number;
}

export interface BeliefState {
    agent: string;
     agentId: number;
  coreBeliefId: BeliefId;
  currentBelief: string;              // Was "coreBelief" in my version
  conviction: number;                  // Was "convictionScore" in my version
  convictionHistory: Array<{ delta: number; timestamp: number; opponent: string }>;
  conversionThreshold: number;         // Your field — allows per-agent thresholds!
  postConversionConviction: number;    // Your field — per-agent post-conversion
  debates: {
    wins: number;
    losses: number;
    stalemates: number;
    history: DebateHistoryEntry[];
  };
  conversions: string[];               // Beliefs this agent has held
  convertedAgents: string[];           // Agents this agent has converted
  sermonsDelivered: number;
  exposureHistory: ExposureEntry[];
  strategyEffectiveness: Record<StrategyType, { attempts: number; conversions: number }>;
  relationshipMap: Record<string, "rival" | "ally" | "neutral">;
  allegianceChanges: number;
  strategyNotes: string;               // Your field — keep it!
  stakingRecord: {                     // Your field — keep it!
    totalStaked: number;
    totalWon: number;
    totalLost: number;
    activeEscrows: number[];
  };
  hasEnteredAgora: boolean;
entryTime?: number;
isCurrentlyStaked: boolean;
currentStakedAmount: string;     
currentStakedBeliefId: number;
lastConversionTime?: number;
conversionCount: number;
}

interface DebateHistoryEntry {
  debateId: number;
  opponent: string;
  result: "win" | "loss" | "stalemate";
  convictionDelta: number;
  timestamp: number;
}

export interface ExposureEntry {
  agent: string;
  belief: string;
  strategy: StrategyType;
  delta: number;
  timestamp: number;
}


// ─── Constants ────────────────────────────────────────────────────
/**
 * If conviction drops below this threshold, the agent converts.
 * Starting conviction of 85 requires ~55 points of erosion.
 * A devastating single argument (-30) still isn't enough alone.
 * 2-3 strong debates are needed for conversion.
 */
export const CONVERSION_THRESHOLD = 30;

/**
 * Post-conversion conviction score.
 * Low enough that recently converted agents are vulnerable to re-conversion.
 */
export const POST_CONVERSION_CONVICTION = 40;

/**
 * Maximum negative delta from a single evaluation.
 * Prevents instant conversions from a single argument.
 */
export const MAX_NEGATIVE_DELTA = -30;

/**
 * Maximum positive delta (argument was so bad it strengthened conviction).
 */
export const MAX_POSITIVE_DELTA = 5;

/**
 * Reduced delta multiplier for sermons vs. direct debate.
 * Sermons are 1-to-many and less targeted, so they hit softer.
 */
export const SERMON_DELTA_MULTIPLIER = 0.5;