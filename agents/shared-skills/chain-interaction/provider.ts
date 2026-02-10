import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables from contracts/.env
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = join(__dirname, '../../../contracts/.env');
dotenv.config({ path: envPath });

/**
 * ChainProvider - Manages blockchain connection and wallet creation
 * Connects to Monad testnet by default
 */
export class ChainProvider {
  provider: ethers.JsonRpcProvider;
  chainId: number;
  rpcUrl: string;

  constructor() {
    this.rpcUrl = process.env.RPC_URL || 'https://testnet.monad.xyz/rpc';
    this.chainId = parseInt(process.env.CHAIN_ID || '10143');

    console.log(`[ChainProvider] Connecting to ${this.rpcUrl} (Chain ID: ${this.chainId})`);
    this.provider = new ethers.JsonRpcProvider(this.rpcUrl);
  }

  /**
   * Create a wallet instance from a private key
   * @param privateKey - Hex string private key (with or without 0x prefix)
   * @returns Wallet instance connected to the provider
   */
  async getWallet(privateKey: string): Promise<ethers.Wallet> {
    // Ensure private key has 0x prefix
    const formattedKey = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
    const wallet = new ethers.Wallet(formattedKey, this.provider);

    console.log(`[ChainProvider] Wallet created: ${wallet.address}`);
    return wallet;
  }

  /**
   * Wait for a transaction to be confirmed
   * @param txHash - Transaction hash
   * @param confirmations - Number of confirmations to wait for (default: 1)
   * @returns Transaction receipt
   */
  async waitForTransaction(
    txHash: string,
    confirmations: number = 1
  ): Promise<ethers.TransactionReceipt | null> {
    console.log(`[ChainProvider] Waiting for tx ${txHash} (${confirmations} confirmations)...`);
    const receipt = await this.provider.waitForTransaction(txHash, confirmations);

    if (receipt) {
      console.log(`[ChainProvider] Tx confirmed in block ${receipt.blockNumber}`);
    } else {
      console.log(`[ChainProvider] Tx receipt not found`);
    }

    return receipt;
  }

  /**
   * Get current block number
   * @returns Current block number
   */
  async getBlockNumber(): Promise<number> {
    return await this.provider.getBlockNumber();
  }

  /**
   * Get balance of an address
   * @param address - Wallet address
   * @returns Balance in wei as bigint
   */
  async getBalance(address: string): Promise<bigint> {
    return await this.provider.getBalance(address);
  }

  /**
   * Get balance of an address in MON (formatted)
   * @param address - Wallet address
   * @returns Balance formatted as string (e.g., "1.5 MON")
   */
  async getBalanceFormatted(address: string): Promise<string> {
    const balance = await this.getBalance(address);
    return `${ethers.formatEther(balance)} MON`;
  }

  /**
   * Check if provider is connected
   * @returns True if connected to network
   */
  async isConnected(): Promise<boolean> {
    try {
      await this.provider.getBlockNumber();
      return true;
    } catch (error) {
      console.error('[ChainProvider] Connection failed:', error);
      return false;
    }
  }
}
