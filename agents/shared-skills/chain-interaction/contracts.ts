import { ethers, Contract } from 'ethers';
import { ChainProvider } from './provider.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

// Load contract ABIs
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const beliefPoolABI = JSON.parse(
  readFileSync(join(__dirname, 'abis/BeliefPool.json'), 'utf-8')
);
const agoraGateABI = JSON.parse(
  readFileSync(join(__dirname, 'abis/AgoraGate.json'), 'utf-8')
);
const identityRegistryABI = JSON.parse(
  readFileSync(join(__dirname, 'abis/IdentityRegistry.json'), 'utf-8')
);
const reputationRegistryABI = JSON.parse(
  readFileSync(join(__dirname, 'abis/ReputationRegistry.json'), 'utf-8')
);

/**
 * ContractManager - Manages contract instances and addresses
 * Provides easy access to deployed contracts on Monad testnet
 */
export class ContractManager {
  chainProvider: ChainProvider;

  // Contract addresses on Monad testnet
  beliefPoolAddress: string;
  agoraGateAddress: string;
  identityRegistryAddress: string;
  reputationRegistryAddress: string;

  constructor() {
    this.chainProvider = new ChainProvider();

    // Load addresses from environment or use defaults
    this.beliefPoolAddress = process.env.BELIEF_POOL || '0xc48c2B841d78bB8Ea0384eA25fAf7e31DA4704f5';
    this.agoraGateAddress = process.env.AGORA_GATE || '0x89bfc8a77aeBa64B567457c2E13D2677568617B6';
    this.identityRegistryAddress = process.env.IDENTITY_REGISTRY || '0x8004A818BFB912233c491871b3d84c89A494BD9e';
    this.reputationRegistryAddress = process.env.REPUTATION_REGISTRY || '0x8004B663056A597Dffe9eCcC1965A193B7388713';

    console.log('[ContractManager] Initialized with addresses:');
    console.log(`  BeliefPool: ${this.beliefPoolAddress}`);
    console.log(`  AgoraGate: ${this.agoraGateAddress}`);
    console.log(`  IdentityRegistry: ${this.identityRegistryAddress}`);
    console.log(`  ReputationRegistry: ${this.reputationRegistryAddress}`);
  }

  /**
   * Get BeliefPool contract instance
   * @param signer - Wallet to sign transactions
   * @returns BeliefPool contract instance
   */
  getBeliefPool(signer: ethers.Wallet): Contract {
    return new ethers.Contract(
      this.beliefPoolAddress,
      beliefPoolABI,
      signer
    );
  }

  /**
   * Get AgoraGate contract instance
   * @param signer - Wallet to sign transactions
   * @returns AgoraGate contract instance
   */
  getAgoraGate(signer: ethers.Wallet): Contract {
    return new ethers.Contract(
      this.agoraGateAddress,
      agoraGateABI,
      signer
    );
  }

  /**
   * Get IdentityRegistry contract instance (ERC-8004)
   * @param signer - Wallet to sign transactions
   * @returns IdentityRegistry contract instance
   */
  getIdentityRegistry(signer: ethers.Wallet): Contract {
    return new ethers.Contract(
      this.identityRegistryAddress,
      identityRegistryABI,
      signer
    );
  }

  /**
   * Get ReputationRegistry contract instance (ERC-8004)
   * @param signer - Wallet to sign transactions
   * @returns ReputationRegistry contract instance
   */
  getReputationRegistry(signer: ethers.Wallet): Contract {
    return new ethers.Contract(
      this.reputationRegistryAddress,
      reputationRegistryABI,
      signer
    );
  }

  /**
   * Get read-only BeliefPool contract instance (no signer needed)
   * Useful for view functions that don't modify state
   * @returns BeliefPool contract instance connected to provider
   */
  getBeliefPoolReadOnly(): Contract {
    return new ethers.Contract(
      this.beliefPoolAddress,
      beliefPoolABI,
      this.chainProvider.provider
    );
  }

  /**
   * Get read-only AgoraGate contract instance (no signer needed)
   * @returns AgoraGate contract instance connected to provider
   */
  getAgoraGateReadOnly(): Contract {
    return new ethers.Contract(
      this.agoraGateAddress,
      agoraGateABI,
      this.chainProvider.provider
    );
  }

  /**
   * Get read-only IdentityRegistry contract instance (no signer needed)
   * @returns IdentityRegistry contract instance connected to provider
   */
  getIdentityRegistryReadOnly(): Contract {
    return new ethers.Contract(
      this.identityRegistryAddress,
      identityRegistryABI,
      this.chainProvider.provider
    );
  }

  /**
   * Get read-only ReputationRegistry contract instance (no signer needed)
   * @returns ReputationRegistry contract instance connected to provider
   */
  getReputationRegistryReadOnly(): Contract {
    return new ethers.Contract(
      this.reputationRegistryAddress,
      reputationRegistryABI,
      this.chainProvider.provider
    );
  }
}
