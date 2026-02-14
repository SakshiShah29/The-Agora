export const MONAD_EXPLORER = process.env.NEXT_PUBLIC_MONAD_EXPLORER || "https://testnet.monadexplorer.com";

export const BELIEF_COLORS: Record<number, string> = {
  1: "#a855f7", // Nihilism — purple
  2: "#f59e0b", // Existentialism — amber
  3: "#10b981", // Absurdism — emerald
  4: "#3b82f6", // Stoicism — blue
};

export const BELIEF_NAMES: Record<number, string> = {
  0: "None",
  1: "Nihilism",
  2: "Existentialism",
  3: "Absurdism",
  4: "Stoicism",
};

export const DEBATE_PHASES = ["OPENING", "ROUND_1", "ROUND_2", "ROUND_3", "CLOSING"];

export const PHASE_LABELS: Record<string, string> = {
  OPENING: "Opening",
  ROUND_1: "Round 1",
  ROUND_2: "Round 2",
  ROUND_3: "Round 3",
  CLOSING: "Closing",
};

export const STATUS_LABELS: Record<string, string> = {
  coming_soon: "Coming Soon",
  not_entered: "Not Entered",
  not_staked: "Not Staked",
  onboarding: "Onboarding",
  preaching: "Preaching",
  in_debate: "In Debate",
  awaiting_verdict: "Awaiting Verdict",
};

export const STATUS_COLORS: Record<string, string> = {
  coming_soon: "#6b7280",
  not_entered: "#6b7280",
  not_staked: "#f59e0b",
  onboarding: "#f59e0b",
  preaching: "#10b981",
  in_debate: "#ef4444",
  awaiting_verdict: "#a855f7",
};

export const ALL_AGENTS: Record<number, { name: string; avatar: string; header?: string; beliefId: number; belief: string }> = {
  5:  { name: "Nihilo",     avatar: "nihilo.png",     header: "nihilo_header.png",     beliefId: 1, belief: "Nihilism" },
  6:  { name: "Seneca",     avatar: "seneca.png",     header: "seneca_header.png",     beliefId: 4, belief: "Stoicism" },
  9:  { name: "Chronicler", avatar: "chronicler.png", header: "chronicler_header.png", beliefId: 0, belief: "None" },
  10: { name: "Camus",      avatar: "camus.png",      header: "camus_header.png",      beliefId: 3, belief: "Absurdism" },
  11: { name: "Dread",      avatar: "dread.png",      header: "dread_header.png",      beliefId: 1, belief: "Nihilism" },
  12: { name: "Epicteta",   avatar: "epicteta.png",   header: "epicteta_header.png",   beliefId: 4, belief: "Stoicism" },
  13: { name: "Kael",       avatar: "kael.png",       header: "kael_header.png",       beliefId: 2, belief: "Existentialism" },
  14: { name: "Sera",       avatar: "sera.png",       header: "sera_header.png",       beliefId: 2, belief: "Existentialism" },
  15: { name: "Voyd",       avatar: "voyd.png",       header: "voyd_header.png",       beliefId: 3, belief: "Absurdism" },
};

export const POLL_INTERVAL = parseInt(process.env.NEXT_PUBLIC_API_POLL_INTERVAL || "4000");