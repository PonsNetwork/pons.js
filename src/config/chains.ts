import type { Address } from 'viem';
import type { ChainConfig } from '../types.js';

/**
 * Supported chain names for easy reference
 */
export type SupportedChain = 
  | 'arc-testnet' 
  | 'sepolia' 
  | 'ethereum'
  | number; // Chain ID

/**
 * Full chain configuration including factory address
 */
export interface FullChainConfig extends ChainConfig {
  /** SmartAccountFactory address on this chain (if deployed) */
  factory?: Address;
}

/**
 * Arc Testnet configuration
 */
export const arcTestnet: FullChainConfig = {
  id: 5042002,
  name: 'Arc Testnet',
  rpcUrl: 'https://rpc.testnet.arc.network',
  domain: 26, // CCTP domain for Arc Testnet
  tokenMessenger: '0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA' as Address,
  messageTransmitter: '0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275' as Address,
  usdc: '0x3600000000000000000000000000000000000000' as Address,
  factory: '0xd1164a315228b0f77b3cd2a408ad5136c50ca389' as Address,
};

/**
 * Sepolia Testnet configuration
 */
export const sepolia: FullChainConfig = {
  id: 11155111,
  name: 'Sepolia',
  rpcUrl: 'https://sepolia.drpc.org',
  domain: 0,
  tokenMessenger: '0x9f3B8679c73C2Fef8b59B4f3444d4e156fb70AA5' as Address,
  messageTransmitter: '0x7865fAfC2db2093669d92c0F33AeEF291086BEFD' as Address,
  usdc: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238' as Address,
  // factory: undefined - not yet deployed
};

/**
 * Ethereum Mainnet configuration
 */
export const ethereum: FullChainConfig = {
  id: 1,
  name: 'Ethereum',
  rpcUrl: 'https://eth.llamarpc.com',
  domain: 0,
  tokenMessenger: '0xBd3fa81B58Ba92a82136038B25aDec7066af3155' as Address,
  messageTransmitter: '0x0a992d191DEeC32aFe36203Ad87D7d289a738F81' as Address,
  usdc: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Address,
  // factory: undefined - not yet deployed
};

/**
 * Registry of all supported chains
 */
export const CHAINS: Record<string, FullChainConfig> = {
  'arc-testnet': arcTestnet,
  'sepolia': sepolia,
  'ethereum': ethereum,
  // By chain ID
  '5042002': arcTestnet,
  '11155111': sepolia,
  '1': ethereum,
};

/**
 * Get chain configuration by name or ID
 * 
 * @example
 * const arc = getChain('arc-testnet');
 * const sepolia = getChain(11155111);
 */
export function getChain(chain: SupportedChain): FullChainConfig {
  const key = typeof chain === 'number' ? String(chain) : chain;
  const config = CHAINS[key];
  
  if (!config) {
    throw new Error(
      `Unsupported chain: ${chain}. ` +
      `Supported chains: ${Object.keys(CHAINS).filter(k => isNaN(Number(k))).join(', ')}`
    );
  }
  
  return config;
}

/**
 * Check if a chain is supported
 */
export function isChainSupported(chain: SupportedChain): boolean {
  const key = typeof chain === 'number' ? String(chain) : chain;
  return key in CHAINS;
}

/**
 * Get factory address for a chain
 */
export function getFactory(chain: SupportedChain): Address | undefined {
  return getChain(chain).factory;
}

/**
 * Helper to create custom chain config
 */
export function createChainConfig(config: ChainConfig): ChainConfig {
  return config;
}

/**
 * Supported routes (source → destination)
 */
export const SUPPORTED_ROUTES = [
  { from: 'sepolia', to: 'arc-testnet', status: 'active' },
  { from: 'arc-testnet', to: 'sepolia', status: 'coming-soon' },
  { from: 'ethereum', to: 'arc-testnet', status: 'coming-soon' },
] as const;

