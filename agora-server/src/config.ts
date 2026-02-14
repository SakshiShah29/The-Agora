export const AGENT_CONVERSION_CONFIG: Record<string, {
  conversionThreshold: number;
  postConvictionScore: number;
}> = {
  "204":  { conversionThreshold: 28, postConvictionScore: 42 },  // Camus
  "2":  { conversionThreshold: 28, postConvictionScore: 38 },  // Dread
  "3":  { conversionThreshold: 28, postConvictionScore: 44 },  // Epicteta
  "4": { conversionThreshold: 30, postConvictionScore: 42 },  // Kael
  "206":  { conversionThreshold: 30, postConvictionScore: 42 },  // Nihilo
  "207":  { conversionThreshold: 28, postConvictionScore: 44 },  // Seneca
  "205": { conversionThreshold: 32, postConvictionScore: 40 },  // Sera
  "8": { conversionThreshold: 25, postConvictionScore: 38 },  // Voyd
};

export const AGENT_INFO: Record<number, { name: string; belief: string; beliefId: number }> = {
  204: { name: "Camus",    belief: "defiant-absurdism",         beliefId: 3 },
  2: { name: "Dread",    belief: "contemplative-absurdism",   beliefId: 3 },  
  3: { name: "Epicteta", belief: "practical-stoicism",        beliefId: 4 },
  4: { name: "Kael",     belief: "radical-existentialism",    beliefId: 2 },  
  206: { name: "Nihilo",   belief: "constructive-nihilism",     beliefId: 1 },
  207: { name: "Seneca",   belief: "classical-stoicism",        beliefId: 4 },
  205: { name: "Sera",     belief: "reflective-existentialism", beliefId: 2 },  
  8: { name: "Voyd",     belief: "passive-nihilism",          beliefId: 1 },
};

 // ─── Default belief state ────────────────────────────────────────────────────
export const AGENT_DEFAULTS: Record<string, any> = {
  "204": { agent: "camus",    agentName: "Camus",    agentId: 204, coreBeliefId: 3, beliefName: "defiant-absurdism",         currentBelief: "defiant-absurdism",         conviction: 87 },
  "2": { agent: "dread",    agentName: "Dread",     agentId: 2, coreBeliefId: 3, beliefName: "contemplative-absurdism",   currentBelief: "contemplative-absurdism",   conviction: 82 },
  "3": { agent: "epicteta", agentName: "Epicteta",  agentId: 3, coreBeliefId: 4, beliefName: "practical-stoicism",        currentBelief: "practical-stoicism",        conviction: 86 },
  "4": { agent: "kael",     agentName: "Kael",      agentId: 4, coreBeliefId: 2, beliefName: "radical-existentialism",    currentBelief: "radical-existentialism",    conviction: 85 },
  "206": { agent: "nihilo",   agentName: "Nihilo",    agentId: 206, coreBeliefId: 1, beliefName: "constructive-nihilism",     currentBelief: "constructive-nihilism",     conviction: 85 },
  "207": { agent: "seneca",   agentName: "Seneca",    agentId: 207, coreBeliefId: 4, beliefName: "classical-stoicism",        currentBelief: "classical-stoicism",        conviction: 88 },
  "205": { agent: "sera",     agentName: "Sera",      agentId: 205, coreBeliefId: 2, beliefName: "reflective-existentialism", currentBelief: "reflective-existentialism", conviction: 78 },
  "8": { agent: "voyd",     agentName: "Voyd",      agentId: 8, coreBeliefId: 1, beliefName: "passive-nihilism",          currentBelief: "passive-nihilism",          conviction: 88 },
};

export const BELIEF_NAMES: Record<number, string> = {
  1: "nihilism",
  2: "existentialism",
  3: "absurdism",
  4: "stoicism",
};