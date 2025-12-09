import type { Address, Hex } from 'viem';

/**
 * Pons SDK Types v2.0
 * 
 * Clean, unified types for cross-chain execution via Pons Network
 * V2: Added batch action support (arrays of targets/values/callDatas)
 */

// ============ Enums ============

export enum TransferStatus {
  INITIATED = 'initiated',
  ATTESTED = 'attested',
  ANNOUNCED = 'announced',
  MINTED = 'minted',
  EXECUTED = 'executed',
  FAILED = 'failed',
}

// ============ Core Types ============

/**
 * Fee configuration for indexer and resolver payments
 */
export interface FeeConfig {
  paymentToken: Address;   // Token to pay fees in (usually USDC)
  indexerFee: bigint;      // Fixed amount for indexer
  resolverFee: bigint;     // Fixed amount for resolver
}

/**
 * Permit2 setup for a token
 */
export interface Permit2Setup {
  token: Address;     // Token to set Permit2 allowance for
  spender: Address;   // Who can spend (e.g., Universal Router)
  amount: bigint;     // How much to allow
}

/**
 * Funding configuration - what resolver provides upfront
 */
export interface FundingConfig {
  ethNeeded: bigint;            // ETH resolver must send with tx
  tokensNeeded: Address[];      // Tokens resolver must transfer
  tokenAmounts: bigint[];       // Amounts for each token
  maxReimbursement: bigint;     // Max USDC resolver can claim for fronting
}

// ============ Action Types ============

/**
 * Core action interface - the building block of Pons actions
 * V2: Supports batch actions via arrays (single action = arrays of length 1)
 */
export interface IAction {
  // Core execution (arrays for batch support)
  targets: Address[];
  callDatas: Hex[];
  values: bigint[];
  
  // Timing
  nonce: bigint;
  deadline: bigint;
  
  // Bridged amount
  expectedAmount: bigint;
  
  // Fees
  feeConfig: FeeConfig;
  
  // Permit2 setup (optional)
  permit2Setup: Permit2Setup[];
  
  // Resolver funding (optional)
  funding: FundingConfig;
}

/**
 * Single action input (legacy/convenience format)
 */
export interface SingleActionInput {
  target: Address;
  callData: Hex;
  value?: bigint;
}

/**
 * Batch action input (multiple calls)
 */
export interface BatchActionInput {
  targets: Address[];
  callDatas: Hex[];
  values?: bigint[];
}

/**
 * Action builder options - simplified input for building actions
 * Supports both single action and batch actions
 * Uses nested structs to match EIP-712 signature format
 */
export interface ActionOptions {
  // Single action (legacy format - will be wrapped in arrays internally)
  target?: Address;
  callData?: Hex;
  value?: bigint;
  
  // Batch actions (new format - takes precedence if provided)
  targets?: Address[];
  callDatas?: Hex[];
  values?: bigint[];
  
  // Fees (nested struct)
  feeConfig: FeeConfig;
  
  // Permit2 (optional)
  permit2Setup?: Permit2Setup[];
  
  // Resolver funding (optional, nested struct)
  funding?: FundingConfig;
}

// ============ Chain Config ============

export interface ChainConfig {
  id: number;
  name: string;
  rpcUrl: string;
  domain: number; // CCTP domain
  tokenMessenger: Address;
  messageTransmitter: Address;
  usdc: Address;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  blockExplorerUrl?: string;
}

// ============ Transfer Types ============

/**
 * Parameters for execute (cross-chain transfer)
 */
export interface CCTPTransferParams {
  action: ActionOptions;
  amount: bigint;
  deadline?: bigint;       // Optional: defaults to 24h from now
  nonce?: bigint;          // Optional: defaults to timestamp
  salt?: bigint;           // Optional: for smart account deployment
  maxFee?: bigint;         // Optional: CCTP max fee
  protocolFeeBps?: bigint; // Optional: Protocol fee in basis points (default: 10 = 0.1%)
}

/**
 * Result of a CCTP transfer
 */
export interface TransferResult {
  txHash: Hex;
  smartAccountAddress: Address;
  nonce: bigint;
  expectedAmount: bigint;
  deadline: bigint;
}

/**
 * Transfer status update
 */
export interface TransferStatusUpdate {
  status: TransferStatus;
  timestamp: number;
  txHash?: Hex;
  error?: string;
  metadata?: Record<string, unknown>;
}

// ============ Client Config ============

/**
 * Simplified Pons configuration - just specify chains!
 * 
 * @example
 * // Minimal config - SDK handles everything
 * const pons = new PonsClient({
 *   from: 'sepolia',
 *   to: 'arc-testnet',
 * });
 * 
 * @example
 * // With custom RPC (for better performance)
 * const pons = new PonsClient({
 *   from: 'sepolia',
 *   to: 'arc-testnet',
 *   sourceRpcUrl: 'https://my-sepolia-rpc.com',
 * });
 */
export interface SimplePonsConfig {
  /** Source chain - where users burn USDC */
  from: 'sepolia' | 'arc-testnet' | 'ethereum' | number;
  
