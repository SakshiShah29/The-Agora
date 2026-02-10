import { ethers, Contract, TransactionReceipt, TransactionResponse } from 'ethers';

/**
 * Transaction execution options
 */
export interface TransactionOptions {
  value?: bigint;           // ETH/MON to send with transaction
  gasLimit?: bigint;        // Manual gas limit override
  maxFeePerGas?: bigint;    // Max fee per gas (EIP-1559)
  maxPriorityFeePerGas?: bigint; // Max priority fee (EIP-1559)
}

/**
 * Transaction result with hash and receipt
 */
export interface TransactionResult {
  txHash: string;
  receipt: TransactionReceipt;
  gasUsed: bigint;
  success: boolean;
}

/**
 * Execute a contract method call with error handling and logging
 * @param contract - Contract instance
 * @param method - Method name to call
 * @param args - Array of method arguments
 * @param options - Transaction options (value, gas, etc.)
 * @returns Transaction result with hash and receipt
 */
export async function executeTransaction(
  contract: Contract,
  method: string,
  args: any[] = [],
  options: TransactionOptions = {}
): Promise<TransactionResult> {
  try {
    console.log(`[TX] Calling ${method}(${args.map(a =>
      typeof a === 'bigint' ? ethers.formatEther(a) + ' MON' : a
    ).join(', ')})`);

    if (options.value) {
      console.log(`[TX] Sending ${ethers.formatEther(options.value)} MON`);
    }

    // Build transaction options
    const txOptions: any = {};
    if (options.value !== undefined) txOptions.value = options.value;
    if (options.gasLimit !== undefined) txOptions.gasLimit = options.gasLimit;
    if (options.maxFeePerGas !== undefined) txOptions.maxFeePerGas = options.maxFeePerGas;
    if (options.maxPriorityFeePerGas !== undefined) {
      txOptions.maxPriorityFeePerGas = options.maxPriorityFeePerGas;
    }

    // Execute transaction
    const tx: TransactionResponse = await contract[method](...args, txOptions);
    console.log(`[TX] Submitted: ${tx.hash}`);
    console.log(`[TX] Waiting for confirmation...`);

    // Wait for confirmation
    const receipt = await tx.wait();

    if (!receipt) {
      throw new Error('Transaction receipt is null');
    }

    const success = receipt.status === 1;
    console.log(`[TX] ${success ? '✅ SUCCESS' : '❌ FAILED'}`);
    console.log(`[TX] Block: ${receipt.blockNumber}`);
    console.log(`[TX] Gas used: ${receipt.gasUsed.toString()}`);

    return {
      txHash: tx.hash,
      receipt,
      gasUsed: receipt.gasUsed,
      success
    };

  } catch (error: any) {
    console.error(`[TX ERROR] ${method} failed:`, error.message);

    // Try to extract revert reason if available
    if (error.reason) {
      console.error(`[TX ERROR] Revert reason: ${error.reason}`);
    }
    if (error.code) {
      console.error(`[TX ERROR] Error code: ${error.code}`);
    }

    throw error;
  }
}

/**
 * Call a view/pure function (no transaction, just reads data)
 * @param contract - Contract instance
 * @param method - Method name to call
 * @param args - Array of method arguments
 * @returns Result from the contract call
 */
export async function callViewFunction(
  contract: Contract,
  method: string,
  args: any[] = []
): Promise<any> {
  try {
    console.log(`[VIEW] Calling ${method}(${args.join(', ')})`);

    const result = await contract[method](...args);

    console.log(`[VIEW] Result:`, result);
    return result;

  } catch (error: any) {
    console.error(`[VIEW ERROR] ${method} failed:`, error.message);
    throw error;
  }
}

/**
 * Estimate gas for a transaction before executing
 * @param contract - Contract instance
 * @param method - Method name to call
 * @param args - Array of method arguments
 * @param options - Transaction options (value, etc.)
 * @returns Estimated gas amount
 */
export async function estimateGas(
  contract: Contract,
  method: string,
  args: any[] = [],
  options: TransactionOptions = {}
): Promise<bigint> {
  try {
    const txOptions: any = {};
    if (options.value !== undefined) txOptions.value = options.value;

    const gasEstimate = await contract[method].estimateGas(...args, txOptions);
    console.log(`[GAS] Estimated for ${method}: ${gasEstimate.toString()}`);

    return gasEstimate;

  } catch (error: any) {
    console.error(`[GAS ERROR] Estimation failed for ${method}:`, error.message);
    throw error;
  }
}

/**
 * Execute transaction with automatic gas estimation and 20% buffer
 * @param contract - Contract instance
 * @param method - Method name to call
 * @param args - Array of method arguments
 * @param options - Transaction options (value, etc.)
 * @returns Transaction result
 */
export async function executeWithGasEstimate(
  contract: Contract,
  method: string,
  args: any[] = [],
  options: TransactionOptions = {}
): Promise<TransactionResult> {
  // Estimate gas
  const estimatedGas = await estimateGas(contract, method, args, options);

  // Add 20% buffer to be safe
  const gasLimit = (estimatedGas * 120n) / 100n;

  // Execute with estimated gas limit
  return executeTransaction(contract, method, args, {
    ...options,
    gasLimit
  });
}

/**
 * Parse transaction error and return user-friendly message
 * @param error - Error from transaction
 * @returns Formatted error message
 */
export function parseTransactionError(error: any): string {
  if (error.reason) {
    return error.reason;
  }

  if (error.code === 'INSUFFICIENT_FUNDS') {
    return 'Insufficient funds for transaction';
  }

  if (error.code === 'NONCE_EXPIRED') {
    return 'Transaction nonce expired, please retry';
  }

  if (error.code === 'REPLACEMENT_UNDERPRICED') {
    return 'Gas price too low for replacement transaction';
  }

  if (error.message) {
    return error.message;
  }

  return 'Unknown transaction error';
}
