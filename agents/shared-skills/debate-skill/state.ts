import * as fs from "fs";
import * as path from "path";
import {
  DebateState,
  DebatePhase,
  DebateMessage,
  PHASE_SEQUENCE,
  PHASE_SPEAKER,
  PHASE_DISPLAY,
  DEFAULT_MAX_ROUNDS,
} from "./types.js";

export function getDebateStatePath(workspacePath: string): string {
  return path.join(workspacePath, "active-debate.json");
}

export function loadDebateState(workspacePath: string): DebateState | null {
  const statePath = getDebateStatePath(workspacePath);
  if (!fs.existsSync(statePath)) return null;

  try {
    return JSON.parse(fs.readFileSync(statePath, "utf-8"));
  } catch {
    return null;
  }
}

export function saveDebateState(workspacePath: string, state: DebateState): void {
  const statePath = getDebateStatePath(workspacePath);
  const dir = path.dirname(statePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
}

export function clearDebateState(workspacePath: string): void {
  const statePath = getDebateStatePath(workspacePath);
  if (fs.existsSync(statePath)) {
    fs.renameSync(statePath, path.join(workspacePath, `debate-archive-${Date.now()}.json`));
  }
}

export function createDebateState(params: {
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
  channelId: string;
}): DebateState {
  return {
    ...params,
    currentPhase: "CHALLENGE_ISSUED",
    roundsCompleted: 0,
    maxRounds: DEFAULT_MAX_ROUNDS,
    transcript: [],
    argumentsUsed: [],
    startedAt: Date.now(),
    lastActivityAt: Date.now(),
  };
}

export function advancePhase(state: DebateState): DebateState {
  const idx = PHASE_SEQUENCE.indexOf(state.currentPhase);
  if (idx === -1 || idx >= PHASE_SEQUENCE.length - 1) return state;

  let roundsCompleted = state.roundsCompleted;
  if (state.currentPhase === "REBUTTAL_B_1") roundsCompleted = 1;
  if (state.currentPhase === "REBUTTAL_B_2") roundsCompleted = 2;

  return {
    ...state,
    currentPhase: PHASE_SEQUENCE[idx + 1],
    roundsCompleted,
    lastActivityAt: Date.now(),
  };
}

export function isMyTurn(state: DebateState): boolean {
  return PHASE_SPEAKER[state.currentPhase] === state.myRole;
}

export function isDebateActive(state: DebateState | null): boolean {
  if (!state) return false;
  const activePhases: DebatePhase[] = [
    "ESCROW_LOCKED", "OPENING_A", "OPENING_B",
    "REBUTTAL_A_1", "REBUTTAL_B_1", "REBUTTAL_A_2", "REBUTTAL_B_2",
    "CLOSING_A", "CLOSING_B",
  ];
  return activePhases.includes(state.currentPhase);
}

export function hasTimedOut(state: DebateState, timeoutMs: number): boolean {
  return Date.now() - state.lastActivityAt > timeoutMs;
}

export function addToTranscript(state: DebateState, message: DebateMessage): DebateState {
  return {
    ...state,
    transcript: [...state.transcript, message],
    argumentsUsed: [...state.argumentsUsed, message.content],
    lastActivityAt: Date.now(),
  };
}

export function getOpponentLastArgument(state: DebateState): string | undefined {
  const myName = state.myRole === "challenger" ? state.challengerName : state.challengedName;
  for (let i = state.transcript.length - 1; i >= 0; i--) {
    if (state.transcript[i].agent !== myName) return state.transcript[i].content;
  }
  return undefined;
}

export function formatTranscript(state: DebateState): string {
  if (state.transcript.length === 0) return "(No messages yet)";
  return state.transcript
    .map((m) => `[${m.agent} — ${PHASE_DISPLAY[m.phase]}]\n${m.content}`)
    .join("\n\n---\n\n");
}

export function getMyPreviousArguments(state: DebateState): string[] {
  const myName = state.myRole === "challenger" ? state.challengerName : state.challengedName;
  return state.transcript.filter((m) => m.agent === myName).map((m) => m.content);
}