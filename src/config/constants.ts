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
  },
  // Sepolia (Chain ID: 11155111) - Factory to be deployed
  SEPOLIA: {
    CHAIN_ID: 11155111,
    FACTORY: null as unknown as `0x${string}`, // Not yet deployed
    USDC: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238' as const,
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
 * Waku configuration (for direct Waku access)
 */
export const WAKU_CONFIG = {
  // Default REST API URL (legacy, use PONS_GATEWAY.DEFAULT_URL instead)
  DEFAULT_REST_URL: 'https://relay.pons.sh',
  
  // Network settings
  CLUSTER_ID: 909,
  SHARD: 0,
  
  // Content topic configuration
  CONTENT_TOPIC_PREFIX: '/pons',
  CONTENT_TOPIC_SUFFIX: 'relay',
  
  // Polling interval for REST API subscriptions (ms)
  POLL_INTERVAL: 3000,
} as const;

/**
 * Generate a content topic based on destination chain ID
 * Format: /{prefix}/{destinationChainId}/{suffix}
 * Example: /pons/11155111/relay (for Sepolia)
 */
export function getContentTopic(
  destinationChainId: number,
  prefix: string = WAKU_CONFIG.CONTENT_TOPIC_PREFIX,
  suffix: string = WAKU_CONFIG.CONTENT_TOPIC_SUFFIX
): string {
  return `${prefix}/${destinationChainId}/${suffix}`;
}

/**
 * Generate pubsub topic for static sharding
 * Format: /waku/2/rs/{clusterId}/{shard}
 */
export function getPubsubTopic(
  clusterId: number = WAKU_CONFIG.CLUSTER_ID,
  shard: number = WAKU_CONFIG.SHARD
): string {
  return `/waku/2/rs/${clusterId}/${shard}`;
}

/**
 * Legacy Waku content topics (deprecated, use getContentTopic instead)
 * @deprecated Use getContentTopic(destinationChainId) for dynamic topics
 */
export const WAKU_TOPICS = {
  TRANSFERS: '/pons/1/transfers/proto',
  MINTED: '/pons/1/minted/proto',
  EXECUTED: '/pons/1/executed/proto',
} as const;

/**
 * Default values
 */
export const DEFAULTS = {
  RELAYER_FEE_BPS: 100n, // 1%
  PROTOCOL_FEE_BPS: 1n, // 0.01%
  DEADLINE_OFFSET: 86400n, // 24 hours
  MAX_FEE: 5000n, // 0.005 USDC (in 6 decimals)
  POLL_INTERVAL: 10000, // 10 seconds (faster checking for attestations)
  MAX_RETRIES: 120, // 20 minutes total with 10s interval
  ATTESTATION_TIMEOUT: 1200000, // 20 minutes
} as const;

/**
 * Smart Account ABI (minimal subset needed)
 */
export const SMART_ACCOUNT_ABI = [
  {
    type: 'function',
    name: 'executeWithFees',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'target', type: 'address' },
      { name: 'func', type: 'bytes' },
      { name: 'deadline', type: 'uint256' },
      { name: 'nonce', type: 'uint256' },
      { name: 'relayerFeeBps', type: 'uint256' },
      { name: 'expectedAmount', type: 'uint256' },
      { name: 'gasCostUSDC', type: 'uint256' },
      { name: 'signature', type: 'bytes' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'executeWithRelayerFunding',
    stateMutability: 'payable',
    inputs: [{ name: 'params', type: 'bytes' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'getCCTPFlow',
    stateMutability: 'view',
    inputs: [{ name: 'nonce', type: 'uint256' }],
    outputs: [
      {
        type: 'tuple',
        components: [
          { name: 'indexer', type: 'address' },
          { name: 'executor', type: 'address' },
          { name: 'amount', type: 'uint256' },
          { name: 'messageHash', type: 'bytes32' },
          { name: 'executed', type: 'bool' },
        ],
      },
    ],
  },
  {
    type: 'function',
    name: 'owner',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'address' }],
  },
] as const;

/**
 * Smart Account Factory ABI
 */
export const FACTORY_ABI = [
  {
    type: 'function',
    name: 'getAddress',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'salt', type: 'uint256' },
    ],
    outputs: [{ type: 'address' }],
  },
  {
    type: 'function',
    name: 'createAccount',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'salt', type: 'uint256' },
    ],
    outputs: [{ type: 'address' }],
  },
] as const;

/**
 * Token Messenger ABI
 */
export const TOKEN_MESSENGER_ABI = [
  {
    type: 'function',
    name: 'depositForBurnWithHook',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'amount', type: 'uint256' },
      { name: 'destinationDomain', type: 'uint32' },
      { name: 'mintRecipient', type: 'bytes32' },
      { name: 'burnToken', type: 'address' },
      { name: 'destinationCaller', type: 'bytes32' },
      { name: 'maxFee', type: 'uint256' },
      { name: 'minFinalityThreshold', type: 'uint32' },
      { name: 'hookData', type: 'bytes' },
    ],
    outputs: [{ type: 'uint64' }],
  },
] as const;

/**
 * ERC20 ABI subset
 */
export const ERC20_ABI = [
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
] as const;