  /** Destination chain - where SmartAccount receives */
  to: 'sepolia' | 'arc-testnet' | 'ethereum' | number;
  
  /** Optional: Custom RPC URL for source chain */
  sourceRpcUrl?: string;
  
  /** Optional: Custom RPC URL for destination chain */
  destinationRpcUrl?: string;
  
  /** Optional: Override factory address (uses default for chain if not provided) */
  factoryAddress?: Address;
  
  /** Optional: Custom gateway URL (default: gateway.pons.sh) */
  gatewayUrl?: string;
}

/**
 * Full Pons configuration (advanced)
 */
export interface PonsClientConfig {
  sourceChain: ChainConfig;
  destinationChain: ChainConfig;
  /** Factory address on destination chain (defaults based on chain) */
  factoryAddress?: Address;
  
  // Pons Gateway URL (recommended - default: gateway.pons.sh)
  gatewayUrl?: string;
  
  // Pons Relay URL (direct connection - prefer gatewayUrl)
  ponsRelayUrl?: string;
  
  // Connection mode: Direct peer (advanced - takes precedence over REST)
  ponsPeerAddress?: string;
  ponsBootstrapPeers?: string[];
  ponsWsPort?: number;
  ponsClusterId?: number;
  ponsShard?: number;
  
  // Content topic customization
  contentTopicPrefix?: string;
  contentTopicSuffix?: string;
}

/**
 * Combined config type - accepts either simple or full config
 */
export type PonsConfig = SimplePonsConfig | PonsClientConfig;

/**
 * Type guard to check if config is simplified
 */
export function isSimpleConfig(config: PonsConfig): config is SimplePonsConfig {
  return 'from' in config && 'to' in config;
}

// ============ Wallet Types ============

/**
 * Wallet signer interface (compatible with Privy, wagmi, viem)
 */
export interface WalletSigner {
  address: Address;
  signTypedData(args: {
    domain: {
      name: string;
      version: string;
      chainId: number;
      verifyingContract: Address;
    };
    types: Record<string, Array<{ name: string; type: string }>>;
    primaryType: string;
    message: Record<string, unknown>;
  }): Promise<Hex>;
  signMessage?(args: { message: string | Uint8Array }): Promise<Hex>;
}

// ============ Waku Message Types ============

/**
 * Validation proofs for trustless verification
 * These allow any node to verify the message without trusting the sender
 */
export interface ValidationProofs {
  /**
   * User's EIP-712 signature over the intent (from hookData)
   */
  userSignature: string;
  
  /**
   * CREATE2 parameters for address verification
   */
  create2Params: {
    factory: string;
    owner: string;
    salt: string;
    initCodeHash: string;
  };
}

/**
 * Transfer announcement broadcast to Waku network
 * Now includes validation proofs for trustless verification
 */
export interface TransferAnnouncement {
  version: string;
  timestamp: number;
  userAddress: string;
  smartAccountAddress: string;
  sourceTxHash: string;
  sourceDomain: number;
  destinationDomain: number;
  destinationChainId: number;
  expectedAmount: string;
  nonce: string;
  deadline: number;
  messageHash?: string;
  hookData: Uint8Array;
  
  // Fee config
  feeConfig: {
    paymentToken: string;
    indexerFee: string;
    resolverFee: string;
  };
  
  // Funding config
  fundingConfig?: {
    ethNeeded: string;
    tokensNeeded: string[];
    tokenAmounts: string[];
    maxReimbursement: string;
  };
  
  // Permit2 setup
  permit2Setup?: Array<{
    token: string;
    spender: string;
    amount: string;
  }>;

  /**
   * Validation proofs for trustless verification
   * Allows any resolver to verify the message cryptographically
   */
  proofs?: ValidationProofs;
}

/**
 * Mint completed announcement
 */
export interface MintCompleted {
  version: string;
  timestamp: number;
  indexerAddress: string;
  smartAccountAddress: string;
  sourceTxHash: string;
  mintTxHash: string;
  nonce: string;
  amount: string;
  hookData: Uint8Array;
  indexerGasCostUSDC: string;
  messageHash: string;
}

/**
 * Action executed announcement
 */
export interface ActionExecuted {
  version: string;
  timestamp: number;
  resolverAddress: string;
  smartAccountAddress: string;
  executionTxHash: string;
  nonce: string;
  gasUsed: string;
  gasReimbursementUSDC: string;
  resolverFeeUSDC: string;
  success: boolean;
}

// ============ Hook Data Types ============

/**
 * Parsed hook data from CCTP message
 * V2: Uses arrays for batch action support
 */
export interface HookData {
  targets: Address[];
  values: bigint[];
  callDatas: Hex[];
  nonce: bigint;
  deadline: bigint;
  expectedAmount: bigint;
  signature: Hex;
  
  // Fees
  feeConfig: FeeConfig;
  
  // Permit2 setup
  permit2Setup: Permit2Setup[];
  
  // Funding
  funding: FundingConfig;
}
