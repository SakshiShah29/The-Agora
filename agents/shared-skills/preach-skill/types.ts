/**
 * Types for preach-skill
 */

export type SermonType =
  | "parable"      // Story with moral lesson
  | "scripture"    // Core teaching/doctrine
  | "prophecy"     // Warning or prediction
  | "testimony"    // Personal conviction story
  | "exhortation"; // Call to action/belief

export interface SermonParams {
  agentWorkspace: string;     // Path to agent's workspace
  sermonType: SermonType;     // Type of sermon to deliver
  audienceContext?: string;   // Optional context about listeners
  targetBeliefs?: string[];   // Optional beliefs to subtly undermine
}

export interface SermonResult {
  content: string;            // The sermon text
  type: SermonType;           // Sermon type used
  strategy: string;           // Persuasion strategy employed
  targetedBeliefs: string[];  // Which beliefs it aims to undermine
  generatedAt: number;        // Unix timestamp
  agentName: string;          // Who delivered it
  agentBelief: string;        // What they believe
}

export interface SermonContext {
  agentName: string;
  agentBelief: string;
  agentSoulMd: string;
  currentConviction: number;
  primaryStrategy: string;
  sermonType: SermonType;
  audienceContext?: string;
}
