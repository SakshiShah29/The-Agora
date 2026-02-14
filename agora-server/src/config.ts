export const AGENT_CONVERSION_CONFIG: Record<string, {
  conversionThreshold: number;
  postConvictionScore: number;
}> = {
  "1":  { conversionThreshold: 28, postConvictionScore: 42 },  // Camus
  "2":  { conversionThreshold: 28, postConvictionScore: 38 },  // Dread
  "3":  { conversionThreshold: 28, postConvictionScore: 44 },  // Epicteta
  "4": { conversionThreshold: 30, postConvictionScore: 42 },  // Kael
  "5":  { conversionThreshold: 30, postConvictionScore: 42 },  // Nihilo
  "6":  { conversionThreshold: 28, postConvictionScore: 44 },  // Seneca
  "7": { conversionThreshold: 32, postConvictionScore: 40 },  // Sera
  "8": { conversionThreshold: 25, postConvictionScore: 38 },  // Voyd
};

export const AGENT_INFO: Record<number, { name: string; belief: string; beliefId: number }> = {
  1: { name: "Camus",    belief: "defiant-absurdism",         beliefId: 3 },
  2: { name: "Dread",    belief: "contemplative-absurdism",   beliefId: 3 },  
  3: { name: "Epicteta", belief: "practical-stoicism",        beliefId: 4 },
  4: { name: "Kael",     belief: "radical-existentialism",    beliefId: 2 },  
  5: { name: "Nihilo",   belief: "constructive-nihilism",     beliefId: 1 },
  6: { name: "Seneca",   belief: "classical-stoicism",        beliefId: 4 },
  7: { name: "Sera",     belief: "reflective-existentialism", beliefId: 2 },  
  8: { name: "Voyd",     belief: "passive-nihilism",          beliefId: 1 },
};

 // ─── Default belief state ────────────────────────────────────────────────────
export const AGENT_DEFAULTS: Record<string, any> = {
  "1": { agent: "camus",    agentName: "Camus",    agentId: 1, coreBeliefId: 3, beliefName: "defiant-absurdism",         currentBelief: "defiant-absurdism",         conviction: 87 },
  "2": { agent: "dread",    agentName: "Dread",     agentId: 2, coreBeliefId: 3, beliefName: "contemplative-absurdism",   currentBelief: "contemplative-absurdism",   conviction: 82 },
  "3": { agent: "epicteta", agentName: "Epicteta",  agentId: 3, coreBeliefId: 4, beliefName: "practical-stoicism",        currentBelief: "practical-stoicism",        conviction: 86 },
  "4": { agent: "kael",     agentName: "Kael",      agentId: 4, coreBeliefId: 2, beliefName: "radical-existentialism",    currentBelief: "radical-existentialism",    conviction: 85 },
  "5": { agent: "nihilo",   agentName: "Nihilo",    agentId: 5, coreBeliefId: 1, beliefName: "constructive-nihilism",     currentBelief: "constructive-nihilism",     conviction: 85 },
  "6": { agent: "seneca",   agentName: "Seneca",    agentId: 6, coreBeliefId: 4, beliefName: "classical-stoicism",        currentBelief: "classical-stoicism",        conviction: 88 },
  "7": { agent: "sera",     agentName: "Sera",      agentId: 7, coreBeliefId: 2, beliefName: "reflective-existentialism", currentBelief: "reflective-existentialism", conviction: 78 },
  "8": { agent: "voyd",     agentName: "Voyd",      agentId: 8, coreBeliefId: 1, beliefName: "passive-nihilism",          currentBelief: "passive-nihilism",          conviction: 88 },
};

export const BELIEF_NAMES: Record<number, string> = {
  1: "nihilism",
  2: "existentialism",
  3: "absurdism",
  4: "stoicism",
};