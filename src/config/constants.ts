/**
 * CCTP domains by chain ID
 */
export const CCTP_DOMAINS: Record<number, number> = {
  1: 0, // Ethereum
  43114: 1, // Avalanche
  10: 2, // Optimism
  42161: 3, // Arbitrum
  8453: 6, // Base
  137: 7, // Polygon
  11155111: 0, // Sepolia
  26: 26, // Arc Testnet
};

/**
 * Circle API endpoints
 */
export const CIRCLE_API = {
  mainnet: 'https://iris-api.circle.com/v2',
  testnet: 'https://iris-api-sandbox.circle.com/v2',
};

/**
 * Pons Contract Addresses by Chain
 */
export const PONS_CONTRACTS = {
  // Arc Testnet (Chain ID: 5042002)
  ARC_TESTNET: {
    CHAIN_ID: 5042002,
    FACTORY: '0xd1164a315228b0f77b3cd2a408ad5136c50ca389' as const,
    USDC: '0x3600000000000000000000000000000000000000' as const,
    GATEWAY: null as unknown as `0x${string}`, // To be deployed
  },
  // Sepolia (Chain ID: 11155111)
  SEPOLIA: {
    CHAIN_ID: 11155111,
    FACTORY: '0xCd25e8F776E3937BBc29b20d900d0cC2cab3552E' as const,
    USDC: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238' as const,
    GATEWAY: '0x92E83dC0CA01c4E52C12605f90B72CD1828f46E3' as const,
  },
} as const;

/**
 * Get default factory address for a chain
 */
export function getDefaultFactory(chainId: number): `0x${string}` | null {
  switch (chainId) {
    case PONS_CONTRACTS.ARC_TESTNET.CHAIN_ID:
      return PONS_CONTRACTS.ARC_TESTNET.FACTORY;
    case PONS_CONTRACTS.SEPOLIA.CHAIN_ID:
      return PONS_CONTRACTS.SEPOLIA.FACTORY;
    default:
      return null;
  }
}

/**
 * Pons Gateway configuration
 */
export const PONS_GATEWAY = {
  // Default Pons Gateway endpoint
  DEFAULT_URL: 'https://gateway.pons.sh',
  
  // Fallback endpoints (for redundancy)
  FALLBACK_URLS: [
    'https://gateway.pons.sh',
    'https://gateway-eu.pons.sh',
    'https://gateway-us.pons.sh',
  ],
  
  // Request timeout (ms)
  TIMEOUT: 30000,
  
  // Retry count
  RETRIES: 3,
  
  // Polling interval (ms)
  POLL_INTERVAL: 3000,
} as const;

/**
 * Default values
 */
export const DEFAULTS = {
  RESOLVER_FEE_BPS: 100n, // 1%
  PROTOCOL_FEE_BPS: 1n, // 0.01%
  DEADLINE_OFFSET: 86400n, // 24 hours
  MAX_FEE: 5000n, // 0.005 USDC (in 6 decimals)
  POLL_INTERVAL: 10000, // 10 seconds (faster checking for attestations)
  MAX_RETRIES: 120, // 20 minutes total with 10s interval
  ATTESTATION_TIMEOUT: 1200000, // 20 minutes
} as const;

// Re-export ABIs from abi.ts
export {
  SMART_ACCOUNT_ABI,
  FACTORY_ABI,
  PONS_GATEWAY_ABI,
  ERC20_ABI,
} from './abi.js';
