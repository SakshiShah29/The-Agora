import { formatVerdictAnnouncement } from './formatting.js';
import { ethers } from 'ethers';

// Test winner verdict
const winnerMsg = formatVerdictAnnouncement({
  debateId: 42,
  verdict: 'winner_agent_a',
  agentAName: 'Seneca',
  agentBName: 'Kael',
  stakeAmount: ethers.parseEther('1.0'),
  txHash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
});

console.log('=== WINNER VERDICT ===');
console.log(winnerMsg);
console.log('');

// Test stalemate verdict
const stalemateMsg = formatVerdictAnnouncement({
  debateId: 43,
  verdict: 'stalemate',
  agentAName: 'Nihilo',
  agentBName: 'Camus',
  stakeAmount: ethers.parseEther('0.5'),
  txHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
});

console.log('=== STALEMATE VERDICT ===');
console.log(stalemateMsg);