/**
 * chain-interaction - Foundation skill for blockchain operations
 *
 * This module provides the core infrastructure for interacting with
 * smart contracts deployed on Monad testnet.
 *
 * Usage:
 * ```typescript
 * import { ChainProvider, ContractManager, executeTransaction } from './chain-interaction/index.js';
 *
 * // Create provider and get wallet
 * const provider = new ChainProvider();
 * const wallet = await provider.getWallet(process.env.AGENT_PRIVATE_KEY);
 *
 * // Get contract instance
 * const contractManager = new ContractManager();
 * const beliefPool = contractManager.getBeliefPool(wallet);
 *
 * // Execute transaction
 * const result = await executeTransaction(
 *   beliefPool,
 *   'stake',
 *   [beliefId, agentId],
 *   { value: ethers.parseEther('0.1') }
 * );
 * ```
 */

// Provider exports
export { ChainProvider } from './provider.js';

// Contract exports
export { ContractManager } from './contracts.js';

// Transaction exports
export {
  executeTransaction,
  callViewFunction,
  estimateGas,
  executeWithGasEstimate,
  parseTransactionError
} from './transactions.js';

// Type exports
export type {
  TransactionOptions,
  TransactionResult
} from './transactions.js';
