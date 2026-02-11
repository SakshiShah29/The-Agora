import { onboardAllAgents } from './index.js';
import { ethers } from 'ethers';
import * as dotenv from 'dotenv';

dotenv.config();

const STAKE_AMOUNT = ethers.parseEther('0.1'); //MON
//TODO:Update the agentId values in onboard-all.ts to match your actual on-chain agent IDs from the IdentityRegistry
const agents = [
  { agentId: 1, agentName: 'Nihilo',   beliefId: 1, privateKey: process.env.NIHILO_PRIVATE_KEY!,   workspacePath: '../agents/nihilo/workspace' },
  { agentId: 2, agentName: 'Voyd',     beliefId: 1, privateKey: process.env.VOYD_PRIVATE_KEY!,     workspacePath: '../agents/voyd/workspace' },
  { agentId: 3, agentName: 'Kael',     beliefId: 2, privateKey: process.env.KAEL_PRIVATE_KEY!,     workspacePath: '../agents/kael/workspace' },
  { agentId: 4, agentName: 'Sera',     beliefId: 2, privateKey: process.env.SERA_PRIVATE_KEY!,     workspacePath: '../agents/sera/workspace' },
  { agentId: 5, agentName: 'Camus',    beliefId: 3, privateKey: process.env.CAMUS_PRIVATE_KEY!,    workspacePath: '../agents/camus/workspace' },
  { agentId: 6, agentName: 'Dread',    beliefId: 3, privateKey: process.env.DREAD_PRIVATE_KEY!,    workspacePath: '../agents/dread/workspace' },
  { agentId: 7, agentName: 'Seneca',   beliefId: 4, privateKey: process.env.SENECA_PRIVATE_KEY!,   workspacePath: '../agents/seneca/workspace' },
  { agentId: 8, agentName: 'Epicteta', beliefId: 4, privateKey: process.env.EPICTETA_PRIVATE_KEY!, workspacePath: '../agents/epicteta/workspace' },
];

async function main() {
  console.log('🏛️ The Agora — Agent Onboarding\n');
  console.log(`Stake amount: ${ethers.formatEther(STAKE_AMOUNT)} MON per agent`);
  console.log(`Mock chain: ${process.env.MOCK_CHAIN === "true" ? "YES" : "NO"}\n`);

  await onboardAllAgents(agents, STAKE_AMOUNT);
}

main().catch(console.error);